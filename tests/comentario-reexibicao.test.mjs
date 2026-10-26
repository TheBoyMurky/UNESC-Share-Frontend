import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createModeracaoComentarioService } from '../src/features/moderacao/moderacao-comentario-service.ts'
import { createComentarioDecisaoModel } from '../src/features/moderacao/comentario-decisao-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const comment = (changes = {}) => ({ id: id(30), materialId: id(10), usuarioId: id(8), status: 'OCULTO', conteudo: 'Texto selecionado\n<script>literal</script>', dataCadastro: '2026-10-25T12:00:00Z', ...changes })
const staff = (perfil = 'MODERADOR', key = id(8)) => ({ id: key, perfil })
function fixture({ user = () => staff(), materialStatus = () => 'PUBLICADO', list, reveal, history } = {}) {
  const calls = []
  const model = createComentarioDecisaoModel({
    list: async (key, number, size, signal) => { calls.push({ kind: 'list', key, number, size, signal }); return list ? list(key, number, size, signal) : page([comment({ materialId: key }), comment({ id: id(31), materialId: key, status: 'ATIVO', conteudo: 'OUTRO TEXTO' })], number, size) },
    history: async (key, target, number, size, signal) => { calls.push({ kind: 'history', key, target, number, size, signal }); return history ? history(key, target, number, size, signal) : page([], number, size) },
    hide: async () => assert.fail('Não ocultar ao escolher reexibição'),
    reveal: async (key, target, motivo, signal) => { calls.push({ kind: 'reveal', key, target, motivo, signal }); return reveal ? reveal(key, target, motivo, signal) : comment({ materialId: key, id: target, status: 'ATIVO' }) },
  }, user, materialStatus)
  return { model, calls }
}
async function prepare(model) { await model.load(id(10)); model.openReveal(id(30)); model.setMotivo('  Revisão da ocultação\nMotivo explícito  '); model.setConfirmed(true) }

