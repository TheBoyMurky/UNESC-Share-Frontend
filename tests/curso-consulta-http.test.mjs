import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoService } from '../src/features/instituicao/instituicao-service.ts'
import { createCursoService } from '../src/features/curso/curso-service.ts'
import { createCursoConsultaModel } from '../src/features/curso/curso-consulta-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP consulta cursos limita escopo ao UUID, usa Bearer e trata 403 sem logout', { timeout: 10000 }, async context => {
  const instituicaoId = id(1), token = 'test.user.signature', course = { id: id(2), nome: 'Ciência da Computação', descricao: null, instituicaoId }, requests = []
  let responseStatus = 200, rejected = []
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); requests.push(url)
    assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + token); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    response.setHeader('Content-Type', 'application/json')
    if (url.pathname === `/api/v1/instituicoes/${instituicaoId}`) { response.writeHead(200); response.end(JSON.stringify({ id: instituicaoId, nome: 'UNESC', sigla: 'UNESC' })); return }
    assert.equal(url.pathname, '/api/v1/cursos')
    response.writeHead(responseStatus)
    response.end(responseStatus === 200 ? JSON.stringify(page([course], Number(url.searchParams.get('page')), Number(url.searchParams.get('size')), 1)) : JSON.stringify({ detail: 'PRIVADO' }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  let currentToken = token
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`), authenticated = createAuthenticatedClient(client, { getToken: () => currentToken, rejectToken: used => { rejected.push(used); if (currentToken === used) currentToken = null } })
  const model = createCursoConsultaModel(createCursoService(authenticated.json), createInstituicaoService(authenticated.json), () => currentToken ? { id: id(8), perfil: 'USUARIO' } : null)
  model.load(instituicaoId); for (let i = 0; i < 100 && model.getState().loading; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.deepEqual(model.getState().data.content, [course]); assert.equal(requests[0].pathname, `/api/v1/instituicoes/${instituicaoId}`); assert.deepEqual([...requests[1].searchParams.keys()], ['page', 'size', 'instituicaoId']); assert.equal(requests[1].searchParams.get('instituicaoId'), instituicaoId)
  responseStatus = 403; model.reload(); for (let i = 0; i < 100 && model.getState().loading; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(model.getState().unavailable, true); assert.equal(model.getState().data, null); assert.deepEqual(rejected, []); assert.equal(currentToken, token); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
  model.dispose()
})
