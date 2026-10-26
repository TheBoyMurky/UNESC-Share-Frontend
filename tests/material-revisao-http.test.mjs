import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createMaterialService } from '../src/features/material/material-service.ts'
import { createMaterialRevisaoModel } from '../src/features/moderacao/material-revisao-model.ts'
import { detail, id, torrentBytes, magnetUri } from './material-fixtures.mjs'

test('HTTP sintetico: revisao soGET/Bearer/metadados privados/nomes/torrent limitado/copia explicita e401-403', { timeout: 10000 }, async context => {
  const credential = 'header.moderator.signature', secret = 'NAO EXIBIR CAUSA PRIVADA'
  let status = 'PENDENTE', mode = 'ok', requests = 0, downloads = 0
  const academic = {
    ['/api/v1/disciplinas/' + id(5)]: { id: id(5), nome: 'Disciplina', codigo: '123', cursoId: id(3) },
    ['/api/v1/categorias/' + id(7)]: { id: id(7), nome: 'Resumo' },
    ['/api/v1/cursos/' + id(3)]: { id: id(3), nome: 'Curso', instituicaoId: id(1) },
    ['/api/v1/instituicoes/' + id(1)]: { id: id(1), nome: 'Instituicao' },
  }
  const server = createServer(async (request, response) => {
    requests++; assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + credential)
    assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    let body = ''; for await (const chunk of request) body += chunk; assert.equal(body, '')
    const json = (code, data) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
    if (request.url === '/api/v1/materiais/' + id(10)) { json(200, { ...detail(), status, email: secret, caminhoArquivo: secret }); return }
    if (request.url === `/api/v1/materiais/${id(10)}/torrents/${id(20)}`) {
      downloads++
      if (mode === 401) { response.writeHead(401); response.end(); return }
      if (mode === 403) { json(403, { title: secret, detail: secret }); return }
      response.writeHead(200, { 'Content-Type': 'application/x-bittorrent', 'Content-Length': String(torrentBytes.length), 'Content-Disposition': 'attachment; filename="../inseguro.exe"' }); response.end(torrentBytes); return
    }
    assert.ok(academic[request.url], 'sem rotas de mutacao, interacoes ou consultas pessoais extras')
    if (mode === 'academic-403') { json(403, { title: secret, detail: secret }); return }
    json(200, academic[request.url])
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    let token = credential, rejected = [], saved = [], copied = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createMaterialRevisaoModel(createMaterialService(authenticated.json, authenticated.torrent), { save: file => { saved.push(file) }, copy: async uri => { copied.push(uri) } }, () => token ? { id: id(8), perfil } : null)
    for (const state of ['PENDENTE', 'PUBLICADO', 'BLOQUEADO', 'REMOVIDO']) {
      status = state; const before = requests, beforeDownloads = downloads
      await model.load(id(10)); assert.equal(requests, before + 5); assert.equal(downloads, beforeDownloads); assert.equal(model.getState().material.status, state)
      assert.equal(JSON.stringify(model.getState()).includes(secret), false)
    }
    await model.copy(id(21)); assert.deepEqual(copied, [magnetUri])
    await model.download(id(20)); await model.download(id(20)); assert.equal(saved.length, 2); assert.equal(saved[0].filename, id(20) + '.torrent')
    assert.deepEqual(new Uint8Array(await saved[0].blob.arrayBuffer()), torrentBytes)
    mode = 403; await model.download(id(20)); assert.equal(model.getState().material, null); assert.equal(model.getState().academic, null); assert.deepEqual(rejected, []); assert.equal(token, credential)
    assert.equal(model.getState().error.includes(secret), false); assert.equal(JSON.stringify(model.getState()).includes(magnetUri), false)
    mode = 'ok'; await model.retry(); assert.ok(model.getState().material)
    mode = 401; await model.download(id(20)); assert.deepEqual(rejected, [credential]); assert.equal(token, null); assert.equal(model.getState().material, null); model.dispose(); mode = 'ok'
  }
  const before = requests
  const ordinary = createAuthenticatedClient(client, { getToken: () => credential, rejectToken: () => assert.fail() })
  const denied = createMaterialRevisaoModel(createMaterialService(ordinary.json, ordinary.torrent), { save: () => assert.fail(), copy: () => assert.fail() }, () => ({ id: id(8), perfil: 'USUARIO' }))
  await denied.load(id(10)); assert.equal(requests, before); denied.dispose()
  const deniedAcademic = createMaterialRevisaoModel(createMaterialService(ordinary.json, ordinary.torrent), { save: () => assert.fail(), copy: () => assert.fail() }, () => ({ id: id(8), perfil: 'MODERADOR' }))
  mode = 'academic-403'; await deniedAcademic.load(id(10)); assert.equal(deniedAcademic.getState().material, null); assert.equal(deniedAcademic.getState().academic, null); assert.ok(deniedAcademic.getState().error); deniedAcademic.dispose()
})