test('service reexibicao fixa endpoint POST JSONsoMotivo trim e confereATIVO/par projetandoextras', async () => {
  const calls = [], signal = new AbortController().signal, expected = comment({ status: 'ATIVO' })
  const service = createModeracaoComentarioService(async (...args) => { calls.push(args); return { ...expected, email: 'PRIVADO' } })
  assert.deepEqual(await service.reveal(id(10).toUpperCase(), id(30).toUpperCase(), '  Revisão\nliteral  ', signal), expected)
  assert.deepEqual(calls, [[`/materiais/${id(10)}/comentarios/${id(30)}/reexibicao`, { method: 'POST', json: { motivo: 'Revisão\nliteral' }, signal }]])
})
test('service reexibicao rejeitaUUID/motivo antesHTTP e resposta comestado/vinculo/alvo errados', async () => {
  const service = createModeracaoComentarioService(() => assert.fail())
  for (const motivo of ['', ' ', 'a'.repeat(1001), 'x\u0000', null]) await assert.rejects(service.reveal(id(10), id(30), motivo), TypeError)
  await assert.rejects(service.reveal('../x', id(30), 'Motivo'), TypeError); await assert.rejects(service.reveal(id(10), '../x', 'Motivo'), TypeError)
  for (const changes of [{ status: 'OCULTO' }, { status: 'REMOVIDO' }, { materialId: id(11) }, { id: id(31) }, { usuarioId: 'x' }, { conteudo: 'x\u0000' }]) {
    await assert.rejects(createModeracaoComentarioService(async () => comment({ status: 'ATIVO', ...changes })).reveal(id(10), id(30), 'Motivo'), error => error instanceof ApiError && error.kind === 'protocol')
  }
  await createModeracaoComentarioService(async () => comment({ status: 'ATIVO' })).reveal(id(10), id(30), 'a'.repeat(1000))
})
for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' reexibeComentarioProprio OCULTO deMaterialPUBLICADO sem inferirconflitoDenuncia', async () => {
    const { model, calls } = fixture({ user: () => staff(perfil) }); await prepare(model)
    assert.equal(model.getState().kind, 'reexibicao'); assert.equal(model.getState().target.usuarioId, id(8)); assert.equal(model.getState().read.data, null); assert.equal(JSON.stringify(model.getState()).includes('OUTRO TEXTO'), false)
    await model.submit(); assert.deepEqual(calls.map(x => x.kind), ['list', 'reveal', 'list']); assert.equal(calls[1].motivo, 'Revisão da ocultação\nMotivo explícito'); assert.equal(calls.at(-1).number, 0); assert.equal(calls.at(-1).size, 20)
    assert.equal(model.getState().kind, null); assert.equal(model.getState().target, null); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().motivo, ''); assert.match(model.getState().notice, /Reexibição confirmada/); model.dispose()
  })
}
test('reexibicao exigeMaterialPUBLICADO observado; ausencia/privado/estadoinvalido naoofereceescrita', async () => {
  for (const status of ['PENDENTE', 'BLOQUEADO', 'REMOVIDO', undefined, 'desconhecido']) {
    const { model, calls } = fixture({ materialStatus: () => status }); await model.load(id(10)); model.openReveal(id(30)); model.setMotivo('Motivo'); model.setConfirmed(true); await model.submit()
    assert.equal(model.getState().panel, false); assert.equal(calls.length, 1); model.openHide(id(31)); assert.equal(model.getState().kind, 'ocultacao', 'ocultação permanece disponível em Material privado'); model.dispose()
  }
})
test('semconta/equipe/UUIDvalido nao consulta nemprepara reexibicao', async () => {
  for (const user of [null, staff('USUARIO'), staff('X'), staff('MODERADOR', 'x')]) {
    const { model, calls } = fixture({ user: () => user }); await model.load(id(10)); model.openReveal(id(30)); await model.submit(); assert.equal(calls.length, 0); assert.equal(model.getState().target, null); model.dispose()
  }
  const { model, calls } = fixture(); await model.load('x'); model.openReveal(id(30)); assert.equal(calls.length, 0); model.dispose()
})
test('soOCULTO da paginaatual, semUUIDarbitrario/restaurarREMOVIDO ouacaoinferidadohistorico', async () => {
  const { model, calls } = fixture(); await model.load(id(10))
  for (const key of [id(31), id(99), 'x']) model.openReveal(key)
  assert.equal(model.getState().panel, false); await model.openHistory(id(30)); model.openReveal(id(30)); assert.equal(model.getState().panel, false)
  await model.closeHistory(); model.openReveal(id(30)); assert.equal(model.getState().panel, true); assert.equal(calls.length, 3); model.dispose()
})
test('trocaracaorequer cancelar/GETnovo e descartamotivo-confirmacao', async () => {
  const { model, calls } = fixture(); await model.load(id(10)); model.openHide(id(31)); model.setMotivo('Motivo anterior'); model.setConfirmed(true); model.openReveal(id(30))
  assert.equal(model.getState().kind, 'ocultacao'); assert.equal(model.getState().motivo, 'Motivo anterior')
  await model.closeDecision(); model.openReveal(id(30)); assert.equal(model.getState().kind, 'reexibicao'); assert.equal(model.getState().motivo, ''); assert.equal(model.getState().confirmed, false); assert.equal(calls.length, 2); model.dispose()
})
test('confirmacao consumida poredicao/tentativa e400 preservamotivo semreenvioautomatico', async () => {
  const { model, calls } = fixture({ reveal: async () => { throw new ApiError('http', 400, { detail: 'ERRO PRIVADO', errors: [] }) } }); await prepare(model)
  model.setMotivo('Motivo atualizado'); await model.submit(); assert.equal(calls.length, 1)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().motivo, 'Motivo atualizado'); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().sending, false)
  assert.equal(JSON.stringify(model.getState()).includes('ERRO PRIVADO'), false); await model.submit(); assert.equal(calls.length, 2); model.dispose()
})
test('envio de reexibicao bloqueia duplicidade/troca/fechar/edicao/GETs', async () => {
  const pending = deferred(); const { model, calls } = fixture({ reveal: () => pending.promise }); await prepare(model); const sending = model.submit()
  model.openHide(id(31)); model.setMotivo('Trocado'); model.setConfirmed(true); await model.submit(); await model.closeDecision(); await model.openHistory(id(30)); await model.reload(); await model.setSize(50); await model.goToPage(1)
  assert.equal(calls.length, 2); assert.equal(model.getState().kind, 'reexibicao'); assert.equal(model.getState().sending, true); assert.equal(model.getState().confirmed, false)
  pending.resolve(comment({ status: 'ATIVO' })); await sending; assert.equal(calls.length, 3); assert.equal(model.getState().panel, false); model.dispose()
})
test('sucessoseguidoGETfalho preservaaviso semsnapshot nem evento inventado', async () => {
  let reads = 0
  const { model, calls } = fixture({ list: async (_key, number, size) => { if (++reads > 1) throw new ApiError('network'); return page([comment()], number, size) } }); await prepare(model); await model.submit()
  assert.equal(model.getState().read.data, null); assert.ok(model.getState().read.error); assert.match(model.getState().notice, /Reexibição confirmada/)
  assert.equal(JSON.stringify(model.getState()).includes(comment().conteudo), false); assert.equal(calls.some(x => x.kind === 'history'), false); model.dispose()
})
test('409eincertos descartamtexto-motivo e exigemnovaconsulta-novaselecao sematribuirresultado', async () => {
  for (const failure of [new ApiError('http', 409), new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) {
    const { model, calls } = fixture({ reveal: async () => { throw failure } }); await prepare(model); await model.submit()
    assert.equal(model.getState().mustReload, true); assert.equal(model.getState().target, null); assert.equal(model.getState().motivo, ''); assert.equal(model.getState().notice, '')
    model.setConfirmed(true); await model.submit(); model.openHide(id(31)); model.openReveal(id(30)); await model.reload(); assert.equal(calls.length, 2)
    await model.closeDecision(); model.openReveal(id(30)); assert.equal(calls.at(-1).kind, 'list'); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().motivo, ''); model.dispose()
  }
})
test('401-403-404 dePOST retiramtudo e impedemnovasacoes atecargaexplicita', async () => {
  for (const status of [401, 403, 404]) {
    const { model, calls } = fixture({ reveal: async () => { throw new ApiError('http', status, { detail: 'ERRO PRIVADO', errors: [] }) } }); await prepare(model); await model.submit()
    assert.equal(model.getState().read.denied, true); assert.equal(model.getState().target, null); assert.equal(model.getState().motivo, ''); assert.equal(JSON.stringify(model.getState()).includes('ERRO PRIVADO'), false)
    await model.reload(); await model.closeDecision(); model.openReveal(id(30)); model.openHide(id(31)); assert.equal(calls.length, 2); await model.load(id(10)); assert.equal(calls.length, 3); model.dispose()
  }
})
test('resposta deoutroautor-data ouestado contraditorio incerta semaviso desucesso', async () => {
  for (const changes of [{ usuarioId: id(9) }, { dataCadastro: '2026-10-26T12:00:00Z' }, { status: 'OCULTO' }]) {
    const { model } = fixture({ reveal: async () => comment({ status: 'ATIVO', ...changes }) }); await prepare(model); await model.submit(); assert.equal(model.getState().mustReload, true); assert.equal(model.getState().notice, ''); model.dispose()
  }
})
for (const change of ['Material', 'estadoMaterial', 'conta', 'perfil', 'equipe', 'dispose']) {
  test('reexibicaoatrasada apos ' + change + ' abortada/ignorada sem contaminar novarevisao', async () => {
    let user = staff(), status = 'PUBLICADO'; const pending = deferred()
    const { model, calls } = fixture({ user: () => user, materialStatus: () => status, reveal: () => pending.promise }); await prepare(model); const sending = model.submit()
    if (change === 'estadoMaterial') status = 'BLOQUEADO'
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose(); else await model.load(change === 'Material' ? id(11) : id(10))
    pending.reject(new ApiError('http', 403)); await sending
    assert.equal(calls[1].signal.aborted, true); assert.equal(model.getState().panel, false); assert.equal(model.getState().motivo, ''); assert.equal(model.getState().notice, '')
    if (!['perfil', 'dispose'].includes(change)) assert.equal(model.getState().read.denied, false)
    model.dispose()
  })
}
test('mudancaMaterialsemwatcher antesPOST removeformulario e impedeenvio', async () => {
  let status = 'PUBLICADO'; const { model, calls } = fixture({ materialStatus: () => status }); await prepare(model); status = 'BLOQUEADO'; await model.submit()
  assert.equal(calls.length, 1); assert.equal(model.getState().target, null); assert.equal(model.getState().read.denied, true); model.dispose()
})
test('mudancaMaterialsemwatcher durantePOST ignora sucessoatrasado', async () => {
  let status = 'PUBLICADO'; const pending = deferred(); const { model } = fixture({ materialStatus: () => status, reveal: () => pending.promise }); await prepare(model); const sending = model.submit()
  status = 'PENDENTE'; pending.resolve(comment({ status: 'ATIVO' })); await sending; assert.equal(model.getState().notice, ''); assert.equal(model.getState().target, null); assert.equal(model.getState().read.data, null); model.dispose()
})
