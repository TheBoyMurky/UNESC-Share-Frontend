import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createInstituicaoExclusaoService } from '../src/features/instituicao/instituicao-exclusao-service.ts'
import { createInstituicaoExclusaoModel } from '../src/features/instituicao/instituicao-exclusao-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const uuid = id(1), institution = { id: uuid, nome: 'Universidade Exemplo', sigla: 'UEX' }, actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
function setup({ load = async () => institution, remove = async () => {}, user = () => actor() } = {}) {
  const calls = [], model = createInstituicaoExclusaoModel({ load: (...args) => { calls.push(['GET', ...args]); return load(...args) }, remove: (...args) => { calls.push(['DELETE', ...args]); return remove(...args) } }, user)
  return { model, calls }
}
async function ready(model, idValue = uuid) { model.load(idValue); await new Promise(resolve => setImmediate(resolve)) }

test('service GET por UUID e DELETE sem corpo ligado ao mesmo UUID', async () => {
  const calls = [], service = createInstituicaoExclusaoService(async (...args) => { calls.push(['GET', ...args]); return { ...institution, cursos: ['EXTRA'] } }, async (...args) => { calls.push(['DELETE', ...args]) })
  assert.deepEqual(await service.load(uuid.toUpperCase()), institution)
  await service.remove(uuid.toUpperCase())
  assert.deepEqual(calls, [['GET', `/instituicoes/${uuid}`, { signal: undefined }], ['DELETE', `/instituicoes/${uuid}`, { signal: undefined }]])
  let requested = false; await assert.rejects(createInstituicaoExclusaoService(() => assert.fail(), async () => { requested = true }).remove('invalid'), TypeError); assert.equal(requested, false)
})

test('abertura consulta mas nao exclui; exige confirmacao e so sucesso da API conclui', async () => {
  const { model, calls } = setup(); await ready(model); assert.equal(calls.filter(c => c[0] === 'DELETE').length, 0)
  await model.submit(); assert.equal(calls.filter(c => c[0] === 'DELETE').length, 0)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().deleted, true); assert.equal(model.getState().confirmed, false); assert.equal(calls.filter(c => c[0] === 'DELETE').length, 1)
  model.setConfirmed(true); await model.submit(); assert.equal(calls.filter(c => c[0] === 'DELETE').length, 1); model.dispose()
})

test('409 informa conflito de dependencias/estado e obriga GET antes de nova confirmacao', async () => {
  let deletes = 0; const { model, calls } = setup({ remove: async () => { deletes++; throw new ApiError('http', 409, { detail: 'PRIVADO' }) } }); await ready(model)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().conflict, true); assert.equal(model.getState().confirmed, false); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1)
  await model.reload(); assert.equal(model.getState().conflict, false); assert.equal(model.getState().confirmed, false); assert.equal(calls.filter(c => c[0] === 'GET').length, 2)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 2); model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) test('resultado incerto bloqueia retry ate GET e nova confirmacao: ' + error.kind + error.status, async () => {
  let deletes = 0; const { model, calls } = setup({ remove: async () => { deletes++; throw error } }); await ready(model)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().uncertain, true); assert.equal(model.getState().confirmed, false); await model.submit(); assert.equal(deletes, 1)
  await model.reload(); assert.equal(model.getState().uncertain, false); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().deleted, false); assert.equal(calls.filter(c => c[0] === 'GET').length, 2)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 2); model.dispose()
})

test('GET 404 depois de resultado incerto nao e apresentado como sucesso nem permite novo DELETE', async () => {
  let gets = 0, deletes = 0; const { model } = setup({ load: async () => { if (++gets > 1) throw new ApiError('http', 404); return institution }, remove: async () => { deletes++; throw new ApiError('network') } }); await ready(model)
  model.setConfirmed(true); await model.submit(); await model.reload(); assert.equal(model.getState().deleted, false); assert.equal(model.getState().unavailable, true); assert.equal(model.getState().institution, null)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1); model.dispose()
})

for (const status of [401, 403]) test('GET ' + status + ' remove a tela de confirmacao e bloqueia a instancia', async () => {
  const { model } = setup({ load: async () => { throw new ApiError('http', status) } }); await ready(model)
  assert.equal(model.getState().denied, true); assert.equal(model.getState().institution, null); model.setConfirmed(true); assert.equal(model.getState().confirmed, false); model.dispose()
})
test('GET 404 nao oferece confirmacao para instituicao indisponivel', async () => {
  const { model } = setup({ load: async () => { throw new ApiError('http', 404) } }); await ready(model)
  assert.equal(model.getState().unavailable, true); assert.equal(model.getState().institution, null); model.setConfirmed(true); assert.equal(model.getState().confirmed, false); model.dispose()
})

for (const status of [401, 403, 404]) test('DELETE ' + status + ' nao apresenta exclusao confirmada', async () => {
  const { model } = setup(); await ready(model); model.setConfirmed(true)
  // O 404 é uma instituição que deixou de estar disponível; 401/403 retiram autorização.
  const local = createInstituicaoExclusaoModel({ load: async () => institution, remove: async () => { throw new ApiError('http', status) } }, () => actor())
  await ready(local); local.setConfirmed(true); await local.submit()
  if (status === 404) assert.equal(local.getState().deleted, false)
  else assert.equal(local.getState().denied, true)
  local.dispose(); model.dispose()
})

test('GET atrasado nao restaura alvo depois de trocar de conta ou perder perfil', async () => {
  for (const change of ['account', 'profile']) {
    const pending = deferred(); let user = actor(), count = 0; const { model, calls } = setup({ load: () => ++count === 1 ? pending.promise : Promise.resolve(institution), user: () => user }); model.load(uuid); const signal = calls[0][2]
    user = change === 'account' ? actor('ADMINISTRADOR', id(9)) : actor('MODERADOR'); model.load(uuid)
    assert.equal(signal.aborted, true); pending.resolve({ ...institution, nome: 'Resposta antiga' }); await new Promise(resolve => setImmediate(resolve))
    if (change === 'account') assert.equal(model.getState().institution.nome, institution.nome)
    else { assert.equal(model.getState().institution, null); assert.equal(model.getState().denied, true) }
    model.dispose()
  }
})
