import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createDisciplinaCadastroService, normalizeDisciplina, validateDisciplina } from '../src/features/disciplina/disciplina-cadastro-service.ts'
import { createDisciplinaCadastroModel } from '../src/features/disciplina/disciplina-cadastro-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const institutionId = id(1), courseId = id(2), disciplineId = id(3)
const institution = { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }, course = { id: courseId, nome: 'Ciência da Computação', descricao: null, instituicaoId: institutionId }
const actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
const input = () => ({ nome: '  Algoritmos e Programação  ', descricao: '   ', codigo: ' cco001 ' })

test('service POST envia somente payload normalizado e projeta UUID; código conserva zeros', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createDisciplinaCadastroService(async (...args) => { calls.push(args); return { id: disciplineId, nome: 'Algoritmos e Programação', descricao: null, codigo: 'CCO001', cursoId: courseId, extras: ['PRIVADO'] } })
  assert.deepEqual(await service.create(courseId.toUpperCase(), input(), signal), { id: disciplineId })
  assert.deepEqual(calls, [['/disciplinas', { method: 'POST', json: { nome: 'Algoritmos e Programação', descricao: null, codigo: 'CCO001', cursoId: courseId }, signal }]])
  assert.equal(normalizeDisciplina({ nome: 'Nome', descricao: '', codigo: '  001a  ' }).codigo, '001A')
})

test('validação cobre nome150, descrição1000, código30 e U+0000 sem truncar', async () => {
  const service = createDisciplinaCadastroService(() => assert.fail('não deveria chamar a API'))
  for (const value of [
    { nome: '', descricao: '', codigo: 'X' }, { nome: ' ', descricao: '', codigo: 'X' },
    { nome: 'x'.repeat(151), descricao: '', codigo: 'X' }, { nome: 'N', descricao: 'x'.repeat(1001), codigo: 'X' },
    { nome: 'N', descricao: '', codigo: '' }, { nome: 'N', descricao: '', codigo: 'x'.repeat(31) },
    { nome: 'N\u0000', descricao: '', codigo: 'X' }, { nome: 'N', descricao: 'x\u0000', codigo: 'X' }, { nome: 'N', descricao: '', codigo: 'X\u0000' },
  ]) { assert.ok(Object.keys(validateDisciplina(value)).length); await assert.rejects(service.create(courseId, value), TypeError) }
  assert.deepEqual(validateDisciplina({ nome: ' ' + 'x'.repeat(150) + ' ', descricao: ' ' + 'y'.repeat(1000) + ' ', codigo: ' 001 ' }), {})
})

test('service rejeita UUID, curso, DTO ou valores retornados divergentes', async () => {
  for (const dto of [
    { id: 'inválido', nome: 'Algoritmos e Programação', descricao: null, codigo: 'CCO001', cursoId: courseId },
    { id: disciplineId, nome: 'Outro nome', descricao: null, codigo: 'CCO001', cursoId: courseId },
    { id: disciplineId, nome: 'Algoritmos e Programação', descricao: 'Descrição', codigo: 'CCO001', cursoId: courseId },
    { id: disciplineId, nome: 'Algoritmos e Programação', descricao: null, codigo: 'OUTRO', cursoId: courseId },
    { id: disciplineId, nome: 'Algoritmos e Programação', descricao: null, codigo: 'CCO001', cursoId: id(9) },
  ]) await assert.rejects(createDisciplinaCadastroService(async () => dto).create(courseId, input()), error => error instanceof ApiError && error.kind === 'protocol')
  let calls = 0; await assert.rejects(createDisciplinaCadastroService(async () => { calls++; return {} }).create('ruim', input()), TypeError); assert.equal(calls, 0)
})

function setup({ create, courseDetail = async () => course, institutionDetail = async () => institution, user = () => actor() } = {}) {
  const calls = [], model = createDisciplinaCadastroModel({ create: (...args) => { calls.push(['POST', ...args]); return create ? create(...args) : Promise.resolve({ id: disciplineId }) } },
    { detail: (...args) => { calls.push(['COURSE', ...args]); return courseDetail(...args) } },
    { detail: (...args) => { calls.push(['INSTITUTION', ...args]); return institutionDetail(...args) },
      list: async () => { throw new Error('unused') } }, user)
  return { model, calls }
}
async function ready(model) { await model.initialize(institutionId, courseId) }
function fill(model) { for (const [key, value] of Object.entries(input())) model.change(key, value) }

test('modelo valida curso/instituição, sucesso preserva vínculo fixo e bloqueia novo POST', async () => {
  const { model, calls } = setup(); await ready(model)
  assert.equal(model.getState().curso.id, courseId); assert.equal(model.getState().instituicao.id, institutionId)
  await model.submit(); assert.equal(calls.filter(call => call[0] === 'POST').length, 0); assert.ok(model.getState().fields.nome)
  fill(model); await model.submit(); assert.equal(model.getState().savedId, disciplineId); assert.deepEqual(model.getState().draft, { nome: '', descricao: '', codigo: '' })
  assert.equal(calls.filter(call => call[0] === 'POST').length, 1); assert.deepEqual(calls.find(call => call[0] === 'POST').slice(1, 2), [courseId])
  model.change('nome', 'Outro'); await model.submit(); assert.equal(calls.filter(call => call[0] === 'POST').length, 1); model.dispose()
})

