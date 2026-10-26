import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createCategoriaService } from '../src/features/categoria/categoria-service.ts'
import { createCategoriaConsultaModel } from '../src/features/categoria/categoria-consulta-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico categorias: somente GET/Bearer, DTO projetado e leitura para os tres perfis', { timeout: 10000 }, async context => {
  const token = 'test.authenticated.signature', row = { id: id(1), nome: '<script>Texto literal</script>', descricao: null }
  let mode = 200, calls = 0
  const server = createServer(async (request, response) => {
    calls++; assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + token)
    assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    let body = ''; for await (const chunk of request) body += chunk; assert.equal(body, '')
    const url = new URL(request.url, 'http://localhost')
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (mode !== 200) { json(mode, { detail: 'PRIVADO' }); return }
    const source = { ...row, materiais: ['EXTRA'], ownerEmail: 'PRIVADO' }
    if (url.pathname === '/api/v1/categorias') {
      assert.deepEqual([...url.searchParams.keys()], ['page', 'size'])
      json(200, page([source], Number(url.searchParams.get('page')), Number(url.searchParams.get('size')))); return
    }
    assert.equal(url.pathname, `/api/v1/categorias/${id(1)}`); assert.equal(url.search, '')
    json(200, source)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    let accessToken = token; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => accessToken, rejectToken: used => { rejected.push(used); if (accessToken === used) accessToken = null } })
    const model = createCategoriaConsultaModel(createCategoriaService(authenticated.json), () => accessToken ? { id: id(8), perfil } : null)
    await model.loadList(); assert.deepEqual(model.getState().data.content, [row]); await model.setSize(50); assert.equal(model.getState().data.page.size, 50)
    await model.loadDetail(id(1)); assert.deepEqual(model.getState().categoria, row); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    model.dispose()
  }
  mode = 401
  const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => assert.equal(used, token) })
  const denied = createCategoriaConsultaModel(createCategoriaService(authenticated.json), () => ({ id: id(8), perfil: 'USUARIO' }))
  await denied.loadList(); assert.equal(denied.getState().unavailable, true); assert.equal(denied.getState().data, null); denied.dispose()
  assert.equal(calls, 10)
})
