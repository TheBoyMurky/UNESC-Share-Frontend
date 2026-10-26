import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createModeracaoComentarioService } from '../src/features/moderacao/moderacao-comentario-service.ts'
import { createModeracaoComentarioModel } from '../src/features/moderacao/moderacao-comentario-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP sintetico: comentarios de equipe GET/Bearer, contextosMaterial, semREMOVIDO/N+1/escritas/fallback', { timeout: 10000 }, async context => {
  const credential = 'test.staff.signature'; let mode = 'ok', requests = 0
  const materials = new Map([[id(10), 'PENDENTE'], [id(11), 'PUBLICADO'], [id(12), 'BLOQUEADO'], [id(13), 'REMOVIDO']])
  const server = createServer(async (request, response) => {
    requests++; assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    let body = ''; for await (const chunk of request) body += chunk; assert.equal(body, '')
    const url = new URL(request.url, 'http://localhost'), match = /^\/api\/v1\/materiais\/([0-9a-f-]+)\/comentarios\/moderacao$/.exec(url.pathname)
    assert.ok(match, 'somente namespace de equipe, semfallback, GETMaterial ou consultas denomes'); assert.ok(materials.has(match[1])); assert.deepEqual([...url.searchParams.keys()], ['page', 'size'])
    const json = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (mode === 401) { response.writeHead(401); response.end(); return }
    if ([403, 404, 503].includes(mode)) { json(mode, { detail: 'PRIVADO ERRO' }); return }
    const row = { id: id(30), materialId: match[1], usuarioId: id(8), conteudo: 'Ativo\n<script>literal</script>', status: 'ATIVO', dataCadastro: '2026-10-25T12:00:00Z' }
    json(200, page([row, { ...row, id: id(31), status: mode === 'removed' ? 'REMOVIDO' : 'OCULTO', conteudo: mode === 'removed' ? 'TEXTO REMOVIDO PRIVADO' : 'Oculto literal', email: 'CAMPO PRIVADO', nome: 'CAMPO PRIVADO' }], Number(url.searchParams.get('page')), Number(url.searchParams.get('size'))))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    mode = 'ok'; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createModeracaoComentarioModel(createModeracaoComentarioService(authenticated.json), () => token ? { id: id(8), perfil } : null)
    for (const materialId of materials.keys()) {
      const before = requests; await model.load(materialId); assert.equal(requests, before + 1); assert.deepEqual(model.getState().data.content.map(x => x.status), ['ATIVO', 'OCULTO']); assert.equal(model.getState().data.content[0].materialId, materialId)
      assert.equal(JSON.stringify(model.getState()).includes('CAMPO PRIVADO'), false); assert.equal(model.getState().data.content[0].conteudo, 'Ativo\n<script>literal</script>')
    }
    await model.setSize(50); assert.equal(model.getState().data.page.size, 50)
    for (const failure of ['removed', 503]) { mode = failure; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().denied, false); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false) }
    for (const failure of [403, 404]) {
      mode = 'ok'; await model.load(id(10)); mode = failure; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().denied, true); assert.equal(token, credential); assert.deepEqual(rejected, [])
      const before = requests; await model.reload(); await model.setSize(50); assert.equal(requests, before)
    }
    mode = 'ok'; await model.load(id(10)); mode = 401; await model.reload(); assert.equal(model.getState().data, null); assert.equal(token, null); assert.deepEqual(rejected, [credential]); model.dispose()
  }
})
