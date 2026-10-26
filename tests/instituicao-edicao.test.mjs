import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createInstituicaoEdicaoService } from '../src/features/instituicao/instituicao-cadastro-service.ts'
import { createInstituicaoEdicaoModel } from '../src/features/instituicao/instituicao-edicao-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const uuid = id(1), actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
const original = { id: uuid, nome: 'Universidade Exemplo', sigla: 'UEX' }
function setup({ detail = async () => original, update = async (_id, data) => ({ id: uuid, ...data }), user = () => actor() } = {}) {
  const calls = [], model = createInstituicaoEdicaoModel({ detail: (...args) => { calls.push(['GET', ...args]); return detail(...args) }, update: (...args) => { calls.push(['PUT', ...args]); return update(...args) } }, user)
  return { model, calls }
}
async function ready(model, idValue = uuid) { model.initialize(idValue); await new Promise(resolve => setImmediate(resolve)) }

test('service edicao GET porUUID e PUT somente nome/sigla normalizados, resposta vinculada ao UUID', async () => {
  const calls = [], service = createInstituicaoEdicaoService(async (...args) => { calls.push(args); const [, options] = args; return options?.method === 'PUT' ? { id: uuid, nome: 'Universidade Nova', sigla: 'UN' } : original })
  assert.deepEqual(await service.detail(uuid.toUpperCase()), original)
  assert.deepEqual(await service.update(uuid, { nome: ' Universidade Nova ', sigla: ' un ' }), { id: uuid })
  assert.deepEqual(calls, [[`/instituicoes/${uuid}`, { signal: undefined }], [`/instituicoes/${uuid}`, { method: 'PUT', json: { nome: 'Universidade Nova', sigla: 'UN' }, signal: undefined }]])
  for (const response of [{ ...original, id: id(2) }, { ...original, nome: 'Outra' }, { ...original, sigla: 'OUTRA' }]) await assert.rejects(createInstituicaoEdicaoService(async () => response).update(uuid, { nome: 'Universidade Exemplo', sigla: 'UEX' }), error => error instanceof ApiError && error.kind === 'protocol')
  await assert.rejects(service.update('bad-id', { nome: 'x', sigla: 'x' }), TypeError)
})

test('GET inicializa draft; PUT so se alterado, salva e bloqueia repeticao', async () => {
  const { model, calls } = setup(); await ready(model); assert.deepEqual(model.getState().draft, { nome: original.nome, sigla: original.sigla })
  await model.submit(); assert.equal(calls.filter(call => call[0] === 'PUT').length, 0); assert.match(model.getState().error, /Altere ao menos/)
  model.change('nome', ' Universidade Nova '); model.change('sigla', ' un '); await model.submit()
  assert.deepEqual(calls.find(call => call[0] === 'PUT').slice(1, 3), [uuid, { nome: 'Universidade Nova', sigla: 'UN' }]); assert.equal(model.getState().saved, true)
  model.change('nome', 'Outra'); await model.submit(); assert.equal(calls.filter(call => call[0] === 'PUT').length, 1); model.dispose()
})

test('GET UUID invalido nao chama servico e DTO de outro registro e rejeitado', async () => {
  const { model, calls } = setup({ detail: async () => ({ ...original, id: id(2) }) }); await ready(model, 'nao-uuid'); assert.equal(calls.length, 0); assert.equal(model.getState().denied, true); model.dispose()
  const other = setup({ detail: async () => ({ ...original, id: id(2) }) }); await ready(other.model); assert.equal(other.model.getState().loading, false); assert.match(other.model.getState().error, /consultar/); other.model.dispose()
})

test('403/404 limpam campos e bloqueiam instancia; 401 usa erro seguro do adaptador', async () => {
  for (const status of [401, 403, 404]) { const { model } = setup({ detail: async () => { throw new ApiError('http', status) } }); await ready(model); assert.equal(model.getState().denied, true); assert.deepEqual(model.getState().draft, { nome: '', sigla: '' }); model.dispose() }
})

test('400 preserva draft sem eco; 409 bloqueia ate GET atual bem-sucedido', async () => {
  const { model, calls } = setup({ update: async () => { throw new ApiError('http', 409, { detail: 'PRIVADO' }) } }); await ready(model); model.change('nome', 'Outra'); model.change('sigla', 'OU'); await model.submit()
  assert.equal(model.getState().conflict, true); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); assert.equal(calls.filter(c => c[0] === 'PUT').length, 1)
  await model.reload(); assert.deepEqual(model.getState().draft, { nome: original.nome, sigla: original.sigla }); assert.equal(model.getState().conflict, false); model.dispose()
  const bad = setup({ update: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO' }) } }); await ready(bad.model); bad.model.change('nome', 'Outra'); bad.model.change('sigla', 'OU'); await bad.model.submit(); assert.ok(bad.model.getState().fields.nome); assert.equal(bad.model.getState().draft.nome, 'Outra'); assert.equal(JSON.stringify(bad.model.getState()).includes('PRIVADO'), false); bad.model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) test('resultado PUT incerto bloqueia nova tentativa ate GET fresco: ' + error.kind + error.status, async () => {
  let updates = 0; const { model, calls } = setup({ update: async () => { updates++; throw error } }); await ready(model); model.change('nome', 'Universidade Nova'); await model.submit(); assert.equal(model.getState().uncertain, true); model.change('nome', 'Outra'); await model.submit(); assert.equal(updates, 1)
  await model.reload(); assert.equal(model.getState().uncertain, false); assert.deepEqual(model.getState().draft, { nome: original.nome, sigla: original.sigla }); assert.equal(calls.filter(c => c[0] === 'GET').length, 2); model.dispose()
})

for (const change of ['conta', 'perfil', 'dispose']) test('resposta GET antiga descartada depois de ' + change, async () => {
  const first = deferred(), second = deferred(); let requestCount = 0, user = actor(); const { model, calls } = setup({ detail: () => (++requestCount === 1 ? first.promise : second.promise), user: () => user }); model.initialize(uuid); const signal = calls[0][2]
  if (change === 'conta') user = actor('ADMINISTRADOR', id(9)); if (change === 'perfil') user = actor('MODERADOR')
  if (change === 'dispose') model.dispose(); else model.initialize(uuid)
  assert.equal(signal.aborted, true)
  if (change === 'conta') { second.resolve(original); await new Promise(resolve => setImmediate(resolve)); first.resolve({ ...original, nome: 'Resposta antiga' }); await new Promise(resolve => setImmediate(resolve)); assert.equal(model.getState().draft.nome, original.nome) }
  else if (change === 'perfil') { first.resolve({ ...original, nome: 'Resposta antiga' }); await new Promise(resolve => setImmediate(resolve)); assert.equal(model.getState().denied, true); assert.equal(model.getState().draft.nome, '') }
  else first.resolve({ ...original, nome: 'Resposta antiga' })
  model.dispose()
})
