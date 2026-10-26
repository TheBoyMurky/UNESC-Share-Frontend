import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createCursoExclusaoService } from '../src/features/curso/curso-exclusao-service.ts'
import { createCursoExclusaoModel } from '../src/features/curso/curso-exclusao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP exclusão usa Bearer, DELETE sem corpo, 204 estrito, 409 e perda sem retry', { timeout: 10000 }, async context => {
  const institutionId = id(1), courseId = id(2), credential = 'test.admin.signature'
  let mode = 204, alive = true, deletes = 0
  const course = { id: courseId, nome: 'Curso de teste', descricao: null, instituicaoId: institutionId }
  const institution = { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.method === 'GET' && url.pathname === `/api/v1/cursos/${courseId}`) { assert.equal(raw, ''); if (!alive) { response.writeHead(404); response.end(); return }; json(200, { ...course, disciplinas: ['NÃO SERIALIZAR'] }); return }
    if (request.method === 'GET' && url.pathname === `/api/v1/instituicoes/${institutionId}`) { assert.equal(raw, ''); json(200, institution); return }
    assert.equal(request.method, 'DELETE'); assert.equal(url.pathname, `/api/v1/cursos/${courseId}`); assert.equal(url.search, ''); assert.equal(raw, ''); assert.equal(request.headers['content-type'], undefined); deletes++
    if (mode === 409 || mode === 400 || mode === 401 || mode === 403 || mode === 404 || mode === 503) { response.writeHead(mode, { 'Content-Type': 'application/problem+json' }); response.end(JSON.stringify({ detail: 'PRIVADO' })); return }
    alive = false
    if (mode === 'lost') { response.destroy(); return }
    if (mode === 'unexpected') { json(200, { detail: 'PRIVADO' }); return }
    response.writeHead(204); response.end()
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`), rejected = [], auth = createAuthenticatedClient(client, { getToken: () => credential, rejectToken: token => rejected.push(token) })
  const waitLoad = async model => { model.load(institutionId, courseId); for (let i = 0; i < 100 && model.getState().loading; i++) await new Promise(resolve => setTimeout(resolve, 3)) }
  for (const next of [204, 409, 400, 401, 403, 404, 503, 'unexpected', 'lost']) {
    mode = next; alive = true
    const model = createCursoExclusaoModel(createCursoExclusaoService(auth.json, auth.delete), () => ({ id: id(8), perfil: 'ADMINISTRADOR' }))
    await waitLoad(model); assert.ok(model.getState().curso)
    const before = deletes, rejectedBefore = rejected.length
    await model.submit(); assert.equal(deletes, before)
    model.setConfirmed(true); await model.submit(); assert.equal(deletes, before + 1); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if (mode === 204) assert.equal(model.getState().deleted, true)
    if (mode === 409) { assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(deletes, before + 1); await model.load(institutionId, courseId); assert.equal(model.getState().conflict, false) }
    if (mode === 400) { assert.ok(model.getState().curso); assert.equal(model.getState().confirmed, false) }
    if (mode === 401) { assert.equal(model.getState().denied, true); assert.deepEqual(rejected.slice(rejectedBefore), [credential]) }
    if (mode === 403) { assert.equal(model.getState().denied, true); assert.deepEqual(rejected.slice(rejectedBefore), []) }
    if (mode === 404) assert.equal(model.getState().unavailable, true)
    if (mode === 503 || mode === 'unexpected' || mode === 'lost') {
      assert.equal(model.getState().uncertain, true); await model.submit(); assert.equal(deletes, before + 1); await model.load(institutionId, courseId); assert.equal(model.getState().uncertain, false); assert.equal(model.getState().deleted, false)
      if (mode === 503) assert.ok(model.getState().curso)
      else assert.equal(model.getState().unavailable, true)
    }
    model.dispose()
  }
})
