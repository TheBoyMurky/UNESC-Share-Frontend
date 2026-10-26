import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createDenunciaAnaliseService, validateJustificativa } from '../src/features/moderacao/denuncia-analise-service.ts'
import { createDenunciaAnaliseModel } from '../src/features/moderacao/denuncia-analise-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const report = (changes = {}) => ({ id: id(60), materialId: id(10), motivo: 'SPAM', descricao: 'Relato original', status: 'PENDENTE', dataCadastro: '2026-10-25T12:00:00Z', ...changes })
const staff = (perfil = 'MODERADOR', key = id(8)) => ({ id: key, perfil })
function fixture({ status = 'PENDENTE', user = () => staff(), start, detail, history } = {}) {
  let source = report({ status }); const reads = [], writes = []
  const model = createDenunciaAnaliseModel({
    detail: async (key, signal) => { reads.push({ kind: 'detail', key, signal }); return detail ? detail(key, signal) : { ...source, id: key } },
    history: async (key, number, size, signal) => { reads.push({ kind: 'history', key, number, size, signal }); return history ? history(key, number, size, signal) : page([], number, size) },
  }, { start: async (key, draft, signal) => { writes.push({ key, draft, signal }); if (start) return start(key, draft, signal); source = { ...source, status: 'EM_ANALISE' }; return { ...source } } }, user)
  return { model, reads, writes }
}
const prepare = model => { model.open(); model.change('Justificativa sintética'); model.setConfirmed(true) }

