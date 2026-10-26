import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createCatalogModel, filtersChanged } from '../src/features/catalogo/catalog-model.ts'
import { deferred, filters, id, material, mockService, page } from './catalog-fixtures.mjs'

test('inicializa busca geral e apenas instituicoes/categorias', async () => {
  const service = mockService(), model = createCatalogModel(service)
  await model.initialize()
  assert.equal(service.calls.length, 3)
  assert.deepEqual(service.calls.filter(call => call.type === 'options').map(call => call.kind), ['instituicoes', 'categorias'])
  assert.deepEqual(model.getState().applied, filters())
  assert.equal(model.getState().results.data.page.size, 20)
})

test('trocar instituicao limpa curso/disciplina, preserva categoria e carrega cursos filtrados', async () => {
  const service = mockService(), model = createCatalogModel(service)
  await model.initialize()
  await model.changeFilter('instituicaoId', id(1))
  await model.changeFilter('cursoId', id(3))
  await model.changeFilter('disciplinaId', id(5))
  await model.changeFilter('categoriaId', id(7))
  await model.changeFilter('instituicaoId', id(2))
  assert.equal(model.getState().filters.cursoId, '')
  assert.equal(model.getState().filters.disciplinaId, '')
  assert.equal(model.getState().filters.categoriaId, id(7))
  assert.equal(model.getState().selectors.disciplinas.options.length, 0)
  assert.equal(service.calls.at(-1).parent, id(2))
})

test('trocar curso limpa disciplina; limpar pai nao busca todos os cursos/disciplinas', async () => {
  const service = mockService(), model = createCatalogModel(service)
  await model.initialize(); await model.changeFilter('instituicaoId', id(1)); await model.changeFilter('cursoId', id(3)); await model.changeFilter('disciplinaId', id(5))
  await model.changeFilter('cursoId', id(4))
  assert.equal(model.getState().filters.disciplinaId, '')
  const before = service.calls.length
  await model.changeFilter('instituicaoId', '')
  assert.equal(service.calls.length, before)
  assert.equal(model.getState().selectors.cursos.options.length, 0)
})

test('selecao desconhecida e texto acima de200 nao alteram filtros nem disparam HTTP', async () => {
  const service = mockService(), model = createCatalogModel(service)
  await model.initialize()
  const before = service.calls.length
  await model.changeFilter('instituicaoId', id(99)); await model.changeFilter('q', 'a'.repeat(201))
  assert.deepEqual(model.getState().filters, filters())
  assert.equal(service.calls.length, before)
})

test('digitar nao pesquisa; aplicar usa trim/pagina0 e desabilita pagina anterior de filtros antigos', async () => {
  const service = mockService(), model = createCatalogModel(service)
  await model.initialize(); await model.goToPage(1)
  const before = service.calls.length
  await model.changeFilter('q', '  redes  ')
  assert.equal(filtersChanged(model.getState()), true)
  await model.goToPage(0)
  assert.equal(service.calls.length, before)
  await model.search()
  assert.equal(service.calls.at(-1).number, 0)
  assert.equal(service.calls.at(-1).filters.q, 'redes')
  assert.equal(filtersChanged(model.getState()), false)
})

test('paginacao usa filtros aplicados e size; limites nao geram chamadas', async () => {
  const service = mockService(), model = createCatalogModel(service)
  await model.initialize()
  model.setPageSize(50)
  assert.equal(filtersChanged(model.getState()), true)
  await model.search()
  assert.equal(service.calls.at(-1).size, 50)
  const before = service.calls.length
  await model.goToPage(-1); await model.goToPage(1); await model.goToPage(0.5)
  assert.equal(service.calls.length, before)
  model.setPageSize(101)
  assert.equal(model.getState().pageSize, 50)
})

test('paginacao de seletores carrega alem de100 e evita duplicar IDs', async () => {
  const service = mockService({ options: async (_, __, number) => number === 0
    ? page(Array.from({ length: 100 }, (_, n) => ({ id: id(n + 100), nome: 'Opção ' + n })), 0, 100, 102)
    : page([{ id: id(100), nome: 'Nome atualizado' }, { id: id(200), nome: 'Opção nova' }], 1, 100, 102) })
  const model = createCatalogModel(service)
  await model.loadOptions('instituicoes'); await model.loadOptions('instituicoes', true)
  assert.equal(model.getState().selectors.instituicoes.options.length, 101)
  assert.equal(model.getState().selectors.instituicoes.options[0].nome, 'Nome atualizado')
  const before = service.calls.length
  await model.loadOptions('instituicoes', true)
  assert.equal(service.calls.length, before)
})

