import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createComentarioService } from '../src/features/comentario/comentario-service.ts'
import { createComentarioModel } from '../src/features/comentario/comentario-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico: comentarios Bearer, pagina ASC, POSTconteudo, erros seguros/401/404 e resposta perdida sem repost', { timeout: 10000 }, async context => {
  const credential = 'header.payload.signature', privateText = 'NAO ECOAR corpo privado'
  const comment = (n, conteudo = 'Texto ' + n) => ({ id: id(n), conteudo, dataCadastro: '2026-10-23T12:00:00Z', status: 'ATIVO', usuarioId: id(8), materialId: id(10) })
  let stored = Array.from({ length: 21 }, (_, n) => comment(n + 30)), posts = 0, mode = 201, published = true
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    assert.equal(url.pathname, '/api/v1/materiais/' + id(10) + '/comentarios')
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    if (request.method === 'GET') {
      assert.deepEqual([...url.searchParams.keys()], ['page', 'size'])
      const number = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
      response.writeHead(published ? 200 : 404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(published ? page(stored.slice(number * size, (number + 1) * size), number, size, stored.length) : { detail: privateText })); return
    }
    assert.equal(request.method, 'POST'); assert.equal(url.search, '')
    assert.equal(request.headers['content-type'], 'application/json')
    let body = ''; for await (const chunk of request) body += chunk
    const input = JSON.parse(body); assert.deepEqual(Object.keys(input), ['conteudo']); assert.equal(input.conteudo, input.conteudo.trim())
    posts++
    const dto = comment(100 + posts, input.conteudo)
    if ([201, 503, 'lost', 'malformed'].includes(mode)) stored.push(dto)
    if (mode === 'lost') { response.destroy(); return }
    if (mode === 'malformed') { response.writeHead(201, { 'Content-Type': 'application/json' }); response.end('{broken'); return }
    response.writeHead(mode, { 'Content-Type': mode === 201 ? 'application/json' : 'application/problem+json' })
    response.end(JSON.stringify(mode === 201 ? dto : { title: privateText, detail: privateText, errors: [{ field: 'conteudo', message: privateText, rejectedValue: privateText }] }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  let token = credential, rejected = []
  const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
  const makeModel = () => createComentarioModel(createComentarioService(authenticated.json), () => token ? id(8) : null)
  const model = makeModel()
  await model.load(id(10), true); assert.equal(model.getState().data.content.length, 20); assert.equal(model.getState().data.page.totalElements, 21)
  await model.goToPage(1); assert.equal(model.getState().data.content[0].id, id(50))
  model.changeDraft('  <b>Texto simples</b>\nSegunda linha  '); await model.submit()
  assert.equal(posts, 1); assert.equal(model.getState().draft, ''); assert.equal(model.getState().data.page.number, 0)
  await model.goToPage(1); assert.equal(model.getState().data.content.at(-1).conteudo, '<b>Texto simples</b>\nSegunda linha')
  model.dispose()
  for (const next of [400, 401, 403, 404, 409, 503, 'lost', 'malformed']) {
    token = credential; rejected = []; mode = next; published = true
    const instance = makeModel(); await instance.load(id(10), true); instance.changeDraft('Outro texto')
    const before = posts; await instance.submit()
    assert.equal(posts, before + 1); assert.equal(instance.getState().message, '')
    assert.equal(JSON.stringify(instance.getState()).includes(privateText), false)
    assert.deepEqual(rejected, mode === 401 ? [credential] : [])
    if ([503, 'lost', 'malformed'].includes(mode)) {
      assert.equal(instance.getState().uncertain, true); await instance.submit(); instance.prepareRetry(); assert.equal(posts, before + 1)
      await instance.reload(); await instance.goToPage(instance.getState().data.page.totalPages - 1)
      assert.equal(instance.getState().data.content.at(-1).conteudo, 'Outro texto'); await instance.submit(); assert.equal(posts, before + 1)
      instance.prepareRetry(); assert.equal(instance.getState().uncertain, false); assert.equal(posts, before + 1)
    }
    if ([401, 403, 404].includes(mode)) { assert.equal(instance.getState().unavailable, true); assert.equal(instance.getState().data, null) }
    instance.dispose()
  }
  token = credential; published = true
  const stale = makeModel(); await stale.load(id(10), true); stale.changeDraft('Rascunho')
  published = false; await stale.reload(); assert.equal(stale.getState().data, null); assert.equal(stale.getState().draft, '')
  const before = posts; await stale.submit(); assert.equal(posts, before); stale.dispose()
})
