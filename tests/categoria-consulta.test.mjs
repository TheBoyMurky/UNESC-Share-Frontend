import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createCategoriaService } from '../src/features/categoria/categoria-service.ts'
import { createCategoriaConsultaModel } from '../src/features/categoria/categoria-consulta-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const categoria = (changes = {}) => ({ id: id(1), nome: 'Categoria <script>literal</script>', descricao: 'Texto de exemplo', ...changes })
const actor = (perfil = 'USUARIO', key = id(8)) => ({ id: key, perfil })

test('service lista e consulta categoria por UUID, valida e projeta somente os tres campos', async () => {
  const calls = [], rows = [categoria(), categoria({ id: id(2), nome: 'Outra categoria', descricao: null })]
  const service = createCategoriaService(async (...args) => {
    calls.push(args)
    return args[0].includes('?') ? page(rows.map(row => ({ ...row, materiais: ['PRIVADO'], createdBy: 'EXTRA' })), 1, 20, 22)
      : { ...rows[0], materiais: ['PRIVADO'] }
  })
  assert.deepEqual((await service.list(1, 20)).content, rows)
  assert.deepEqual(await service.detail(id(1).toUpperCase()), rows[0])
  assert.deepEqual(calls, [[`/categorias?page=1&size=20`, { signal: undefined }], [`/categorias/${id(1)}`, { signal: undefined }]])
})

test('service valida UUID/paginacao antes de HTTP e confere o UUID do detalhe', async () => {
  const service = createCategoriaService(() => assert.fail('não deve consultar'))
  await assert.rejects(service.detail('../x'), TypeError)
  for (const args of [[-1, 20], [0.5, 20], [0, 0], [0, 101]]) await assert.rejects(service.list(...args), TypeError)
  await assert.rejects(createCategoriaService(async () => categoria({ id: id(2) })).detail(id(1)), ApiError)
})

test('parser recusa DTOs invalidos e aceita limites oficiais', async () => {
  for (const change of [
    { id: 'x' }, { nome: '' }, { nome: 'n'.repeat(81) }, { nome: 'x\u0000' },
    { descricao: 'd'.repeat(501) }, { descricao: 'x\u0000' }, { descricao: undefined },
  ]) await assert.rejects(createCategoriaService(async () => categoria(change)).detail(id(1)), ApiError)
  for (const value of [null, [], 'texto']) await assert.rejects(createCategoriaService(async () => value).detail(id(1)), ApiError)
  const exact = categoria({ nome: 'n'.repeat(80), descricao: 'd'.repeat(500) })
  assert.deepEqual(await createCategoriaService(async () => exact).detail(id(1)), exact)
})

test('service recusa UUID duplicado e pagina/contagem incoerentes', async () => {
  for (const data of [
    page([categoria(), categoria()], 0, 20),
    page([categoria(), categoria({ id: id(1).toUpperCase() })], 0, 20),
    page([categoria()], 1, 20, 1), page([categoria()], 0, 20, 1),
  ]) {
    const number = data.page.number === 1 ? 1 : data.page.totalElements === 1 ? 1 : 0
    await assert.rejects(createCategoriaService(async () => data).list(number, 20), ApiError)
  }
})

function fixture({ list, detail, user = () => actor() } = {}) {
  const calls = []
  const service = {
    list: async (number, size, signal) => { calls.push({ kind: 'list', number, size, signal }); return list ? list(number, size, signal) : page([categoria()], number, size, 101) },
    detail: async (key, signal) => { calls.push({ kind: 'detail', key, signal }); return detail ? detail(key, signal) : categoria({ id: key }) },
  }
  return { model: createCategoriaConsultaModel(service, user), calls }
}

for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' consulta lista e detalhe sem exigir perfil administrativo', async () => {
    const { model, calls } = fixture({ user: () => actor(perfil) })
    await model.loadList(); assert.equal(model.getState().data.content[0].id, id(1))
    await model.loadDetail(id(99)); assert.equal(model.getState().data, null); assert.equal(model.getState().categoria.id, id(99))
    assert.equal(calls.at(-1).kind, 'detail'); model.dispose()
  })
}

