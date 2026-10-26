import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createCategoriaExclusaoService } from '../src/features/categoria/categoria-exclusao-service.ts'
import { createCategoriaExclusaoModel } from '../src/features/categoria/categoria-exclusao-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const uuid = id(1), categoria = { id: uuid, nome: 'Categoria de teste', descricao: 'Descrição de teste' }, actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
function setup({ load = async () => categoria, remove = async () => {}, user = () => actor() } = {}) {
  const calls = [], model = createCategoriaExclusaoModel({ load: (...args) => { calls.push(['GET', ...args]); return load(...args) }, remove: (...args) => { calls.push(['DELETE', ...args]); return remove(...args) } }, user)
  return { model, calls }
}
async function ready(model, idValue = uuid) { await model.load(idValue) }

test('service consulta DTO da categoria e DELETE usa somente UUID sem corpo', async () => {
  const calls = [], service = createCategoriaExclusaoService(async (...args) => { calls.push(['GET', ...args]); return { ...categoria, materiais: ['EXTRA'] } }, async (...args) => { calls.push(['DELETE', ...args]) })
  assert.deepEqual(await service.load(uuid.toUpperCase()), categoria)
  await service.remove(uuid.toUpperCase())
  assert.deepEqual(calls, [['GET', `/categorias/${uuid}`, { signal: undefined }], ['DELETE', `/categorias/${uuid}`, { signal: undefined }]])
  let deletes = 0; await assert.rejects(createCategoriaExclusaoService(() => assert.fail('não deve consultar'), async () => { deletes++ }).remove('invalid'), TypeError); assert.equal(deletes, 0)
  await assert.rejects(createCategoriaExclusaoService(async () => categoria, async () => {}).load(id(9)), error => error instanceof ApiError && error.kind === 'protocol')
})

test('abrir consulta sem excluir; confirmação explícita e resposta do DELETE concluem', async () => {
  const { model, calls } = setup(); await ready(model); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 0)
  await model.submit(); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 0)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().deleted, true); assert.equal(model.getState().confirmed, false); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 1)
  model.setConfirmed(true); await model.submit(); assert.equal(calls.filter(call => call[0] === 'DELETE').length, 1); model.dispose()
})

test('409 não expõe detalhes e exige GET atual antes de nova confirmação', async () => {
  let deletes = 0; const { model, calls } = setup({ remove: async () => { deletes++; throw new ApiError('http', 409, { detail: 'MATERIAL_PRIVADO' }) } }); await ready(model)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().conflict, true); assert.equal(model.getState().confirmed, false); assert.equal(JSON.stringify(model.getState()).includes('MATERIAL_PRIVADO'), false)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1)
  await model.reload(); assert.equal(model.getState().conflict, false); assert.equal(model.getState().confirmed, false); assert.equal(calls.filter(call => call[0] === 'GET').length, 2)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 2); model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) test('resultado incerto exige GET e confirmação renovada: ' + error.kind + error.status, async () => {
  let deletes = 0; const { model, calls } = setup({ remove: async () => { deletes++; throw error } }); await ready(model)
  model.setConfirmed(true); await model.submit(); assert.equal(model.getState().uncertain, true); assert.equal(model.getState().confirmed, false); await model.submit(); assert.equal(deletes, 1)
  await model.reload(); assert.equal(model.getState().uncertain, false); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().deleted, false); assert.equal(calls.filter(call => call[0] === 'GET').length, 2)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 2); model.dispose()
})

test('GET 404 após resultado incerto não confirma exclusão nem libera outro DELETE', async () => {
  let gets = 0, deletes = 0; const { model } = setup({ load: async () => { if (++gets > 1) throw new ApiError('http', 404); return categoria }, remove: async () => { deletes++; throw new ApiError('network') } }); await ready(model)
  model.setConfirmed(true); await model.submit(); await model.reload(); assert.equal(model.getState().deleted, false); assert.equal(model.getState().unavailable, true); assert.equal(model.getState().categoria, null)
  model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1); model.dispose()
})

for (const status of [401, 403, 404]) test('GET ' + status + ' não oferece alvo para confirmação', async () => {
  const { model } = setup({ load: async () => { throw new ApiError('http', status) } }); await ready(model)
  if (status === 404) assert.equal(model.getState().unavailable, true); else assert.equal(model.getState().denied, true)
  assert.equal(model.getState().categoria, null); model.setConfirmed(true); await model.submit(); assert.equal(model.getState().confirmed, false); model.dispose()
})

for (const status of [401, 403]) test('DELETE ' + status + ' limpa o alvo sem declarar sucesso', async () => {
  const { model } = setup({ remove: async () => { throw new ApiError('http', status) } }); await ready(model); model.setConfirmed(true); await model.submit()
  assert.equal(model.getState().denied, true); assert.equal(model.getState().categoria, null); assert.equal(model.getState().deleted, false); model.dispose()
})

test('DELETE 404 não representa sucesso e descarta confirmação', async () => {
  let deletes = 0; const { model } = setup({ remove: async () => { deletes++; throw new ApiError('http', 404) } }); await ready(model); model.setConfirmed(true); await model.submit()
  assert.equal(model.getState().unavailable, true); assert.equal(model.getState().categoria, null); assert.equal(model.getState().deleted, false); model.setConfirmed(true); await model.submit(); assert.equal(deletes, 1); model.dispose()
})

test('mudança de conta/perfil, nova rota ou dispose abortam DELETE atrasado e ignoram resposta', async () => {
  for (const mode of ['account', 'profile', 'route', 'dispose']) {
    const pending = deferred(); let user = actor(), count = 0; const { model, calls } = setup({ remove: () => pending.promise, load: async key => ({ ...categoria, id: key }), user: () => user }); await ready(model); model.setConfirmed(true); const sending = model.submit(); const signal = calls.find(call => call[0] === 'DELETE')[2]
    if (mode === 'account') user = actor('ADMINISTRADOR', id(9)); if (mode === 'profile') user = actor('MODERADOR')
    if (mode === 'dispose') model.dispose(); else await model.load(mode === 'route' ? id(2) : uuid)
    assert.equal(signal.aborted, true); pending.resolve(); await sending; assert.equal(model.getState().deleted, false)
    if (mode === 'profile') assert.equal(model.getState().denied, true)
    if (mode === 'route') assert.equal(model.getState().id, id(2))
    model.dispose()
  }
})
