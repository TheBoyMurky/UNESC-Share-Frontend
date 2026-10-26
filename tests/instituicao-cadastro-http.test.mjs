import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoService } from '../src/features/instituicao/instituicao-service.ts'
import { createInstituicaoCadastroService } from '../src/features/instituicao/instituicao-cadastro-service.ts'
import { createInstituicaoCadastroModel } from '../src/features/instituicao/instituicao-cadastro-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP cadastroInstituicao POSTsoNomeSigla/Bearer/201-Locationignorado/incerto semretry/401-403', { timeout: 10000 }, async context => {
  const credential = 'test.admin.signature', body = { nome: 'Universidade de teste', sigla: 'UT' }
  let mode = 201, posts = 0, stored = null, gets = 0
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(url.pathname, '/api/v1/instituicoes'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    const json = (code, data) => { response.writeHead(code, { 'Content-Type': 'application/json', Location: 'https://invalid.test/nao-seguir' }); response.end(JSON.stringify(data)) }
    if (request.method === 'GET') { gets++; assert.equal(raw, ''); assert.equal(request.headers['content-type'], undefined); assert.deepEqual([...url.searchParams.keys()], ['page', 'size']); json(200, page(stored ? [stored] : [], Number(url.searchParams.get('page')), Number(url.searchParams.get('size')))); return }
    posts++; assert.equal(request.method, 'POST'); assert.equal(url.search, ''); assert.equal(request.headers['content-type'], 'application/json'); assert.deepEqual(JSON.parse(raw), body)
    if (Number.isInteger(mode) && mode !== 201) { json(mode, { detail: 'PRIVADO', errors: [{ field: 'nome', message: 'PRIVADO' }] }); return }
    stored = { id: id(1), ...body }
    if (mode === 'lost') { response.destroy(); return }
    json(201, mode === 'badDTO' ? { ...stored, nome: 'Outro registro' } : { ...stored, email: 'PRIVADO', cursos: ['EXTRA'] })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of [201, 400, 409, 401, 403, 404, 503, 'badDTO', 'lost']) {
    mode = next; stored = null; let token = credential; const rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); if (token === used) token = null } })
    const model = createInstituicaoCadastroModel(createInstituicaoCadastroService(authenticated.json), () => token ? { id: id(8), perfil: 'ADMINISTRADOR' } : null)
    model.initialize(); model.change('nome', '  ' + body.nome + '  '); model.change('sigla', ' ut ')
    const before = posts, beforeGets = gets; await model.submit(); assert.equal(posts, before + 1); assert.equal(gets, beforeGets); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if (mode === 201) { assert.equal(model.getState().savedId, id(1)); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' }) }
    if (mode === 400) { assert.equal(model.getState().draft.sigla, ' ut '); assert.equal(model.getState().uncertain, false) }
    if (mode === 409) { assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(posts, before + 1) }
    if ([503, 'badDTO', 'lost'].includes(mode)) {
      assert.equal(model.getState().uncertain, true); assert.equal(model.getState().savedId, ''); await model.submit(); assert.equal(posts, before + 1)
      if (mode === 'lost') { assert.equal((await createInstituicaoService(authenticated.json).list()).content.length, 1); assert.equal(model.getState().savedId, '', 'consulta nao atribui registro aPOSTperdido') }
      model.prepareNew(); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' }); assert.equal(posts, before + 1)
    }
    if ([401, 403, 404].includes(mode)) { assert.equal(model.getState().denied, true); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' }) }
    if (mode === 401) { assert.deepEqual(rejected, [credential]); assert.equal(token, null) } else { assert.deepEqual(rejected, []); assert.equal(token, credential) }
    model.dispose()
  }
})
