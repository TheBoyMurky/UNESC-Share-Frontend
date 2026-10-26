import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createModeracaoDenunciaService } from '../src/features/moderacao/moderacao-denuncia-service.ts'
import { createModeracaoDenunciaDetalheModel } from '../src/features/moderacao/moderacao-denuncia-detalhe-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const report = (changes = {}) => ({ id: id(60), materialId: id(10), motivo: 'SPAM', descricao: 'Relato\n<script>texto literal</script>', status: 'EM_ANALISE', dataCadastro: '2026-10-25T12:00:00Z', ...changes })
const event = (changes = {}) => ({ id: id(70), denunciaId: id(60), responsavelId: id(8), justificativa: 'Análise\n<script>texto literal</script>', estadoAnterior: 'PENDENTE', estadoNovo: 'EM_ANALISE', dataCadastro: '2026-10-25T13:00:00Z', ...changes })
const staff = (perfil = 'MODERADOR', key = id(8)) => ({ id: key, perfil })
function fixture(overrides = {}, user = () => staff()) {
  const calls = []
  const service = {
    detail: async (key, signal) => { calls.push({ kind: 'detail', key, signal }); return report({ id: key }) },
    history: async (key, number, size, signal) => { calls.push({ kind: 'history', key, number, size, signal }); return page([event({ denunciaId: key })], number, size) },
    ...overrides,
  }
  return { model: createModeracaoDenunciaDetalheModel(service, user), calls }
}

