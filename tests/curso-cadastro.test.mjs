import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createCursoCadastroService, normalizeCurso, validateCurso } from '../src/features/curso/curso-cadastro-service.ts'
import { createCursoCadastroModel } from '../src/features/curso/curso-cadastro-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const instituicaoId = id(1), courseId = id(2), institution = { id: instituicaoId, nome: 'UNESC', sigla: 'UNESC' }, actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
const input = () => ({ nome: '  Ciências da Computação  ', descricao: '  Curso <script>literal</script>  ' })
function setup({ create, detail = async () => institution, user = () => actor() } = {}) {
  const calls = [], model = createCursoCadastroModel({ create: (...args) => { calls.push(['POST', ...args]); return create ? create(...args) : Promise.resolve({ id: courseId }) } }, { detail: (...args) => { calls.push(['GET', ...args]); return detail(...args) } }, user)
  return { model, calls }
}
async function ready(model, idValue = instituicaoId) { await model.initialize(idValue) }

test('service POST envia somente nome/descricao/instituicaoId normalizados e retorna UUID', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createCursoCadastroService(async (...args) => { calls.push(args); return { id: courseId, nome: 'Ciências da Computação', descricao: 'Curso <script>literal</script>', instituicaoId, disciplinas: ['PRIVADO'] } })
  assert.deepEqual(await service.create(instituicaoId, input(), signal), { id: courseId })
  assert.deepEqual(calls, [['/cursos', { method: 'POST', json: { nome: 'Ciências da Computação', descricao: 'Curso <script>literal</script>', instituicaoId }, signal }]])
  assert.equal(normalizeCurso({ nome: ' Nome ', descricao: '   ' }).descricao, null)
})

test('validacao de nome150/descricao1000 sem truncar e sem U+0000 bloqueia HTTP', async () => {
  const service = createCursoCadastroService(() => assert.fail('não deveria chamar a API'))
  for (const value of [
    { nome: '', descricao: '' }, { nome: ' ', descricao: '' }, { nome: 'x'.repeat(151), descricao: '' },
    { nome: 'Nome', descricao: 'x'.repeat(1001) }, { nome: 'Nome\u0000', descricao: '' }, { nome: 'Nome', descricao: 'x\u0000' },
  ]) { assert.ok(Object.keys(validateCurso(value)).length); await assert.rejects(service.create(instituicaoId, value), TypeError) }
  assert.deepEqual(validateCurso({ nome: ' ' + 'x'.repeat(150) + ' ', descricao: ' ' + 'y'.repeat(1000) + ' ' }), {})
})

test('service rejeita UUID vinculo ou valores de resposta divergentes', async () => {
  for (const dto of [
    { id: 'invalid', nome: 'Ciências da Computação', descricao: null, instituicaoId },
    { id: courseId, nome: 'Outro nome', descricao: null, instituicaoId },
    { id: courseId, nome: 'Ciências da Computação', descricao: 'Outra', instituicaoId },
    { id: courseId, nome: 'Ciências da Computação', descricao: null, instituicaoId: id(9) },
  ]) await assert.rejects(createCursoCadastroService(async () => dto).create(instituicaoId, { nome: 'Ciências da Computação', descricao: '' }), error => error instanceof ApiError && error.kind === 'protocol')
  let calls = 0; await assert.rejects(createCursoCadastroService(async () => { calls++; return {} }).create('bad-id', input()), TypeError); assert.equal(calls, 0)
})

test('modelo valida instituicao antes do formulario; sucesso guarda so UUID e nao reenvia', async () => {
  const { model, calls } = setup(); await ready(model); assert.equal(calls[0][0], 'GET'); assert.equal(model.getState().instituicao.nome, 'UNESC')
  await model.submit(); assert.equal(calls.filter(c => c[0] === 'POST').length, 0); assert.ok(model.getState().fields.nome)
  model.change('nome', input().nome); model.change('descricao', input().descricao); await model.submit()
  assert.equal(model.getState().savedId, courseId); assert.deepEqual(model.getState().draft, { nome: '', descricao: '' }); assert.equal(calls.filter(c => c[0] === 'POST').length, 1)
  assert.deepEqual(calls.find(c => c[0] === 'POST').slice(1, 2), [instituicaoId]); model.change('nome', 'Outro'); await model.submit(); assert.equal(calls.filter(c => c[0] === 'POST').length, 1); model.dispose()
})

