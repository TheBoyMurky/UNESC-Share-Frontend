import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createCategoriaEdicaoService } from '../src/features/categoria/categoria-edicao-service.ts'
import { createCategoriaEdicaoModel } from '../src/features/categoria/categoria-edicao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP sintetico edição categoria: GET/PUT Bearer, payload completo e consulta após 409/incerteza', { timeout: 10000 }, async context => {
  const categoryId = id(1), credential = 'test.admin.signature', original = { id: categoryId, nome: 'Categoria teste', descricao: 'Descrição anterior' }
  const body = { nome: 'Categoria alterada', descricao: null }
  let mode = 200, calls = 0, gets = 0, puts = 0
  const server = createServer(async (request, response) => {
    calls++; assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    const url = new URL(request.url, 'http://localhost')
    let raw = ''; for await (const chunk of request) raw += chunk
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.method === 'GET') {
      gets++; assert.equal(url.pathname, `/api/v1/categorias/${categoryId}`); assert.equal(url.search, ''); assert.equal(raw, ''); assert.equal(request.headers['content-type'], undefined)
      json(200, { ...original, materiais: ['EXTRA'], email: 'PRIVADO' }); return
    }
    puts++; assert.equal(request.method, 'PUT'); assert.equal(url.pathname, `/api/v1/categorias/${categoryId}`); assert.equal(url.search, '')
    assert.equal(request.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(raw), body)
    if (mode === 'lost') { response.destroy(); return }
    if (mode === 503) { json(503, { detail: 'PRIVADO' }); return }
    if (mode !== 200) { json(mode, { detail: 'PRIVADO', errors: [{ message: 'PRIVADO' }] }); return }
    json(200, { id: categoryId, ...body, materiais: ['EXTRA'] })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)

  for (const next of [200, 400, 401, 403, 404, 409, 503, 'lost']) {
    mode = next; let token = credential
    const auth = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { assert.equal(used, credential); token = null } })
    const model = createCategoriaEdicaoModel(createCategoriaEdicaoService(auth.json), () => token ? { id: id(8), perfil: 'ADMINISTRADOR' } : null)
    const loaded = new Promise(resolve => { let unsubscribe = () => {}; unsubscribe = model.subscribe(state => { if (state.categoria || state.denied) { unsubscribe(); resolve() } }); model.initialize(categoryId) })
    await loaded; assert.equal(model.getState().categoria?.id, categoryId, `GET inicial mode=${mode}`)
    model.change('nome', body.nome); model.change('descricao', '  '); await model.submit()
    if (mode === 200) assert.equal(model.getState().saved, true)
    if (mode === 400) { assert.equal(model.getState().draft.nome, body.nome); assert.ok(model.getState().fields.nome); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false) }
    if (mode === 401 || mode === 403 || mode === 404) { assert.equal(model.getState().denied, true); assert.equal(model.getState().categoria, null) }
    if (mode === 409) {
      assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(puts, 6)
      await model.reload(); assert.equal(model.getState().conflict, false); assert.deepEqual(model.getState().draft, { nome: original.nome, descricao: original.descricao })
    }
    if (mode === 503 || mode === 'lost') {
      assert.equal(model.getState().uncertain, true); await model.submit(); assert.equal(model.getState().uncertain, true)
      await model.reload(); assert.equal(model.getState().uncertain, false); assert.equal(model.getState().saved, false)
    }
    model.dispose()
  }
  assert.equal(puts, 8); assert.equal(gets, 11); assert.equal(calls, 19)
})
