import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createMaterialDecisaoService } from '../src/features/moderacao/material-decisao-service.ts'
import { createMaterialDecisaoModel } from '../src/features/moderacao/material-decisao-model.ts'
import { academic, detail, id } from './material-fixtures.mjs'

test('HTTP sintetico: autoaprovacao ambos, POST sem corpo/Bearer, GETposterior e falhas sem retry', { timeout: 10000 }, async context => {
  const credential = 'test.staff.signature'; let status = 'PENDENTE', mode = 'ok', posts = 0, gets = 0
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    let body = ''; for await (const chunk of request) body += chunk; assert.equal(body, '')
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.method === 'GET') {
      gets++; assert.equal(request.url, '/api/v1/materiais/' + id(10)); json(200, { ...detail(), status }); return
    }
    posts++; assert.equal(request.method, 'POST'); assert.ok([`/api/v1/materiais/${id(10)}/publicacao`, `/api/v1/materiais/${id(10)}/bloqueio`].includes(request.url))
    if (mode === 401) { response.writeHead(401); response.end(); return }
    if ([403, 409, 503].includes(mode)) { json(mode, { detail: 'PRIVADO', errors: [] }); return }
    status = request.url.endsWith('/publicacao') ? 'PUBLICADO' : 'BLOQUEADO'
    if (mode === 'lost') { request.socket.destroy(); return }
    json(200, { ...detail(), status, email: 'PRIVADO' })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createMaterialDecisaoModel({ detail: key => authenticated.json('/materiais/' + key), academic: async () => academic, download: () => assert.fail() },
      { save: () => assert.fail(), copy: () => assert.fail() }, createMaterialDecisaoService(authenticated.json), () => token ? { id: id(8), perfil } : null)
    mode = 'ok'; status = 'PENDENTE'; const beforePosts = posts, beforeGets = gets
    await model.load(id(10)); assert.equal(model.getState().material.usuarioId, id(8)); assert.equal(posts, beforePosts)
    for (const action of ['publicar', 'bloquear']) { model.choose(action); model.setConfirmed(true); await model.submit() }
    assert.equal(posts, beforePosts + 2); assert.equal(gets, beforeGets + 3); assert.equal(model.getState().material.status, 'BLOQUEADO'); assert.deepEqual(rejected, [])
    for (const failure of [409, 503, 'lost']) {
      mode = failure; model.choose('bloquear'); model.setConfirmed(true); const before = posts; await model.submit()
      assert.equal(posts, before + 1); assert.equal(model.getDecisionState().requiresReload, true); assert.equal(model.getDecisionState().error.includes('PRIVADO'), false)
      model.setConfirmed(true); await model.submit(); assert.equal(posts, before + 1)
      mode = 'ok'; await model.retry(); assert.equal(model.getState().material.status, 'BLOQUEADO'); assert.equal(model.getDecisionState().action, '')
    }
    mode = 403; model.choose('bloquear'); model.setConfirmed(true); await model.submit(); assert.equal(model.getState().material, null); assert.equal(token, credential); assert.deepEqual(rejected, [])
    mode = 'ok'; await model.retry(); mode = 401; model.choose('bloquear'); model.setConfirmed(true); await model.submit(); assert.equal(model.getState().material, null); assert.deepEqual(rejected, [credential]); assert.equal(token, null); model.dispose()
  }
})
