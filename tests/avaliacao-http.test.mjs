import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createAvaliacaoService } from '../src/features/avaliacao/avaliacao-service.ts'
import { createAvaliacaoModel } from '../src/features/avaliacao/avaliacao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP sintetico: minha404+resumoPUBLICADO, POSTnota numerica/Bearer, zero,409/401/incerto/reconciliacao sem replay', { timeout: 10000 }, async context => {
  const credential = 'header.payload.signature', otherCredential = 'header.other.signature', secret = 'DETALHE PRIVADO NAO EXIBIR'
  let stored = null, published = true, mode = 201, posts = 0
  const reads = []
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'), collection = '/api/v1/materiais/' + id(10) + '/avaliacoes'
    assert.ok([credential, otherCredential].some(token => request.headers.authorization === 'Bearer ' + token))
    assert.equal(request.headers.cookie, undefined); assert.equal(url.search, '')
    const user = request.headers.authorization === 'Bearer ' + credential ? id(8) : id(7)
    if (request.method === 'GET') {
      reads.push(url.pathname)
      if (!published) { response.writeHead(404); response.end(); return }
      if (url.pathname === collection + '/minha') {
        response.writeHead(stored && stored.usuarioId === user ? 200 : 404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(stored && stored.usuarioId === user ? stored : { detail: secret })); return
      }
      assert.equal(url.pathname, collection + '/resumo')
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(stored ? { media: stored.nota, quantidade: 1 } : { media: null, quantidade: 0 })); return
    }
    assert.equal(request.method, 'POST'); assert.equal(url.pathname, collection); assert.equal(request.headers['content-type'], 'application/json')
    let body = ''; for await (const chunk of request) body += chunk
    const input = JSON.parse(body); assert.deepEqual(Object.keys(input), ['nota']); assert.equal(typeof input.nota, 'number')
    posts++
    if ([201, 503, 'lost', 'malformed', 'wrongdto', 409].includes(mode)) stored = { id: id(40), nota: mode === 409 ? 3.5 : input.nota, dataCadastro: '2026-10-23T12:00:00Z', usuarioId: user, materialId: id(10) }
    if (mode === 'lost') { response.destroy(); return }
    if (mode === 'malformed') { response.writeHead(201, { 'Content-Type': 'application/json' }); response.end('{broken'); return }
    const status = mode === 'wrongdto' ? 201 : mode
    response.writeHead(status, { 'Content-Type': status === 201 ? 'application/json' : 'application/problem+json', Location: 'https://invalid.example/ignore-location' })
    response.end(JSON.stringify(status === 201 ? mode === 'wrongdto' ? { ...stored, nota: 3.25 } : stored : { title: secret, detail: secret, errors: [{ field: 'nota', message: secret, rejectedValue: secret }] }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  let token = credential, rejected = []
  const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
  const make = () => createAvaliacaoModel(createAvaliacaoService(authenticated.json), () => token ? id(8) : null)
  const model = make(); await model.load(id(10), id(9), true)
  assert.deepEqual(reads.slice(-2).map(path => path.split('/').at(-1)), ['minha', 'resumo'])
  assert.equal(model.getState().minha, null); assert.equal(model.getState().resumo.media, null)
  model.changeNota('0,00'); await model.submit(); assert.equal(posts, 1); assert.equal(stored.nota, 0)
  assert.deepEqual(model.getState().resumo, { media: 0, quantidade: 1 }); assert.equal(model.getState().minha.nota, 0)
  await model.submit(); assert.equal(posts, 1); model.dispose()
  const other = createAuthenticatedClient(client, { getToken: () => otherCredential, rejectToken: () => assert.fail() })
  const otherData = await createAvaliacaoService(other.json).read(id(10), id(7))
  assert.equal(otherData.minha, null); assert.deepEqual(otherData.resumo, { media: 0, quantidade: 1 })
  for (const next of [400, 401, 403, 404, 409, 503, 'lost', 'malformed', 'wrongdto']) {
    stored = null; published = true; mode = next; token = credential; rejected = []
    const instance = make(); await instance.load(id(10), id(9), true); instance.changeNota('4,25')
    const before = posts; await instance.submit()
    assert.equal(posts, before + 1); assert.equal(JSON.stringify(instance.getState()).includes(secret), false)
    assert.deepEqual(rejected, next === 401 ? [credential] : [])
    if ([409, 503, 'lost', 'malformed', 'wrongdto'].includes(next)) {
      await instance.submit(); instance.prepareRetry(); assert.equal(posts, before + 1)
      await instance.reload(); assert.equal(instance.getState().minha.nota, next === 409 ? 3.5 : 4.25)
      await instance.submit(); assert.equal(posts, before + 1); assert.equal(instance.getState().uncertain, false); assert.equal(instance.getState().conflict, false)
    }
    if (next === 403) { assert.equal(instance.getState().forbidden, true); assert.equal(token, credential) }
    if ([401, 404].includes(next)) assert.equal(instance.getState().unavailable, true)
    instance.dispose()
  }
  token = credential; stored = null; published = false
  const privateMaterial = make(); const count = posts
  await privateMaterial.load(id(10), id(9), true); privateMaterial.changeNota('4'); await privateMaterial.submit()
  assert.equal(privateMaterial.getState().unavailable, true); assert.equal(privateMaterial.getState().checked, false); assert.equal(posts, count); privateMaterial.dispose()
  published = true
  const owner = make(); await owner.load(id(10), id(8), true); owner.changeNota('5'); await owner.submit()
  assert.equal(posts, count); owner.dispose()
})