test('lista aceita tamanhos 20/50/100, refresh preserva página e correção não faz loop', async () => {
  const { model, calls } = fixture()
  await model.loadList(); await model.goToPage(2); await model.reload()
  assert.deepEqual(calls.slice(-2).map(call => call.number), [2, 2])
  await model.setSize(50); assert.deepEqual([calls.at(-1).number, calls.at(-1).size], [0, 50])
  await model.setSize(100); const before = calls.length
  await model.setSize(21); await model.goToPage(-1); await model.goToPage(0.5); await model.goToPage(99); assert.equal(calls.length, before)
  await model.loadDetail(id(1)); await model.setSize(20); assert.equal(calls.at(-1).kind, 'detail')
  model.dispose()

  let shrunk = false
  const corrected = fixture({ list: async (number, size) => page(shrunk ? [] : [categoria()], number, size, shrunk ? 0 : 101) })
  await corrected.model.loadList(); shrunk = true; await corrected.model.goToPage(3)
  assert.deepEqual(corrected.calls.slice(-2).map(call => call.number), [3, 0]); assert.deepEqual(corrected.model.getState().data.content, [])
  corrected.model.dispose()
})

test('falhas distinguem lista vazia, retry explicito, 404 e bloqueio 401/403', async () => {
  let fail = false
  const { model, calls } = fixture({
    list: async (number, size) => { if (fail) throw new ApiError('http', 503, { detail: 'PRIVADO' }); return page([], number, size) },
    detail: async key => { if (fail) throw new ApiError('http', 404); return categoria({ id: key }) },
  })
  await model.loadList(); assert.deepEqual(model.getState().data.content, [])
  fail = true; await model.reload(); assert.ok(model.getState().error); assert.equal(model.getState().unavailable, false); assert.equal(model.getState().error.includes('PRIVADO'), false)
  fail = false; await model.reload(); assert.equal(model.getState().error, '')
  await model.loadDetail(id(1)); fail = true; await model.reload(); assert.equal(model.getState().unavailable, true); assert.equal(model.getState().categoria, null)
  const before = calls.length; await model.reload(); assert.equal(calls.length, before); model.dispose()

  for (const status of [401, 403]) {
    const blocked = fixture({ list: async () => { throw new ApiError('http', status) } })
    await blocked.model.loadList(); assert.equal(blocked.model.getState().unavailable, true)
    const count = blocked.calls.length; await blocked.model.reload(); assert.equal(blocked.calls.length, count); blocked.model.dispose()
  }
})

test('troca de categoria, conta/perfil ou dispose aborta e ignora respostas atrasadas', async () => {
  for (const change of ['uuid', 'account', 'profile', 'logout', 'dispose']) {
    const pending = deferred(); let user = actor(); let reads = 0
    const { model, calls } = fixture({ user: () => user, detail: async key => ++reads === 1 ? pending.promise : categoria({ id: key }) })
    const opening = model.loadDetail(id(1))
    if (change === 'account') user = actor('USUARIO', id(9))
    if (change === 'profile') user = actor('ADMINISTRADOR')
    if (change === 'logout') user = null
    if (change === 'dispose') model.dispose(); else await model.loadDetail(change === 'uuid' ? id(2) : id(1))
    pending.reject(new ApiError('http', 403)); await opening; assert.equal(calls[0].signal.aborted, true)
    if (change === 'logout' || change === 'dispose') assert.equal(model.getState().categoria, null)
    else { assert.equal(model.getState().unavailable, false); assert.equal(model.getState().categoria.id, change === 'uuid' ? id(2) : id(1)) }
    model.dispose()
  }
})

test('sem usuario ou UUID de conta invalido nenhuma consulta e enviada', async () => {
  for (const user of [null, actor('USUARIO', 'invalido')]) {
    const { model, calls } = fixture({ user: () => user }); await model.loadList(); await model.loadDetail(id(1)); assert.equal(calls.length, 0); model.dispose()
  }
})
