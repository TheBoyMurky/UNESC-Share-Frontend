import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createCategoriaEdicaoService } from '../src/features/categoria/categoria-edicao-service.ts'
import { createCategoriaEdicaoModel } from '../src/features/categoria/categoria-edicao-model.ts'
import { deferred, id } from './catalog-fixtures.mjs'

const categoryId = id(1), original = { id: categoryId, nome: 'Livros', descricao: 'Descrição atual' }
const changed = { nome: 'Livros revisados', descricao: 'Descrição revisada' }
const actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
const input = () => ({ nome: '  Livros revisados  ', descricao: '  Descrição revisada  ' })

test('service consulta UUID e envia PUT completo nome/descricao normalizados sem extras', async () => {
  const calls = [], service = createCategoriaEdicaoService(async (...args) => {
    calls.push(args)
    return args[1]?.method === 'PUT' ? { id: categoryId, ...changed, materiais: ['PRIVADO'] } : { ...original, materiais: ['PRIVADO'] }
  })
  assert.deepEqual(await service.detail(categoryId.toUpperCase()), original)
  assert.deepEqual(await service.update(categoryId, input()), { id: categoryId })
  assert.deepEqual(calls, [
    [`/categorias/${categoryId}`, { signal: undefined }],
    [`/categorias/${categoryId}`, { method: 'PUT', json: changed, signal: undefined }],
  ])
})

test('service rejeita UUID/payload inválidos antes de HTTP e DTO divergente', async () => {
  let calls = 0; const service = createCategoriaEdicaoService(async () => { calls++; return original })
  await assert.rejects(service.detail('invalido'), TypeError)
  await assert.rejects(service.update('invalido', input()), TypeError)
  for (const value of [
    { nome: '', descricao: '' }, { nome: 'x'.repeat(81), descricao: '' }, { nome: 'N\u0000', descricao: '' },
    { nome: 'Nome', descricao: 'x'.repeat(501) }, { nome: 'Nome', descricao: 'x\u0000' },
  ]) await assert.rejects(service.update(categoryId, value), TypeError)
  assert.equal(calls, 0)
  for (const response of [
    { ...original, id: id(9) }, { ...original, nome: changed.nome }, { ...original, descricao: null },
  ]) await assert.rejects(createCategoriaEdicaoService(async () => response).update(categoryId, input()), error => error instanceof ApiError && error.kind === 'protocol')
  await assert.rejects(createCategoriaEdicaoService(async () => ({ ...original, id: id(9) })).detail(categoryId), ApiError)
})

function fixture({ detail, update, user = () => actor() } = {}) {
  const calls = []
  const service = {
    detail: async (...args) => { calls.push({ kind: 'GET', args }); return detail ? detail(...args) : original },
    update: async (...args) => { calls.push({ kind: 'PUT', args }); return update ? update(...args) : { id: categoryId } },
  }
  return { model: createCategoriaEdicaoModel(service, user), calls }
}
async function ready(model, id = categoryId) { model.initialize(id); await new Promise(resolve => setImmediate(resolve)) }

test('carrega detalhe por UUID e não envia PUT se os valores não mudaram', async () => {
  const { model, calls } = fixture(); await ready(model)
  assert.deepEqual(model.getState().draft, { nome: original.nome, descricao: original.descricao })
  await model.submit(); assert.equal(calls.filter(call => call.kind === 'PUT').length, 0); assert.match(model.getState().error, /Altere ao menos/)
  model.dispose()
})

test('validação local não trunca; edição envia apenas nome/descrição e sucesso pede consulta explícita', async () => {
  const { model, calls } = fixture(); await ready(model)
  model.change('nome', 'x'.repeat(81)); await model.submit(); assert.ok(model.getState().fields.nome); assert.equal(calls.filter(call => call.kind === 'PUT').length, 0)
  model.change('nome', input().nome); model.change('descricao', input().descricao); await model.submit()
  assert.equal(model.getState().saved, true); assert.deepEqual(calls.find(call => call.kind === 'PUT').args.slice(0, 2), [categoryId, input()])
  assert.equal(calls.filter(call => call.kind === 'GET').length, 1); await model.reload(); assert.equal(model.getState().saved, false); assert.equal(model.getState().draft.nome, original.nome); model.dispose()
})

test('somente ADMINISTRADOR carrega e edita', async () => {
  for (const user of [null, actor('USUARIO'), actor('MODERADOR'), actor('ADMINISTRADOR', 'invalido')]) {
    const { model, calls } = fixture({ user: () => user }); await ready(model)
    assert.equal(model.getState().denied, true); assert.equal(calls.length, 0); await model.submit(); assert.equal(calls.length, 0); model.dispose()
  }
})

