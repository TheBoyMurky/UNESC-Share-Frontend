import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createMaterialService } from '../src/features/material/material-service.ts'
import { createMaterialModel } from '../src/features/material/material-model.ts'
import { detail, id, torrentBytes } from './material-fixtures.mjs'

test('HTTP sintetico: detalhe, nomes, downloadUUID e nova verificacao401 sem cache de permissao', async context => {
  let allowed = true, downloads = 0, token = 'token-sintetico'
  const rejected = [], saved = []
  const replies = { ['/api/v1/materiais/' + id(10)]: detail(), ['/api/v1/disciplinas/' + id(5)]: { id: id(5), nome: 'Disciplina', codigo: '123', cursoId: id(3) },
    ['/api/v1/categorias/' + id(7)]: { id: id(7), nome: 'Resumo' }, ['/api/v1/cursos/' + id(3)]: { id: id(3), nome: 'Curso', instituicaoId: id(1) }, ['/api/v1/instituicoes/' + id(1)]: { id: id(1), nome: 'Instituicao' } }
  const server = createServer((request, response) => {
    assert.equal(request.method, 'GET')
    assert.equal(request.headers.authorization, 'Bearer token-sintetico')
    assert.equal(request.headers.cookie, undefined)
    assert.equal(request.url.includes('token='), false)
    if (request.url === `/api/v1/materiais/${id(10)}/torrents/${id(20)}`) {
      downloads++
      if (!allowed) { response.writeHead(401); response.end(); return }
      response.writeHead(200, { 'Content-Type': 'application/x-bittorrent', 'Content-Length': String(torrentBytes.length), 'Content-Disposition': 'attachment; filename="../inseguro.exe"' })
      response.end(torrentBytes); return
    }
    if (!replies[request.url]) { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(replies[request.url]))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createAuthenticatedClient(createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`), {
    getToken: () => token, rejectToken: value => { rejected.push(value); if (token === value) token = null },
  })
  const model = createMaterialModel(createMaterialService(client.json, client.torrent), { save: file => { saved.push(file) }, copy: async () => assert.fail('nao copiar automaticamente') })
  context.after(() => model.dispose())
  await model.load(id(10)); assert.equal(model.getState().academic.instituicao, 'Instituicao')
  await model.download(id(20)); assert.equal(saved.length, 1)
  assert.equal(saved[0].filename, id(20) + '.torrent')
  assert.deepEqual(new Uint8Array(await saved[0].blob.arrayBuffer()), torrentBytes)
  await model.load(id(99)); assert.equal(model.getState().material, null); assert.ok(model.getState().error)
  await model.load(id(10)); allowed = false; await model.download(id(20))
  assert.equal(downloads, 2); assert.equal(saved.length, 1)
  assert.deepEqual(rejected, ['token-sintetico']); assert.equal(token, null)
})
