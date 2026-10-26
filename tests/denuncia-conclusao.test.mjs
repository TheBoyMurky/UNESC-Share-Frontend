import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createDenunciaDecisaoService, denunciaActionInfo } from '../src/features/moderacao/denuncia-decisao-service.ts'
import { createDenunciaDecisaoModel } from '../src/features/moderacao/denuncia-decisao-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const report = (changes = {}) => ({ id: id(60), materialId: id(10), motivo: 'SPAM', descricao: 'Relato original', status: 'EM_ANALISE', dataCadastro: '2026-10-25T12:00:00Z', ...changes })
const staff = (perfil = 'MODERADOR', key = id(8)) => ({ id: key, perfil })
function fixture({ status = 'EM_ANALISE', user = () => staff(), decide, detail, history } = {}) {
  let source = report({ status }); const writes = [], reads = []
  const model = createDenunciaDecisaoModel({
    detail: async (key, signal) => { reads.push({ kind: 'detail', key, signal }); return detail ? detail(key, signal) : { ...source, id: key } },
    history: async (key, number, size, signal) => { reads.push({ kind: 'history', key, number, size, signal }); return history ? history(key, number, size, signal) : page([], number, size) },
  }, { decide: async (key, kind, draft, signal) => { writes.push({ key, kind, draft, signal }); if (decide) return decide(key, kind, draft, signal); source = { ...source, status: denunciaActionInfo[kind].target }; return { ...source } } }, user)
  return { model, writes, reads }
}
const prepare = (model, kind = 'procedencia') => { model.open(kind); model.change('Justificativa da conclusão'); model.setConfirmed(true) }
for (const kind of ['procedencia', 'improcedencia']) {
  test('service ' + kind + ' mapeia endpoint/estado, envia sojustificativa e projeta resposta', async () => {
    const calls = [], signal = new AbortController().signal, target = denunciaActionInfo[kind].target
    const service = createDenunciaDecisaoService(async (...args) => { calls.push(args); return { ...report({ status: target }), responsavelId: id(8), email: 'PRIVADO' } })
    assert.deepEqual(await service.decide(id(60).toUpperCase(), kind, '  Conferido\n', signal), report({ status: target }))
    assert.deepEqual(calls, [[`/denuncias/moderacao/${id(60)}/${kind}`, { method: 'POST', json: { justificativa: 'Conferido' }, signal }]])
  })
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
    test(perfil + ' conclui ' + kind + ' apenas aposescolha e confirmacao, reconsulta semevento otimista', async () => {
      const { model, writes, reads } = fixture({ user: () => staff(perfil) }); await model.load(id(60)); assert.equal(writes.length, 0)
      await model.submit(); model.open(kind); await model.submit(); model.change('Conferido'); await model.submit(); assert.equal(writes.length, 0)
      model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 1); assert.equal(writes[0].kind, kind); assert.equal(model.getState().report.status, denunciaActionInfo[kind].target)
      assert.deepEqual(reads.map(x => x.kind), ['detail', 'history', 'detail', 'history']); assert.deepEqual(model.getState().history.content, []); assert.equal(model.getActionState().kind, ''); assert.equal(model.getActionState().draft, ''); assert.ok(model.getActionState().message)
      for (const next of ['analise', 'procedencia', 'improcedencia']) { assert.equal(model.canOpen(next), false); prepare(model, next); await model.submit() }
      assert.equal(writes.length, 1); model.dispose()
    })
  }
}
test('service nao aceitaUUID/acao/justificativa invalidos nem estado oposto ouUUIDdiferente na resposta', async () => {
  const service = createDenunciaDecisaoService(() => assert.fail())
  for (const kind of ['', 'PROCEDENTE', '__proto__', 'remocao']) await assert.rejects(service.decide(id(60), kind, 'Conferido'), TypeError)
  for (const value of ['', ' ', 'a'.repeat(1001), 'a\u0000']) await assert.rejects(service.decide(id(60), 'procedencia', value), TypeError)
  await assert.rejects(service.decide('../x', 'procedencia', 'Conferido'), TypeError)
  for (const kind of ['procedencia', 'improcedencia']) {
    for (const value of [undefined, report(), report({ status: kind === 'procedencia' ? 'IMPROCEDENTE' : 'PROCEDENTE' }), report({ id: id(61), status: denunciaActionInfo[kind].target })]) {
      await assert.rejects(createDenunciaDecisaoService(async () => value).decide(id(60), kind, 'Conferido'), error => error instanceof ApiError && error.kind === 'protocol')
    }
  }
})
test('matriz de estados: PENDENTE soanalise, EM_ANALISE so conclusoes, finais semacao/reabertura', async () => {
  for (const status of ['PENDENTE', 'EM_ANALISE', 'PROCEDENTE', 'IMPROCEDENTE']) {
    const { model, writes } = fixture({ status }); await model.load(id(60))
    for (const kind of ['analise', 'procedencia', 'improcedencia']) {
      const expected = status === denunciaActionInfo[kind].source
      assert.equal(model.canOpen(kind), expected)
      if (!expected) { prepare(model, kind); await model.submit(); assert.equal(writes.length, 0) }
    }
    model.open('__proto__'); assert.equal(model.getActionState().open, false); model.dispose()
  }
})
test('nao restringe conclusao aoagente queiniciou analise nem exigeevento legado', async () => {
  const history = async (key, number, size) => page([{ id: id(70), denunciaId: key, responsavelId: id(9), justificativa: 'Iniciada por colega', estadoAnterior: 'PENDENTE', estadoNovo: 'EM_ANALISE', dataCadastro: '2026-10-25T13:00:00Z' }], number, size)
  const { model, writes } = fixture({ history }); await model.load(id(60)); assert.equal(model.getState().history.content[0].responsavelId, id(9))
  prepare(model, 'improcedencia'); await model.submit(); assert.equal(writes.length, 1); assert.equal(model.getState().report.status, 'IMPROCEDENTE'); model.dispose()
})
test('mudar conclusao exige cancelar; rascunho/confirmacao nao migram entre escolhas', async () => {
  const { model, writes } = fixture(); await model.load(id(60)); prepare(model, 'procedencia'); model.open('improcedencia')
  assert.equal(model.getActionState().kind, 'procedencia'); assert.equal(model.getActionState().draft, 'Justificativa da conclusão')
  model.close(); assert.equal(model.getActionState().draft, ''); model.open('improcedencia'); assert.equal(model.getActionState().confirmed, false); await model.submit(); assert.equal(writes.length, 0)
  model.change('Outra justificativa'); model.setConfirmed(true); model.change('Justificativa alterada'); assert.equal(model.getActionState().confirmed, false)
  model.setConfirmed(true); await model.submit(); assert.equal(writes[0].kind, 'improcedencia'); assert.equal(writes.length, 1); model.dispose()
})
test('durantePOST nao troca conclusao nem cancela/edita/recarrega/reenvia', async () => {
  const pending = deferred(), { model, writes, reads } = fixture({ decide: () => pending.promise })
  await model.load(id(60)); prepare(model); const sending = model.submit(); model.open('improcedencia'); model.close(); model.change('Outro'); model.setConfirmed(true); await model.reload(); await model.submit()
  assert.equal(writes.length, 1); assert.equal(reads.length, 2); assert.equal(model.getActionState().kind, 'procedencia'); assert.equal(model.getActionState().confirmed, false)
  pending.resolve(report({ status: 'PROCEDENTE' })); await sending; assert.equal(reads.length, 4); assert.equal(writes.length, 1); model.dispose()
})
for (const error of [new ApiError('http', 409), new ApiError('network'), new ApiError('protocol', 200), new ApiError('http', 408), new ApiError('http', 503)]) {
  test(error.kind + '/' + error.status + ' nao permite trocar para conclusao oposta sem reconsultar/confirmar', async () => {
    const { model, writes } = fixture({ decide: async () => { throw error } }); await model.load(id(60)); prepare(model); await model.submit()
    assert.equal(model.getActionState().requiresReload, true); assert.equal(model.getActionState().confirmed, false)
    model.open('improcedencia'); model.close(); model.change('Outro'); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 1)
    await model.reload(); assert.equal(model.getActionState().kind, ''); assert.equal(model.getActionState().draft, ''); model.open('improcedencia'); await model.submit(); assert.equal(writes.length, 1)
    model.change('Nova conclusão'); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 2); assert.equal(writes[1].kind, 'improcedencia'); model.dispose()
  })
}
test('400 conserva escolha/draft econsomeconfirmacao; cancelar antesdeoutraescolha descarta ambos', async () => {
  const { model, writes } = fixture({ decide: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO', errors: [] }) } })
  await model.load(id(60)); prepare(model, 'improcedencia'); await model.submit(); assert.equal(model.getActionState().kind, 'improcedencia'); assert.equal(model.getActionState().confirmed, false); assert.ok(model.getActionState().fieldError)
  assert.equal(JSON.stringify(model.getActionState()).includes('PRIVADO'), false); model.close(); model.open('procedencia'); assert.equal(model.getActionState().draft, ''); await model.submit(); assert.equal(writes.length, 1); model.dispose()
})
for (const kind of ['procedencia', 'improcedencia']) {
  test('403 ' + kind + ' bloqueia asduasconclusoes mas preserva leitura sem inferir identidade', async () => {
    const { model, writes } = fixture({ decide: async () => { throw new ApiError('http', 403, { detail: 'PRIVADO', errors: [] }) } })
    await model.load(id(60)); prepare(model, kind); await model.submit(); assert.ok(model.getState().report); assert.ok(model.getState().history); assert.equal(model.getState().denied, false)
    assert.equal(model.getActionState().forbidden, true); assert.equal(model.getActionState().draft, ''); assert.equal(JSON.stringify(model.getActionState()).includes('PRIVADO'), false)
    await model.reload(); for (const next of ['procedencia', 'improcedencia']) { assert.equal(model.canOpen(next), false); prepare(model, next); await model.submit() }
    assert.equal(writes.length, 1); await model.reloadHistory(); assert.ok(model.getState().history); model.dispose()
  })
}
test('401/404 retiram leitura eformulario; conclusoes semequipe ouhistorico valido nao enviam', async () => {
  for (const status of [401, 404]) {
    const { model } = fixture({ decide: async () => { throw new ApiError('http', status) } }); await model.load(id(60)); prepare(model); await model.submit()
    assert.equal(model.getState().report, null); assert.equal(model.getState().history, null); assert.equal(model.getActionState().kind, ''); assert.equal(model.getActionState().draft, ''); model.dispose()
  }
  for (const options of [{ user: () => staff('USUARIO') }, { user: () => null }, { history: async () => { throw new ApiError('network') } }]) {
    const { model, writes } = fixture(options); await model.load(id(60)); prepare(model); await model.submit(); assert.equal(writes.length, 0); model.dispose()
  }
})
for (const mode of ['success', '403']) {
  test('conclusao antiga ' + mode + ' nao altera rascunho/confirmacao de novo contexto', async () => {
    const pending = deferred(); let user = staff()
    const { model, writes } = fixture({ user: () => user, decide: () => pending.promise }); await model.load(id(60)); prepare(model); const sending = model.submit()
    user = staff('ADMINISTRADOR', id(9)); await model.load(id(61)); prepare(model, 'improcedencia')
    if (mode === 'success') pending.resolve(report({ status: 'PROCEDENTE' })); else pending.reject(new ApiError('http', 403))
    await sending; assert.equal(writes[0].signal.aborted, true); assert.equal(model.getState().report.id, id(61)); assert.equal(model.getActionState().kind, 'improcedencia'); assert.equal(model.getActionState().confirmed, true); assert.equal(model.getActionState().forbidden, false); assert.equal(model.getActionState().message, ''); model.dispose()
  })
}
test('resposta comrelato alterado gera incerteza eGETfalhoapos sucesso preserva aviso sem repetirPOST', async () => {
  const { model } = fixture({ decide: async () => report({ status: 'PROCEDENTE', descricao: 'Relato alterado' }) }); await model.load(id(60)); prepare(model); await model.submit()
  assert.equal(model.getActionState().requiresReload, true); assert.equal(model.getActionState().message, ''); assert.deepEqual(model.getState().history.content, []); model.dispose()
  let reads = 0
  const f = fixture({ detail: async () => { if (++reads > 1) throw new ApiError('network'); return report() } }); await f.model.load(id(60)); prepare(f.model, 'improcedencia'); await f.model.submit()
  assert.equal(f.writes.length, 1); assert.ok(f.model.getActionState().message); assert.ok(f.model.getState().error); assert.equal(f.model.getState().report, null); f.model.dispose()
})