test('sem ADMIN ou UUID valido nao busca/enviacadastro', async () => {
  for (const user of [null, actor('USUARIO'), actor('MODERADOR')]) {
    const { model, calls } = setup({ user: () => user }); await ready(model); assert.equal(model.getState().denied, true); assert.equal(calls.length, 0); model.dispose()
  }
  const invalid = setup(); await ready(invalid.model, 'invalid'); assert.equal(invalid.calls.length, 0); assert.equal(invalid.model.getState().unavailable, true); invalid.model.dispose()
})

test('falha ao consultar instituição mostra erro recuperável por GET explícito', async () => {
  let attempts = 0
  const { model, calls } = setup({ detail: async () => { attempts++; if (attempts === 1) throw new ApiError('network'); return institution } })
  await ready(model); assert.equal(model.getState().instituicao, null); assert.match(model.getState().error, /consultar a instituição/)
  await model.initialize(instituicaoId); assert.equal(attempts, 2); assert.equal(model.getState().instituicao.id, instituicaoId); assert.equal(calls.filter(call => call[0] === 'POST').length, 0); model.dispose()
})

test('400 preserva draft/mensagens fixas; 409 bloqueia mesmo payload normalizado até editar', async () => {
  const bad = setup({ create: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO' }) } }); await ready(bad.model); bad.model.change('nome', input().nome); bad.model.change('descricao', input().descricao); await bad.model.submit()
  assert.equal(bad.model.getState().draft.nome, input().nome); assert.equal(JSON.stringify(bad.model.getState()).includes('PRIVADO'), false); assert.ok(bad.model.getState().fields.nome); bad.model.dispose()

  const conflict = setup({ create: async () => { throw new ApiError('http', 409) } }); await ready(conflict.model); conflict.model.change('nome', input().nome); conflict.model.change('descricao', input().descricao); await conflict.model.submit(); assert.equal(conflict.model.getState().conflict, true)
  await conflict.model.submit(); assert.equal(conflict.calls.filter(c => c[0] === 'POST').length, 1)
  conflict.model.change('nome', 'Outro curso'); assert.equal(conflict.model.getState().conflict, false); await conflict.model.submit(); assert.equal(conflict.calls.filter(c => c[0] === 'POST').length, 2); conflict.model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) test('POST incerto bloqueia edicao/reenvio ate descarte explicito: ' + error.kind + error.status, async () => {
  const { model, calls } = setup({ create: async () => { throw error } }); await ready(model); model.change('nome', input().nome); model.change('descricao', input().descricao); await model.submit()
  assert.equal(model.getState().uncertain, true); model.change('nome', 'Outro'); await model.submit(); assert.equal(calls.filter(c => c[0] === 'POST').length, 1)
  model.prepareNew(); assert.deepEqual(model.getState().draft, { nome: '', descricao: '' }); assert.equal(model.getState().uncertain, false); assert.equal(calls.filter(c => c[0] === 'POST').length, 1); model.dispose()
})

for (const status of [401, 403, 404]) test('POST ' + status + ' limpa alvo/draft e exige reabrir', async () => {
  const { model, calls } = setup({ create: async () => { throw new ApiError('http', status) } }); await ready(model); model.change('nome', input().nome); model.change('descricao', input().descricao); await model.submit()
  assert.equal(model.getState().denied, true); assert.equal(model.getState().instituicao, null); assert.deepEqual(model.getState().draft, { nome: '', descricao: '' }); model.change('nome', 'Outro'); await model.submit(); assert.equal(calls.filter(c => c[0] === 'POST').length, 1); model.dispose()
})

test('mudanca de conta/perfil e dispose abortam e ignoram respostas atrasadas', async () => {
  for (const mode of ['account', 'profile', 'dispose']) {
    const pending = deferred(); let user = actor(); const { model, calls } = setup({ create: () => pending.promise, user: () => user }); await ready(model); model.change('nome', input().nome); model.change('descricao', input().descricao); const sending = model.submit(); const signal = calls.find(c => c[0] === 'POST')[3]
    if (mode === 'account') user = actor('ADMINISTRADOR', id(9)); if (mode === 'profile') user = actor('MODERADOR')
    if (mode === 'dispose') model.dispose(); else await model.initialize(instituicaoId)
    pending.resolve({ id: courseId }); await sending; assert.equal(signal.aborted, true); assert.equal(model.getState().savedId, '')
    if (mode === 'profile') assert.equal(model.getState().denied, true); model.dispose()
  }
})