test('service detalhe usa namespace equipe e seis campos, sem buscar Material/denunciante ou inferir autoria', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createModeracaoDenunciaService(async (...args) => { calls.push(args); return { ...report(), usuarioId: id(8), email: 'PRIVADO', magnets: ['PRIVADO'] } })
  assert.deepEqual(await service.detail(id(60).toUpperCase(), signal), report())
  assert.deepEqual(calls, [['/denuncias/moderacao/' + id(60), { signal }]])
  await assert.rejects(createModeracaoDenunciaService(async () => report({ id: id(61) })).detail(id(60)), ApiError)
})
for (const [before, after] of [['PENDENTE', 'EM_ANALISE'], ['EM_ANALISE', 'PROCEDENTE'], ['EM_ANALISE', 'IMPROCEDENTE']]) {
  test('service historico projeta sete campos/transicao ' + before + '->' + after + ' sem reescrever texto', async () => {
    const calls = [], source = event({ estadoAnterior: before, estadoNovo: after }), signal = new AbortController().signal
    const service = createModeracaoDenunciaService(async (...args) => { calls.push(args); return page([{ ...source, email: 'PRIVADO', usuarioId: 'PRIVADO', descricao: 'PRIVADO' }], 1, 20, 21) })
    assert.deepEqual((await service.history(id(60), 1, 20, signal)).content, [source])
    assert.deepEqual(calls, [[`/denuncias/moderacao/${id(60)}/historico?page=1&size=20`, { signal }]])
  })
}
test('service rejeita eventos invalidos: vinculo, agente, transicao, texto e data', async () => {
  for (const changes of [{ id: 'x' }, { denunciaId: id(61) }, { responsavelId: 'x' }, { estadoAnterior: 'PUBLICADO' }, { estadoAnterior: 'PROCEDENTE', estadoNovo: 'PENDENTE' }, { estadoAnterior: 'PENDENTE', estadoNovo: 'PROCEDENTE' }, { estadoNovo: {} }, { justificativa: null }, { justificativa: ' ' }, { justificativa: 'a'.repeat(1001) }, { justificativa: 'a\u0000' }, { dataCadastro: 'x' }]) {
    await assert.rejects(createModeracaoDenunciaService(async () => page([event(changes)], 0, 20)).history(id(60)), error => error instanceof ApiError && error.kind === 'protocol')
  }
  assert.equal((await createModeracaoDenunciaService(async () => page([event({ justificativa: 'a'.repeat(1000) })], 0, 20)).history(id(60))).content[0].justificativa.length, 1000)
})
test('service pagina duplicada/incoerente rejeitada e UUID/paginacao invalidos nao enviamHTTP', async () => {
  for (const data of [page([event(), event()], 0, 20), page([event()], 1, 20), { content: [], page: { number: 0, size: 20, totalElements: 21, totalPages: 1 } }]) await assert.rejects(createModeracaoDenunciaService(async () => data).history(id(60)), ApiError)
  const service = createModeracaoDenunciaService(() => assert.fail())
  await assert.rejects(service.detail('../x'), TypeError); await assert.rejects(service.history('../x'), TypeError)
  for (const [number, size] of [[-1, 20], [0.5, 20], [0, 0], [0, 101]]) await assert.rejects(service.history(id(60), number, size), TypeError)
})
test('service conserva ordem recebida e aceita historico parcial sem impor continuidade ou estado atual', async () => {
  const source = [event({ id: id(72), estadoAnterior: 'EM_ANALISE', estadoNovo: 'PROCEDENTE' }), event({ id: id(71) })]
  assert.deepEqual((await createModeracaoDenunciaService(async () => page(source, 0, 20)).history(id(60))).content, source)
})
for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' le relato e historico inclusive agente proprio, sem oferecer mutacoes', async () => {
    const { model, calls } = fixture({}, () => staff(perfil)); await model.load(id(60))
    assert.deepEqual(calls.map(x => x.kind), ['detail', 'history']); assert.deepEqual(model.getState().report, report()); assert.deepEqual(model.getState().history.content, [event()])
    for (const key of ['analisar', 'proceder', 'improceder', 'submit', 'remove']) assert.equal(key in model, false)
    model.dispose()
  })
}
for (const user of [null, staff('USUARIO'), staff('DESCONHECIDO'), staff('MODERADOR', 'x')]) {
  test('sem equipe valida nao consulta nem porUUIDconhecido: ' + JSON.stringify(user), async () => {
    const { model, calls } = fixture({}, () => user); await model.load(id(60)); await model.reload(); await model.reloadHistory(); await model.setSize(50)
    assert.equal(calls.length, 0); assert.equal(model.getState().report, null); assert.equal(model.getState().denied, true); model.dispose()
  })
}
test('UUIDinvalido e falha de detalhe nao consultam historico, retryGETnovo explicito', async () => {
  const { model, calls } = fixture(); await model.load('x'); assert.equal(calls.length, 0); assert.ok(model.getState().error); model.dispose()
  let failed = true, histories = 0
  const f = fixture({ detail: async () => { if (failed) throw new ApiError('network'); return report() }, history: async () => { histories++; return page([], 0, 20) } })
  await f.model.load(id(60)); assert.equal(histories, 0); assert.equal(f.model.getState().report, null); failed = false; await f.model.reload(); assert.equal(histories, 1); assert.ok(f.model.getState().report); f.model.dispose()
})
test('historico vazio nao contradiz relato EM_ANALISE e falharede nao vira vazio nem descarta relato', async () => {
  let failure = false
  const { model } = fixture({ history: async () => { if (failure) throw new ApiError('network'); return page([], 0, 20) } })
  await model.load(id(60)); assert.equal(model.getState().report.status, 'EM_ANALISE'); assert.deepEqual(model.getState().history.content, [])
  failure = true; await model.reloadHistory(); assert.ok(model.getState().report); assert.equal(model.getState().history, null); assert.ok(model.getState().historyError)
  failure = false; await model.reloadHistory(); assert.equal(model.getState().historyError, ''); assert.deepEqual(model.getState().history.content, []); model.dispose()
})
test('paginacao20/50/100, correcaounica totalzero e recarga completa reseta pagina/tamanho', async () => {
  let shrink = false; const reads = []
  const { model } = fixture({ history: async (key, number, size) => { reads.push([key, number, size]); return page(shrink ? [] : [event()], number, size, shrink ? 0 : 101) } })
  await model.load(id(60)); await model.goToPage(3); await model.reloadHistory(); assert.deepEqual(reads.slice(-2).map(x => x[1]), [3, 3])
  await model.setSize(50); assert.deepEqual(reads.at(-1), [id(60), 0, 50]); await model.setSize(100)
  const before = reads.length; await model.setSize(21); await model.goToPage(-1); await model.goToPage(99); assert.equal(reads.length, before)
  shrink = true; await model.goToPage(1); assert.deepEqual(reads.slice(-2), [[id(60), 1, 100], [id(60), 0, 100]])
  await model.reload(); assert.deepEqual(reads.at(-1), [id(60), 0, 20]); model.dispose()
})
for (const status of [401, 403, 404]) {
  for (const stage of ['detail', 'history']) {
    test(stage + status + ' retira relato/historico e bloqueia retry sem refletir corpo privado', async () => {
      let fail = false, failures = 0
      const { model } = fixture({ [stage]: async () => { if (fail) { failures++; throw new ApiError('http', status, { detail: 'PRIVADO', errors: [] }) } return stage === 'detail' ? report() : page([event()], 0, 20) } })
      await model.load(id(60)); fail = true; if (stage === 'detail') await model.reload(); else await model.reloadHistory()
      assert.equal(model.getState().report, null); assert.equal(model.getState().history, null); assert.equal(model.getState().denied, true); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
      await model.reload(); await model.reloadHistory(); await model.setSize(50); assert.equal(failures, 1); model.dispose()
    })
  }
}
test('troca de tamanho cancela historico anterior sem permitir que volte a ocupar a tela', async () => {
  const old = deferred(); let reads = 0, signal
  const { model } = fixture({ history: async (key, number, size, s) => { if (++reads === 2) { signal = s; return old.promise } return page([], number, size) } })
  await model.load(id(60)); const loading = model.reloadHistory(); assert.equal(model.getState().history, null)
  await model.setSize(50); old.resolve(page([event()], 0, 20)); await loading
  assert.equal(signal.aborted, true); assert.equal(model.getState().history.page.size, 50); assert.deepEqual(model.getState().history.content, []); model.dispose()
})
for (const change of ['conta', 'perfil', 'equipe', 'rota', 'dispose']) {
  test('historico antigo apos ' + change + ' nao restaura relato/justificativa antigos', async () => {
    const old = deferred(), started = deferred(); let user = staff(), signal, reads = 0
    const { model } = fixture({ history: async (key, number, size, s) => { if (++reads === 1) { signal = s; started.resolve(); return old.promise } return page([], number, size) } }, () => user)
    const loading = model.load(id(60)); await started.promise
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose(); else await model.load(change === 'rota' ? id(61) : id(60))
    old.reject(new ApiError('http', 403)); await loading
    assert.equal(signal.aborted, true); assert.equal(model.getState().report?.id ?? null, change === 'dispose' || change === 'perfil' ? null : change === 'rota' ? id(61) : id(60))
    if (change !== 'dispose' && change !== 'perfil') { assert.deepEqual(model.getState().history.content, []); assert.equal(model.getState().denied, false) }
    model.dispose()
  })
}
test('detalhe antigo apos nova rota nao restaura relato nem dispara historico doUUIDantigo', async () => {
  const old = deferred(); let reads = 0, historyIds = []
  const { model } = fixture({ detail: async key => ++reads === 1 ? old.promise : report({ id: key }), history: async (key, number, size) => { historyIds.push(key); return page([], number, size) } })
  const loading = model.load(id(60)); await model.load(id(61)); old.resolve(report()); await loading
  assert.equal(model.getState().report.id, id(61)); assert.deepEqual(historyIds, [id(61)]); model.dispose()
})
test('perda de perfil sem reinitialize na resposta retira tambem o relato ja exibido', async () => {
  const pending = deferred(), started = deferred(); let user = staff()
  const { model } = fixture({ history: async () => { started.resolve(); return pending.promise } }, () => user)
  const loading = model.load(id(60)); await started.promise; assert.ok(model.getState().report); user = staff('USUARIO'); pending.resolve(page([event()], 0, 20)); await loading
  assert.equal(model.getState().report, null); assert.equal(model.getState().history, null); assert.equal(model.getState().denied, true); model.dispose()
})
