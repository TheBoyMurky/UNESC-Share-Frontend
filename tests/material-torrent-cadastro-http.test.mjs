import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createMaterialCadastroService } from '../src/features/material/material-cadastro-service.ts'
import { createMaterialCadastroModel } from '../src/features/material/material-cadastro-model.ts'
import { mockService } from './catalog-fixtures.mjs'
import { detail, torrentBytes } from './material-fixtures.mjs'
import { input, id, prepare } from './material-cadastro-fixtures.mjs'

test('HTTP multipart sintetico nativo: boundary/duaspartes/bytes/Bearer/erros sem passoMaterialvazio ou retry', { timeout: 10000 }, async context => {
  const credential = 'header.payload.signature', selected = new File([torrentBytes], 'sintetico.torrent')
  const { magnetUris, ...metadata } = input()
  let mode = 'created', calls = 0
  const server = createServer(async (request, response) => {
    calls++
    assert.equal(request.url, '/api/v1/materiais')
    assert.equal(request.method, 'POST')
    assert.equal(request.headers.authorization, 'Bearer ' + credential)
    assert.equal(request.headers.cookie, undefined)
    assert.match(request.headers['content-type'], /^multipart\/form-data; boundary=.+/)
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    // Parser multipart nativo do Fetch/Node, nao um parser proprio do projeto.
    const form = await new Request('http://localhost/materiais', { method: 'POST', headers: { 'Content-Type': request.headers['content-type'] }, body: Buffer.concat(chunks) }).formData()
    assert.deepEqual([...form.keys()], ['material', 'arquivo'])
    assert.equal(form.getAll('material').length, 1)
    assert.equal(form.getAll('arquivo').length, 1)
    assert.equal(form.get('material').type, 'application/json')
    assert.deepEqual(JSON.parse(await form.get('material').text()), metadata)
    assert.equal(form.get('arquivo').name, selected.name)
    assert.deepEqual(new Uint8Array(await form.get('arquivo').arrayBuffer()), torrentBytes)
    if (mode === 'lost') { response.destroy(); return }
    if (Number.isInteger(mode)) {
      if (mode === 400) {
        response.writeHead(400, { 'Content-Type': 'application/problem+json' })
        response.end(JSON.stringify({ detail: 'caminho-privado', errors: [{ field: 'arquivo', message: 'caminho-privado' }] }))
      } else { response.writeHead(mode); response.end() }
      return
    }
    response.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Location: '/api/v1/materiais/' + id(10) })
    response.end(JSON.stringify({ ...detail(), status: 'PENDENTE', magnets: [], ...(mode === 'badDTO' ? { torrents: [] } : {}) }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of ['created', 400, 401, 409, 413, 415, 503, 'badDTO', 'lost']) {
    mode = next
    let token = credential, rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createMaterialCadastroModel(mockService(), createMaterialCadastroService(authenticated.json, authenticated.multipart))
    await prepare(model); model.setMode('TORRENT'); model.selectTorrent([selected])
    const before = calls
    await model.submit()
    assert.equal(calls, before + 1, 'somente uma requisicao para material + torrent')
    assert.equal(!!model.getState().createdId, mode === 'created')
    assert.equal(model.getState().sending, false)
    assert.equal(model.getState().error.includes('caminho-privado'), false)
    assert.equal(JSON.stringify(model.getState().fields).includes('caminho-privado'), false)
    assert.equal(model.getState().uncertain, [503, 'badDTO', 'lost'].includes(mode))
    if (mode === 'created') { assert.equal(model.getState().file, null); await model.submit(); assert.equal(calls, before + 1) }
    else assert.equal(model.getState().file, selected)
    assert.deepEqual(rejected, mode === 401 ? [credential] : [])
    model.dispose()
    assert.equal(model.getState().file, null)
  }
})
