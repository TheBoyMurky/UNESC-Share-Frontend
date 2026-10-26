import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createCatalogService } from '../src/features/catalogo/catalog-service.ts'
import { createMaterialEdicaoService } from '../src/features/material/material-edicao-service.ts'
import { createMaterialEdicaoModel } from '../src/features/material/material-edicao-model.ts'
import { page } from './catalog-fixtures.mjs'
import { detail, id, metadata, referenceDTOs } from './material-edicao-fixtures.mjs'

test('HTTP sintetico: prefillUUID/101opcoes/PUTBearer quatrocampos/PENDENTE/mecanismos preservados/erros semretry', { timeout: 10000 }, async context => {
  const credential = 'header.payload.signature'
  let stored = detail(), mode = 200, puts = 0, routes = []
  const replies = referenceDTOs()
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer ' + credential)
    assert.equal(request.headers.cookie, undefined)
    const url = new URL(request.url, 'http://localhost'), path = url.pathname.slice('/api/v1'.length)
    routes.push(path)
    assert.equal(url.searchParams.has('usuarioId'), false)
    assert.equal(url.searchParams.has('token'), false)
    if (request.method === 'PUT') {
      puts++
      assert.equal(path, '/materiais/' + id(10))
      assert.equal(request.headers['content-type'], 'application/json')
      let body = ''
      for await (const chunk of request) body += chunk
      assert.deepEqual(JSON.parse(body), metadata())
      if ([200, 'lost', 'badDTO'].includes(mode)) stored = { ...stored, ...metadata(), status: 'PENDENTE' }
      if (mode === 'lost') { response.destroy(); return }
      if (mode === 400) {
        response.writeHead(400, { 'Content-Type': 'application/problem+json' })
        response.end(JSON.stringify({ detail: 'URI-privada', errors: [{ field: 'titulo', message: 'URI-privada' }] })); return
      }
      if (Number.isInteger(mode) && mode !== 200) { response.writeHead(mode); response.end(); return }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify(mode === 'badDTO' ? { ...stored, status: 'PUBLICADO' } : stored)); return
    }
    assert.equal(request.method, 'GET')
    let result
    if (path === '/materiais/' + id(10)) result = stored
    else if (replies[path]) result = replies[path]
    else {
      const current = { '/instituicoes': replies['/instituicoes/' + id(1)], '/cursos': replies['/cursos/' + id(3)], '/disciplinas': replies['/disciplinas/' + id(5)], '/categorias': replies['/categorias/' + id(7)] }[path]
      assert.ok(current, 'nenhuma consulta ou escrita em mecanismo/usuario')
      assert.equal(url.searchParams.get('size'), '100')
      if (path === '/cursos') assert.equal(url.searchParams.get('instituicaoId'), id(1))
      if (path === '/disciplinas') assert.equal(url.searchParams.get('cursoId'), id(3))
      const number = Number(url.searchParams.get('page'))
      result = page(number === 0 ? Array.from({ length: 100 }, (_, index) => ({ ...current, id: id(100 + index), nome: 'Opção sintética' })) : [current], number, 100, 101)
    }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(result))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of [200, 400, 401, 403, 404, 409, 503, 'badDTO', 'lost']) {
    stored = detail(); mode = next
    let token = credential, rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createMaterialEdicaoModel(createMaterialEdicaoService(authenticated.json), createCatalogService(authenticated.json), () => token ? id(8) : null)
    await model.load(id(10))
    assert.equal(model.getState().draft.disciplinaId, id(5))
    assert.equal(model.getState().selectors.disciplinas.options.length, 101)
    await model.loadOptions('disciplinas', true)
    assert.equal(model.getState().selectors.disciplinas.options.length, 101)
    model.changeText('titulo', metadata().titulo); model.changeText('descricao', metadata().descricao)
    const before = puts
    await model.submit()
    assert.equal(puts, before + 1)
    assert.equal(!!model.getState().savedId, mode === 200)
    assert.equal(model.getState().error.includes('URI-privada'), false)
    assert.equal(JSON.stringify(model.getState().fields).includes('URI-privada'), false)
    if (mode === 200) {
      assert.equal(stored.status, 'PENDENTE')
      assert.deepEqual(stored.magnets, detail().magnets); assert.deepEqual(stored.torrents, detail().torrents)
      await model.submit(); assert.equal(puts, before + 1)
    }
    if ([503, 'badDTO', 'lost'].includes(mode)) assert.equal(model.getState().uncertain, true)
    assert.deepEqual(rejected, mode === 401 ? [credential] : [])
    model.dispose()
  }
  stored = { ...detail(), usuarioId: id(99) }; routes = []
  const authenticated = createAuthenticatedClient(client, { getToken: () => credential, rejectToken: () => assert.fail() })
  const foreign = createMaterialEdicaoModel(createMaterialEdicaoService(authenticated.json), createCatalogService(authenticated.json), () => id(8))
  const before = puts
  await foreign.load(id(10)); foreign.changeText('titulo', 'Não permitido'); await foreign.submit()
  assert.deepEqual(routes, ['/materiais/' + id(10)])
  assert.equal(foreign.getState().material, null)
  assert.equal(puts, before)
  foreign.dispose()
})
