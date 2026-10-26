import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createModeracaoComentarioService, validateMotivoComentario } from '../src/features/moderacao/moderacao-comentario-service.ts'
import { createComentarioOcultacaoModel } from '../src/features/moderacao/comentario-ocultacao-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const comment = (changes = {}) => ({ id: id(30), materialId: id(10), usuarioId: id(8), status: 'ATIVO', conteudo: 'Comentário selecionado <script>literal</script>', dataCadastro: '2026-10-25T12:00:00Z', ...changes })
const staff = (perfil = 'MODERADOR', key = id(8)) => ({ id: key, perfil })
function fixture({ list, hide, history, user = () => staff() } = {}) {
  const calls = []
  const model = createComentarioOcultacaoModel({
    list: async (key, number, size, signal) => { calls.push({ kind: 'list', key, number, size, signal }); return list ? list(key, number, size, signal) : page([comment({ materialId: key }), comment({ id: id(31), materialId: key, status: 'OCULTO', conteudo: 'OUTRO TEXTO' })], number, size) },
    history: async (key, target, number, size, signal) => { calls.push({ kind: 'history', key, target, number, size, signal }); return history ? history(key, target, number, size, signal) : page([], number, size) },
    hide: async (key, target, motivo, signal) => { calls.push({ kind: 'hide', key, target, motivo, signal }); return hide ? hide(key, target, motivo, signal) : comment({ id: target, materialId: key, status: 'OCULTO' }) },
  }, user)
  return { model, calls }
}
async function prepare(model) { await model.load(id(10)); model.openHide(id(30)); model.setMotivo('  Motivo explícito\n<script>literal</script>  '); model.setConfirmed(true) }

