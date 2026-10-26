import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createOwnMaterialsService, materialStates } from '../src/features/material/meus-materiais-service.ts'
import { createOwnMaterialsModel } from '../src/features/material/meus-materiais-model.ts'
import { id, material, page } from './catalog-fixtures.mjs'

test('HTTP sintetico de meus materiais: identidade no Bearer, todos estados, texto/pagina e401 sem corpo', { timeout: 8000 }, async context => {
  const tokenA = 'contaA.payload.signature', tokenB = 'contaB.payload.signature'
  const itemsA = Array.from({ length: 24 }, (_, index) => ({ ...material(100 + index), usuarioId: id(8), status: materialStates[index % 4], titulo: index === 3 ? 'Redes C++ & #/?' : 'Registro sintético ' + index }))
  const itemB = { ...material(200), usuarioId: id(9), titulo: 'Registro de outra conta sintética' }
  let requests = 0
  const server = createServer((request, response) => {
    requests++
    assert.equal(request.method, 'GET')
    assert.equal(request.headers.cookie, undefined)
    const url = new URL(request.url, 'http://localhost')
    assert.equal(url.pathname, '/api/v1/materiais/meus')
    assert.deepEqual([...url.searchParams.keys()].filter(key => !['q', 'status', 'page', 'size'].includes(key)), [])
    const token = request.headers.authorization
    if (token !== `Bearer ${tokenA}` && token !== `Bearer ${tokenB}`) { response.writeHead(401); response.end(); return }
    let items = token === `Bearer ${tokenA}` ? itemsA : [itemB]
    const status = url.searchParams.get('status'), q = url.searchParams.get('q')
    if (status) items = items.filter(item => item.status === status)
    if (q) items = items.filter(item => item.titulo.includes(q))
    const number = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(page(items.slice(number * size, (number + 1) * size), number, size, items.length)))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  let token = tokenA, rejected = []
  const authenticated = createAuthenticatedClient(createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`), {
    getToken: () => token,
    rejectToken: used => { rejected.push(used); if (used === token) token = null },
  })
  const model = createOwnMaterialsModel(createOwnMaterialsService(authenticated.json))
  context.after(() => model.dispose())
  await model.initialize()
  assert.equal(model.getState().data.page.totalElements, 24)
  assert.deepEqual(new Set(model.getState().data.content.map(item => item.status)), new Set(materialStates))
  assert.ok(model.getState().data.content.every(item => item.usuarioId === id(8)))
  await model.goToPage(1)
  assert.equal(model.getState().data.content.length, 4)
  model.changeFilter('status', 'REMOVIDO'); model.changeFilter('q', '  C++ & #/?  ')
  await model.search()
  assert.equal(model.getState().data.content.length, 1)
  assert.equal(model.getState().data.content[0].id, itemsA[3].id)
  await model.clearFilters()
  assert.equal(model.getState().data.page.totalElements, 24)
  token = tokenB
  await model.search()
  assert.deepEqual(model.getState().data.content, [itemB])
  token = 'invalido.payload.signature'
  const before = requests
  await model.search()
  assert.equal(requests, before + 1)
  assert.equal(model.getState().data, null)
  assert.ok(model.getState().error)
  assert.equal(token, null)
  assert.deepEqual(rejected, ['invalido.payload.signature'])
})
