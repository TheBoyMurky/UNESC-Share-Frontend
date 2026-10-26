import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoService } from '../src/features/instituicao/instituicao-service.ts'
import { createInstituicaoConsultaModel } from '../src/features/instituicao/instituicao-consulta-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTPsintetico instituicoes: soGET/Bearer/paginacao/DTO3campos/todosperfis e401-403-404', { timeout: 10000 }, async context => {
  const credential = 'test.authenticated.signature', row = { id: id(1), nome: '<script>Texto literal</script>', sigla: 'TESTE' }
  let mode = 200, calls = 0
  const server = createServer(async (request, response) => {
    calls++; assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined); assert.equal(request.headers['content-type'], undefined)
    let body = ''; for await (const chunk of request) body += chunk; assert.equal(body, '')
    const url = new URL(request.url, 'http://localhost')
    const json = (code, data) => { response.writeHead(code, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
    if (mode !== 200) { json(mode, { detail: 'PRIVADO ERRO' }); return }
    const source = { ...row, cursos: [{ nome: 'EXTRA' }], email: 'PRIVADO ERRO' }
    if (url.pathname === '/api/v1/instituicoes') { assert.deepEqual([...url.searchParams.keys()], ['page', 'size']); json(200, page([source], Number(url.searchParams.get('page')), Number(url.searchParams.get('size')))); return }
    assert.equal(url.pathname, `/api/v1/instituicoes/${id(1)}`, 'sem consultas filho/N+1, fallback ou escrita'); assert.equal(url.search, ''); json(200, source)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    let token = credential; const rejected = []; mode = 200
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createInstituicaoConsultaModel(createInstituicaoService(authenticated.json), () => token ? { id: id(8), perfil } : null)
    let before = calls; await model.loadList(); assert.equal(calls, before + 1); assert.deepEqual(model.getState().data.content, [row]); await model.setSize(50); assert.equal(model.getState().data.page.size, 50)
    await model.loadDetail(id(1)); assert.deepEqual(model.getState().institution, row); assert.equal(model.getState().data, null); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    mode = 503; await model.reload(); assert.equal(model.getState().institution, null); assert.equal(model.getState().unavailable, false); mode = 200; await model.reload(); assert.ok(model.getState().institution)
    mode = 404; await model.reload(); assert.equal(model.getState().unavailable, true); before = calls; await model.reload(); assert.equal(calls, before); mode = 200; await model.loadList(); assert.ok(model.getState().data)
    mode = 403; await model.reload(); assert.equal(model.getState().unavailable, true); assert.equal(model.getState().data, null); assert.equal(token, credential); assert.deepEqual(rejected, []); before = calls; await model.reload(); await model.setSize(100); assert.equal(calls, before)
    mode = 200; await model.loadDetail(id(1)); mode = 401; await model.reload(); assert.equal(model.getState().institution, null); assert.deepEqual(rejected, [credential]); assert.equal(token, null); model.dispose()
  }
})
