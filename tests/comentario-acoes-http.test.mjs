import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createComentarioService } from '../src/features/comentario/comentario-service.ts'
import { createComentarioModel } from '../src/features/comentario/comentario-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico: PUTconteudo/DELETEsemcorpo204, autor, conflito/acesso e resposta perdida sem replay', { timeout: 10000 }, async context => {
  const credential = 'header.payload.signature', secret = 'CORPO PRIVADO NAO EXIBIR'
  const original = { id: id(30), conteudo: 'Original', dataCadastro: '2026-10-23T12:00:00Z', status: 'ATIVO', usuarioId: id(8), materialId: id(10) }
  let stored = { ...original }, published = true, writes = 0, mode = 'ok'
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'), collection = '/api/v1/materiais/' + id(10) + '/comentarios'
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    if (request.method === 'GET') {
      assert.equal(url.pathname, collection, 'nenhum GETindividual ou privado')
      const number = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
      response.writeHead(published ? 200 : 404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(published ? page(stored.status === 'ATIVO' ? [stored] : [], number, size) : { detail: secret })); return
    }
    writes++; assert.equal(url.pathname, collection + '/' + original.id); assert.equal(url.search, '')
    let body = ''; for await (const chunk of request) body += chunk
    assert.ok(['PUT', 'DELETE'].includes(request.method))
    let status = request.method === 'PUT' ? 200 : 204
    if (request.method === 'PUT') {
      assert.equal(request.headers['content-type'], 'application/json')
      const input = JSON.parse(body); assert.deepEqual(Object.keys(input), ['conteudo'])
      if (!published) status = 404
      else if (stored.status !== 'ATIVO') status = 409
      else if (mode === 'ok' || ['lost', 'malformed', 503].includes(mode)) stored = { ...stored, conteudo: input.conteudo }
    } else {
      assert.equal(body, ''); assert.equal(request.headers['content-type'], undefined)
      if (mode === 'ok' || ['lost', 'malformed', 200, 503].includes(mode)) stored = { ...stored, status: 'REMOVIDO' }
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
  const service = createComentarioService(authenticated.json, authenticated.delete)
  const makeModel = () => createComentarioModel(service, () => token ? id(8) : null)
  const model = makeModel()
  await model.load(id(10), true); model.startEdit(id(30)); model.changeActionDraft('  Corrigido\n'); await model.submitAction()
  assert.equal(stored.conteudo, 'Corrigido'); assert.equal(stored.id, original.id); assert.equal(stored.dataCadastro, original.dataCadastro); assert.equal(model.getState().data.content[0].conteudo, 'Corrigido')
  model.startRemoval(id(30)); const before = writes; await model.submitAction(); await model.closeAction(); assert.equal(writes, before)
  model.startRemoval(id(30)); model.confirmRemoval(true)
  published = false; stored.status = 'OCULTO' // Mudanca apos selecao: DELETE proprio continua permitido.
  await model.submitAction(); assert.equal(stored.status, 'REMOVIDO'); assert.equal(stored.conteudo, 'Corrigido'); assert.equal(model.getState().unavailable, true)
  await service.remove(id(10), original, id(8)) // Mesmo UUID conhecido: idempotencia simulada, sem GET privado.
  assert.equal(stored.status, 'REMOVIDO'); model.dispose()
  for (const kind of ['edit', 'remove']) {
    for (const next of [400, 401, 403, 404, 409, 503, 'lost', 'malformed', ...(kind === 'remove' ? [200] : [])]) {
      stored = { ...original }; published = true; mode = next; token = credential; rejected = []
      const instance = makeModel(); await instance.load(id(10), true)
      if (kind === 'edit') { instance.startEdit(id(30)); instance.changeActionDraft('Novo') }
      else { instance.startRemoval(id(30)); instance.confirmRemoval(true) }
      const count = writes; await instance.submitAction()
      assert.equal(writes, count + 1); assert.equal(JSON.stringify(instance.getState()).includes(secret), false)
      assert.deepEqual(rejected, next === 401 ? [credential] : [])
      if ([503, 'lost', 'malformed', 200].includes(next)) {
        assert.equal(instance.getState().action.uncertain, true)
        instance.confirmRemoval(true); await instance.submitAction(); assert.equal(writes, count + 1)
        await instance.closeAction(); assert.equal(writes, count + 1)
        if (kind === 'edit') assert.equal(instance.getState().data.content[0].conteudo, 'Novo')
        else assert.deepEqual(instance.getState().data.content, [])
      }
      if ([401, 403, 404].includes(next)) { assert.equal(instance.getState().action, null); assert.equal(instance.getState().data, null) }
      instance.dispose()
    }
  }
  mode = 'ok'; token = credential; published = true; stored = { ...original }
  const changed = makeModel(); await changed.load(id(10), true); changed.startEdit(id(30)); changed.changeActionDraft('Novo'); stored.status = 'OCULTO'
  await changed.submitAction(); assert.equal(changed.getState().action.blocked, true); assert.equal(stored.conteudo, 'Original'); await changed.closeAction(); assert.deepEqual(changed.getState().data.content, []); changed.dispose()
})
