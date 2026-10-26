import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createModeracaoDenunciaService } from '../src/features/moderacao/moderacao-denuncia-service.ts'
import { createDenunciaAnaliseService } from '../src/features/moderacao/denuncia-analise-service.ts'
import { createDenunciaAnaliseModel } from '../src/features/moderacao/denuncia-analise-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico: iniciar analise ambosperfis, payload unico, evento consultado e resultados incertos/403/401', { timeout: 10000 }, async context => {
  const credential = 'test.staff.signature'; let mode = 'ok', status = 'PENDENTE', events = [], posts = 0, gets = 0
  const report = () => ({ id: id(60), materialId: id(10), motivo: 'SPAM', descricao: 'Relato', status, dataCadastro: '2026-10-25T12:00:00Z' })
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    let body = ''; for await (const chunk of request) body += chunk
    if (request.method === 'GET') {
      gets++; assert.equal(body, ''); assert.equal(request.headers['content-type'], undefined)
      if (request.url === '/api/v1/denuncias/moderacao/' + id(60)) { json(200, report()); return }
      assert.equal(request.url, `/api/v1/denuncias/moderacao/${id(60)}/historico?page=0&size=20`); json(200, page(events, 0, 20)); return
    }
    posts++; assert.equal(request.method, 'POST'); assert.equal(request.url, `/api/v1/denuncias/moderacao/${id(60)}/analise`); assert.equal(request.headers['content-type'], 'application/json')
    const input = JSON.parse(body); assert.deepEqual(Object.keys(input), ['justificativa']); assert.equal(input.justificativa, 'Conferido')
    if (mode === 401) { response.writeHead(401); response.end(); return }
    if ([400, 403, 404, 409, 503].includes(mode)) { json(mode, { detail: 'PRIVADO', errors: [{ field: 'justificativa', message: 'PRIVADO' }] }); return }
    status = 'EM_ANALISE'; events.push({ id: id(70), denunciaId: id(60), responsavelId: id(8), justificativa: input.justificativa, estadoAnterior: 'PENDENTE', estadoNovo: 'EM_ANALISE', dataCadastro: '2026-10-25T13:00:00Z' })
    if (mode === 'lost') { request.socket.destroy(); return }
    json(200, { ...report(), ...(mode === 'invalid' ? { materialId: id(11) } : {}), email: 'PRIVADO' })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createDenunciaAnaliseModel(createModeracaoDenunciaService(authenticated.json), createDenunciaAnaliseService(authenticated.json), () => token ? { id: id(8), perfil } : null)
    const fill = () => { model.open(); model.change('  Conferido\n'); model.setConfirmed(true) }
    mode = 'ok'; status = 'PENDENTE'; events = []; const before = posts, beforeGets = gets
    await model.load(id(60)); assert.equal(posts, before); fill(); await model.submit()
    assert.equal(posts, before + 1); assert.equal(gets, beforeGets + 4); assert.equal(model.getState().report.status, 'EM_ANALISE'); assert.equal(model.getState().history.content.length, 1); assert.ok(model.getActionState().message); assert.equal(model.getActionState().draft, '')
    for (const failure of ['lost', 'invalid']) {
      status = 'PENDENTE'; events = []; mode = 'ok'; await model.load(id(60)); mode = failure; fill(); const beforePosts = posts; await model.submit()
      assert.equal(events.length, 1); assert.equal(model.getActionState().requiresReload, true); assert.equal(model.getActionState().message, '')
      model.setConfirmed(true); await model.submit(); assert.equal(posts, beforePosts + 1)
      mode = 'ok'; await model.reload(); assert.equal(model.getState().report.status, 'EM_ANALISE'); assert.equal(model.canOpen(), false); assert.equal(model.getActionState().draft, ''); assert.equal(model.getActionState().message, '')
    }
    for (const failure of [400, 409, 503]) {
      status = 'PENDENTE'; events = []; mode = 'ok'; await model.load(id(60)); mode = failure; fill(); const beforePosts = posts; await model.submit()
      assert.equal(model.getActionState().confirmed, false); assert.equal(events.length, 0); assert.equal(JSON.stringify(model.getActionState()).includes('PRIVADO'), false)
      await model.submit(); assert.equal(posts, beforePosts + 1)
    }
    mode = 'ok'; await model.load(id(60)); mode = 403; fill(); await model.submit(); assert.ok(model.getState().report); assert.equal(model.getState().denied, false); assert.equal(model.getActionState().forbidden, true); assert.equal(token, credential); assert.deepEqual(rejected, [])
    mode = 'ok'; await model.reload(); assert.ok(model.getState().report); assert.equal(model.canOpen(), false); assert.ok(model.getActionState().error)
    await model.load(id(60)); mode = 404; fill(); await model.submit(); assert.equal(model.getState().report, null); assert.equal(model.getActionState().draft, ''); assert.equal(token, credential)
    mode = 'ok'; await model.load(id(60)); mode = 401; fill(); await model.submit(); assert.equal(model.getState().report, null); assert.equal(model.getState().history, null); assert.equal(token, null); assert.deepEqual(rejected, [credential]); model.dispose()
  }
})
