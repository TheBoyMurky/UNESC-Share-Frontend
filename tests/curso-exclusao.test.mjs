import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createCursoExclusaoService } from '../src/features/curso/curso-exclusao-service.ts'
import { createCursoExclusaoModel } from '../src/features/curso/curso-exclusao-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const institutionId = id(1), courseId = id(2), actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
const course = { id: courseId, nome: 'Curso de teste', descricao: null, instituicaoId: institutionId }, institution = { id: institutionId, nome: 'UNESC', sigla: 'UNESC' }
function setup({ load = async () => ({ curso: course, instituicao: institution }), remove = async () => {}, user = () => actor() } = {}) {
  const calls = [], model = createCursoExclusaoModel({ load: (...args) => { calls.push(['GET', ...args]); return load(...args) }, remove: (...args) => { calls.push(['DELETE', ...args]); return remove(...args) } }, user)
  return { model, calls }
}
async function ready(model, parent = institutionId, idValue = courseId) { await model.load(parent, idValue) }

test('service consulta curso/instituição e DELETE só pelo UUID sem corpo', async () => {
  const calls = [], service = createCursoExclusaoService(async (...args) => { calls.push(['GET', ...args]); return args[0].startsWith('/cursos/') ? { ...course, disciplinas: ['EXTRA'] } : { ...institution, cursos: ['EXTRA'] } }, async (...args) => { calls.push(['DELETE', ...args]) })
  assert.deepEqual(await service.load(institutionId.toUpperCase(), courseId.toUpperCase()), { curso: course, instituicao: institution })
  await service.remove(courseId.toUpperCase())
  assert.deepEqual(calls, [['GET', `/cursos/${courseId}`, { signal: undefined }], ['GET', `/instituicoes/${institutionId}`, { signal: undefined }], ['DELETE', `/cursos/${courseId}`, { signal: undefined }]])
  let deletes = 0; await assert.rejects(createCursoExclusaoService(() => assert.fail('não deve consultar'), async () => { deletes++ }).remove('invalid'), TypeError); assert.equal(deletes, 0)
  await assert.rejects(createCursoExclusaoService(async () => course, async () => {}).load(id(9), courseId), error => error instanceof ApiError && error.kind === 'protocol')
})

test('abrir não exclui; confirmação explícita exige 204 confirmado pelo helper', async () => {
  const { model, calls } = setup(); await ready(model); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 0)
  await model.submit(); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 0)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().deleted, true); assert.equal(model.getState().confirmed, false); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 1)
  model.setConfirmed(true); await model.submit(); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 1); model.dispose()
})

test('409 informa a dependência sem inferir qual e exige GET antes de nova confirmação', async () => {
  let deletes = 0; const { model, calls } = setup({ remove: async () => { deletes++; throw new ApiError('http', 409, { detail: 'PRIVADO' }) } }); await ready(model)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().conflict, true); assert.equal(model.getState().confirmed, false); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1); await model.reload(); assert.equal(model.getState().conflict, false); assert.equal(model.getState().confirmed, false); assert.equal(calls.filter(call => call[0] === 'GET').length, 2)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 2); model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) test('resultado incerto exige GET e nova confirmação: ' + error.kind + error.status, async () => {
  let deletes = 0; const { model, calls } = setup({ remove: async () => { deletes++; throw error } }); await ready(model)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().uncertain, true); assert.equal(model.getState().confirmed, false); await model.submit(); assert.equal(deletes, 1)
  await model.reload(); assert.equal(model.getState().uncertain, false); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().deleted, false); assert.equal(calls.filter(call => call[0] === 'GET').length, 2)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 2); model.dispose()
})

test('GET 404 após resultado incerto não confirma sucesso nem permite novo DELETE', async () => {
  let gets = 0, deletes = 0; const { model } = setup({ load: async () => { if (++gets > 1) throw new ApiError('http', 404); return { curso: course, instituicao: institution } }, remove: async () => { deletes++; throw new ApiError('network') } }); await ready(model)
  assert.ok(model.getState().curso, JSON.stringify(model.getState())); model.setConfirmed(true); assert.equal(model.getState().confirmed, true); await model.submit(); assert.equal(deletes, 1); await model.reload(); assert.equal(model.getState().deleted, false); assert.equal(model.getState().unavailable, true); assert.equal(model.getState().curso, null)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1); model.dispose()
})

for (const status of [401, 403, 404]) test('GET ' + status + ' não oferece confirmação para curso indisponível/sem acesso', async () => {
  const { model } = setup({ load: async () => { throw new ApiError('http', status) } }); await ready(model)
  if (status === 404) assert.equal(model.getState().unavailable, true); else assert.equal(model.getState().denied, true)
  assert.equal(model.getState().curso, null); model.setConfirmed(true); await model.submit(); assert.equal(model.getState().confirmed, false); model.dispose()
})

for (const status of [401, 403]) test('DELETE ' + status + ' limpa alvo e não declara exclusão', async () => {
  const { model } = setup({ remove: async () => { throw new ApiError('http', status) } }); await ready(model); model.setConfirmed(true); await model.submit()
  assert.equal(model.getState().denied, true); assert.equal(model.getState().curso, null); assert.equal(model.getState().deleted, false); model.dispose()
})

test('DELETE 404 não é apresentado como sucesso nem reaproveita confirmação', async () => {
  let deletes = 0; const { model } = setup({ remove: async () => { deletes++; throw new ApiError('http', 404) } }); await ready(model); model.setConfirmed(true); await model.submit()
  assert.equal(model.getState().unavailable, true); assert.equal(model.getState().curso, null); assert.equal(model.getState().deleted, false); model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1); model.dispose()
})

test('conta/perfil/dispose abortam DELETE atrasado e descartam resposta', async () => {
  for (const mode of ['account', 'profile', 'dispose']) {
    const pending = deferred(); let user = actor(); const { model, calls } = setup({ remove: () => pending.promise, user: () => user }); await ready(model); model.setConfirmed(true); const sending = model.submit(); const signal = calls.find(call => call[0] === 'DELETE')[2]
    if (mode === 'account') user = actor('ADMINISTRADOR', id(9)); if (mode === 'profile') user = actor('MODERADOR')
    if (mode === 'dispose') model.dispose(); else model.load(institutionId, courseId)
    assert.equal(signal.aborted, true); pending.resolve(); await sending; assert.equal(model.getState().deleted, false); if (mode === 'profile') assert.equal(model.getState().denied, true); model.dispose()
  }
})
