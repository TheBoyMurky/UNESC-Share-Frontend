import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { estados } from '../src/features/denuncia/denuncia-service.ts'
import { createModeracaoDenunciaService } from '../src/features/moderacao/moderacao-denuncia-service.ts'
import { createModeracaoDenunciaModel } from '../src/features/moderacao/moderacao-denuncia-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const report = (changes = {}) => ({ id: id(60), materialId: id(10), motivo: 'LINK_INVALIDO', descricao: 'Relato privado', status: 'PENDENTE', dataCadastro: '2026-10-23T12:00:00Z', ...changes })
const summary = status => { const { descricao, ...data } = report({ status }); return data }
const staff = (perfil = 'MODERADOR', key = id(8)) => ({ id: key, perfil })
function fixture(list, user = () => staff()) {
  const calls = []
  const model = createModeracaoDenunciaModel({ list: async (status, number, size, signal) => { calls.push({ status, number, size, signal }); return list ? list(status, number, size, signal) : page([summary(status)], number, size) } }, user)
  return { model, calls }
}
for (const status of estados) {
  test('service fila ' + status + ' usa namespace de equipe e projeta resumo sem descricao/denunciante/extras', async () => {
    const calls = [], signal = new AbortController().signal
    const service = createModeracaoDenunciaService(async (...args) => { calls.push(args); return page([report({ status, usuarioId: id(8), email: 'PRIVADO', titulo: 'PRIVADO', magnetUri: 'PRIVADO' })], 1, 20, 21) })
    const data = await service.list(status, 1, 20, signal)
    assert.deepEqual(calls, [[`/denuncias/moderacao?page=1&size=20&status=${status}`, { signal }]])
    assert.deepEqual(data.content, [summary(status)]); assert.equal(JSON.stringify(data).includes('PRIVADO'), false); assert.equal('descricao' in data.content[0], false)
  })
}
test('service defaultPENDENTE, ordenacao recebida preservada e sem consulta extra porMaterial/usuario', async () => {
  let calls = 0
  const service = createModeracaoDenunciaService(async path => { calls++; assert.equal(path, '/denuncias/moderacao?page=0&size=20&status=PENDENTE'); return page([report({ id: id(62) }), report({ id: id(60) })], 0, 20) })
  assert.deepEqual((await service.list()).content.map(item => item.id), [id(62), id(60)]); assert.equal(calls, 1)
})
test('service rejeita filtro/paginacao invalidos antesHTTP', async () => {
  const service = createModeracaoDenunciaService(() => assert.fail())
  for (const status of ['', 'TODOS', 'pendente', null, 'PENDENTE&usuarioId=' + id(8)]) await assert.rejects(service.list(status), TypeError)
  for (const [number, size] of [[-1, 20], [0.5, 20], [0, 101], [0, 0]]) await assert.rejects(service.list('PENDENTE', number, size), TypeError)
})
test('service rejeita estado diferente do filtro, DTO invalido, pagina incoerente e UUIDs duplicados', async () => {
  for (const data of [page([report({ status: 'EM_ANALISE' })], 0, 20), page([report({ materialId: 'x' })], 0, 20), page([report({ descricao: '' })], 0, 20), page([report(), report()], 0, 20), page([report()], 1, 20), { content: [], page: { number: 0, size: 20, totalElements: 21, totalPages: 1 } }]) {
    await assert.rejects(createModeracaoDenunciaService(async () => data).list(), error => error instanceof ApiError && error.kind === 'protocol')
  }
})
for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' consulta mesmo sem elegibilidade inferida; somente leituras oferecidas', async () => {
    const { model, calls } = fixture(undefined, () => staff(perfil)); await model.initialize()
    assert.equal(calls.length, 1); assert.equal(model.getState().status, 'PENDENTE'); assert.ok(model.getState().data)
    for (const key of ['analisar', 'proceder', 'improceder', 'submit', 'remove']) assert.equal(key in model, false)
    model.dispose()
  })
}
for (const user of [null, staff('USUARIO'), staff('DESCONHECIDO'), staff('MODERADOR', 'x')]) {
  test('sem equipe valida nao enviaHTTP: ' + JSON.stringify(user), async () => {
    const { model, calls } = fixture(undefined, () => user); await model.initialize(); await model.reload(); await model.setStatus('EM_ANALISE'); await model.setSize(50)
    assert.equal(calls.length, 0); assert.equal(model.getState().denied, true); assert.equal(model.getState().data, null); model.dispose()
  })
}
test('filtro muda para pagina0/preserva tamanho e reload preserva filtro/pagina', async () => {
  const { model, calls } = fixture((status, number, size) => page([summary(status)], number, size, 101))
  await model.initialize(); await model.goToPage(3); await model.reload(); assert.deepEqual(calls.slice(-2).map(x => [x.status, x.number]), [['PENDENTE', 3], ['PENDENTE', 3]])
  await model.setSize(50); await model.goToPage(2); await model.setStatus('EM_ANALISE'); assert.deepEqual(calls.at(-1).status, 'EM_ANALISE'); assert.equal(calls.at(-1).number, 0); assert.equal(calls.at(-1).size, 50)
  await model.setStatus('PROCEDENTE'); await model.setStatus('IMPROCEDENTE'); await model.setSize(100); assert.equal(calls.at(-1).status, 'IMPROCEDENTE'); assert.equal(calls.at(-1).size, 100)
  const before = calls.length; await model.setStatus('TODOS'); await model.setSize(21); await model.goToPage(-1); await model.goToPage(100); assert.equal(calls.length, before)
  model.dispose()
})
test('pagina encolhida corrige uma vez usando mesmo filtro, inclusive totalzero', async () => {
  let shrink = false
  const { model, calls } = fixture((status, number, size) => page(shrink ? [] : [summary(status)], number, size, shrink ? 0 : 21))
  await model.initialize(); await model.setStatus('EM_ANALISE'); shrink = true; await model.goToPage(1)
  assert.deepEqual(calls.slice(-2).map(x => [x.status, x.number]), [['EM_ANALISE', 1], ['EM_ANALISE', 0]])
  assert.equal(model.getState().data.page.totalElements, 0); model.dispose()
})
test('filtro novo descarta fila imediatamente e resposta antiga nao substitui novos dados', async () => {
  const old = deferred(); let reads = 0, oldSignal
  const { model } = fixture(async (status, number, size, signal) => { if (++reads === 2) { oldSignal = signal; return old.promise } return page([summary(status)], number, size) })
  await model.initialize(); const first = model.reload(); assert.equal(model.getState().data, null)
  await model.setStatus('EM_ANALISE'); old.resolve(page([summary('PENDENTE')], 0, 20)); await first
  assert.equal(oldSignal.aborted, true); assert.equal(model.getState().status, 'EM_ANALISE'); assert.equal(model.getState().data.content[0].status, 'EM_ANALISE'); model.dispose()
})
for (const status of [401, 403]) {
  test('API' + status + ' descarta fila/bloqueia novas leituras sem refletir corpo privado', async () => {
    let fail = false
    const { model, calls } = fixture(async (filter, number, size) => { if (fail) throw new ApiError('http', status, { detail: 'PRIVADO', errors: [] }); return page([summary(filter)], number, size) })
    await model.initialize(); fail = true; await model.reload(); assert.equal(model.getState().denied, true); assert.equal(model.getState().data, null); assert.equal(model.getState().error.includes('PRIVADO'), false)
    await model.reload(); await model.setStatus('EM_ANALISE'); await model.setSize(50); assert.equal(calls.length, 2); model.dispose()
  })
}
test('rede/protocolo nao viram fila vazia; retry explicito preserva filtro e nao conserva dados antigos', async () => {
  let fail = false
  const { model } = fixture(async (status, number, size) => { if (fail) throw new ApiError('network'); return page([], number, size) })
  await model.initialize(); await model.setStatus('EM_ANALISE'); fail = true; await model.reload()
  assert.equal(model.getState().data, null); assert.equal(model.getState().denied, false); assert.ok(model.getState().error)
  fail = false; await model.reload(); assert.equal(model.getState().status, 'EM_ANALISE'); assert.deepEqual(model.getState().data.content, []); assert.equal(model.getState().error, ''); model.dispose()
})
for (const change of ['conta', 'perfil', 'equipe', 'dispose']) {
  test('resposta antiga apos ' + change + ' nao restaura relatos', async () => {
    const old = deferred(); let user = staff(), signal
    const { model } = fixture(async (status, number, size, s) => { signal = s; return old.promise }, () => user)
    const loading = model.initialize()
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose()
    old.resolve(page([summary('PENDENTE')], 0, 20)); await loading; assert.equal(signal.aborted, true); assert.equal(model.getState().data, null); model.dispose()
  })
}
test('nova conta reinicializa filtro/tamanho e403antigo nao limpa nova fila', async () => {
  const old = deferred(); let user = staff(), reads = 0
  const { model } = fixture(async (status, number, size) => ++reads === 3 ? old.promise : page([summary(status)], number, size), () => user)
  await model.initialize(); await model.setStatus('EM_ANALISE'); const loading = model.setSize(50)
  user = staff('ADMINISTRADOR', id(9)); await model.initialize(); old.reject(new ApiError('http', 403)); await loading
  assert.equal(model.getState().status, 'PENDENTE'); assert.equal(model.getState().size, 20); assert.equal(model.getState().denied, false); assert.ok(model.getState().data); model.dispose()
})
