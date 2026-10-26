import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createMaterialMagnetAdicaoService } from '../src/features/material/material-magnet-adicao-service.ts'
import { createMaterialMagnetAdicaoModel } from '../src/features/material/material-magnet-adicao-model.ts'
import { detail, id } from './material-fixtures.mjs'

test('HTTP sintetico adicaoMagnets: GETantesPOST/JSONsoURIs/PENDENTE e perdaaposgravacao semretry', { timeout: 10000 }, async context => {
  const credential = 'test.author.signature', uris = ['magnet:?xt=urn:btih:' + 'b'.repeat(40), 'magnet:?xt=urn:btmh:1220' + 'c'.repeat(64)]
  let stored = detail(), mode = 200, posts = 0
  const calls = []
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); calls.push(request.method)
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined); assert.equal(url.search, '')
    const json = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
    let body = ''; for await (const chunk of request) body += chunk
    if (request.method === 'GET') { assert.equal(url.pathname, `/api/v1/materiais/${id(10)}`); assert.equal(request.headers['content-type'], undefined); assert.equal(body, ''); json(200, stored); return }
    assert.equal(request.method, 'POST'); assert.equal(url.pathname, `/api/v1/materiais/${id(10)}/magnets`); assert.equal(request.headers['content-type'], 'application/json')
    assert.deepEqual(JSON.parse(body), { magnetUris: uris }); posts++
    if (Number.isInteger(mode) && mode !== 200) { json(mode, { detail: 'PRIVADO ERRO', errors: [{ field: 'magnetUris[0]', message: 'PRIVADO ERRO' }] }); return }
    stored = { ...stored, status: 'PENDENTE', magnets: [...stored.magnets, ...uris.map((magnetUri, i) => ({ id: id(22 + i), magnetUri, infoHash: (i ? 'c' : 'b').repeat(i ? 64 : 40), dataCadastro: '2026-10-26T12:00:00Z' }))] }
    if (mode === 'lost') { response.destroy(); return }
    json(200, mode === 'badDTO' ? { ...stored, status: 'PUBLICADO' } : { ...stored, email: 'EXTRA PRIVADO' })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of [200, 400, 401, 403, 404, 409, 503, 'badDTO', 'lost']) {
    stored = detail(); mode = next; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createMaterialMagnetAdicaoModel(createMaterialMagnetAdicaoService(authenticated.json), () => token ? { id: id(8), perfil: 'USUARIO' } : null)
    const before = posts, start = calls.length
    await model.load(id(10)); model.changeUri(0, '  ' + uris[0] + '  '); model.addField(); model.changeUri(1, uris[1]); model.setConfirmed(true); await model.submit()
    assert.equal(posts, before + 1); assert.deepEqual(calls.slice(start), ['GET', 'POST']); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if (mode === 200) { assert.equal(model.getState().savedId, id(10)); assert.equal(model.getState().material, null); assert.deepEqual(model.getState().uris, []); assert.equal(stored.status, 'PENDENTE'); assert.equal(stored.magnets.length, 3); assert.deepEqual(stored.torrents, detail().torrents) }
    if (mode === 400) { assert.equal(model.getState().uris.length, 2); assert.equal(model.getState().confirmed, false); assert.equal(stored.magnets.length, 1) }
    if ([409, 503, 'badDTO', 'lost'].includes(mode)) {
      assert.equal(model.getState().mustReload, true); assert.equal(model.getState().material, null); assert.deepEqual(model.getState().uris, [])
      model.setConfirmed(true); await model.submit(); assert.equal(posts, before + 1); await model.reload(); assert.equal(model.getState().savedId, ''); assert.deepEqual(model.getState().uris, ['']); assert.equal(model.getState().confirmed, false)
      if (mode === 'lost') assert.equal(model.getState().material.magnets.length, 3, 'consulta atual nao atribui lote a resposta perdida')
    }
    if ([401, 403, 404].includes(mode)) { assert.equal(model.getState().denied, true); assert.equal(model.getState().material, null); assert.deepEqual(model.getState().uris, []) }
    if (mode === 401) { assert.deepEqual(rejected, [credential]); assert.equal(token, null) } else { assert.deepEqual(rejected, []); assert.equal(token, credential) }
    await model.submit(); assert.equal(posts, before + 1); model.dispose()
  }
})
