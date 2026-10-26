import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createCategoriaExclusaoService } from '../src/features/categoria/categoria-exclusao-service.ts'
import { createCategoriaExclusaoModel } from '../src/features/categoria/categoria-exclusao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP sintético valida Bearer, DELETE sem corpo, 409 e confirmação estrita por 204', { timeout: 10000 }, async context => {
  const uuid = id(1), credential = 'test.admin.signature', initial = { id: uuid, nome: 'Categoria descartável', descricao: null }
  let entity = { ...initial }, mode = '409', gets = 0, deletes = 0
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(url.pathname, `/api/v1/categorias/${uuid}`); assert.equal(url.search, ''); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    if (request.method === 'GET') { gets++; assert.equal(raw, ''); assert.equal(request.headers['content-type'], undefined); if (!entity) { response.writeHead(404); response.end(); return } response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(entity)); return }
    assert.equal(request.method, 'DELETE'); deletes++; assert.equal(raw, ''); assert.equal(request.headers['content-type'], undefined)
    if (mode === '409') { response.writeHead(409, { 'Content-Type': 'application/problem+json' }); response.end(JSON.stringify({ detail: 'DADO_PRIVADO' })); return }
    entity = null
    if (mode === '200') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}'); return }
    if (mode === 'lost') { response.destroy(); return }
    response.writeHead(204); response.end()
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`), authenticated = createAuthenticatedClient(client, { getToken: () => credential, rejectToken: () => assert.fail('não invalida a sessão nesta resposta') })
  const service = createCategoriaExclusaoService(authenticated.json, authenticated.delete), model = createCategoriaExclusaoModel(service, () => ({ id: id(8), perfil: 'ADMINISTRADOR' }))
  await model.load(uuid); assert.equal(deletes, 0); model.setConfirmed(true); await model.submit(); assert.equal(model.getState().conflict, true); assert.equal(deletes, 1); assert.equal(JSON.stringify(model.getState()).includes('DADO_PRIVADO'), false)
  mode = '204'; await model.reload(); model.setConfirmed(true); await model.submit(); assert.equal(model.getState().deleted, true); assert.equal(deletes, 2)
  model.dispose()

  entity = { ...initial }; mode = '200'; const third = createCategoriaExclusaoModel(service, () => ({ id: id(8), perfil: 'ADMINISTRADOR' }))
  await third.load(uuid); third.setConfirmed(true); await third.submit(); assert.equal(third.getState().deleted, false); assert.equal(third.getState().uncertain, true); assert.equal(deletes, 3)
  await third.reload(); assert.equal(third.getState().deleted, false); assert.equal(third.getState().unavailable, true); third.dispose()

  entity = { ...initial }; mode = 'lost'; const second = createCategoriaExclusaoModel(service, () => ({ id: id(8), perfil: 'ADMINISTRADOR' }))
  await second.load(uuid); second.setConfirmed(true); await second.submit(); assert.equal(second.getState().uncertain, true); assert.equal(deletes, 4); await second.submit(); assert.equal(deletes, 4)
  await second.reload(); assert.equal(second.getState().deleted, false); assert.equal(second.getState().unavailable, true); assert.equal(gets, 6); second.dispose()
})
