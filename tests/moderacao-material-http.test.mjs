import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createModeracaoMaterialService } from '../src/features/moderacao/moderacao-material-service.ts'
import { createModeracaoMaterialModel } from '../src/features/moderacao/moderacao-material-model.ts'
import { id, material } from './catalog-fixtures.mjs'

test('HTTP sintetico: fila PENDENTE GETBearer/semcorpo, equipe vsusuario, paginas,403/401 e nenhuma mutacao', { timeout: 10000 }, async context => {
  const credential = 'header.moderator.signature', adminToken = 'header.admin.signature', userToken = 'header.user.signature', secret = 'PRIVADO NAO EXIBIR'
  let mode = 'ok', requests = 0
  const stored = Array.from({ length: 21 }, (_, n) => ({ ...material(n + 20), usuarioId: n % 2 ? id(9) : id(8), status: 'PENDENTE', dataCadastro: `2026-10-25T12:00:${String(n).padStart(2, '0')}Z` })).reverse()
  const server = createServer(async (request, response) => {
    requests++
    const url = new URL(request.url, 'http://localhost')
    assert.equal(request.method, 'GET'); assert.equal(url.pathname, '/api/v1/materiais/moderacao')
    assert.deepEqual([...url.searchParams.keys()], ['page', 'size', 'status']); assert.equal(url.searchParams.get('status'), 'PENDENTE')
    assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    let body = ''; for await (const chunk of request) body += chunk; assert.equal(body, '')
    const allowed = [credential, adminToken].some(token => request.headers.authorization === 'Bearer ' + token)
    if (mode === 401) { response.writeHead(401); response.end(); return }
    if (!allowed || mode === 403 || mode === 503) {
      response.writeHead(mode === 503 ? 503 : 403, { 'Content-Type': 'application/problem+json' }); response.end(JSON.stringify({ title: secret, detail: secret })); return
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    if (mode === 'malformed') { response.end('{broken'); return }
    const number = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
    const content = stored.slice(number * size, (number + 1) * size).map(item => ({ ...item, status: mode === 'wrong-state' ? 'PUBLICADO' : item.status, email: secret, magnetUri: secret }))
    response.end(JSON.stringify({ content, page: { number, size, totalElements: stored.length, totalPages: Math.ceil(stored.length / size) } }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const [credentialValue, perfil] of [[credential, 'MODERADOR'], [adminToken, 'ADMINISTRADOR']]) {
    const authenticated = createAuthenticatedClient(client, { getToken: () => credentialValue, rejectToken: () => assert.fail() })
    const model = createModeracaoMaterialModel(createModeracaoMaterialService(authenticated.json), () => ({ id: id(8), perfil }))
    await model.initialize(); assert.equal(model.getState().data.page.totalElements, 21); assert.equal(model.getState().data.content[0].id, stored[0].id)
    assert.equal(JSON.stringify(model.getState()).includes(secret), false); assert.equal('usuarioId' in model.getState().data.content[0], false)
    await model.goToPage(1); assert.equal(model.getState().data.content.length, 1); await model.setSize(50); assert.equal(model.getState().data.content.length, 21)
    model.dispose(); assert.equal(model.getState().data, null)
  }
  const ordinary = createAuthenticatedClient(client, { getToken: () => userToken, rejectToken: () => assert.fail() })
  const noPermission = createModeracaoMaterialModel(createModeracaoMaterialService(ordinary.json), () => ({ id: id(8), perfil: 'USUARIO' }))
  const before = requests; await noPermission.initialize(); await noPermission.reload(); assert.equal(requests, before); assert.equal(noPermission.getState().denied, true)
  // Forcar diretamente o service nao contorna a autorizacao HTTP simulada, mesmo sendo autor de pendentes.
  await assert.rejects(createModeracaoMaterialService(ordinary.json).list(), error => error.status === 403); noPermission.dispose()
  for (const next of [401, 403, 503, 'malformed', 'wrong-state']) {
    mode = 'ok'; let token = credential, rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createModeracaoMaterialModel(createModeracaoMaterialService(authenticated.json), () => token ? { id: id(8), perfil: 'MODERADOR' } : null)
    await model.initialize(); assert.ok(model.getState().data)
    mode = next; const count = requests; await model.reload(); assert.equal(requests, count + 1); assert.equal(model.getState().data, null); assert.ok(model.getState().error)
    assert.equal(model.getState().error.includes(secret), false); assert.deepEqual(rejected, next === 401 ? [credential] : [])
    if ([401, 403].includes(next)) { assert.equal(model.getState().denied, true); await model.reload(); assert.equal(requests, count + 1) }
    else { assert.equal(model.getState().denied, false); mode = 'ok'; await model.reload(); assert.ok(model.getState().data) }
    if (next === 403) assert.equal(token, credential)
    model.dispose()
  }
})
