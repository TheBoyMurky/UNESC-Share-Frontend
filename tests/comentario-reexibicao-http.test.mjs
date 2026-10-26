import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createModeracaoComentarioService } from '../src/features/moderacao/moderacao-comentario-service.ts'
import { createComentarioDecisaoModel } from '../src/features/moderacao/comentario-decisao-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico reexibicao: POST especifico, Materialmudou409, perdaaposgravacao, ambosperfis e401-403', { timeout: 10000 }, async context => {
  const credential = 'test.staff.signature', calls = []
  let active = false, materialStatus = 'PUBLICADO', failure = null
  const comment = () => ({ id: id(30), materialId: id(10), usuarioId: id(8), status: active ? 'ATIVO' : 'OCULTO', conteudo: '<script>Texto literal</script>', dataCadastro: '2026-10-25T12:00:00Z' })
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); let body = ''; for await (const chunk of request) body += chunk
    calls.push({ method: request.method, path: url.pathname })
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.method === 'GET') {
      assert.equal(body, ''); assert.equal(request.headers['content-type'], undefined); assert.deepEqual([...url.searchParams.keys()], ['page', 'size'])
      const number = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
      if (url.pathname === `/api/v1/materiais/${id(10)}/comentarios/moderacao`) { json(200, page([comment()], number, size)); return }
      assert.equal(url.pathname, `/api/v1/materiais/${id(10)}/comentarios/${id(30)}/historico-moderacao`, 'sem N+1, GET individualtexto ou buscaMaterial adicional')
      json(200, page(active ? [{ id: id(70), comentarioId: id(30), responsavelId: id(8), motivo: 'Revisão da ocultação', estadoAnterior: 'OCULTO', estadoNovo: 'ATIVO', dataCadastro: '2026-10-26T12:00:00Z' }] : [], number, size)); return
    }
    assert.equal(request.method, 'POST'); assert.equal(url.pathname, `/api/v1/materiais/${id(10)}/comentarios/${id(30)}/reexibicao`); assert.equal(url.search, '')
    assert.equal(request.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(body), { motivo: 'Revisão da ocultação' })
    if ([401, 403].includes(failure)) { json(failure, { detail: 'ERRO PRIVADO' }); return }
    if (materialStatus !== 'PUBLICADO') { json(409, { detail: 'ERRO PRIVADO' }); return }
    active = true
    if (failure === 'lost') { response.destroy(); return }
    json(200, { ...comment(), email: 'EXTRA PRIVADO' })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createComentarioDecisaoModel(createModeracaoComentarioService(authenticated.json), () => token ? { id: id(8), perfil } : null, () => 'PUBLICADO')
    const prepare = async () => { active = false; materialStatus = 'PUBLICADO'; await model.load(id(10)); model.openReveal(id(30)); model.setMotivo('  Revisão da ocultação  '); model.setConfirmed(true) }
    failure = null; await prepare(); const before = calls.length; await model.submit()
    assert.deepEqual(calls.slice(before).map(x => x.method), ['POST', 'GET']); assert.equal(model.getState().read.data.content[0].status, 'ATIVO'); assert.match(model.getState().notice, /Reexibição confirmada/)
    assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); await model.openHistory(id(30)); assert.equal(model.getState().read.data.content[0].estadoNovo, 'ATIVO'); assert.equal(JSON.stringify(model.getState()).includes('Texto literal'), false)
    await prepare(); materialStatus = 'BLOQUEADO'; await model.submit(); assert.equal(active, false); assert.equal(model.getState().mustReload, true); assert.equal(model.getState().target, null); assert.equal(model.getState().notice, '')
    let posts = calls.filter(x => x.method === 'POST').length; await model.submit(); assert.equal(calls.filter(x => x.method === 'POST').length, posts); await model.closeDecision(); assert.equal(model.getState().read.data.content[0].status, 'OCULTO')
    failure = 'lost'; await prepare(); await model.submit(); assert.equal(active, true); assert.equal(model.getState().mustReload, true); assert.equal(model.getState().target, null)
    posts = calls.filter(x => x.method === 'POST').length; model.setConfirmed(true); await model.submit(); await model.closeDecision(); model.openReveal(id(30)); assert.equal(model.getState().panel, false); assert.equal(calls.filter(x => x.method === 'POST').length, posts)
    await model.openHistory(id(30)); assert.equal(model.getState().read.data.content.length, 1); assert.equal(model.getState().notice, '', 'evento não atribuído a POST perdido')
    failure = 403; await prepare(); await model.submit(); assert.equal(model.getState().read.denied, true); assert.equal(model.getState().target, null); assert.deepEqual(rejected, []); assert.equal(token, credential)
    failure = 401; await prepare(); await model.submit(); assert.deepEqual(rejected, [credential]); assert.equal(token, null); assert.equal(model.getState().read.data, null); assert.equal(model.getState().target, null); assert.equal(model.getState().motivo, '')
    model.dispose()
  }
})
