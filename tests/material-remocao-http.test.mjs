import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createMaterialRemocaoService } from '../src/features/material/material-remocao-service.ts'
import { createMaterialRemocaoModel } from '../src/features/material/material-remocao-model.ts'
import { detail, id, magnetUri } from './material-fixtures.mjs'

test('HTTP sintetico: GET antes de confirmacao, DELETEBearer sem corpo204/erros/incerto/reconsulta sem retry', { timeout: 10000 }, async context => {
  const credential = 'header.payload.signature'
  let stored = detail(), mode = 204, deletes = 0, reads = 0
  const server = createServer(async (request, response) => {
    assert.equal(request.url, '/api/v1/materiais/' + id(10))
    assert.equal(request.headers.authorization, 'Bearer ' + credential)
    assert.equal(request.headers.cookie, undefined)
    if (request.method === 'GET') {
      reads++
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(stored)); return
    }
    assert.equal(request.method, 'DELETE')
    deletes++
    assert.equal(request.headers['content-type'], undefined)
    let body = ''
    for await (const chunk of request) body += chunk
    assert.equal(body, '')
    if ([204, 200, 503, 'lost'].includes(mode)) stored = { ...stored, status: 'REMOVIDO' }
    if (mode === 'lost') { response.destroy(); return }
    if (mode === 400) {
      response.writeHead(400, { 'Content-Type': 'application/problem+json' }); response.end(JSON.stringify({ title: magnetUri, detail: magnetUri })); return
    }
    response.writeHead(mode, mode === 200 ? { 'Content-Type': 'application/json' } : {})
    response.end(mode === 200 ? JSON.stringify({ message: magnetUri }) : undefined)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const initialStatus of ['PENDENTE', 'PUBLICADO', 'BLOQUEADO', 'REMOVIDO']) {
    stored = { ...detail(), status: initialStatus }; mode = 204
    const authenticated = createAuthenticatedClient(client, { getToken: () => credential, rejectToken: () => assert.fail() })
    const model = createMaterialRemocaoModel(createMaterialRemocaoService(authenticated.json, authenticated.delete), () => id(8))
    const before = deletes
    await model.load(id(10)); await model.submit()
    assert.equal(deletes, before, 'abrir/submit sem confirmacao nao remove')
    assert.equal(JSON.stringify(model.getState()).includes(magnetUri), false)
    model.setConfirmed(true); await model.submit(); await model.submit()
    assert.equal(deletes, before + (initialStatus === 'REMOVIDO' ? 0 : 1))
    assert.equal(model.getState().result, initialStatus === 'REMOVIDO' ? 'alreadyRemoved' : 'removed')
    assert.deepEqual(stored.magnets, detail().magnets); assert.deepEqual(stored.torrents, detail().torrents)
    model.dispose()
  }
  for (const next of [400, 401, 403, 404, 409, 503, 200, 'lost']) {
    stored = detail(); mode = next
    let token = credential, rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createMaterialRemocaoModel(createMaterialRemocaoService(authenticated.json, authenticated.delete), () => token ? id(8) : null)
    const before = deletes
    await model.load(id(10)); model.setConfirmed(true); await model.submit(); await model.submit()
    assert.equal(deletes, before + 1)
    assert.equal(model.getState().result, '')
    assert.equal(model.getState().confirmed, false)
    assert.equal(model.getState().error.includes(magnetUri), false)
    assert.deepEqual(rejected, mode === 401 ? [credential] : [])
    if ([503, 200, 'lost'].includes(mode)) {
      assert.equal(model.getState().uncertain, true)
      model.setConfirmed(true); await model.submit(); assert.equal(deletes, before + 1)
      await model.reload(); assert.equal(model.getState().result, 'alreadyRemoved')
      model.setConfirmed(true); await model.submit(); assert.equal(deletes, before + 1)
    }
    model.dispose()
  }
  // Concorrencia simulada: outra acao ja removeu apos GET; DELETE continua204 idempotente.
  stored = detail(); mode = 204
  const authenticated = createAuthenticatedClient(client, { getToken: () => credential, rejectToken: () => assert.fail() })
  const model = createMaterialRemocaoModel(createMaterialRemocaoService(authenticated.json, authenticated.delete), () => id(8))
  await model.load(id(10)); stored = { ...stored, status: 'REMOVIDO' }
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().result, 'removed')
  model.dispose()
  stored = { ...detail(), usuarioId: id(99) }
  const foreign = createMaterialRemocaoModel(createMaterialRemocaoService(authenticated.json, authenticated.delete), () => id(8))
  const before = deletes
  await foreign.load(id(10)); foreign.setConfirmed(true); await foreign.submit()
  assert.equal(deletes, before); assert.equal(foreign.getState().material, null)
  assert.ok(reads > 0)
  foreign.dispose()
})