test('service ocultacao usa POST parMaterial-comentario JSONsomotivo trim e projeta resposta', async () => {
  const calls = [], signal = new AbortController().signal
  const source = comment({ status: 'OCULTO' })
  const service = createModeracaoComentarioService(async (...args) => { calls.push(args); return { ...source, email: 'PRIVADO', motivo: 'EXTRA' } })
  assert.deepEqual(await service.hide(id(10).toUpperCase(), id(30).toUpperCase(), '  Motivo\nliteral  ', signal), source)
  assert.deepEqual(calls, [[`/materiais/${id(10)}/comentarios/${id(30)}/ocultacao`, { method: 'POST', json: { motivo: 'Motivo\nliteral' }, signal }]])
})
test('service validaUUIDs e motivo antesHTTP, limite1000 sem truncar/nulo', async () => {
  const service = createModeracaoComentarioService(() => assert.fail())
  for (const reason of ['', '   ', 'a'.repeat(1001), 'a\u0000b', null]) {
    assert.ok(validateMotivoComentario(reason)); await assert.rejects(service.hide(id(10), id(30), reason), TypeError)
  }
  for (const [material, target] of [['../x', id(30)], [id(10), '../x']]) await assert.rejects(service.hide(material, target, 'Motivo'), TypeError)
  assert.equal(validateMotivoComentario(' a'.trim().repeat(1000)), '')
  assert.equal(validateMotivoComentario('  ' + 'a'.repeat(1000) + '  '), '')
})
test('service recusaRespostaOutroAlvo-vinculo-estado ou conteudo invalido', async () => {
  for (const change of [{ id: id(31) }, { materialId: id(11) }, { status: 'ATIVO' }, { status: 'REMOVIDO' }, { conteudo: 'x\u0000' }, { usuarioId: 'x' }]) {
    await assert.rejects(createModeracaoComentarioService(async () => comment({ status: 'OCULTO', ...change })).hide(id(10), id(30), 'Motivo'), error => error instanceof ApiError && error.kind === 'protocol')
  }
})
for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' podeocultarComentarioProprio ativo sem conflito deDenuncia; semenvio aoabrir', async () => {
    const { model, calls } = fixture({ user: () => staff(perfil) }); await model.load(id(10)); model.openHide(id(30))
    assert.equal(model.getState().panel, true); assert.equal(model.getState().target.usuarioId, id(8)); assert.equal(model.getState().read.data, null)
    assert.equal(JSON.stringify(model.getState()).includes('OUTRO TEXTO'), false); assert.equal(calls.length, 1)
    model.setMotivo('Motivo'); model.setConfirmed(true); await model.submit()
    assert.deepEqual(calls.map(x => x.kind), ['list', 'hide', 'list']); assert.equal(model.getState().panel, false); assert.ok(model.getState().notice); assert.equal(model.getState().motivo, ''); model.dispose()
  })
}
test('ocultar soATIVO conhecido dapagina, naoOCULTO/UUIDarbitrario/historico nem segundopainel', async () => {
  const { model, calls } = fixture(); await model.load(id(10))
  for (const key of [id(99), id(31), 'x']) model.openHide(key)
  assert.equal(model.getState().panel, false); await model.openHistory(id(30)); model.openHide(id(30)); assert.equal(model.getState().panel, false)
  await model.closeHistory(); model.openHide(id(30)); model.setMotivo('Rascunho'); model.openHide(id(31)); await model.openHistory(id(30)); await model.reload(); await model.setSize(50); await model.goToPage(1)
  assert.equal(model.getState().target.id, id(30)); assert.equal(model.getState().motivo, 'Rascunho'); assert.equal(calls.length, 3); model.dispose()
})
test('confirmacao exigida e consumida poredicao/tentativa;400 preservadraft sem autoenvio', async () => {
  const { model, calls } = fixture({ hide: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO', errors: [] }) } })
  await model.load(id(10)); model.openHide(id(30)); model.setMotivo('Motivo'); await model.submit(); assert.equal(calls.length, 1)
  model.setConfirmed(true); model.setMotivo('Novo motivo'); assert.equal(model.getState().confirmed, false); await model.submit(); assert.equal(calls.length, 1)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().motivo, 'Novo motivo'); assert.equal(model.getState().sending, false)
  assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); await model.submit(); assert.equal(calls.length, 2)
  model.setConfirmed(true); await model.submit(); assert.equal(calls.length, 3); model.dispose()
})
test('motivo invalido nao envia e exige novaconfirmacao', async () => {
  const { model, calls } = fixture(); await prepare(model); model.setMotivo('x\u0000'); model.setConfirmed(true); await model.submit()
  assert.equal(calls.length, 1); assert.equal(model.getState().confirmed, false); assert.ok(model.getState().error); model.dispose()
})
test('emvoo trava todasacoes-formulario-leituras e duplicidade; sucesso consulta nova20/0', async () => {
  const pending = deferred(); const { model, calls } = fixture({ hide: () => pending.promise }); await prepare(model)
  const sending = model.submit(); assert.equal(model.getState().sending, true); assert.equal(model.getState().confirmed, false)
  model.setMotivo('Trocado'); model.setConfirmed(true); model.openHide(id(31)); await model.submit(); await model.closeHide(); await model.openHistory(id(30)); await model.reload(); await model.setSize(50); await model.goToPage(1)
  assert.equal(calls.length, 2); assert.equal(model.getState().motivo.trim(), 'Motivo explícito\n<script>literal</script>'); assert.equal(model.getState().confirmed, false)
  pending.resolve(comment({ status: 'OCULTO', conteudo: 'Texto editado em outra aba' })); await sending
  assert.equal(calls.length, 3); assert.equal(calls.at(-1).number, 0); assert.equal(calls.at(-1).size, 20); assert.equal(model.getState().target, null); assert.equal(model.getState().motivo, ''); assert.ok(model.getState().notice); model.dispose()
})
test('sucesso nao fabricaevento/estadootimista, GETfalha mantem aviso semantigoTexto', async () => {
  let reads = 0
  const { model, calls } = fixture({ list: async (_key, number, size) => { if (++reads > 1) throw new ApiError('network'); return page([comment()], number, size) } })
  await prepare(model); await model.submit(); assert.equal(model.getState().read.data, null); assert.ok(model.getState().read.error); assert.ok(model.getState().notice)
  assert.equal(JSON.stringify(model.getState()).includes(comment().conteudo), false); assert.deepEqual(calls.map(x => x.kind), ['list', 'hide', 'list']); model.dispose()
})
for (const failure of [new ApiError('http', 409), new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) {
  test('conflito/incerto ' + failure.kind + failure.status + ' descarta texto-motivo exigeGETnovo e novaselecao', async () => {
    const { model, calls } = fixture({ hide: async () => { throw failure } }); await prepare(model); await model.submit()
    assert.equal(model.getState().mustReload, true); assert.equal(model.getState().target, null); assert.equal(model.getState().motivo, ''); assert.equal(model.getState().confirmed, false)
    model.setMotivo('Nova'); model.setConfirmed(true); await model.submit(); await model.reload(); model.openHide(id(30)); assert.equal(calls.length, 2)
    await model.closeHide(); assert.equal(calls.at(-1).kind, 'list'); assert.equal(model.getState().panel, false); model.openHide(id(30)); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().motivo, ''); model.dispose()
  })
}
for (const status of [401, 403, 404]) {
  test('POST' + status + ' retira todosdados e bloqueia ate novacarga semexibirerroprivado', async () => {
    const { model, calls } = fixture({ hide: async () => { throw new ApiError('http', status, { detail: 'PRIVADO', errors: [] }) } }); await prepare(model); await model.submit()
    assert.equal(model.getState().read.denied, true); assert.equal(model.getState().target, null); assert.equal(model.getState().read.data, null); assert.equal(model.getState().motivo, '')
    assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); await model.closeHide(); await model.reload(); model.openHide(id(30)); assert.equal(calls.length, 2)
    await model.load(id(10)); assert.equal(calls.length, 3); assert.equal(model.getState().read.denied, false); model.dispose()
  })
}
test('resposta comautor-data imutaveis divergentes vira incerta, sematribuir sucesso', async () => {
  for (const change of [{ usuarioId: id(9) }, { dataCadastro: '2026-10-26T12:00:00Z' }]) {
    const { model } = fixture({ hide: async () => comment({ status: 'OCULTO', ...change }) }); await prepare(model); await model.submit()
    assert.equal(model.getState().mustReload, true); assert.equal(model.getState().notice, ''); model.dispose()
  }
})
for (const change of ['Material', 'conta', 'perfil', 'equipe', 'dispose']) {
  test('POSTatrasado apos ' + change + ' abortado/ignorado sem restaurardados nem bloquear contexto novo', async () => {
    let user = staff(); const pending = deferred(); const { model, calls } = fixture({ user: () => user, hide: () => pending.promise }); await prepare(model); const sending = model.submit()
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose(); else await model.load(change === 'Material' ? id(11) : id(10))
    pending.reject(new ApiError('http', 403)); await sending
    assert.equal(calls[1].signal.aborted, true); assert.equal(model.getState().panel, false); assert.equal(model.getState().motivo, ''); assert.equal(model.getState().notice, '')
    if (!['perfil', 'dispose'].includes(change)) { assert.equal(model.getState().read.denied, false); assert.ok(model.getState().read.data) }
    else assert.equal(model.getState().read.data, null)
    model.dispose()
  })
}
test('perdaperfil semwatcher naoconfirma nemenvia e limpaselecao', async () => {
  let user = staff(); const { model, calls } = fixture({ user: () => user }); await prepare(model); user = staff('USUARIO'); await model.submit()
  assert.equal(calls.length, 1); assert.equal(model.getState().read.denied, true); assert.equal(model.getState().target, null); model.dispose()
})
test('cancelar descartadraft e consultanova20/0; listavazia naoevidencia resultado dePOST', async () => {
  let empty = false
  const { model, calls } = fixture({ list: async (_key, number, size) => page(empty ? [] : [comment()], number, size) })
  await prepare(model); empty = true; await model.closeHide(); assert.deepEqual(calls.map(x => x.kind), ['list', 'list']); assert.equal(model.getState().motivo, ''); assert.equal(model.getState().notice, ''); assert.deepEqual(model.getState().read.data.content, []); model.dispose()
})
test('composicao preservahistorico semtexto inclusiveapos404 e voltarevalida lista', async () => {
  let fail = false
  const { model, calls } = fixture({ history: async (_key, _target, number, size) => { if (fail) throw new ApiError('http', 404); return page([], number, size) } })
  await model.load(id(10)); await model.openHistory(id(30)); assert.equal(model.getState().read.mode, 'history'); assert.equal(JSON.stringify(model.getState()).includes(comment().conteudo), false)
  fail = true; await model.reload(); assert.equal(model.getState().read.denied, true); assert.equal(model.getState().read.selectedId, null)
  await model.closeHistory(); assert.equal(calls.at(-1).kind, 'list'); assert.equal(model.getState().read.mode, 'list'); assert.equal(model.getState().read.denied, false); model.dispose()
})
