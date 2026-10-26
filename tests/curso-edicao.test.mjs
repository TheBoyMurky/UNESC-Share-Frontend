import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createCursoEdicaoService } from '../src/features/curso/curso-edicao-service.ts'
import { createCursoEdicaoModel } from '../src/features/curso/curso-edicao-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const institutionId = id(1), courseId = id(2), actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
const course = { id: courseId, nome: 'Curso original', descricao: 'Descrição original', instituicaoId: institutionId }
const institution = { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }
const draft = () => ({ nome: '  Curso atualizado  ', descricao: '   ' })
function setup({ detail = async () => course, update = async (_id, _institutionId, value) => ({ id: courseId, ...value }), institutionDetail = async () => institution, user = () => actor() } = {}) {
  const calls = [], model = createCursoEdicaoModel({ detail: (...args) => { calls.push(['GET-CURSO', ...args]); return detail(...args) }, update: (...args) => { calls.push(['PUT', ...args]); return update(...args) } }, { detail: (...args) => { calls.push(['GET-INSTITUICAO', ...args]); return institutionDetail(...args) } }, user)
  return { model, calls }
}
async function ready(model, parent = institutionId, idValue = courseId) { model.initialize(parent, idValue); await new Promise(resolve => setImmediate(resolve)) }

test('service GET UUID e PUT completo preservam instituicaoId e retornam apenas identidade confirmada', async () => {
  const calls = [], service = createCursoEdicaoService(async (...args) => { calls.push(args); const [, options] = args; return options?.method === 'PUT' ? { id: courseId, nome: 'Curso atualizado', descricao: null, instituicaoId: institutionId, disciplinas: ['PRIVADO'] } : { ...course, email: 'PRIVADO' } })
  assert.deepEqual(await service.detail(courseId.toUpperCase()), course)
  assert.deepEqual(await service.update(courseId, institutionId, draft()), { id: courseId })
  assert.deepEqual(calls, [[`/cursos/${courseId}`, { signal: undefined }], [`/cursos/${courseId}`, { method: 'PUT', json: { nome: 'Curso atualizado', descricao: null, instituicaoId: institutionId }, signal: undefined }]])
})

test('service recusa UUID ou payload invalido sem HTTP e rejeita resposta divergente', async () => {
  let calls = 0; const service = createCursoEdicaoService(async () => { calls++; return course })
  await assert.rejects(service.detail('invalid'), TypeError)
  for (const value of [{ nome: '', descricao: '' }, { nome: 'x'.repeat(151), descricao: '' }, { nome: 'Nome', descricao: 'x'.repeat(1001) }, { nome: 'Nome\u0000', descricao: '' }]) await assert.rejects(service.update(courseId, institutionId, value), TypeError)
  assert.equal(calls, 0)
  for (const response of [{ ...course, id: id(9) }, { ...course, nome: 'Divergente' }, { ...course, descricao: 'Divergente' }, { ...course, instituicaoId: id(9) }]) await assert.rejects(createCursoEdicaoService(async () => response).update(courseId, institutionId, draft()), error => error instanceof ApiError && error.kind === 'protocol')
})

test('modelo consulta curso e instituição, confere vínculo e carrega rascunho', async () => {
  const { model, calls } = setup(); await ready(model)
  assert.deepEqual(calls.map(call => call[0]), ['GET-CURSO', 'GET-INSTITUICAO'])
  assert.deepEqual(model.getState().draft, { nome: course.nome, descricao: course.descricao }); assert.equal(model.getState().instituicao.nome, 'UNESC'); model.dispose()
  const mismatched = setup({ detail: async () => ({ ...course, instituicaoId: id(9) }) }); await ready(mismatched.model); assert.equal(mismatched.model.getState().curso, null); assert.match(mismatched.model.getState().error, /consultar/); mismatched.model.dispose()
})

test('rota inválida ou perfil sem ADMIN não consulta registros', async () => {
  for (const user of [null, actor('USUARIO'), actor('MODERADOR')]) { const { model, calls } = setup({ user: () => user }); await ready(model); assert.equal(model.getState().denied, true); assert.equal(calls.length, 0); model.dispose() }
  const bad = setup(); await ready(bad.model, 'invalid'); assert.equal(bad.calls.length, 0); assert.equal(bad.model.getState().unavailable, true); bad.model.dispose()
})

