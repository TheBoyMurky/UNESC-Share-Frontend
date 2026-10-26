import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createCatalogService } from '../src/features/catalogo/catalog-service.ts'
import { createCatalogModel } from '../src/features/catalogo/catalog-model.ts'
import { id, material, page } from './catalog-fixtures.mjs'

test('HTTP sintetico:101instituicoes, vinculos dependentes e query combinada/paginada com Bearer', async context => {
  const received = []
  const server = createServer((request, response) => {
    assert.equal(request.method, 'GET')
    assert.equal(request.headers.authorization, 'Bearer token-sintetico')
    assert.equal(request.headers.cookie, undefined)
    const url = new URL(request.url, 'http://localhost')
    received.push(url)
    const number = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size'))
    let data
    if (url.pathname === '/api/v1/instituicoes') {
      assert.equal(size, 100)
      data = page(Array.from({ length: number === 0 ? 100 : 1 }, (_, n) => ({ id: id(100 + number * 100 + n), nome: 'Instituição sintética ' + n, sigla: 'TESTE' })), number, size, 101)
    } else if (url.pathname === '/api/v1/categorias') data = page([{ id: id(7), nome: 'Resumo', descricao: null }], number, size)
    else if (url.pathname === '/api/v1/cursos') {
      assert.equal(url.searchParams.get('instituicaoId'), id(200))
      data = page([{ id: id(3), nome: 'Curso', instituicaoId: id(200), descricao: null }], number, size)
    } else if (url.pathname === '/api/v1/disciplinas') {
      assert.equal(url.searchParams.get('cursoId'), id(3))
      data = page([{ id: id(5), nome: 'Disciplina', codigo: '123', cursoId: id(3), descricao: null }], number, size)
    } else if (url.pathname === '/api/v1/materiais') {
      data = page(Array.from({ length: size }, (_, n) => material(300 + number * size + n)), number, size, 40)
    } else { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(data))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  const service = createCatalogService((path, options) => client.json(path, { ...options, token: 'token-sintetico' }))
  const model = createCatalogModel(service)
  context.after(() => model.dispose())
  await model.initialize(); await model.loadOptions('instituicoes', true)
  assert.equal(model.getState().selectors.instituicoes.options.length, 101)
  await model.changeFilter('instituicaoId', id(200)); await model.changeFilter('cursoId', id(3))
  await model.changeFilter('disciplinaId', id(5)); await model.changeFilter('categoriaId', id(7))
  await model.changeFilter('q', ' C++ / redes? '); await model.search(); await model.goToPage(1)
  const last = received.at(-1)
  for (const [key, value] of [['instituicaoId', id(200)], ['cursoId', id(3)], ['disciplinaId', id(5)], ['categoriaId', id(7)], ['q', 'C++ / redes?'], ['page', '1'], ['size', '20']]) {
    assert.equal(last.searchParams.get(key), value)
  }
  assert.equal(last.searchParams.has('token'), false)
  assert.equal(model.getState().results.data.content.length, 20)
  assert.equal(model.getState().results.data.page.number, 1)
})
