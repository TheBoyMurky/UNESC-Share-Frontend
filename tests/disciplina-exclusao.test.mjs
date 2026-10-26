import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createDisciplinaExclusaoService } from '../src/features/disciplina/disciplina-exclusao-service.ts'
import { createDisciplinaExclusaoModel } from '../src/features/disciplina/disciplina-exclusao-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const institutionId = id(1), courseId = id(2), disciplineId = id(3)
const institution = { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }, course = { id: courseId, nome: 'Ciência da Computação', descricao: null, instituicaoId: institutionId }
const discipline = { id: disciplineId, nome: 'Algoritmos e Programação', descricao: null, codigo: 'CCO001', cursoId: courseId }
const actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })

test('service GET confere os três vínculos e DELETE usa somente o UUID da rota', async () => {
  const calls = [], service = createDisciplinaExclusaoService(async (...args) => {
    calls.push(['GET', ...args]);
    if (args[0].startsWith('/instituicoes/')) return { ...institution, cursos: ['PRIVADO'] }
    if (args[0].startsWith('/cursos/')) return { ...course, disciplinas: ['PRIVADO'] }
    return { ...discipline, materiais: ['PRIVADO'] }
  }, async (...args) => calls.push(['DELETE', ...args]))
  assert.deepEqual(await service.load(institutionId.toUpperCase(), courseId.toUpperCase(), disciplineId.toUpperCase()), { instituicao: institution, curso: course, disciplina: discipline })
  await service.remove(disciplineId.toUpperCase())
  assert.deepEqual(calls, [
    ['GET', `/instituicoes/${institutionId}`, { signal: undefined }], ['GET', `/cursos/${courseId}`, { signal: undefined }], ['GET', `/disciplinas/${disciplineId}`, { signal: undefined }],
    ['DELETE', `/disciplinas/${disciplineId}`, { signal: undefined }],
  ])
  let deletes = 0; await assert.rejects(createDisciplinaExclusaoService(async () => assert.fail('não deve consultar'), async () => { deletes++ }).remove('inválido'), TypeError); assert.equal(deletes, 0)
  for (const mismatch of [
    [id(9), courseId, disciplineId, institution, course, discipline],
    [institutionId, id(9), disciplineId, institution, course, discipline],
    [institutionId, courseId, id(9), institution, course, discipline],
  ]) {
    const [i, c, d, instDto, courseDto, disciplineDto] = mismatch
    await assert.rejects(createDisciplinaExclusaoService(async path => path.startsWith('/instituicoes/') ? instDto : path.startsWith('/cursos/') ? courseDto : disciplineDto, async () => {}).load(i, c, d), ApiError)
  }
})

function setup({ load = async () => ({ instituicao: institution, curso: course, disciplina: discipline }), remove = async () => {}, user = () => actor() } = {}) {
  const calls = [], model = createDisciplinaExclusaoModel({
    load: (...args) => { calls.push(['GET', ...args]); return load(...args) },
    remove: (...args) => { calls.push(['DELETE', ...args]); return remove(...args) },
  }, user)
  return { model, calls }
}
async function ready(model, i = institutionId, c = courseId, d = disciplineId) { await model.load(i, c, d) }

test('abrir não exclui; confirmação explícita exige sucesso do helper204', async () => {
  const { model, calls } = setup(); await ready(model); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 0)
  await model.submit(); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 0)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().deleted, true); assert.equal(model.getState().confirmed, false)
  model.setConfirmed(true); await model.submit(); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 1); model.dispose()
})

test('409 informa dependência sem identificar material e exige GET antes de nova confirmação', async () => {
  let deletes = 0; const { model, calls } = setup({ remove: async () => { if (++deletes === 1) throw new ApiError('http', 409, { detail: 'PRIVADO' }) } }); await ready(model)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().conflict, true); assert.equal(model.getState().confirmed, false); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1); await model.reload(); assert.equal(model.getState().conflict, false); assert.equal(model.getState().confirmed, false)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 2); model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) test('resultado incerto exige GET e confirmação nova: ' + error.kind + error.status, async () => {
  let deletes = 0; const { model, calls } = setup({ remove: async () => { deletes++; throw error } }); await ready(model)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().uncertain, true); assert.equal(model.getState().confirmed, false); await model.submit(); assert.equal(deletes, 1)
  await model.reload(); assert.equal(model.getState().uncertain, false); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().deleted, false); assert.equal(calls.filter(call => call[0] === 'GET').length, 2)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 2); model.dispose()
})

test('GET404 após DELETE incerto não confirma sucesso nem libera novo DELETE', async () => {
  let loads = 0, deletes = 0; const { model } = setup({ load: async () => { if (++loads > 1) throw new ApiError('http', 404); return { instituicao: institution, curso: course, disciplina: discipline } }, remove: async () => { deletes++; throw new ApiError('network') } }); await ready(model)
  model.setConfirmed(true); await model.submit(); await model.reload(); assert.equal(model.getState().unavailable, true); assert.equal(model.getState().deleted, false); assert.equal(model.getState().disciplina, null)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1); model.dispose()
})

for (const status of [401, 403, 404]) test('GET ' + status + ' não carrega alvo para confirmar', async () => {
  const { model } = setup({ load: async () => { throw new ApiError('http', status) } }); await ready(model)
  if (status === 404) assert.equal(model.getState().unavailable, true); else assert.equal(model.getState().denied, true)
  assert.equal(model.getState().disciplina, null); model.setConfirmed(true); await model.submit(); assert.equal(model.getState().confirmed, false); model.dispose()
})

for (const status of [401, 403]) test('DELETE ' + status + ' limpa alvo e não declara exclusão', async () => {
  const { model } = setup({ remove: async () => { throw new ApiError('http', status) } }); await ready(model); model.setConfirmed(true); await model.submit()
  assert.equal(model.getState().denied, true); assert.equal(model.getState().disciplina, null); assert.equal(model.getState().deleted, false); model.dispose()
})

test('DELETE404 não é apresentado como sucesso nem reaproveita confirmação', async () => {
  let deletes = 0; const { model } = setup({ remove: async () => { deletes++; throw new ApiError('http', 404) } }); await ready(model); model.setConfirmed(true); await model.submit()
  assert.equal(model.getState().unavailable, true); assert.equal(model.getState().disciplina, null); assert.equal(model.getState().deleted, false); model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1); model.dispose()
})

test('troca de conta/perfil/dispose aborta DELETE antigo e descarta resposta', async () => {
  for (const mode of ['account', 'profile', 'dispose']) {
    const pending = deferred(); let user = actor(); const { model, calls } = setup({ remove: () => pending.promise, user: () => user }); await ready(model); model.setConfirmed(true)
    const sending = model.submit(), signal = calls.find(call => call[0] === 'DELETE')[2]
    if (mode === 'account') user = actor('ADMINISTRADOR', id(9)); if (mode === 'profile') user = actor('MODERADOR')
    if (mode === 'dispose') model.dispose(); else model.load(institutionId, courseId, disciplineId)
    assert.equal(signal.aborted, true); pending.resolve(); await sending; assert.equal(model.getState().deleted, false); if (mode === 'profile') assert.equal(model.getState().denied, true); model.dispose()
  }
})
