import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoService } from '../src/features/instituicao/instituicao-service.ts'
import { createCursoService } from '../src/features/curso/curso-service.ts'
import { createDisciplinaCadastroService } from '../src/features/disciplina/disciplina-cadastro-service.ts'
import { createDisciplinaCadastroModel } from '../src/features/disciplina/disciplina-cadastro-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP cadastro valida curso, envia Bearer/JSON mínimo e trata conflitos/acesso sem retry', { timeout: 10000 }, async context => {
  const institutionId = id(1), courseId = id(2), disciplineId = id(3), credential = 'test.admin.signature'
  const payload = { nome: 'Algoritmos e Programação', descricao: null, codigo: 'CCO001', cursoId: courseId }
  let mode = 201, posts = 0, gets = 0, followedLocation = false
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    const json = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://invalid.test/do-not-follow' }); response.end(JSON.stringify(data)) }
    if (request.method === 'GET' && url.pathname === `/api/v1/instituicoes/${institutionId}`) { gets++; assert.equal(raw, ''); json(200, { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }); return }
    if (request.method === 'GET' && url.pathname === `/api/v1/cursos/${courseId}`) { gets++; assert.equal(raw, ''); json(200, { id: courseId, nome: 'Ciência da Computação', descricao: null, instituicaoId: institutionId }); return }
    if (url.hostname === 'invalid.test') { followedLocation = true; response.writeHead(500); response.end(); return }
    posts++; assert.equal(request.method, 'POST'); assert.equal(url.pathname, '/api/v1/disciplinas'); assert.equal(url.search, '')
    assert.equal(request.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(raw), payload)
    if ([400, 403, 404, 409, 503].includes(mode)) { json(mode, { detail: 'PRIVADO', errors: [{ field: 'codigo', message: 'PRIVADO' }] }); return }
    if (mode === 'lost') { response.destroy(); return }
    json(201, mode === 'badDTO' ? { id: disciplineId, nome: 'Outro nome', descricao: null, codigo: 'CCO001', cursoId: courseId } : { ...payload, id: disciplineId, extra: 'PRIVADO' })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of [201, 400, 403, 404, 409, 503, 'badDTO', 'lost']) {
    mode = next; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createDisciplinaCadastroModel(createDisciplinaCadastroService(authenticated.json), createCursoService(authenticated.json), createInstituicaoService(authenticated.json), () => token ? { id: id(8), perfil: 'ADMINISTRADOR' } : null)
    await model.initialize(institutionId, courseId)
    model.change('nome', ' Algoritmos e Programação '); model.change('codigo', ' cco001 '); await model.submit()
    assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if (mode === 201) assert.equal(model.getState().savedId, disciplineId)
    if (mode === 400) { assert.equal(model.getState().draft.codigo, ' cco001 '); assert.equal(model.getState().uncertain, false) }
    if (mode === 403 || mode === 404) assert.equal(model.getState().denied, true)
    if (mode === 403) { assert.deepEqual(rejected, []); assert.equal(token, credential) }
    if (mode === 409) { assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(posts, 5) }
    if ([503, 'badDTO', 'lost'].includes(mode)) { assert.equal(model.getState().uncertain, true); await model.submit(); assert.equal(posts, mode === 503 ? 6 : mode === 'badDTO' ? 7 : 8); model.prepareNew(); assert.equal(model.getState().uncertain, false) }
    model.dispose()
  }
  assert.equal(gets, 16); assert.equal(followedLocation, false)
})
