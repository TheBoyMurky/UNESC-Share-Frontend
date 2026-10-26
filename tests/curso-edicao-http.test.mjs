import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoService } from '../src/features/instituicao/instituicao-service.ts'
import { createCursoEdicaoService } from '../src/features/curso/curso-edicao-service.ts'
import { createCursoEdicaoModel } from '../src/features/curso/curso-edicao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP edição preserva vínculo, Bearer, PUT completo, conflito/incerteza sem retry e descarte em 401/403/404', { timeout: 10000 }, async context => {
  const institutionId = id(1), courseId = id(2), credential = 'test.admin.signature', payload = { nome: 'Curso novo', descricao: null, instituicaoId: institutionId }
  let mode = 200, puts = 0
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.method === 'GET' && url.pathname === `/api/v1/cursos/${courseId}`) { assert.equal(raw, ''); json(200, { id: courseId, nome: 'Curso original', descricao: 'Descrição original', instituicaoId: institutionId, email: 'PRIVADO' }); return }
    if (request.method === 'GET' && url.pathname === `/api/v1/instituicoes/${institutionId}`) { assert.equal(raw, ''); json(200, { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }); return }
    puts++; assert.equal(request.method, 'PUT'); assert.equal(url.pathname, `/api/v1/cursos/${courseId}`); assert.equal(url.search, ''); assert.equal(request.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(raw), payload)
    if ([400, 401, 403, 404, 409, 503].includes(mode)) { response.writeHead(mode, { 'Content-Type': 'application/problem+json' }); response.end(JSON.stringify({ detail: 'PRIVADO' })); return }
    if (mode === 'lost') { response.destroy(); return }
    json(200, mode === 'badDTO' ? { ...payload, id: id(9) } : { ...payload, id: courseId, disciplinas: ['PRIVADO'] })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`), rejected = [], auth = createAuthenticatedClient(client, { getToken: () => credential, rejectToken: token => rejected.push(token) })
  for (const next of [200, 400, 401, 403, 404, 409, 503, 'badDTO', 'lost']) {
    mode = next
    const model = createCursoEdicaoModel(createCursoEdicaoService(auth.json), createInstituicaoService(auth.json), () => ({ id: id(8), perfil: 'ADMINISTRADOR' }))
    model.initialize(institutionId, courseId)
    for (let attempt = 0; attempt < 100 && model.getState().loading; attempt++) await new Promise(resolve => setTimeout(resolve, 2))
    assert.equal(model.getState().curso?.id, courseId, `curso não carregou antes do PUT (${mode})`)
    model.change('nome', ' Curso novo '); model.change('descricao', '   '); const before = puts, rejectedBefore = rejected.length; await model.submit(); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if (mode === 200) assert.equal(model.getState().saved, true)
    if (mode === 400) assert.equal(model.getState().draft.nome, ' Curso novo ')
    if (mode === 401 || mode === 403 || mode === 404) assert.equal(model.getState().denied, true)
    if (mode === 401) assert.deepEqual(rejected.slice(rejectedBefore), [credential])
    if (mode === 403) assert.deepEqual(rejected.slice(rejectedBefore), [])
    if (mode === 409) { assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(puts, before + 1); await model.reload(); assert.equal(model.getState().conflict, false) }
    if (mode === 503 || mode === 'badDTO' || mode === 'lost') { assert.equal(model.getState().uncertain, true); await model.submit(); assert.equal(puts, before + 1); await model.reload(); assert.equal(model.getState().uncertain, false) }
    model.dispose()
  }
})
