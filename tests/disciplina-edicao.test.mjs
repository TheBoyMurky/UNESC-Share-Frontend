import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createDisciplinaEdicaoService } from '../src/features/disciplina/disciplina-edicao-service.ts'
import { createDisciplinaEdicaoModel } from '../src/features/disciplina/disciplina-edicao-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const institutionId = id(1), courseId = id(2), disciplineId = id(3)
const institution = { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }, course = { id: courseId, nome: 'Ciência da Computação', descricao: null, instituicaoId: institutionId }
const discipline = { id: disciplineId, nome: 'Algoritmos e Programação', descricao: 'Descrição original', codigo: 'CCO001', cursoId: courseId }
const actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
const draft = () => ({ nome: '  Algoritmos atualizados  ', descricao: '   ', codigo: ' cco002 ' })
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)) }

test('service GET/PUT por UUID usa curso fixo e payload completo normalizado', async () => {
  const calls = [], service = createDisciplinaEdicaoService(async (...args) => {
    calls.push(args); return args[1]?.method === 'PUT' ? { id: disciplineId, nome: 'Algoritmos atualizados', descricao: null, codigo: 'CCO002', cursoId: courseId, extra: 'PRIVADO' } : { ...discipline, extra: 'PRIVADO' }
  })
  assert.deepEqual(await service.detail(disciplineId.toUpperCase(), courseId), discipline)
  assert.deepEqual(await service.update(disciplineId, courseId, draft()), { id: disciplineId })
  assert.deepEqual(calls, [
    [`/disciplinas/${disciplineId}`, { signal: undefined }],
    [`/disciplinas/${disciplineId}`, { method: 'PUT', json: { nome: 'Algoritmos atualizados', descricao: null, codigo: 'CCO002', cursoId: courseId }, signal: undefined }],
  ])
})

test('service recusa UUID/payload inválido sem HTTP e DTO divergente', async () => {
  let calls = 0; const service = createDisciplinaEdicaoService(async () => { calls++; return discipline })
  await assert.rejects(service.detail('ruim', courseId), TypeError); await assert.rejects(service.detail(disciplineId, 'ruim'), TypeError)
  for (const value of [
    { nome: '', descricao: '', codigo: 'A' }, { nome: 'x'.repeat(151), descricao: '', codigo: 'A' },
    { nome: 'Nome', descricao: 'x'.repeat(1001), codigo: 'A' }, { nome: 'Nome\u0000', descricao: '', codigo: 'A' },
    { nome: 'Nome', descricao: '', codigo: '' }, { nome: 'Nome', descricao: '', codigo: 'x'.repeat(31) },
  ]) await assert.rejects(service.update(disciplineId, courseId, value), TypeError)
  assert.equal(calls, 0)
  for (const dto of [
    { ...discipline, id: id(9) }, { ...discipline, nome: 'Divergente' }, { ...discipline, descricao: null },
    { ...discipline, codigo: 'OUTRO' }, { ...discipline, cursoId: id(9) },
  ]) await assert.rejects(createDisciplinaEdicaoService(async () => dto).update(disciplineId, courseId, draft()), error => error instanceof ApiError && error.kind === 'protocol')
  await assert.rejects(createDisciplinaEdicaoService(async () => ({ ...discipline, id: id(9) })).detail(disciplineId, courseId), ApiError)
})

function setup({ detail = async () => discipline, update = async () => ({ id: disciplineId }), courseDetail = async () => course, institutionDetail = async () => institution, user = () => actor() } = {}) {
  const calls = [], service = {
    detail: (...args) => { calls.push(['GET-DISCIPLINE', ...args]); return detail(...args) },
    update: (...args) => { calls.push(['PUT', ...args]); return update(...args) },
  }
  const model = createDisciplinaEdicaoModel(service,
    { detail: (...args) => { calls.push(['GET-COURSE', ...args]); return courseDetail(...args) } },
    { detail: (...args) => { calls.push(['GET-INSTITUTION', ...args]); return institutionDetail(...args) } }, user)
  return { model, calls }
}
async function ready(model) { model.initialize(institutionId, courseId, disciplineId); await tick() }

test('modelo confirma vínculo dos três recursos e carrega campos atuais', async () => {
  const { model, calls } = setup(); await ready(model)
  assert.deepEqual(new Set(calls.map(call => call[0])), new Set(['GET-DISCIPLINE', 'GET-COURSE', 'GET-INSTITUTION']))
  assert.deepEqual(model.getState().draft, { nome: discipline.nome, descricao: discipline.descricao, codigo: discipline.codigo }); model.dispose()
})

