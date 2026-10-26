import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createModeracaoDenunciaService } from '../src/features/moderacao/moderacao-denuncia-service.ts'
import { createDenunciaDecisaoService, denunciaActionInfo } from '../src/features/moderacao/denuncia-decisao-service.ts'
import { createDenunciaDecisaoModel } from '../src/features/moderacao/denuncia-decisao-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico: duasconclusoes/ambosperfis, bodyunico, conflitoeefeito semresposta, semMaterialautomatico', { timeout: 10000 }, async context => {
  const credential = 'test.staff.signature'; let status = 'EM_ANALISE', mode = 'ok', posts = 0, gets = 0, events = []
  const report = () => ({ id: id(60), materialId: id(10), motivo: 'SPAM', descricao: 'Relato original', status, dataCadastro: '2026-10-25T12:00:00Z' })
  const first = () => ({ id: id(70), denunciaId: id(60), responsavelId: id(9), justificativa: 'Análise por colega', estadoAnterior: 'PENDENTE', estadoNovo: 'EM_ANALISE', dataCadastro: '2026-10-25T13:00:00Z' })
  const final = (target, agent = id(8)) => ({ id: id(71), denunciaId: id(60), responsavelId: agent, justificativa: 'Decisão final', estadoAnterior: 'EM_ANALISE', estadoNovo: target, dataCadastro: '2026-10-25T14:00:00Z' })
  const reset = () => { status = 'EM_ANALISE'; events = [first()]; mode = 'ok' }
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    let body = ''; for await (const chunk of request) body += chunk
    if (request.method === 'GET') {
      gets++; assert.equal(body, ''); assert.equal(request.headers['content-type'], undefined)
      if (request.url === '/api/v1/denuncias/moderacao/' + id(60)) { json(200, report()); return }
      assert.equal(request.url, `/api/v1/denuncias/moderacao/${id(60)}/historico?page=0&size=20`, 'semN+1ouMaterialautomatico'); json(200, page(events, 0, 20)); return
    }
    posts++; assert.equal(request.method, 'POST'); assert.equal(request.headers['content-type'], 'application/json')
    const kind = request.url.endsWith('/improcedencia') ? 'improcedencia' : 'procedencia'
    assert.equal(request.url, `/api/v1/denuncias/moderacao/${id(60)}/${kind}`)
    assert.deepEqual(JSON.parse(body), { justificativa: 'Decisão final' })
    if (mode === 401) { response.writeHead(401); response.end(); return }
    if ([400, 403, 404, 503].includes(mode)) { json(mode, { detail: 'PRIVADO' }); return }
    const target = denunciaActionInfo[kind].target
    if (mode === 'conflict') { status = target === 'PROCEDENTE' ? 'IMPROCEDENTE' : 'PROCEDENTE'; events.push(final(status, id(7))); json(409, { detail: 'PRIVADO' }); return }
    status = target; events.push(final(status))
    if (mode === 'lost') { request.socket.destroy(); return }
    json(200, { ...report(), ...(mode === 'invalid' ? { status: target === 'PROCEDENTE' ? 'IMPROCEDENTE' : 'PROCEDENTE' } : {}), email: 'PRIVADO' })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createDenunciaDecisaoModel(createModeracaoDenunciaService(authenticated.json), createDenunciaDecisaoService(authenticated.json), () => token ? { id: id(8), perfil } : null)
    const fill = kind => { model.open(kind); model.change('  Decisão final\n'); model.setConfirmed(true) }
    for (const kind of ['procedencia', 'improcedencia']) {
      reset(); const before = posts, beforeGets = gets; await model.load(id(60)); assert.equal(posts, before); assert.equal(model.getState().history.content[0].responsavelId, id(9))
      fill(kind); await model.submit(); assert.equal(posts, before + 1); assert.equal(gets, beforeGets + 4); assert.equal(model.getState().report.status, denunciaActionInfo[kind].target); assert.equal(model.getState().history.content.length, 2)
      assert.equal(model.getActionState().draft, ''); assert.ok(model.getActionState().message); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
      for (const other of ['procedencia', 'improcedencia']) assert.equal(model.canOpen(other), false)
      for (const failure of ['conflict', 'lost', 'invalid']) {
        reset(); await model.load(id(60)); mode = failure; fill(kind); const beforePosts = posts; await model.submit()
        assert.equal(model.getActionState().requiresReload, true); assert.equal(model.getActionState().confirmed, false); assert.equal(events.length, 2)
        model.open(kind === 'procedencia' ? 'improcedencia' : 'procedencia'); model.setConfirmed(true); await model.submit(); assert.equal(posts, beforePosts + 1)
        mode = 'ok'; await model.reload(); assert.equal(model.getState().report.status, failure === 'conflict' ? kind === 'procedencia' ? 'IMPROCEDENTE' : 'PROCEDENTE' : denunciaActionInfo[kind].target)
        assert.equal(model.getActionState().message, ''); assert.equal(model.getActionState().draft, ''); assert.equal(model.canOpen('procedencia'), false); assert.equal(model.canOpen('improcedencia'), false); assert.equal(posts, beforePosts + 1)
      }
    }
    reset(); await model.load(id(60)); mode = 403; fill('procedencia'); await model.submit(); assert.ok(model.getState().report); assert.equal(model.getActionState().forbidden, true); assert.deepEqual(rejected, []); assert.equal(token, credential)
    mode = 'ok'; await model.reload(); assert.equal(model.canOpen('procedencia'), false); assert.equal(model.canOpen('improcedencia'), false); assert.ok(model.getState().history)
    await model.load(id(60)); mode = 401; fill('improcedencia'); await model.submit(); assert.equal(model.getState().report, null); assert.equal(model.getState().history, null); assert.deepEqual(rejected, [credential]); assert.equal(token, null); model.dispose()
  }
})
