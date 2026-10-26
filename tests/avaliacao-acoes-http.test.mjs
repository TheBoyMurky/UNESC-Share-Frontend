import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createAvaliacaoService } from '../src/features/avaliacao/avaliacao-service.ts'
import { createAvaliacaoModel } from '../src/features/avaliacao/avaliacao-model.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP sintetico: PUTnota/DELETEminha204 semcorpo, preservacao de terceiros, privado, nova geracao e incerto sem replay', { timeout: 10000 }, async context => {
  const credential = 'header.payload.signature', secret = 'NAO EXIBIR DADOS PRIVADOS'
  const original = { id: id(40), nota: 4.25, dataCadastro: '2026-10-23T12:00:00Z', usuarioId: id(8), materialId: id(10) }
  const other = { ...original, id: id(50), nota: 5, usuarioId: id(7) }
  let stored = { ...original }, published = true, mode = 'ok', writes = 0, generation = 40
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'), collection = '/api/v1/materiais/' + id(10) + '/avaliacoes'
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined); assert.equal(url.search, '')
    if (request.method === 'GET') {
      if (!published) { response.writeHead(404); response.end(); return }
      if (url.pathname === collection + '/minha') {
        response.writeHead(stored ? 200 : 404, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(stored ?? { detail: secret })); return
      }
      assert.equal(url.pathname, collection + '/resumo')
      const quantidade = stored ? 2 : 1, media = stored ? Math.round((stored.nota + other.nota) * 100 / quantidade) / 100 : other.nota
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ media, quantidade })); return
    }
    let body = ''; for await (const chunk of request) body += chunk
    writes++
    if (request.method === 'POST') {
      assert.equal(url.pathname, collection); assert.equal(request.headers['content-type'], 'application/json')
      const input = JSON.parse(body); assert.deepEqual(Object.keys(input), ['nota'])
      assert.equal(stored, null); stored = { ...original, id: id(++generation), nota: input.nota, dataCadastro: '2026-10-23T13:00:00Z' }
      response.writeHead(201, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(stored)); return
    }
    assert.equal(url.pathname, collection + '/minha')
    let status = request.method === 'PUT' ? 200 : 204
    if (request.method === 'PUT') {
      assert.equal(request.headers['content-type'], 'application/json')
      const input = JSON.parse(body); assert.deepEqual(Object.keys(input), ['nota']); assert.equal(typeof input.nota, 'number')
      if (!published || !stored) status = 404
      else if (mode === 'ok' || ['lost', 'malformed', 'generation', 503].includes(mode)) {
        if (mode === 'generation') stored = { ...stored, id: id(41), dataCadastro: '2026-10-23T13:00:00Z' }
        stored = { ...stored, nota: input.nota }
      }
    } else {
      assert.equal(request.method, 'DELETE'); assert.equal(body, ''); assert.equal(request.headers['content-type'], undefined)
      if (mode === 'ok' || ['lost', 'malformed', 200, 503].includes(mode)) stored = null
    }
    if (typeof mode === 'number') status = mode
    if (mode === 'lost') { response.destroy(); return }
    if (mode === 'malformed') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{broken'); return }
    response.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' })
    response.end(status === 204 ? undefined : JSON.stringify(status >= 400 ? { title: secret, detail: secret } : stored))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  let token = credential, rejected = []
  const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
  const service = createAvaliacaoService(authenticated.json, authenticated.delete)
  const make = () => createAvaliacaoModel(service, () => token ? id(8) : null)
  const model = make(); await model.load(id(10), id(9), true); model.startEdit(); model.changeActionNota('0,00'); await model.submitAction()
  assert.equal(stored.nota, 0); assert.equal(stored.id, original.id); assert.equal(stored.dataCadastro, original.dataCadastro)
  assert.deepEqual(model.getState().resumo, { media: 2.5, quantidade: 2 })
  model.startRemoval(); const before = writes; await model.submitAction(); await model.closeAction(); assert.equal(writes, before)
  model.startRemoval(); model.confirmRemoval(true); await model.submitAction()
  assert.equal(stored, null); assert.deepEqual(model.getState().resumo, { media: 5, quantidade: 1 })
  model.changeNota('4,50'); await model.submit(); assert.equal(stored.id, id(41)); assert.equal(model.getState().minha.nota, 4.5)
  assert.equal(other.nota, 5); assert.equal(other.id, id(50)); model.dispose()
  for (const kind of ['edit', 'remove']) {
    for (const next of [400, 401, 403, 404, 409, 503, 'lost', 'malformed', ...(kind === 'edit' ? ['generation'] : [200])]) {
      token = credential; rejected = []; published = true; stored = { ...original }; mode = next
      const instance = make(); await instance.load(id(10), id(9), true)
      if (kind === 'edit') { instance.startEdit(); instance.changeActionNota('3,25') } else { instance.startRemoval(); instance.confirmRemoval(true) }
      const count = writes; await instance.submitAction(); assert.equal(writes, count + 1)
      assert.equal(JSON.stringify(instance.getState()).includes(secret), false); assert.deepEqual(rejected, next === 401 ? [credential] : [])
      if ([503, 'lost', 'malformed', 'generation', 200].includes(next)) {
        assert.equal(instance.getState().action.uncertain, true); instance.confirmRemoval(true); await instance.submitAction(); assert.equal(writes, count + 1)
        await instance.closeAction(); assert.equal(writes, count + 1)
        if (kind === 'edit') assert.equal(instance.getState().minha.nota, 3.25)
        else assert.equal(instance.getState().minha, null)
      }
      assert.equal(other.nota, 5); instance.dispose()
    }
  }
  token = credential; mode = 'ok'; stored = { ...original }; published = true
  const privateMaterial = make(); await privateMaterial.load(id(10), id(9), true); privateMaterial.startRemoval(); privateMaterial.confirmRemoval(true); published = false
  await privateMaterial.submitAction(); assert.equal(stored, null); assert.equal(privateMaterial.getState().unavailable, true); assert.ok(privateMaterial.getState().message.includes('confirmada'))
  const count = writes; await service.remove(id(10), id(8)); assert.equal(writes, count + 1); assert.equal(stored, null); assert.equal(other.nota, 5); privateMaterial.dispose()
  published = true; stored = { ...original }
  const missing = make(); await missing.load(id(10), id(9), true); missing.startEdit(); missing.changeActionNota('2'); stored = null
  await missing.submitAction(); assert.equal(missing.getState().unavailable, true); assert.equal(stored, null); missing.dispose()
})
