import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoExclusaoService } from '../src/features/instituicao/instituicao-exclusao-service.ts'
import { createInstituicaoExclusaoModel } from '../src/features/instituicao/instituicao-exclusao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP exclusao GET confirmado, DELETE sem corpo/Bearer,409 e resposta perdida sem retry', { timeout: 10000 }, async context => {
  const uuid = id(1), credential = 'test.admin.signature', initial = { id: uuid, nome: 'Universidade Exemplo', sigla: 'UEX' }
  let entity = { ...initial }, mode = '409', gets = 0, deletes = 0
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(url.pathname, `/api/v1/instituicoes/${uuid}`); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'GET') { gets++; assert.equal(raw, ''); assert.equal(request.headers['content-type'], undefined); if (!entity) { response.writeHead(404); response.end(); return } response.writeHead(200); response.end(JSON.stringify(entity)); return }
    assert.equal(request.method, 'DELETE'); deletes++; assert.equal(raw, ''); assert.equal(request.headers['content-type'], undefined)
    if (mode === '409') { response.writeHead(409); response.end(JSON.stringify({ detail: 'PRIVADO' })); return }
    entity = null
    if (mode === 'lost') { response.destroy(); return }
    response.writeHead(204); response.end()
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`), authenticated = createAuthenticatedClient(client, { getToken: () => credential, rejectToken: () => assert.fail('nao deve invalidar o token') })
  const service = createInstituicaoExclusaoService(authenticated.json, authenticated.delete), model = createInstituicaoExclusaoModel(service, () => ({ id: id(8), perfil: 'ADMINISTRADOR' }))
  model.load(uuid); for (let i = 0; i < 100 && !model.getState().institution; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(deletes, 0); model.setConfirmed(true); await model.submit(); assert.equal(model.getState().conflict, true); assert.equal(deletes, 1); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
  mode = '204'; model.reload(); for (let i = 0; i < 100 && model.getState().loading; i++) await new Promise(resolve => setTimeout(resolve, 5)); model.setConfirmed(true); await model.submit(); assert.equal(model.getState().deleted, true); assert.equal(deletes, 2)
  model.dispose()

  entity = { ...initial }; mode = 'lost'; const second = createInstituicaoExclusaoModel(service, () => ({ id: id(8), perfil: 'ADMINISTRADOR' }))
  second.load(uuid); for (let i = 0; i < 100 && !second.getState().institution; i++) await new Promise(resolve => setTimeout(resolve, 5)); second.setConfirmed(true); await second.submit()
  assert.equal(second.getState().uncertain, true); assert.equal(deletes, 3); await second.submit(); assert.equal(deletes, 3)
  second.reload(); for (let i = 0; i < 100 && second.getState().loading; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(second.getState().deleted, false); assert.equal(second.getState().unavailable, true); assert.equal(gets, 4); second.dispose()
})
