import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createMaterialTorrentAdicaoService } from '../src/features/material/material-torrent-adicao-service.ts'
import { createMaterialTorrentAdicaoModel } from '../src/features/material/material-torrent-adicao-model.ts'
import { detail, id, torrentBytes } from './material-fixtures.mjs'

test('HTTP sintetico Torrent: GETantesPOST/multipart arquivo unico/Bearer/201recibo semLocation e incerto semretry', { timeout: 10000 }, async context => {
  const credential = 'test.author.signature', calls = []
  let stored = detail(), mode = 201, posts = 0
  const selected = () => new File([torrentBytes], 'novo.torrent', { type: 'application/x-bittorrent' })
  const receipt = () => ({ id: id(22), nomeArquivo: selected().name, infoHash: 'b'.repeat(40), tamanho: selected().size, dataCadastro: '2026-10-26T12:00:00Z' })
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); calls.push(request.method)
    assert.equal(url.search, ''); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://invalid.test/nao-seguir' }); response.end(JSON.stringify(value)) }
    if (request.method === 'GET') { assert.equal(url.pathname, `/api/v1/materiais/${id(10)}`); assert.equal(request.headers['content-type'], undefined); assert.equal(chunks.length, 0); json(200, stored); return }
    posts++; assert.equal(request.method, 'POST'); assert.equal(url.pathname, `/api/v1/materiais/${id(10)}/torrents`)
    const contentType = request.headers['content-type']; assert.match(contentType, /^multipart\/form-data; boundary=/)
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': contentType } }).formData()
    assert.deepEqual([...form.keys()], ['arquivo']); const part = form.get('arquivo'); assert.equal(part.name, selected().name); assert.equal(part.size, selected().size); assert.deepEqual(new Uint8Array(await part.arrayBuffer()), torrentBytes)
    if (Number.isInteger(mode) && mode !== 201) { json(mode, { detail: 'PRIVADO', errors: [{ field: 'arquivo', message: 'PRIVADO' }] }); return }
    stored = { ...stored, status: 'PENDENTE', torrents: [...stored.torrents, receipt()] }
    if (mode === 'lost') { response.destroy(); return }
    json(201, mode === 'badDTO' ? { ...receipt(), tamanho: 1 } : { ...receipt(), caminhoArquivo: 'PRIVADO' })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of [201, 400, 413, 415, 401, 403, 404, 409, 503, 'badDTO', 'lost']) {
    stored = detail(); mode = next; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createMaterialTorrentAdicaoModel(createMaterialTorrentAdicaoService(authenticated.json, authenticated.multipart), () => token ? { id: id(8), perfil: 'USUARIO' } : null)
    const before = posts, start = calls.length
    await model.load(id(10)); model.selectFiles([selected()]); model.setConfirmed(true); await model.submit()
    assert.equal(posts, before + 1); assert.deepEqual(calls.slice(start), ['GET', 'POST']); assert.equal(model.getState().file, null); assert.equal(model.getState().confirmed, false); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if (mode === 201) { assert.equal(model.getState().savedId, id(10)); assert.equal(model.getState().torrentId, id(22)); assert.equal(model.getState().material, null); assert.equal(stored.status, 'PENDENTE'); assert.deepEqual(stored.magnets, detail().magnets) }
    if ([400, 413, 415].includes(mode)) { assert.ok(model.getState().material); assert.equal(stored.torrents.length, 1) }
    if ([409, 503, 'badDTO', 'lost'].includes(mode)) {
      assert.equal(model.getState().mustReload, true); assert.equal(model.getState().material, null); assert.equal(model.getState().torrentId, '')
      model.selectFiles([selected()]); model.setConfirmed(true); await model.submit(); assert.equal(posts, before + 1)
      await model.reload(); assert.equal(model.getState().savedId, ''); assert.equal(model.getState().file, null); assert.equal(model.getState().confirmed, false)
      if (mode === 'lost') assert.equal(model.getState().material.torrents.length, 2, 'GET atual nao atribui um Torrent a POST perdido')
    }
    if ([401, 403, 404].includes(mode)) { assert.equal(model.getState().denied, true); assert.equal(model.getState().material, null) }
    if (mode === 401) { assert.deepEqual(rejected, [credential]); assert.equal(token, null) } else { assert.deepEqual(rejected, []); assert.equal(token, credential) }
    await model.submit(); assert.equal(posts, before + 1); model.dispose()
  }
})
