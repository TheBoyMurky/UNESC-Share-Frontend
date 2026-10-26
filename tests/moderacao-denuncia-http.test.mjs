import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createModeracaoDenunciaService } from '../src/features/moderacao/moderacao-denuncia-service.ts'
import { createModeracaoDenunciaModel } from '../src/features/moderacao/moderacao-denuncia-model.ts'
import { estados } from '../src/features/denuncia/denuncia-service.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico: fila equipe soGET/Bearer/status/page-size/projecao e403-401 sem escritas ou N+1', { timeout: 10000 }, async context => {
  const credential = 'test.staff.signature'; let mode = 'ok', requests = 0
  const server = createServer(async (request, response) => {
    requests++; assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    let body = ''; for await (const chunk of request) body += chunk; assert.equal(body, '')
    const url = new URL(request.url, 'http://localhost'); assert.equal(url.pathname, '/api/v1/denuncias/moderacao')
    assert.deepEqual([...url.searchParams.keys()], ['page', 'size', 'status']); assert.ok(estados.includes(url.searchParams.get('status')))
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (mode === 401) { response.writeHead(401); response.end(); return }
    if (mode === 403 || mode === 503) { json(mode, { detail: 'PRIVADO' }); return }
    json(200, page([{ id: id(60), materialId: id(10), motivo: 'SPAM', descricao: 'PRIVADO', status: url.searchParams.get('status'), dataCadastro: '2026-10-25T12:00:00Z', usuarioId: id(8), email: 'PRIVADO', magnetUri: 'PRIVADO' }], Number(url.searchParams.get('page')), Number(url.searchParams.get('size'))))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    mode = 'ok'; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createModeracaoDenunciaModel(createModeracaoDenunciaService(authenticated.json), () => token ? { id: id(8), perfil } : null)
    const before = requests; await model.initialize()
    for (const status of estados.slice(1)) { await model.setStatus(status); assert.equal(model.getState().data.content[0].status, status) }
    assert.equal(requests, before + 4); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); assert.equal('usuarioId' in model.getState().data.content[0], false)
    await model.setSize(50); assert.equal(model.getState().data.page.size, 50)
    mode = 503; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().denied, false); assert.equal(model.getState().error.includes('PRIVADO'), false)
    mode = 'ok'; await model.reload(); assert.equal(model.getState().status, 'IMPROCEDENTE')
    mode = 403; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().denied, true); assert.equal(token, credential); assert.deepEqual(rejected, [])
    const deniedCount = requests; await model.reload(); await model.setStatus('EM_ANALISE'); assert.equal(requests, deniedCount)
    mode = 'ok'; await model.initialize(); assert.equal(model.getState().status, 'PENDENTE')
    mode = 401; await model.reload(); assert.equal(model.getState().data, null); assert.deepEqual(rejected, [credential]); assert.equal(token, null); model.dispose()
  }
})