test('não envia PUT inalterado; sucesso guarda o curso e bloqueia segunda edição até atualizar', async () => {
  const { model, calls } = setup(); await ready(model); await model.submit(); assert.equal(calls.filter(call => call[0] === 'PUT').length, 0); assert.match(model.getState().error, /Altere ao menos/)
  model.change('nome', draft().nome); model.change('descricao', draft().descricao); await model.submit()
  assert.equal(model.getState().saved, true); assert.equal(calls.filter(call => call[0] === 'PUT').length, 1); assert.deepEqual(calls.find(call => call[0] === 'PUT').slice(1, 3), [courseId, institutionId])
  model.change('nome', 'Outro'); await model.submit(); assert.equal(calls.filter(call => call[0] === 'PUT').length, 1); model.dispose()
})

test('400 preserva draft e nao expoe corpo da API', async () => {
  const { model } = setup({ update: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO' }) } }); await ready(model); model.change('nome', draft().nome); await model.submit()
  assert.equal(model.getState().draft.nome, draft().nome); assert.ok(model.getState().fields.nome); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); model.dispose()
})

test('409 bloqueia formulário até GET explícito de estado atual', async () => {
  let count = 0; const { model, calls } = setup({ update: async () => { throw new ApiError('http', 409) }, detail: async () => (++count === 1 ? course : { ...course, nome: 'Nome atual' }) })
  await ready(model); model.change('nome', draft().nome); await model.submit(); assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(calls.filter(call => call[0] === 'PUT').length, 1)
  await model.reload(); assert.equal(model.getState().conflict, false); assert.equal(model.getState().draft.nome, 'Nome atual'); model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) test('resultado PUT incerto exige GET antes de nova preparação: ' + error.kind + error.status, async () => {
  let puts = 0; const { model, calls } = setup({ update: async () => { puts++; throw error } }); await ready(model); model.change('nome', draft().nome); await model.submit(); assert.equal(model.getState().uncertain, true)
  model.change('nome', 'Outro'); await model.submit(); assert.equal(puts, 1); await model.reload(); assert.equal(model.getState().uncertain, false); assert.deepEqual(model.getState().draft, { nome: course.nome, descricao: course.descricao }); assert.equal(calls.filter(call => call[0] === 'GET-CURSO').length, 2); model.dispose()
})

for (const status of [401, 403, 404]) test('GET/PUT ' + status + ' limpa edição e bloqueia instância', async () => {
  const { model } = setup({ update: async () => { throw new ApiError('http', status) } }); await ready(model); model.change('nome', draft().nome); await model.submit(); assert.equal(model.getState().denied, true); assert.equal(model.getState().curso, null); assert.deepEqual(model.getState().draft, { nome: '', descricao: '' }); model.dispose()
})

test('falha GET inicial pode ser repetida; sucesso da edição requer atualização explícita', async () => {
  let get = 0; const { model, calls } = setup({ detail: async () => { get++; if (get === 1) throw new ApiError('network'); return course } }); await ready(model)
  assert.match(model.getState().error, /consultar o curso/); await model.reload(); assert.equal(model.getState().curso.id, courseId); model.change('nome', draft().nome); await model.submit()
  assert.equal(model.getState().saved, true); await model.reload(); assert.equal(model.getState().saved, false); assert.equal(calls.filter(call => call[0] === 'GET-CURSO').length, 3); model.dispose()
})

test('conta/perfil/dispose abortam e ignoram PUT atrasado', async () => {
  for (const mode of ['account', 'profile', 'dispose']) {
    const pending = deferred(); let user = actor(); const { model, calls } = setup({ update: () => pending.promise, user: () => user }); await ready(model); model.change('nome', draft().nome); const sending = model.submit(); const signal = calls.find(call => call[0] === 'PUT')[4]
    if (mode === 'account') user = actor('ADMINISTRADOR', id(9)); if (mode === 'profile') user = actor('USUARIO')
    if (mode === 'dispose') model.dispose(); else model.initialize(institutionId, courseId)
    assert.equal(signal.aborted, true); pending.resolve({ id: courseId }); await sending; assert.equal(model.getState().saved, false); if (mode === 'profile') assert.equal(model.getState().denied, true); model.dispose()
  }
})