test('400 preserva rascunho e não ecoa ProblemDetail', async () => {
  const { model } = fixture({ update: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO', errors: [{ message: 'PRIVADO' }] }) } }); await ready(model)
  model.change('nome', input().nome); await model.submit(); assert.equal(model.getState().draft.nome, input().nome); assert.ok(model.getState().fields.nome); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); model.dispose()
})

test('409 bloqueia edição até GET explícito que substitui draft pelos dados atuais', async () => {
  let reads = 0; const { model, calls } = fixture({ detail: async () => ++reads === 1 ? original : { ...original, nome: 'Nome atual' }, update: async () => { throw new ApiError('http', 409) } }); await ready(model)
  model.change('nome', input().nome); await model.submit(); assert.equal(model.getState().conflict, true); await model.submit(); assert.equal(calls.filter(call => call.kind === 'PUT').length, 1)
  await model.reload(); assert.equal(model.getState().conflict, false); assert.equal(model.getState().draft.nome, 'Nome atual'); assert.equal(model.getState().draft.descricao, original.descricao); model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) {
  test('resultado PUT incerto exige GET explícito antes de outra alteração: ' + error.kind + error.status, async () => {
    let reads = 0, writes = 0
    const { model, calls } = fixture({ detail: async () => { reads++; return original }, update: async () => { writes++; if (writes === 1) throw error; return { id: categoryId } } }); await ready(model)
    model.change('nome', input().nome); await model.submit(); assert.equal(model.getState().uncertain, true); model.change('descricao', 'Outro'); await model.submit(); assert.equal(writes, 1)
    await model.reload(); assert.equal(model.getState().uncertain, false); assert.equal(model.getState().draft.nome, original.nome); assert.equal(reads, 2)
    model.change('nome', input().nome); await model.submit(); assert.equal(model.getState().saved, true); assert.equal(writes, 2); assert.equal(calls.filter(call => call.kind === 'GET').length, 2); model.dispose()
  })
}

for (const status of [401, 403, 404]) {
  test('GET ' + status + ' bloqueia contexto ou categoria antes de editar', async () => {
    const { model, calls } = fixture({ detail: async () => { throw new ApiError('http', status) } }); await ready(model)
    assert.equal(model.getState().denied, true); assert.equal(model.getState().categoria, null); await model.submit(); assert.equal(calls.filter(call => call.kind === 'PUT').length, 0); model.dispose()
  })
  test('PUT ' + status + ' limpa dados e não declara sucesso', async () => {
    const { model, calls } = fixture({ update: async () => { throw new ApiError('http', status) } }); await ready(model); model.change('nome', input().nome); await model.submit()
    assert.equal(model.getState().denied, true); assert.equal(model.getState().categoria, null); assert.equal(model.getState().saved, false); assert.equal(calls.filter(call => call.kind === 'PUT').length, 1); model.dispose()
  })
}

test('GET inicial com falha de rede permite retry explícito', async () => {
  let reads = 0; const { model } = fixture({ detail: async () => { if (++reads === 1) throw new ApiError('network'); return original } }); await ready(model)
  assert.ok(model.getState().error); await model.reload(); assert.equal(model.getState().categoria.id, categoryId); assert.equal(model.getState().error, ''); model.dispose()
})

test('troca de categoria/conta/perfil/dispose aborta e ignora PUT antiga', async () => {
  for (const change of ['uuid', 'account', 'profile', 'dispose']) {
    const pending = deferred(); let user = actor(), reads = 0
    const { model, calls } = fixture({ user: () => user, detail: async id => { reads++; return { ...original, id } }, update: () => pending.promise }); await ready(model)
    model.change('nome', input().nome); const sending = model.submit(), call = calls.find(item => item.kind === 'PUT')
    if (change === 'account') user = actor('ADMINISTRADOR', id(9))
    if (change === 'profile') user = actor('USUARIO')
    if (change === 'dispose') model.dispose(); else model.initialize(change === 'uuid' ? id(2) : categoryId)
    assert.equal(call.args[2].aborted, true); pending.resolve({ id: categoryId }); await sending
    if (change === 'profile') assert.equal(model.getState().denied, true)
    else if (change !== 'dispose') assert.equal(model.getState().id, change === 'uuid' ? id(2) : categoryId)
    assert.equal(model.getState().saved, false); model.dispose()
  }
})

test('perda do perfil ADMIN sem watcher impede PUT', async () => {
  let user = actor(); const { model, calls } = fixture({ user: () => user }); await ready(model); model.change('nome', input().nome); user = actor('MODERADOR'); await model.submit()
  assert.equal(calls.filter(call => call.kind === 'PUT').length, 0); assert.equal(model.getState().denied, true); model.dispose()
})