test('sem administrador ou vínculos válidos não consulta nem envia', async () => {
  for (const user of [null, actor('USUARIO'), actor('MODERADOR')]) {
    const { model, calls } = setup({ user: () => user }); await ready(model); assert.equal(model.getState().denied, true); assert.equal(calls.length, 0); model.dispose()
  }
  const mismatch = setup({ courseDetail: async () => ({ ...course, instituicaoId: id(9) }) }); await ready(mismatch.model)
  assert.equal(mismatch.model.getState().curso, null); assert.equal(mismatch.calls.filter(call => call[0] === 'POST').length, 0); mismatch.model.dispose()
  const invalid = setup(); await invalid.model.initialize('inválido', courseId); assert.equal(invalid.calls.length, 0); invalid.model.dispose()
})

test('falha ao carregar curso permite consulta explícita; 404 encerra vínculo', async () => {
  let attempts = 0; const recoverable = setup({ courseDetail: async () => { if (++attempts === 1) throw new ApiError('network'); return course } })
  await ready(recoverable.model); assert.match(recoverable.model.getState().error, /consultar o curso/); await ready(recoverable.model); assert.equal(recoverable.model.getState().curso.id, courseId); recoverable.model.dispose()
  const missing = setup({ courseDetail: async () => { throw new ApiError('http', 404) } }); await ready(missing.model); assert.equal(missing.model.getState().unavailable, true); missing.model.dispose()
})

test('400 mantém rascunho; 409 bloqueia payload normalizado até edição', async () => {
  const bad = setup({ create: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO' }) } }); await ready(bad.model); fill(bad.model); await bad.model.submit()
  assert.deepEqual(bad.model.getState().draft, input()); assert.ok(bad.model.getState().fields.codigo); assert.equal(JSON.stringify(bad.model.getState()).includes('PRIVADO'), false); bad.model.dispose()
  const conflict = setup({ create: async () => { throw new ApiError('http', 409) } }); await ready(conflict.model); fill(conflict.model); await conflict.model.submit()
  assert.equal(conflict.model.getState().conflict, true); await conflict.model.submit(); assert.equal(conflict.calls.filter(call => call[0] === 'POST').length, 1)
  conflict.model.change('codigo', ' novo '); assert.equal(conflict.model.getState().conflict, false); await conflict.model.submit(); assert.equal(conflict.calls.filter(call => call[0] === 'POST').length, 2); conflict.model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) test('POST incerto bloqueia edição/reenvio até descarte: ' + error.kind + error.status, async () => {
  const { model, calls } = setup({ create: async () => { throw error } }); await ready(model); fill(model); await model.submit()
  assert.equal(model.getState().uncertain, true); model.change('nome', 'Outro'); await model.submit(); assert.equal(calls.filter(call => call[0] === 'POST').length, 1)
  model.prepareNew(); assert.deepEqual(model.getState().draft, { nome: '', descricao: '', codigo: '' }); assert.equal(model.getState().uncertain, false); assert.equal(calls.filter(call => call[0] === 'POST').length, 1); model.dispose()
})

for (const status of [401, 403, 404]) test('POST ' + status + ' limpa curso/rascunho e exige reabrir', async () => {
  const { model, calls } = setup({ create: async () => { throw new ApiError('http', status) } }); await ready(model); fill(model); await model.submit()
  assert.equal(model.getState().denied, true); assert.equal(model.getState().curso, null); assert.deepEqual(model.getState().draft, { nome: '', descricao: '', codigo: '' }); model.change('nome', 'Outro'); await model.submit()
  assert.equal(calls.filter(call => call[0] === 'POST').length, 1); model.dispose()
})

test('troca de conta/perfil e dispose abortam e ignoram resposta de POST antiga', async () => {
  for (const mode of ['account', 'profile', 'dispose']) {
    const pending = deferred(); let user = actor(); const { model, calls } = setup({ create: () => pending.promise, user: () => user }); await ready(model); fill(model)
    const sending = model.submit(), signal = calls.find(call => call[0] === 'POST')[3]
    if (mode === 'account') user = actor('ADMINISTRADOR', id(9)); if (mode === 'profile') user = actor('USUARIO')
    if (mode === 'dispose') model.dispose(); else await ready(model)
    pending.resolve({ id: disciplineId }); await sending; assert.equal(signal.aborted, true); assert.equal(model.getState().savedId, '')
    if (mode === 'profile') assert.equal(model.getState().denied, true); model.dispose()
  }
})
