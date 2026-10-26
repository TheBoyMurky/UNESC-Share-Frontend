import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createCategoriaCadastroService } from '../src/features/categoria/categoria-cadastro-service.ts'
import { createCategoriaCadastroModel } from '../src/features/categoria/categoria-cadastro-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP sintetico cadastro de categoria: Bearer, payload minimo e respostas 201/400/401/403/404/409/503/rede', { timeout: 10000 }, async context => {
  const credential = 'test.admin.signature', expected = { nome: 'Categoria teste', descricao: null }
  const identifier = id(1)
  let mode = 201, calls = 0
  const server = createServer(async (request, response) => {
    calls++; assert.equal(request.method, 'POST'); assert.equal(request.url, '/api/v1/categorias')
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    assert.equal(request.headers['content-type'], 'application/json')
    let raw = ''; for await (const chunk of request) raw += chunk
    assert.deepEqual(JSON.parse(raw), expected)
    if (mode === 'lost') { response.destroy(); return }
    const json = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)) }
    if (mode === 201) { response.writeHead(201, { Location: `/api/v1/categorias/${identifier}`, 'Content-Type': 'application/json' }); response.end(JSON.stringify({ id: identifier, ...expected, materiais: ['EXTRA'] })); return }
    if (mode === 503) { json(503, { detail: 'PRIVADO' }); return }
    json(mode, { detail: 'PRIVADO', errors: [{ field: 'nome', message: 'PRIVADO' }] })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of [201, 400, 401, 403, 404, 409, 503, 'lost']) {
    mode = next; let token = credential
    const auth = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { assert.equal(used, credential); token = null } })
    const model = createCategoriaCadastroModel(createCategoriaCadastroService(auth.json), () => token ? { id: id(8), perfil: 'ADMINISTRADOR' } : null)
    model.initialize(); model.change('nome', '  Categoria teste  '); model.change('descricao', '   '); await model.submit()
    if (mode === 201) assert.equal(model.getState().savedId, identifier)
    if (mode === 400) { assert.ok(model.getState().fields.nome); assert.equal(model.getState().draft.nome, '  Categoria teste  ') }
    if (mode === 401 || mode === 403 || mode === 404) assert.equal(model.getState().denied, true)
    if (mode === 409) { assert.equal(model.getState().conflict, true); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false) }
    if (mode === 503 || mode === 'lost') assert.equal(model.getState().uncertain, true)
    model.dispose()
  }
  assert.equal(calls, 8)
})
