import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoService } from '../src/features/instituicao/instituicao-service.ts'
import { createCursoService } from '../src/features/curso/curso-service.ts'
import { createDisciplinaEdicaoService } from '../src/features/disciplina/disciplina-edicao-service.ts'
import { createDisciplinaEdicaoModel } from '../src/features/disciplina/disciplina-edicao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP edição preserva curso, envia PUT completo com Bearer e exige GET após conflito/incerteza', { timeout: 10000 }, async context => {
  const institutionId = id(1), courseId = id(2), disciplineId = id(3), credential = 'test.admin.signature'
  const initial = { id: disciplineId, nome: 'Disciplina original', descricao: 'Descrição original', codigo: 'CCO001', cursoId: courseId }
  const payload = { nome: 'Disciplina nova', descricao: null, codigo: 'CCO002', cursoId: courseId }
  let mode = 200, puts = 0, gets = 0
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    const json = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
    if (request.method === 'GET' && url.pathname === `/api/v1/instituicoes/${institutionId}`) { gets++; assert.equal(raw, ''); json(200, { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }); return }
    if (request.method === 'GET' && url.pathname === `/api/v1/cursos/${courseId}`) { gets++; assert.equal(raw, ''); json(200, { id: courseId, nome: 'Ciência da Computação', descricao: null, instituicaoId: institutionId }); return }
    if (request.method === 'GET' && url.pathname === `/api/v1/disciplinas/${disciplineId}`) { gets++; assert.equal(raw, ''); json(200, mode === 200 && puts ? { ...initial, ...payload } : initial); return }
    puts++; assert.equal(request.method, 'PUT'); assert.equal(url.pathname, `/api/v1/disciplinas/${disciplineId}`); assert.equal(url.search, '')
    assert.equal(request.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(raw), payload)
    if ([400, 401, 403, 404, 409, 503].includes(mode)) { json(mode, { detail: 'PRIVADO' }); return }
    if (mode === 'lost') { response.destroy(); return }
    json(200, mode === 'badDTO' ? { ...payload, id: id(9) } : { ...payload, id: disciplineId, extras: ['PRIVADO'] })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of [200, 400, 401, 403, 404, 409, 503, 'badDTO', 'lost']) {
    mode = next; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createDisciplinaEdicaoModel(createDisciplinaEdicaoService(authenticated.json), createCursoService(authenticated.json), createInstituicaoService(authenticated.json), () => token ? { id: id(8), perfil: 'ADMINISTRADOR' } : null)
    model.initialize(institutionId, courseId, disciplineId)
    for (let attempt = 0; attempt < 100 && model.getState().loading; attempt++) await new Promise(resolve => setTimeout(resolve, 2))
    assert.equal(model.getState().disciplina?.id, disciplineId, `disciplina não carregou antes do PUT (${mode})`)
    model.change('nome', ' Disciplina nova '); model.change('descricao', '   '); model.change('codigo', ' cco002 ')
    const before = puts, rejectedBefore = rejected.length; await model.submit(); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if (mode === 200) assert.equal(model.getState().saved, true)
    if (mode === 400) assert.deepEqual(model.getState().draft, { nome: ' Disciplina nova ', descricao: '   ', codigo: ' cco002 ' })
    if (mode === 401 || mode === 403 || mode === 404) assert.equal(model.getState().denied, true)
    if (mode === 401) assert.deepEqual(rejected.slice(rejectedBefore), [credential])
    if (mode === 403) { assert.deepEqual(rejected.slice(rejectedBefore), []); assert.equal(token, credential) }
    if (mode === 409) { assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(puts, before + 1); await model.reload(); assert.equal(model.getState().conflict, false) }
    if (mode === 503 || mode === 'badDTO' || mode === 'lost') { assert.equal(model.getState().uncertain, true); await model.submit(); assert.equal(puts, before + 1); await model.reload(); assert.equal(model.getState().uncertain, false) }
    model.dispose()
  }
  assert.equal(gets, 39)
})
