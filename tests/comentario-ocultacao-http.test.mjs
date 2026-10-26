import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createModeracaoComentarioService } from '../src/features/moderacao/moderacao-comentario-service.ts'
import { createComentarioOcultacaoModel } from '../src/features/moderacao/comentario-ocultacao-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico ocultacao: Bearer JSONsoMotivo, ambosperfis, perdaaposgravacao,403naodesloga/401tokenusado', { timeout: 10000 }, async context => {
  const credential = 'test.staff.signature', calls = []
  let hidden = false, failure = null
  const comment = () => ({ id: id(30), materialId: id(10), usuarioId: id(8), status: hidden ? 'OCULTO' : 'ATIVO', conteudo: '<script>Texto literal</script>', dataCadastro: '2026-10-25T12:00:00Z' })
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); let body = ''; for await (const chunk of request) body += chunk
    calls.push({ method: request.method, path: url.pathname })
    assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.method === 'GET') {
      assert.equal(body, ''); assert.equal(request.headers['content-type'], undefined); assert.deepEqual([...url.searchParams.keys()], ['page', 'size'])
      const number = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
      if (url.pathname === `/api/v1/materiais/${id(10)}/comentarios/moderacao`) { json(200, page([comment()], number, size)); return }
      assert.equal(url.pathname, `/api/v1/materiais/${id(10)}/comentarios/${id(30)}/historico-moderacao`)
      json(200, page(hidden ? [{ id: id(70), comentarioId: id(30), responsavelId: id(8), motivo: 'Motivo explícito', estadoAnterior: 'ATIVO', estadoNovo: 'OCULTO', dataCadastro: '2026-10-25T13:00:00Z' }] : [], number, size)); return
    }
    assert.equal(request.method, 'POST'); assert.equal(url.pathname, `/api/v1/materiais/${id(10)}/comentarios/${id(30)}/ocultacao`); assert.equal(url.search, '')
    assert.equal(request.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(body), { motivo: 'Motivo explícito' })
    if ([401, 403].includes(failure)) { json(failure, { detail: 'ERRO PRIVADO' }); return }
    hidden = true
    if (failure === 'lost') { response.destroy(); return }
    json(200, { ...comment(), email: 'EXTRA PRIVADO' })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createComentarioOcultacaoModel(createModeracaoComentarioService(authenticated.json), () => token ? { id: id(8), perfil } : null)
    const prepare = async () => { hidden = false; await model.load(id(10)); model.openHide(id(30)); model.setMotivo('  Motivo explícito  '); model.setConfirmed(true) }
    failure = null; await prepare(); const before = calls.length; await model.submit()
    assert.deepEqual(calls.slice(before).map(x => x.method), ['POST', 'GET']); assert.equal(model.getState().read.data.content[0].status, 'OCULTO'); assert.ok(model.getState().notice)
    assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    await model.openHistory(id(30)); assert.equal(model.getState().read.data.content[0].estadoNovo, 'OCULTO'); assert.equal(JSON.stringify(model.getState()).includes('Texto literal'), false)
    failure = 'lost'; await prepare(); await model.submit(); assert.equal(hidden, true); assert.equal(model.getState().mustReload, true); assert.equal(model.getState().target, null); assert.equal(model.getState().notice, '')
    const posts = calls.filter(x => x.method === 'POST').length; model.setConfirmed(true); await model.submit(); await model.closeHide()
    assert.equal(model.getState().read.data.content[0].status, 'OCULTO'); model.openHide(id(30)); assert.equal(model.getState().panel, false); assert.equal(calls.filter(x => x.method === 'POST').length, posts)
    await model.openHistory(id(30)); assert.equal(model.getState().read.data.content.length, 1); assert.equal(model.getState().notice, '')
    failure = 403; await prepare(); await model.submit(); assert.equal(model.getState().read.denied, true); assert.equal(model.getState().target, null); assert.deepEqual(rejected, []); assert.equal(token, credential)
    failure = 401; await prepare(); await model.submit(); assert.deepEqual(rejected, [credential]); assert.equal(token, null); assert.equal(model.getState().read.data, null); assert.equal(model.getState().target, null); assert.equal(model.getState().motivo, '')
    model.dispose()
  }
})