test('service POST/analise envia somente justificativa trim/Bearer via helper existente e valida DTO', async () => {
  const calls = [], signal = new AbortController().signal
  const result = await createDenunciaAnaliseService(async (...args) => { calls.push(args); return { ...report({ status: 'EM_ANALISE' }), usuarioId: id(8), email: 'PRIVADO' } }).start(id(60).toUpperCase(), '  Conferido\n', signal)
  assert.deepEqual(calls, [[`/denuncias/moderacao/${id(60)}/analise`, { method: 'POST', json: { justificativa: 'Conferido' }, signal }]])
  assert.deepEqual(result, report({ status: 'EM_ANALISE' })); assert.equal('email' in result, false)
})
test('justificativa obrigatoria/1000UTF16/semU+0000 eUUID valido antesHTTP', async () => {
  const service = createDenunciaAnaliseService(() => assert.fail())
  for (const value of ['', ' \n', 'a'.repeat(1001), 'a\u0000', null]) { assert.ok(validateJustificativa(value)); await assert.rejects(service.start(id(60), value), TypeError) }
  assert.equal(validateJustificativa(' ' + '🙂'.repeat(500) + ' '), ''); assert.ok(validateJustificativa('🙂'.repeat(501)))
  await assert.rejects(service.start('../x', 'Conferido'), TypeError)
})
test('resposta naoEM_ANALISE/UUIDerrado/malformada e erro deprotocolo apospossivelgravacao', async () => {
  for (const value of [undefined, report(), report({ status: 'PROCEDENTE' }), report({ id: id(61), status: 'EM_ANALISE' }), report({ status: 'EM_ANALISE', materialId: 'x' })]) {
    await assert.rejects(createDenunciaAnaliseService(async () => value).start(id(60), 'Conferido'), error => error instanceof ApiError && error.kind === 'protocol')
  }
})
for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' prepara/justifica/confirma sem inferir autoria, sucesso reconsulta relato-historico sem evento otimista', async () => {
    const { model, reads, writes } = fixture({ user: () => staff(perfil) }); await model.load(id(60)); assert.equal(writes.length, 0)
    await model.submit(); model.open(); await model.submit(); model.change('Conferido'); await model.submit(); assert.equal(writes.length, 0)
    model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 1); assert.equal(model.getState().report.status, 'EM_ANALISE'); assert.deepEqual(reads.map(x => x.kind), ['detail', 'history', 'detail', 'history'])
    assert.deepEqual(model.getState().history.content, []); assert.equal(model.getActionState().draft, ''); assert.equal(model.getActionState().confirmed, false); assert.ok(model.getActionState().message)
    assert.equal(model.canOpen(), false); await model.submit(); assert.equal(writes.length, 1); model.dispose()
  })
}
for (const status of ['EM_ANALISE', 'PROCEDENTE', 'IMPROCEDENTE']) {
  test(status + ' nao permite iniciar novamente ou concluir por este modelo', async () => {
    const { model, writes } = fixture({ status }); await model.load(id(60)); prepare(model); await model.submit()
    assert.equal(model.canOpen(), false); assert.equal(model.getActionState().open, false); assert.equal(writes.length, 0)
    for (const key of ['proceder', 'improceder', 'remove', 'edit']) assert.equal(key in model, false); model.dispose()
  })
}
test('sem equipe/UUID valido nao le nem escreve, inclusive conhecimento doidentificador', async () => {
  for (const user of [null, staff('USUARIO'), staff('DESCONHECIDO'), staff('MODERADOR', 'x')]) {
    const { model, reads, writes } = fixture({ user: () => user }); await model.load(id(60)); prepare(model); await model.submit(); assert.equal(reads.length, 0); assert.equal(writes.length, 0); model.dispose()
  }
  const f = fixture(); await f.model.load('x'); prepare(f.model); await f.model.submit(); assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0); f.model.dispose()
})
test('aguarda relato e historico valido antes de preparar; falha dehistorico nao liberaformulario', async () => {
  const pending = deferred(), started = deferred(); let failed = false
  const { model } = fixture({ history: async () => { if (failed) throw new ApiError('network'); started.resolve(); return pending.promise } })
  const loading = model.load(id(60)); await started.promise; model.open(); assert.equal(model.getActionState().open, false)
  pending.resolve(page([], 0, 20)); await loading; assert.equal(model.canOpen(), true)
  failed = true; await model.reloadHistory(); model.open(); assert.equal(model.getActionState().open, false); assert.equal(model.canOpen(), false); model.dispose()
})
test('alterar justificativa consome checkbox; cancelar/recarga descarta rascunho e confirmacao', async () => {
  const { model, writes } = fixture(); await model.load(id(60)); prepare(model); model.change('Outro texto'); assert.equal(model.getActionState().confirmed, false)
  await model.submit(); assert.equal(writes.length, 0); model.close(); assert.equal(model.getActionState().draft, '')
  prepare(model); await model.reload(); assert.equal(model.getActionState().draft, ''); assert.equal(model.getActionState().open, false); await model.submit(); assert.equal(writes.length, 0); model.dispose()
})
test('validacao local nao envia, confirma nova tentativa apos corrigir; nao reflete texto privado noerro', async () => {
  const { model, writes } = fixture(); await model.load(id(60)); model.open(); model.change('a'.repeat(1001)); model.setConfirmed(true); await model.submit()
  assert.equal(writes.length, 0); assert.ok(model.getActionState().fieldError); assert.equal(model.getActionState().confirmed, false)
  model.change('Corrigido'); await model.submit(); assert.equal(writes.length, 0); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 1); model.dispose()
})
test('painel trava consultas parciais, emvoo trava edicao/cancelar/recarga/reenvio econfirmacao econsumida', async () => {
  const pending = deferred(), { model, reads, writes } = fixture({ start: () => pending.promise })
  await model.load(id(60)); prepare(model); await model.reloadHistory(); await model.setSize(50); await model.goToPage(0); assert.equal(reads.length, 2)
  const sending = model.submit(); model.change('NÃO ALTERAR'); model.setConfirmed(true); model.close(); await model.reload(); await model.submit()
  assert.equal(reads.length, 2); assert.equal(writes.length, 1); assert.equal(model.getActionState().draft, 'Justificativa sintética'); assert.equal(model.getActionState().confirmed, false)
  pending.resolve(report({ status: 'EM_ANALISE' })); await sending; assert.equal(reads.length, 4); assert.ok(model.getActionState().message)
  // GET pode refletir outro momento: nao sobrescrever o PENDENTE da consulta com status doPOST.
  assert.equal(model.getState().report.status, 'PENDENTE'); model.dispose()
})
for (const error of [new ApiError('http', 409), new ApiError('network'), new ApiError('protocol', 200), new ApiError('http', 408), new ApiError('http', 503)]) {
  test('falha ' + error.kind + '/' + error.status + ' exige descartar/GETnovo/nova justificativa-confirmacao, sem retry', async () => {
    const { model, writes, reads } = fixture({ start: async () => { throw error } }); await model.load(id(60)); prepare(model); await model.submit()
    assert.equal(model.getActionState().requiresReload, true); assert.equal(model.getActionState().confirmed, false); assert.ok(model.getActionState().error)
    model.change('outro'); model.setConfirmed(true); model.close(); model.open(); await model.submit(); assert.equal(writes.length, 1); assert.equal(model.getActionState().draft, 'Justificativa sintética')
    await model.reload(); assert.equal(reads.length, 4); assert.equal(model.getActionState().draft, ''); await model.submit(); assert.equal(writes.length, 1)
    prepare(model); await model.submit(); assert.equal(writes.length, 2); model.dispose()
  })
}
test('POST400 conserva draft mas consome confirmacao e exige correcao/novaconfirmacao', async () => {
  const { model, writes } = fixture({ start: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO', errors: [{ field: 'justificativa', message: 'PRIVADO' }] }) } })
  await model.load(id(60)); prepare(model); await model.submit(); assert.equal(model.getActionState().draft, 'Justificativa sintética'); assert.ok(model.getActionState().fieldError); assert.equal(model.getActionState().confirmed, false)
  assert.equal(JSON.stringify(model.getActionState()).includes('PRIVADO'), false); model.change('Corrigido'); await model.submit(); assert.equal(writes.length, 1); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 2); model.dispose()
})
test('POST403 nao declara autoria/conflito confirmado, preserva leitura e bloqueia acao mesmo aposreconsulta', async () => {
  const { model, writes, reads } = fixture({ start: async () => { throw new ApiError('http', 403, { detail: 'PRIVADO', errors: [] }) } })
  await model.load(id(60)); prepare(model); await model.submit(); assert.ok(model.getState().report); assert.ok(model.getState().history); assert.equal(model.getState().denied, false)
  assert.equal(model.getActionState().forbidden, true); assert.equal(model.getActionState().draft, ''); assert.equal(JSON.stringify(model.getActionState()).includes('PRIVADO'), false)
  prepare(model); await model.submit(); assert.equal(writes.length, 1); await model.reload(); assert.equal(reads.length, 4); assert.equal(model.getActionState().forbidden, true); assert.ok(model.getActionState().error); assert.equal(model.canOpen(), false)
  await model.reloadHistory(); assert.equal(reads.length, 5); model.dispose()
})
for (const status of [401, 404]) {
  test('POST' + status + ' retira relato-historico-draft e bloqueia novos envios', async () => {
    const { model, writes } = fixture({ start: async () => { throw new ApiError('http', status) } }); await model.load(id(60)); prepare(model); await model.submit()
    assert.equal(model.getState().report, null); assert.equal(model.getState().history, null); assert.equal(model.getActionState().draft, ''); assert.equal(model.getState().denied, true)
    prepare(model); await model.reload(); await model.submit(); assert.equal(writes.length, 1); model.dispose()
  })
}
test('resposta aposPOST com campos imutaveis diferentes gera incerteza sem evento otimista', async () => {
  for (const changes of [{ materialId: id(11) }, { motivo: 'OUTRO' }, { descricao: 'Outro relato' }, { dataCadastro: '2026-10-24T12:00:00Z' }]) {
    const { model } = fixture({ start: async () => report({ status: 'EM_ANALISE', ...changes }) }); await model.load(id(60)); prepare(model); await model.submit()
    assert.equal(model.getActionState().requiresReload, true); assert.equal(model.getActionState().message, ''); assert.deepEqual(model.getState().history.content, []); model.dispose()
  }
})
for (const change of ['conta', 'perfil', 'equipe', 'rota', 'dispose']) {
  test('POSTantigo apos ' + change + ' nao restaura draft/dados ou sobrepoe consulta atual', async () => {
    const pending = deferred(); let user = staff()
    const { model, writes } = fixture({ user: () => user, start: () => pending.promise }); await model.load(id(60)); prepare(model); const sending = model.submit()
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose(); else await model.load(change === 'rota' ? id(61) : id(60))
    pending.reject(new ApiError('http', 403)); await sending; assert.equal(writes[0].signal.aborted, true); assert.equal(model.getActionState().forbidden, false); assert.equal(model.getActionState().draft, '')
    assert.equal(model.getState().report?.id ?? null, change === 'perfil' || change === 'dispose' ? null : change === 'rota' ? id(61) : id(60)); model.dispose()
  })
}
test('perda deperfil sem watcher durantePOST descarta resposta e dados', async () => {
  const pending = deferred(); let user = staff()
  const { model } = fixture({ user: () => user, start: () => pending.promise }); await model.load(id(60)); prepare(model); const sending = model.submit(); user = staff('USUARIO'); pending.resolve(report({ status: 'EM_ANALISE' })); await sending
  assert.equal(model.getState().report, null); assert.equal(model.getActionState().draft, ''); assert.equal(model.getActionState().message, ''); model.dispose()
})
test('falhaGET apos sucesso preserva aviso, sem repetirPOST; GET403 retira dados e formulario', async () => {
  let reads = 0
  const { model, writes } = fixture({ detail: async () => { if (++reads > 1) throw new ApiError('network'); return report() } })
  await model.load(id(60)); prepare(model); await model.submit(); assert.equal(writes.length, 1); assert.ok(model.getActionState().message); assert.equal(model.getState().report, null); assert.ok(model.getState().error); model.dispose()
  let fail = false
  const f = fixture({ history: async () => { if (fail) throw new ApiError('http', 403); return page([], 0, 20) } }); await f.model.load(id(60)); fail = true; await f.model.reloadHistory()
  assert.equal(f.model.getState().report, null); assert.equal(f.model.getActionState().draft, ''); assert.equal(f.model.getState().denied, true); f.model.dispose()
})
