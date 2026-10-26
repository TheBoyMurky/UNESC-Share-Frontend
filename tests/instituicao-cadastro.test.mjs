import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { canAdminister } from '../src/features/auth/permissions.ts'
import { createInstituicaoCadastroService, validateInstituicao, normalizeInstituicao } from '../src/features/instituicao/instituicao-cadastro-service.ts'
import { createInstituicaoCadastroModel } from '../src/features/instituicao/instituicao-cadastro-model.ts'
import { id, deferred } from './catalog-fixtures.mjs'

const actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
const input = () => ({ nome: '  Universidade <script>texto literal</script>  ', sigla: '  uni  ' })
function fixture({ create, user = () => actor() } = {}) {
  const calls = []
  const model = createInstituicaoCadastroModel({ create: async (body, signal) => { calls.push({ body, signal }); return create ? create(body, signal) : { id: id(1) } } }, user)
  return { model, calls }
}
function prepare(model) { model.initialize(); model.change('nome', input().nome); model.change('sigla', input().sigla) }

test('canAdminister apenasADMINISTRADOR semdecodificarJWT/perfilalternativo', () => {
  assert.equal(canAdminister(actor()), true)
  for (const user of [null, undefined, actor('USUARIO'), actor('MODERADOR'), actor('ADMIN'), {}]) assert.equal(canAdminister(user), false)
})
test('service POSTsoNomeSigla normalizados, projetaDTO-descartaextras-retornasoUUID', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createInstituicaoCadastroService(async (...args) => { calls.push(args); return { id: id(1), ...normalizeInstituicao(input()), cursos: ['EXTRA'], email: 'PRIVADO' } })
  assert.deepEqual(await service.create({ ...input(), perfil: 'ADMINISTRADOR', id: id(99) }, signal), { id: id(1) })
  assert.deepEqual(calls, [['/instituicoes', { method: 'POST', json: normalizeInstituicao(input()), signal }]])
})
test('validacao180-30 aposnormalizacao semtruncar/incluirU+0000 nemenvioHTTPinvalido', async () => {
  const service = createInstituicaoCadastroService(() => assert.fail())
  for (const data of [{ nome: '', sigla: 'A' }, { nome: ' ', sigla: 'A' }, { nome: 'a'.repeat(181), sigla: 'A' }, { nome: 'Nome', sigla: '' }, { nome: 'Nome', sigla: 'x'.repeat(31) }, { nome: 'x\u0000', sigla: 'A' }, { nome: 'Nome', sigla: 'a\u0000' }, { nome: 'Nome', sigla: 'ß'.repeat(16) }]) {
    assert.ok(Object.keys(validateInstituicao(data)).length); await assert.rejects(service.create(data), TypeError)
  }
  assert.deepEqual(validateInstituicao({ nome: ' ' + 'a'.repeat(180) + ' ', sigla: 'ß'.repeat(15) }), {})
  assert.equal(normalizeInstituicao({ nome: ' Nome ', sigla: 'ß'.repeat(15) }).sigla, 'SS'.repeat(15))
})
test('service recusaDTOID-nome-sigla divergentes/malformados sematribuirsucesso', async () => {
  for (const changes of [{ id: 'x' }, { nome: 'Outra' }, { sigla: 'OUTRA' }, { sigla: 'uni' }, { nome: 'x\u0000' }]) await assert.rejects(createInstituicaoCadastroService(async () => ({ id: id(1), ...normalizeInstituicao(input()), ...changes })).create(input()), error => error instanceof ApiError && error.kind === 'protocol')
  for (const dto of [undefined, null, [], 'x']) await assert.rejects(createInstituicaoCadastroService(async () => dto).create(input()), ApiError)
})
test('inicializarnaoHTTP/validacaoantesPOST/sucessoapagaformulario e naoreenvia', async () => {
  const { model, calls } = fixture(); model.initialize(); await model.submit(); assert.equal(calls.length, 0); assert.ok(model.getState().fields.nome)
  prepare(model); await model.submit(); assert.deepEqual(calls[0].body, normalizeInstituicao(input())); assert.equal(model.getState().savedId, id(1)); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' })
  model.change('nome', 'Outra'); await model.submit(); assert.equal(calls.length, 1); model.dispose()
})
for (const user of [null, actor('USUARIO'), actor('MODERADOR'), actor('ADMINISTRADOR', 'x')]) {
  test('semADMIN-comUUIDvalido nao edita/envia cadastro ' + String(user?.perfil), async () => {
    const { model, calls } = fixture({ user: () => user }); prepare(model); await model.submit(); assert.equal(model.getState().denied, true); assert.equal(calls.length, 0); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' }); model.dispose()
  })
}
test('emvoo bloqueiaedicao/reenvio/prepararnovo', async () => {
  const pending = deferred(), { model, calls } = fixture({ create: () => pending.promise }); prepare(model); const sending = model.submit()
  model.change('nome', 'Outra'); model.prepareNew(); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().draft.nome, input().nome)
  pending.resolve({ id: id(1) }); await sending; assert.equal(model.getState().savedId, id(1)); model.dispose()
})
test('400 conservadraft e mapeiamensagensfixassemecoarProblemDetail', async () => {
  const { model, calls } = fixture({ create: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO', errors: [{ field: 'nome', message: 'PRIVADO' }] }) } }); prepare(model); await model.submit()
  assert.deepEqual(model.getState().draft, input()); assert.equal(model.getState().sending, false); assert.ok(model.getState().fields.nome); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
  model.change('sigla', 'OUTRA'); await model.submit(); assert.equal(calls.length, 2); model.dispose()
})
test('409 preservadraft bloqueiamesmodados-normalizados, mudarpermitePOST/revertervoltaconflito', async () => {
  const { model, calls } = fixture({ create: async () => { throw new ApiError('http', 409) } }); prepare(model); await model.submit(); assert.equal(model.getState().conflict, true); assert.deepEqual(model.getState().draft, input())
  model.change('nome', ' ' + input().nome.trim() + ' '); model.change('sigla', ' UNI '); await model.submit(); assert.equal(calls.length, 1)
  model.change('sigla', 'OUTRA'); assert.equal(model.getState().conflict, false); model.change('sigla', 'uni'); assert.equal(model.getState().conflict, true); assert.ok(model.getState().error)
  model.change('nome', 'Outra instituição'); await model.submit(); assert.equal(calls.length, 2); model.dispose()
})
for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) {
  test('incerto ' + error.kind + error.status + ' naoredigita-naoreenvia ate descarteexplicito sematribuirporlista', async () => {
    const { model, calls } = fixture({ create: async () => { throw error } }); prepare(model); await model.submit(); assert.equal(model.getState().uncertain, true); assert.deepEqual(model.getState().draft, input()); assert.equal(model.getState().savedId, '')
    model.change('nome', 'Outra'); await model.submit(); assert.equal(calls.length, 1); model.prepareNew(); assert.equal(calls.length, 1); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' }); assert.equal(model.getState().uncertain, false); await model.submit(); assert.equal(calls.length, 1); model.dispose()
  })
}
for (const code of [401, 403, 404]) {
  test('POST' + code + ' retiradados e bloqueiaate novacarga', async () => {
    const { model, calls } = fixture({ create: async () => { throw new ApiError('http', code) } }); prepare(model); await model.submit(); assert.equal(model.getState().denied, true); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' }); model.change('nome', 'Outra'); model.prepareNew(); await model.submit(); assert.equal(calls.length, 1); model.initialize(); assert.equal(model.getState().denied, false); model.dispose()
  })
}
test('respostaUUIDinvalido doadaptador e incerta semsavedId', async () => {
  const { model } = fixture({ create: async () => ({ id: 'x' }) }); prepare(model); await model.submit(); assert.equal(model.getState().uncertain, true); assert.equal(model.getState().savedId, ''); model.dispose()
})
for (const change of ['conta', 'perfil', 'logout', 'dispose']) {
  test('POSTatrasado apos ' + change + ' abortado/ignorado semdraft-sucesso no contexto novo', async () => {
    let user = actor(); const pending = deferred(), { model, calls } = fixture({ user: () => user, create: () => pending.promise }); prepare(model); const sending = model.submit()
    if (change === 'conta') user = actor('ADMINISTRADOR', id(9))
    if (change === 'perfil') user = actor('MODERADOR')
    if (change === 'logout') user = null
    if (change === 'dispose') model.dispose(); else model.initialize()
    pending.reject(new ApiError('http', 403)); await sending; assert.equal(calls[0].signal.aborted, true); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' }); assert.equal(model.getState().savedId, '')
    if (change === 'conta') assert.equal(model.getState().denied, false)
    model.dispose()
  })
}
test('perdadeperfil semwatcher impedePOST e retira draft', async () => {
  let user = actor(); const { model, calls } = fixture({ user: () => user }); prepare(model); user = actor('USUARIO'); await model.submit(); assert.equal(calls.length, 0); assert.equal(model.getState().denied, true); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' }); model.dispose()
})
