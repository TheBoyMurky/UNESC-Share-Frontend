import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoService } from '../src/features/instituicao/instituicao-service.ts'
import { createCursoCadastroService } from '../src/features/curso/curso-cadastro-service.ts'
import { createCursoCadastroModel } from '../src/features/curso/curso-cadastro-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP cadastro curso GETinstituicao/POSTpayloadBearer-Locationignorado/400-409-403-503-perda sem retry', { timeout: 10000 }, async context => {
  const instituicaoId = id(1), courseId = id(2), credential = 'test.admin.signature', payload = { nome: 'Curso de Teste', descricao: null, instituicaoId }
  let mode = 201, posts = 0, gets = 0
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    const json = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://invalid.test/nao-seguir' }); response.end(JSON.stringify(data)) }
    if (request.method === 'GET') { gets++; assert.equal(url.pathname, `/api/v1/instituicoes/${instituicaoId}`); assert.equal(raw, ''); assert.equal(request.headers['content-type'], undefined); json(200, { id: instituicaoId, nome: 'UNESC', sigla: 'UNESC' }); return }
    posts++; assert.equal(request.method, 'POST'); assert.equal(url.pathname, '/api/v1/cursos'); assert.equal(url.search, ''); assert.equal(request.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(raw), payload)
    if (mode === 400 || mode === 403 || mode === 404 || mode === 409 || mode === 503) { json(mode, { detail: 'PRIVADO', errors: [{ field: 'nome', message: 'PRIVADO' }] }); return }
    if (mode === 'lost') { response.destroy(); return }
    json(201, mode === 'badDTO' ? { id: courseId, nome: 'Outro', descricao: null, instituicaoId } : { ...payload, id: courseId, disciplinas: ['PRIVADO'] })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of [201, 400, 403, 404, 409, 503, 'badDTO', 'lost']) {
    mode = next; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createCursoCadastroModel(createCursoCadastroService(authenticated.json), createInstituicaoService(authenticated.json), () => token ? { id: id(8), perfil: 'ADMINISTRADOR' } : null)
    await model.initialize(instituicaoId); model.change('nome', ' Curso de Teste '); await model.submit(); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if (mode === 201) assert.equal(model.getState().savedId, courseId)
    if (mode === 400) { assert.equal(model.getState().draft.nome, ' Curso de Teste '); assert.equal(model.getState().uncertain, false) }
    if (mode === 409) { assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(posts, 5) }
    if ([503, 'badDTO', 'lost'].includes(mode)) { assert.equal(model.getState().uncertain, true); await model.submit(); assert.equal(posts, mode === 503 ? 6 : mode === 'badDTO' ? 7 : 8); model.prepareNew(); assert.equal(model.getState().uncertain, false) }
    if (mode === 403 || mode === 404) assert.equal(model.getState().denied, true)
    if (mode === 403) { assert.deepEqual(rejected, []); assert.equal(token, credential) }
    model.dispose()
  }
  assert.equal(gets, 8)
})