test('rota inválida, curso divergente ou perfil sem ADMIN não permite editar', async () => {
  for (const user of [null, actor('USUARIO'), actor('MODERADOR')]) {
    const { model, calls } = setup({ user: () => user }); await ready(model); assert.equal(model.getState().denied, true); assert.equal(calls.length, 0); model.dispose()
  }
  const mismatch = setup({ courseDetail: async () => ({ ...course, instituicaoId: id(9) }) }); await ready(mismatch.model); assert.equal(mismatch.model.getState().disciplina, null); mismatch.model.dispose()
  const wrongCourse = setup({ detail: async () => ({ ...discipline, cursoId: id(9) }) }); await ready(wrongCourse.model); assert.equal(wrongCourse.model.getState().disciplina, null); wrongCourse.model.dispose()
  const invalid = setup(); invalid.model.initialize(institutionId, courseId, 'bad'); assert.equal(invalid.calls.length, 0); invalid.model.dispose()
})

test('não envia PUT inalterado; sucesso mantém contexto e exige atualização explícita', async () => {
  const { model, calls } = setup(); await ready(model); await model.submit(); assert.equal(calls.filter(call => call[0] === 'PUT').length, 0); assert.match(model.getState().error, /Altere ao menos/)
  for (const [key, value] of Object.entries(draft())) model.change(key, value)
  await model.submit(); assert.equal(model.getState().saved, true); assert.equal(calls.filter(call => call[0] === 'PUT').length, 1); assert.deepEqual(calls.find(call => call[0] === 'PUT').slice(1, 3), [disciplineId, courseId])
  model.change('nome', 'Outro'); await model.submit(); assert.equal(calls.filter(call => call[0] === 'PUT').length, 1)
  await model.reload(); assert.equal(model.getState().saved, false); assert.equal(model.getState().draft.nome, discipline.nome); model.dispose()
})

test('400 preserva draft; mensagens da API não são exibidas', async () => {
  const { model } = setup({ update: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO' }) } }); await ready(model)
  for (const [key, value] of Object.entries(draft())) model.change(key, value); await model.submit()
  assert.deepEqual(model.getState().draft, draft()); assert.ok(model.getState().fields.codigo); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); model.dispose()
})

test('409 bloqueia escrita até GET explícito que repovoa os dados atuais', async () => {
  let loads = 0; const { model, calls } = setup({ detail: async () => (++loads === 1 ? discipline : { ...discipline, nome: 'Nome atual' }), update: async () => { throw new ApiError('http', 409) } })
  await ready(model); model.change('codigo', 'CCO002'); await model.submit(); assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(calls.filter(call => call[0] === 'PUT').length, 1)
  await model.reload(); assert.equal(model.getState().conflict, false); assert.equal(model.getState().draft.nome, 'Nome atual'); model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) test('resultado PUT incerto exige GET antes de nova alteração: ' + error.kind + error.status, async () => {
  let puts = 0; const { model, calls } = setup({ update: async () => { puts++; throw error } }); await ready(model); model.change('codigo', 'CCO002'); await model.submit()
  assert.equal(model.getState().uncertain, true); model.change('nome', 'Outro'); await model.submit(); assert.equal(puts, 1)
  await model.reload(); assert.equal(model.getState().uncertain, false); assert.deepEqual(model.getState().draft, { nome: discipline.nome, descricao: discipline.descricao, codigo: discipline.codigo }); assert.equal(calls.filter(call => call[0] === 'GET-DISCIPLINE').length, 2); model.dispose()
})

for (const status of [401, 403, 404]) test('PUT ' + status + ' limpa alvo e exige reabrir a edição', async () => {
  const { model } = setup({ update: async () => { throw new ApiError('http', status) } }); await ready(model); model.change('codigo', 'CCO002'); await model.submit()
  assert.equal(model.getState().denied, true); assert.equal(model.getState().disciplina, null); assert.deepEqual(model.getState().draft, { nome: '', descricao: '', codigo: '' }); model.dispose()
})

test('erro inicial GET permite retry explícito', async () => {
  let gets = 0; const { model } = setup({ detail: async () => { if (++gets === 1) throw new ApiError('network'); return discipline } }); await ready(model)
  assert.match(model.getState().error, /consultar/); await model.reload(); assert.equal(model.getState().disciplina.id, disciplineId); model.dispose()
})

test('troca de conta/perfil/dispose aborta e ignora PUT antiga', async () => {
  for (const mode of ['account', 'profile', 'dispose']) {
    const pending = deferred(); let user = actor(); const { model, calls } = setup({ update: () => pending.promise, user: () => user }); await ready(model); model.change('codigo', 'CCO002')
    const sending = model.submit(), signal = calls.find(call => call[0] === 'PUT')[4]
    if (mode === 'account') user = actor('ADMINISTRADOR', id(9)); if (mode === 'profile') user = actor('USUARIO')
    if (mode === 'dispose') model.dispose(); else model.initialize(institutionId, courseId, disciplineId)
    assert.equal(signal.aborted, true); pending.resolve({ id: disciplineId }); await sending; assert.equal(model.getState().saved, false); if (mode === 'profile') assert.equal(model.getState().denied, true); model.dispose()
  }
})
