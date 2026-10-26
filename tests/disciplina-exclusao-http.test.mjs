import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createDisciplinaExclusaoService } from '../src/features/disciplina/disciplina-exclusao-service.ts'
import { createDisciplinaExclusaoModel } from '../src/features/disciplina/disciplina-exclusao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP exclusão exige Bearer/DELETE vazio, só 204 confirma e 409/incerteza exigem GET', { timeout: 10000 }, async context => {
  const institutionId = id(1), courseId = id(2), disciplineId = id(3), credential = 'test.admin.signature'
  const institution = { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }, course = { id: courseId, nome: 'Ciência da Computação', descricao: null, instituicaoId: institutionId }
  const discipline = { id: disciplineId, nome: 'Algoritmos e Programação', descricao: null, codigo: 'CCO001', cursoId: courseId }
  let mode = 204, active = true, deletes = 0, gets = 0
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.method === 'GET' && url.pathname === `/api/v1/instituicoes/${institutionId}`) { gets++; assert.equal(raw, ''); json(200, institution); return }
    if (request.method === 'GET' && url.pathname === `/api/v1/cursos/${courseId}`) { gets++; assert.equal(raw, ''); json(200, { ...course, disciplinas: ['PRIVADO'] }); return }
    if (request.method === 'GET' && url.pathname === `/api/v1/disciplinas/${disciplineId}`) {
      gets++; assert.equal(raw, '')
      if (!active) { response.writeHead(404); response.end(); return }
      json(200, { ...discipline, materiais: ['PRIVADO'] }); return
    }
    deletes++; assert.equal(request.method, 'DELETE'); assert.equal(url.pathname, `/api/v1/disciplinas/${disciplineId}`); assert.equal(url.search, '')
    assert.equal(raw, ''); assert.equal(request.headers['content-type'], undefined)
    if ([400, 401, 403, 404, 409, 503].includes(mode)) { response.writeHead(mode, { 'Content-Type': 'application/problem+json' }); response.end(JSON.stringify({ detail: 'PRIVADO' })); return }
    active = false
    if (mode === 'lost') { response.destroy(); return }
    if (mode === 'unexpected') { json(200, { detail: 'PRIVADO' }); return }
    response.writeHead(204); response.end()
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of [204, 400, 401, 403, 404, 409, 503, 'unexpected', 'lost']) {
    mode = next; active = true; let token = credential; const rejected = []
    const auth = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createDisciplinaExclusaoModel(createDisciplinaExclusaoService(auth.json, auth.delete), () => token ? { id: id(8), perfil: 'ADMINISTRADOR' } : null)
    await model.load(institutionId, courseId, disciplineId); assert.equal(model.getState().disciplina?.id, disciplineId)
    const before = deletes, rejectedBefore = rejected.length; await model.submit(); assert.equal(deletes, before)
    model.setConfirmed(true); await model.submit(); assert.equal(deletes, before + 1); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if (mode === 204) assert.equal(model.getState().deleted, true)
    if (mode === 400) { assert.equal(model.getState().disciplina.id, disciplineId); assert.equal(model.getState().confirmed, false) }
    if (mode === 401) { assert.equal(model.getState().denied, true); assert.deepEqual(rejected.slice(rejectedBefore), [credential]) }
    if (mode === 403) { assert.equal(model.getState().denied, true); assert.deepEqual(rejected.slice(rejectedBefore), []); assert.equal(token, credential) }
    if (mode === 404) assert.equal(model.getState().unavailable, true)
    if (mode === 409) { assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(deletes, before + 1); await model.reload(); assert.equal(model.getState().conflict, false); assert.equal(model.getState().confirmed, false) }
    if (mode === 503 || mode === 'unexpected' || mode === 'lost') {
      assert.equal(model.getState().uncertain, true); await model.submit(); assert.equal(deletes, before + 1); await model.reload()
      assert.equal(model.getState().uncertain, false); assert.equal(model.getState().deleted, false)
      if (mode === 503) assert.ok(model.getState().disciplina)
      else { assert.equal(model.getState().unavailable, true); assert.equal(model.getState().disciplina, null) }
    }
    model.dispose()
  }
  assert.equal(gets, 39)
})