test('resposta atrasada de cursos de outra instituicao e ignorada mesmo sem cancelamento no servidor', async () => {
  const pending = deferred()
  const service = mockService({ options: async (kind, parent, number) => {
    if (kind === 'instituicoes') return page([1, 2].map(n => ({ id: id(n), nome: 'Inst ' + n })))
    if (kind === 'cursos' && parent === id(1)) return pending.promise
    return page([{ id: id(4), nome: 'Curso B' }], number)
  } })
  const model = createCatalogModel(service)
  await model.loadOptions('instituicoes')
  const old = model.changeFilter('instituicaoId', id(1))
  const oldCall = service.calls.at(-1)
  await model.changeFilter('instituicaoId', id(2))
  assert.equal(oldCall.signal.aborted, true)
  pending.resolve(page([{ id: id(3), nome: 'Curso A' }]))
  await old
  assert.deepEqual(model.getState().selectors.cursos.options, [{ id: id(4), nome: 'Curso B' }])
})

test('busca atrasada nao sobrescreve resultado da busca mais recente', async () => {
  const pending = deferred()
  const service = mockService({ search: async (filters, number, size) => filters.q === 'antiga' ? pending.promise : page([material(11)], number, size) })
  const model = createCatalogModel(service)
  await model.changeFilter('q', 'antiga')
  const old = model.search()
  await model.changeFilter('q', 'nova'); await model.search()
  pending.resolve(page([material(10)], 0, 20)); await old
  assert.equal(model.getState().results.data.content[0].id, id(11))
  assert.equal(model.getState().applied.q, 'nova')
})

test('erro de um seletor nao impede outros ou resultados, e permite tentar novamente', async () => {
  let failure = true
  const service = mockService({ options: async (kind, _, number) => {
    if (kind === 'instituicoes' && failure) throw new Error('detalhe-privado')
    return page([{ id: id(1), nome: 'Nome' }], number)
  } })
  const model = createCatalogModel(service)
  await model.initialize()
  assert.ok(model.getState().selectors.instituicoes.error)
  assert.equal(model.getState().selectors.instituicoes.error.includes('privado'), false)
  assert.equal(model.getState().results.data.content.length, 1)
  assert.equal(model.getState().selectors.categorias.options.length, 1)
  failure = false; await model.loadOptions('instituicoes')
  assert.equal(model.getState().selectors.instituicoes.error, '')
})

test('erro na pagina seguinte preserva opcoes anteriores e permite repetir so essa pagina', async () => {
  let failure = true
  const service = mockService({ options: async (_, __, number) => {
    if (number === 1 && failure) throw new ApiError('network')
    return number === 0 ? page(Array.from({ length: 100 }, (_, n) => ({ id: id(n + 100), nome: 'Opção' })), 0, 100, 101)
      : page([{ id: id(200), nome: 'Mais uma' }], 1, 100, 101)
  } })
  const model = createCatalogModel(service)
  await model.loadOptions('instituicoes'); await model.loadOptions('instituicoes', true)
  assert.equal(model.getState().selectors.instituicoes.options.length, 100)
  assert.equal(model.getState().selectors.instituicoes.page.number, 0)
  assert.ok(model.getState().selectors.instituicoes.error)
  failure = false; await model.loadOptions('instituicoes', true)
  assert.equal(model.getState().selectors.instituicoes.options.length, 101)
  assert.equal(model.getState().selectors.instituicoes.error, '')
})

test('erro de busca remove resultados antigos, nao e tratado como pagina vazia', async () => {
  let failure = false
  const service = mockService({ search: async (_, number, size) => { if (failure) throw new ApiError('network'); return page([material()], number, size) } })
  const model = createCatalogModel(service)
  await model.search(); failure = true; await model.search()
  assert.equal(model.getState().results.data, null)
  assert.ok(model.getState().results.error)
  assert.equal(model.getState().results.loading, false)
})

test('limpar filtros faz nova busca geral e preserva opcoes independentes', async () => {
  const service = mockService(), model = createCatalogModel(service)
  await model.initialize(); await model.changeFilter('instituicaoId', id(1)); await model.changeFilter('q', 'termo'); await model.clearFilters()
  assert.deepEqual(model.getState().filters, filters())
  assert.deepEqual(service.calls.at(-1).filters, filters())
  assert.equal(model.getState().selectors.instituicoes.options.length, 2)
  assert.equal(model.getState().selectors.cursos.options.length, 0)
})

test('catalogo que encolhe permite uma correcao para ultima pagina sem retry infinito', async () => {
  let calls = 0
  const service = mockService({ search: async (_, number, size) => {
    calls++
    return calls === 1 ? page([material()], 0, size, 120) : number === 5 ? page([], 5, size, 20) : page([material()], 0, size, 20)
  } })
  const model = createCatalogModel(service)
  await model.search(); await model.goToPage(5)
  assert.deepEqual(service.calls.map(call => call.number), [0, 5, 0])
  assert.equal(model.getState().results.data.page.number, 0)
})

test('dispose aborta requisicoes e impede respostas/novas chamadas apos sair ou logout', async () => {
  const pending = deferred(), service = mockService({ search: async () => pending.promise }), model = createCatalogModel(service)
  let notifications = 0
  model.subscribe(() => { notifications++ })
  const running = model.search()
  const before = notifications
  model.dispose()
  assert.equal(service.calls[0].signal.aborted, true)
  pending.resolve(page([material()], 0, 20)); await running; await model.search(); await model.initialize()
  assert.equal(notifications, before)
  assert.equal(service.calls.length, 1)
})
