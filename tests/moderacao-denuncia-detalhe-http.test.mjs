import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createModeracaoDenunciaService } from '../src/features/moderacao/moderacao-denuncia-service.ts'
import { createModeracaoDenunciaDetalheModel } from '../src/features/moderacao/moderacao-denuncia-detalhe-model.ts'
import { estados } from '../src/features/denuncia/denuncia-service.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico: detalhe/historico somenteGET da equipe, campos projetados e falhas sem vazamento', { timeout: 10000 }, async context => {
  const credential = 'test.staff.signature', requests = []; let mode = 'ok', status = 'EM_ANALISE'
  const server = createServer(async (request, response) => {
    assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    let body = ''; for await (const chunk of request) body += chunk; assert.equal(body, '')
    requests.push(request.url); const url = new URL(request.url, 'http://localhost')
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (url.pathname === '/api/v1/denuncias/moderacao/' + id(60)) {
      assert.equal(url.search, ''); json(200, { id: id(60), materialId: id(10), motivo: 'SPAM', descricao: '<script>relato literal</script>', status, dataCadastro: '2026-10-25T12:00:00Z', usuarioId: 'PRIVADO', email: 'PRIVADO' }); return
    }
    assert.equal(url.pathname, `/api/v1/denuncias/moderacao/${id(60)}/historico`, 'semN+1 de Material/responsavel/denunciante nem namespace proprio')
    assert.deepEqual([...url.searchParams.keys()], ['page', 'size'])
    if (mode === 401) { response.writeHead(401); response.end(); return }
    if ([403, 404, 503].includes(mode)) { json(mode, { detail: 'PRIVADO' }); return }
    json(200, page(mode === 'empty' ? [] : [{ id: id(70), denunciaId: id(60), responsavelId: id(8), justificativa: '<script>justificativa literal</script>', estadoAnterior: 'PENDENTE', estadoNovo: 'EM_ANALISE', dataCadastro: '2026-10-25T13:00:00Z', nome: 'PRIVADO', usuarioId: 'PRIVADO' }], Number(url.searchParams.get('page')), Number(url.searchParams.get('size'))))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    mode = 'ok'; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createModeracaoDenunciaDetalheModel(createModeracaoDenunciaService(authenticated.json), () => token ? { id: id(8), perfil } : null)
    for (const value of estados) {
      status = value; const before = requests.length; await model.load(id(60))
      assert.equal(requests.length, before + 2); assert.equal(model.getState().report.status, value); assert.equal(model.getState().history.content[0].responsavelId, id(8))
      assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); assert.equal(model.getState().history.content[0].justificativa, '<script>justificativa literal</script>')
    }
    await model.setSize(50); assert.ok(requests.at(-1).endsWith('?page=0&size=50'))
    mode = 'empty'; await model.reloadHistory(); assert.ok(model.getState().report); assert.deepEqual(model.getState().history.content, [])
    mode = 503; await model.reloadHistory(); assert.ok(model.getState().report); assert.equal(model.getState().history, null); assert.ok(model.getState().historyError)
    for (const failure of [403, 404]) {
      mode = failure; await model.reloadHistory(); assert.equal(model.getState().report, null); assert.equal(model.getState().history, null); assert.equal(model.getState().denied, true); assert.deepEqual(rejected, [])
      const before = requests.length; await model.reload(); await model.reloadHistory(); assert.equal(requests.length, before)
      mode = 'ok'; await model.load(id(60)); assert.ok(model.getState().report)
    }
    mode = 401; await model.reloadHistory(); assert.equal(model.getState().report, null); assert.equal(model.getState().history, null); assert.deepEqual(rejected, [credential]); assert.equal(token, null); model.dispose()
  }
})
