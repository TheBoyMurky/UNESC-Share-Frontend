import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCatalogService, materialSearchPath } from '../src/features/catalogo/catalog-service.ts'
import { filters, id, material, page } from './catalog-fixtures.mjs'

test('query codifica texto e combina todos os filtros sem parametros de identidade/status/sort', () => {
  const path = materialSearchPath({ q: '  C++ & redes? #/ % _  ', instituicaoId: id(1), cursoId: id(3), disciplinaId: id(5), categoriaId: id(7) }, 2, 50)
  const url = new URL('https://example.test' + path)
  assert.equal(url.pathname, '/materiais')
  assert.equal(url.searchParams.get('q'), 'C++ & redes? #/ % _')
  assert.equal(url.searchParams.get('instituicaoId'), id(1))
  assert.equal(url.searchParams.get('cursoId'), id(3))
  assert.equal(url.searchParams.get('disciplinaId'), id(5))
  assert.equal(url.searchParams.get('categoriaId'), id(7))
  assert.equal(url.searchParams.get('page'), '2')
  assert.equal(url.searchParams.get('size'), '50')
  for (const key of ['status', 'usuarioId', 'sort', 'token']) assert.equal(url.searchParams.has(key), false)
})

test('busca vazia usa somente pagina/size e aceita ausencia de resultados', async () => {
  assert.equal(materialSearchPath(filters()), '/materiais?page=0&size=20')
  const service = createCatalogService(async () => page([], 0, 20))
  assert.deepEqual(await service.search(filters()), page([], 0, 20))
})

for (const [number, size] of [[-1, 20], [0.5, 20], [0, 0], [0, 101], [0, 1.5]]) {
  test(`paginacao invalida ${number}/${size} nao e enviada`, () => assert.throws(() => materialSearchPath(filters(), number, size), TypeError))
}

test('texto acima de200 e UUID invalido sao rejeitados antes do HTTP', () => {
  assert.throws(() => materialSearchPath({ ...filters(), q: 'a'.repeat(201) }), TypeError)
  assert.throws(() => materialSearchPath({ ...filters(), cursoId: 'invalido' }), TypeError)
})

for (const [kind, parent, dto, expectedQuery] of [
  ['instituicoes', '', { id: id(1), nome: 'Instituição', sigla: 'TESTE' }, null],
  ['categorias', '', { id: id(7), nome: 'Resumo', descricao: null }, null],
  ['cursos', id(1), { id: id(3), nome: 'Curso', instituicaoId: id(1) }, ['instituicaoId', id(1)]],
  ['disciplinas', id(3), { id: id(5), nome: 'Disciplina', codigo: 'OFICIAL-1', cursoId: id(3) }, ['cursoId', id(3)]],
]) {
  test(`seletor ${kind} respeita pagina100, vinculo e AbortSignal`, async () => {
    const controller = new AbortController()
    const service = createCatalogService(async (path, options) => {
      const url = new URL('https://example.test' + path)
      assert.equal(url.pathname, '/' + kind)
      assert.equal(url.searchParams.get('size'), '100')
      assert.equal(url.searchParams.get('page'), '0')
      if (expectedQuery) assert.equal(url.searchParams.get(expectedQuery[0]), expectedQuery[1])
      assert.equal(options.signal, controller.signal)
      return page([dto])
    })
    const result = await service.options(kind, parent, 0, controller.signal)
    assert.equal(result.content[0].id, dto.id)
    assert.equal(result.content[0].nome, dto.nome)
    assert.equal(result.content[0].descricao, undefined)
  })
}

test('curso/disciplina nao sao buscados sem pai valido', async () => {
  let calls = 0
  const service = createCatalogService(async () => { calls++ })
  await assert.rejects(service.options('cursos'), TypeError)
  await assert.rejects(service.options('disciplinas', 'invalido'), TypeError)
  assert.equal(calls, 0)
})

test('vinculo incorreto de curso/disciplina e erro de protocolo', async () => {
  for (const kind of ['cursos', 'disciplinas']) {
    const service = createCatalogService(async () => page([{ id: id(3), nome: 'Nome', codigo: '123', instituicaoId: id(2), cursoId: id(2) }]))
    await assert.rejects(service.options(kind, id(1)), error => error.kind === 'protocol')
  }
})

test('MaterialResumo projetado nao conserva campos extras ou dados pessoais', async () => {
  const dto = material()
  const service = createCatalogService(async () => page([{ ...dto, email: 'privado', caminhoArquivo: 'privado' }], 0, 20))
  assert.deepEqual((await service.search(filters())).content, [dto])
})

for (const invalid of [
  { ...material(), status: 'PENDENTE' }, { ...material(), id: 'invalido' }, { ...material(), dataCadastro: 'invalida' },
  { ...material(), visualizacoes: -1 }, { ...material(), titulo: ' ' },
]) {
  test('MaterialResumo invalido ou nao publicado nao e exibido', async () => {
    const service = createCatalogService(async () => page([invalid], 0, 20))
    await assert.rejects(service.search(filters()), error => error.kind === 'protocol')
  })
}

for (const invalid of [null, [], {}, { content: [], page: null }, { ...page([], 0, 20), page: { number: 0, size: 20, totalElements: -1, totalPages: 0 } },
  page([], 1, 20), page([], 0, 100), { content: [], page: { number: 0, size: 20, totalElements: 21, totalPages: 1 } }]) {
  test('metadados de pagina ausentes/inconsistentes nao sao aceitos silenciosamente', async () => {
    const service = createCatalogService(async () => invalid)
    await assert.rejects(service.search(filters()), error => error.kind === 'protocol')
  })
}

test('pagina que declara total menor que o conteudo e rejeitada', async () => {
  const service = createCatalogService(async () => page([material()], 0, 20, 0))
  await assert.rejects(service.search(filters()), error => error.kind === 'protocol')
})
