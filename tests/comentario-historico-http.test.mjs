import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createModeracaoComentarioService } from '../src/features/moderacao/moderacao-comentario-service.ts'
import { createComentarioConsultaEquipeModel } from '../src/features/moderacao/comentario-consulta-equipe-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico: selecionar conhecido, descartartexto, historico aposremocao, ambosperfis e401-403-404', { timeout: 10000 }, async context => {
  const credential = 'test.staff.signature'; let removed = false, mode = 'ok', requests = 0, histories = 0
  const server = createServer(async (request, response) => {
    requests++; assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    let body = ''; for await (const chunk of request) body += chunk; assert.equal(body, '')
    const url = new URL(request.url, 'http://localhost'); assert.deepEqual([...url.searchParams.keys()], ['page', 'size'])
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    const number = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
    if (url.pathname === `/api/v1/materiais/${id(10)}/comentarios/moderacao`) {
      json(200, page(removed ? [] : [{ id: id(30), materialId: id(10), usuarioId: id(8), status: 'OCULTO', conteudo: 'TEXTO ORIGINAL PRIVADO', dataCadastro: '2026-10-25T12:00:00Z' }], number, size)); return
    }
    assert.equal(url.pathname, `/api/v1/materiais/${id(10)}/comentarios/${id(30)}/historico-moderacao`, 'semGETindividualdetexto, Material, usuarios, fallback comum ou escrita')
    histories++
    if (mode === 401) { response.writeHead(401); response.end(); return }
    if ([403, 404, 503].includes(mode)) { json(mode, { detail: 'PRIVADO ERRO' }); return }
    json(200, page([{ id: id(70), comentarioId: id(30), responsavelId: id(9), motivo: 'Motivo\n<script>texto literal</script>', estadoAnterior: 'ATIVO', estadoNovo: 'OCULTO', dataCadastro: '2026-10-25T13:00:00Z', conteudo: 'TEXTO ORIGINAL PRIVADO', email: 'PRIVADO ERRO' }], number, size))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    removed = false; mode = 'ok'; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createComentarioConsultaEquipeModel(createModeracaoComentarioService(authenticated.json), () => token ? { id: id(8), perfil } : null)
    const before = requests, beforeHistory = histories
    await model.load(id(10)); assert.equal(requests, before + 1); assert.equal(histories, beforeHistory)
    await model.openHistory(id(99)); assert.equal(histories, beforeHistory)
    await model.openHistory(id(30)); assert.equal(histories, beforeHistory + 1); assert.equal(model.getState().mode, 'history'); assert.equal(model.getState().selectedId, id(30))
    assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); assert.equal(model.getState().data.content[0].responsavelId, id(9)); assert.equal(model.getState().data.content[0].motivo, 'Motivo\n<script>texto literal</script>')
    removed = true; await model.setSize(50); await model.reload(); assert.equal(model.getState().data.page.size, 50); assert.ok(model.getState().data.content.length); assert.equal(JSON.stringify(model.getState()).includes('TEXTO ORIGINAL'), false)
    await model.closeHistory(); assert.equal(model.getState().mode, 'list'); assert.deepEqual(model.getState().data.content, []); const count = histories; await model.openHistory(id(30)); assert.equal(histories, count)
    removed = false; await model.load(id(10)); await model.openHistory(id(30)); mode = 503; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().selectedId, id(30)); assert.equal(model.getState().denied, false)
    mode = 'ok'; await model.reload(); assert.ok(model.getState().data.content.length)
    for (const failure of [403, 404]) {
      mode = failure; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().selectedId, null); assert.equal(model.getState().denied, true); assert.deepEqual(rejected, []); assert.equal(token, credential)
      const count = requests; await model.reload(); await model.setSize(50); assert.equal(requests, count)
      mode = 'ok'; await model.closeHistory(); assert.equal(model.getState().mode, 'list'); await model.openHistory(id(30)); assert.ok(model.getState().data.content.length)
    }
    mode = 401; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().selectedId, null); assert.deepEqual(rejected, [credential]); assert.equal(token, null); model.dispose()
  }
})
