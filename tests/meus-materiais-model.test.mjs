import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOwnMaterialsModel, ownFiltersChanged } from '../src/features/material/meus-materiais-model.ts'
import { ApiError } from '../src/shared/http/client.ts'
import { page, material, deferred } from './catalog-fixtures.mjs'

function fixture(override) {
  const calls = []
  const model = createOwnMaterialsModel({ search: async (filters, number, size, signal) => {
    calls.push({ filters, number, size, signal })
    return override ? override(filters, number, size, signal) : page([{ ...material(), status: 'PENDENTE' }], number, size, 60)
  } })
  return { model, calls }
}

test('inicializa somente consulta propria em todos os estados com size20', async () => {
  const { model, calls } = fixture()
  await model.initialize()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].filters, { q: '', status: '' })
  assert.equal(calls[0].size, 20)
  assert.equal(model.getState().data.content[0].status, 'PENDENTE')
  assert.equal(ownFiltersChanged(model.getState()), false)
})

test('digitar/trocar estado nao pesquisa; filtros pendentes impedem navegar pagina antiga', async () => {
  const { model, calls } = fixture()
  await model.initialize(); await model.goToPage(1)
  model.changeFilter('q', '  redes  '); model.changeFilter('status', 'BLOQUEADO')
  const before = calls.length
  assert.equal(ownFiltersChanged(model.getState()), true)
  await model.goToPage(0)
  assert.equal(calls.length, before)
  await model.search()
  assert.deepEqual(calls.at(-1).filters, { q: 'redes', status: 'BLOQUEADO' })
  assert.equal(calls.at(-1).number, 0)
  assert.equal(ownFiltersChanged(model.getState()), false)
})

test('filtro desconhecido/texto excedente/tamanho invalido nao altera consulta', async () => {
  const { model, calls } = fixture()
  model.changeFilter('status', 'TODOS'); model.changeFilter('q', 'a'.repeat(201)); model.changeFilter('usuarioId', 'outro')
  model.setPageSize(10)
  assert.deepEqual(model.getState().filters, { q: '', status: '' })
  assert.equal(model.getState().pageSize, 20)
  assert.equal(calls.length, 0)
})

test('paginacao usa filtros aplicados e20/50/100; limites nao geram chamadas', async () => {
  const { model, calls } = fixture()
  model.changeFilter('status', 'REMOVIDO'); await model.search(); await model.goToPage(1)
  assert.deepEqual(calls.at(-1).filters, { q: '', status: 'REMOVIDO' })
  const before = calls.length
  await model.goToPage(-1); await model.goToPage(3); await model.goToPage(.5)
  assert.equal(calls.length, before)
  for (const size of [50, 100]) {
    model.setPageSize(size)
    assert.equal(ownFiltersChanged(model.getState()), true)
    await model.search()
    assert.equal(calls.at(-1).size, size)
    assert.equal(calls.at(-1).number, 0)
  }
})

test('limpar filtros consulta todos os estados na primeira pagina preservando size', async () => {
  const { model, calls } = fixture()
  model.changeFilter('q', 'termo'); model.changeFilter('status', 'PUBLICADO'); model.setPageSize(50)
  await model.search(); await model.clearFilters()
  assert.deepEqual(calls.at(-1).filters, { q: '', status: '' })
  assert.equal(calls.at(-1).number, 0)
  assert.equal(calls.at(-1).size, 50)
})

test('busca antiga abortada nao sobrescreve a ultima resposta', async () => {
  const old = deferred()
  const { model, calls } = fixture(async (filters, number, size) => filters.q === 'antiga' ? old.promise : page([material(11)], number, size))
  model.changeFilter('q', 'antiga'); const pending = model.search()
  model.changeFilter('q', 'nova'); await model.search()
  assert.equal(calls[0].signal.aborted, true)
  old.resolve(page([material(10)], 0, 20)); await pending
  assert.equal(model.getState().applied.q, 'nova')
  assert.equal(model.getState().data.content[0].id, material(11).id)
})

