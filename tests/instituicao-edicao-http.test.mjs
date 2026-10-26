import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoEdicaoService } from '../src/features/instituicao/instituicao-cadastro-service.ts'
import { createInstituicaoEdicaoModel } from '../src/features/instituicao/instituicao-edicao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP edicao GET/PUT usa Bearer, UUID conhecido e somente nome/sigla sem retry', { timeout: 10000 }, async context => {
  const uuid = id(1), credential = 'test.admin.signature', original = { id: uuid, nome: 'Universidade Exemplo', sigla: 'UEX' }, calls = []
  let status = 200, entity = original
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined); assert.equal(url.pathname, `/api/v1/instituicoes/${uuid}`)
    let raw = ''; for await (const chunk of request) raw += chunk
    calls.push({ method: request.method, raw })
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'GET') { assert.equal(raw, ''); response.writeHead(status); response.end(JSON.stringify(entity)); return }
    assert.equal(request.method, 'PUT'); assert.equal(request.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(raw), { nome: 'Universidade Nova', sigla: 'UN' })
    if (status !== 200) { response.writeHead(status); response.end(JSON.stringify({ detail: 'PRIVADO' })); return }
    entity = { id: uuid, nome: 'Universidade Nova', sigla: 'UN' }; response.writeHead(status); response.end(JSON.stringify({ ...entity, cursos: ['EXTRA'], email: 'PRIVADO' }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`), auth = createAuthenticatedClient(client, { getToken: () => credential, rejectToken: () => assert.fail('nao deve descartar token') }), service = createInstituicaoEdicaoService(auth.json)
  const model = createInstituicaoEdicaoModel(service, () => ({ id: id(8), perfil: 'ADMINISTRADOR' })); model.initialize(uuid)
  for (let attempt = 0; attempt < 100 && !model.getState().draft.nome; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
  model.change('nome', 'Universidade Nova'); model.change('sigla', 'un'); await model.submit()
  assert.equal(model.getState().saved, true); assert.deepEqual(calls, [{ method: 'GET', raw: '' }, { method: 'PUT', raw: JSON.stringify({ nome: 'Universidade Nova', sigla: 'UN' }) }]); model.dispose()
})
