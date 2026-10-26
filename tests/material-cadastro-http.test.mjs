import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createCatalogService } from '../src/features/catalogo/catalog-service.ts'
import { createMaterialCadastroService } from '../src/features/material/material-cadastro-service.ts'
import { createMaterialCadastroModel } from '../src/features/material/material-cadastro-model.ts'
import { page } from './catalog-fixtures.mjs'
import { created, id, input, magnetUri } from './material-cadastro-fixtures.mjs'

test('HTTP sintetico: seletores101opcoes e POST Bearer atomico projetado/erros/resposta perdida sem retry', { timeout: 10000 }, async context => {
  const credential = 'header.payload.signature'
  let mode = 'created', posts = 0
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer ' + credential)
    assert.equal(request.headers.cookie, undefined)
    const url = new URL(request.url, 'http://localhost')
    assert.equal(url.searchParams.has('usuarioId'), false)
    assert.equal(url.searchParams.has('token'), false)
    if (request.method === 'POST') {
      posts++
      assert.equal(url.pathname, '/api/v1/materiais')
      assert.equal(request.headers['content-type'], 'application/json')
      let body = ''
      for await (const chunk of request) body += chunk
      assert.deepEqual(JSON.parse(body), input())
      if (mode === 'lost') { response.destroy(); return }
      if (mode === 'unauthorized') { response.writeHead(401); response.end(); return }
      if (mode === 'unavailable') { response.writeHead(503); response.end(); return }
      if (mode === 'conflict') { response.writeHead(409); response.end(); return }
      if (mode === 'invalid') {
        response.writeHead(400, { 'Content-Type': 'application/problem+json' })
        response.end(JSON.stringify({ detail: magnetUri, errors: [{ field: 'magnetUris[0]', message: magnetUri }] })); return
      }
      response.writeHead(201, { 'Content-Type': 'application/json', Location: '/api/v1/materiais/' + id(10), 'Cache-Control': 'no-store' })
      response.end(JSON.stringify(mode === 'badDTO' ? { ...created(), status: 'PUBLICADO' } : created()))
      return
    }
    assert.equal(request.method, 'GET')
    let data
    const number = Number(url.searchParams.get('page'))
    assert.equal(url.searchParams.get('size'), '100')
    if (url.pathname === '/api/v1/instituicoes') data = page(number === 0 ? Array.from({ length: 100 }, (_, i) => ({ id: id(100 + i), nome: 'Instituição', sigla: 'TESTE' })) : [{ id: id(1), nome: 'Outra instituição', sigla: 'TESTE' }], number, 100, 101)
    else if (url.pathname === '/api/v1/categorias') data = page([{ id: id(7), nome: 'Resumo' }])
    else if (url.pathname === '/api/v1/cursos') {
      assert.equal(url.searchParams.get('instituicaoId'), id(1))
      data = page([{ id: id(3), nome: 'Curso', instituicaoId: id(1) }])
    } else if (url.pathname === '/api/v1/disciplinas') {
      assert.equal(url.searchParams.get('cursoId'), id(3))
      data = page([{ id: id(5), nome: 'Disciplina', codigo: 'CODIGO', cursoId: id(3) }])
    } else { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  for (const next of ['created', 'conflict', 'invalid', 'unavailable', 'badDTO', 'lost', 'unauthorized']) {
    mode = next
    let token = credential, rejected = []
    const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
    const model = createMaterialCadastroModel(createCatalogService(authenticated.json), createMaterialCadastroService(authenticated.json))
    await model.initialize(); await model.loadOptions('instituicoes', true)
    assert.equal(model.getState().selectors.instituicoes.options.length, 101)
    await model.changeAcademic('instituicaoId', id(1)); await model.changeAcademic('cursoId', id(3))
    await model.changeAcademic('disciplinaId', id(5)); await model.changeAcademic('categoriaId', id(7))
    model.changeText('titulo', ' ' + input().titulo + ' '); model.changeText('descricao', input().descricao); model.changeMagnet(0, magnetUri)
    const before = posts
    await model.submit()
    assert.equal(posts, before + 1)
    assert.equal(model.getState().sending, false)
    assert.equal(!!model.getState().createdId, mode === 'created')
    assert.equal(model.getState().error.includes(magnetUri), false)
    assert.equal(JSON.stringify(model.getState().fields).includes(magnetUri), false)
    if (['unavailable', 'badDTO', 'lost'].includes(mode)) assert.equal(model.getState().uncertain, true)
    if (mode === 'created') { await model.submit(); assert.equal(posts, before + 1); assert.deepEqual(model.getState().draft.magnetUris, ['']) }
    if (mode === 'unauthorized') { assert.equal(token, null); assert.deepEqual(rejected, [credential]) }
    model.dispose()
  }
})