test('erro antigo nao apaga resultado novo e mensagens nao ecoam causa privada', async () => {
  const old = deferred()
  const { model } = fixture(async (filters, number, size) => filters.q === 'antiga' ? old.promise : page([material()], number, size))
  model.changeFilter('q', 'antiga'); const pending = model.search()
  model.changeFilter('q', 'nova'); await model.search()
  old.reject(new Error('url-token-privado')); await pending
  assert.equal(model.getState().error, '')
  assert.ok(model.getState().data)
})

for (const status of [401, 403, 404, 503]) {
  test(`erro${status} remove lista anterior sem mostrar vazio ou repetir automaticamente`, async () => {
    let failing = false
    const { model, calls } = fixture(async (_, number, size) => { if (failing) throw new ApiError('http', status); return page([material()], number, size) })
    await model.search(); failing = true; await model.search()
    assert.equal(calls.length, 2)
    assert.equal(model.getState().data, null)
    assert.equal(model.getState().loading, false)
    assert.ok(model.getState().error)
  })
}

test('erro desconhecido e sanitizado e busca explicita permite recuperar', async () => {
  let failing = true
  const { model } = fixture(async (_, number, size) => { if (failing) throw new Error('url-token-privado'); return page([], number, size) })
  await model.search()
  assert.equal(model.getState().error.includes('privado'), false)
  failing = false; await model.search()
  assert.equal(model.getState().error, '')
  assert.deepEqual(model.getState().data.content, [])
})

test('corrige uma pagina que saiu do total sem loop de retry', async () => {
  let initial = true
  const { model, calls } = fixture(async (_, number, size) => {
    if (initial) { initial = false; return page([material()], number, size, 60) }
    return page([], number, size, number === 2 ? 20 : 0)
  })
  await model.search(); await model.goToPage(2)
  assert.deepEqual(calls.map(call => call.number), [0, 2, 0])
  assert.equal(model.getState().data.page.totalElements, 0)
})

test('pagina vazia ainda dentro do total nao dispara retries', async () => {
  const { model, calls } = fixture(async (_, number, size) => page([], number, size, 40))
  await model.search()
  assert.equal(calls.length, 1)
  assert.equal(model.getState().data.page.totalElements, 40)
})

test('nao navega paginas enquanto consulta esta em andamento', async () => {
  const task = deferred()
  const { model, calls } = fixture(() => task.promise)
  const pending = model.search()
  await model.goToPage(1)
  assert.equal(calls.length, 1)
  task.resolve(page([], 0, 20)); await pending
})

test('desmontagem limpa estado, aborta espera e ignora resultado/acoes posteriores', async () => {
  const task = deferred(), { model, calls } = fixture(() => task.promise)
  let changes = 0
  model.subscribe(() => { changes++ })
  const pending = model.search()
  model.dispose()
  const before = changes
  assert.equal(calls[0].signal.aborted, true)
  task.resolve(page([material()], 0, 20)); await pending
  await model.search(); await model.initialize(); await model.goToPage(0); await model.clearFilters()
  model.changeFilter('status', 'PENDENTE'); model.setPageSize(50)
  assert.equal(calls.length, 1)
  assert.equal(changes, before)
  assert.equal(model.getState().data, null)
  assert.deepEqual(model.getState().filters, { q: '', status: '' })
})

test('dispose durante correcao de pagina impede resultado atrasado', async () => {
  const task = deferred()
  let count = 0
  const { model, calls } = fixture(async (_, number, size) => {
    if (++count === 1) return page([material()], 0, size, 60)
    if (count === 2) return page([], number, size, 20)
    return task.promise
  })
  await model.search()
  const pending = model.goToPage(2)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls.length, 3)
  model.dispose()
  task.resolve(page([material()], 0, 20)); await pending
  assert.equal(model.getState().data, null)
  assert.equal(calls[2].signal.aborted, true)
})
