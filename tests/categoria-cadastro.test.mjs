import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createCategoriaCadastroService, normalizeCategoria, validateCategoria } from '../src/features/categoria/categoria-cadastro-service.ts'
import { createCategoriaCadastroModel } from '../src/features/categoria/categoria-cadastro-model.ts'
import { id, deferred } from './catalog-fixtures.mjs'

const actor = (perfil = 'ADMINISTRADOR', key = id(8)) => ({ id: key, perfil })
const draft = () => ({ nome: '  Categoria <script>texto literal</script>  ', descricao: '  Descrição de teste  ' })
const normalized = () => ({ nome: 'Categoria <script>texto literal</script>', descricao: 'Descrição de teste' })
const response = (input = normalized()) => ({ id: id(1), ...input })

test('service envia somente nome/descricao normalizados, projeta DTO e retorna UUID', async () => {
  const calls = [], service = createCategoriaCadastroService(async (...args) => { calls.push(args); return { ...response(), materiais: ['PRIVADO'], ownerEmail: 'EXTRA' } })
  assert.deepEqual(await service.create({ ...draft(), id: id(99), perfil: 'ADMINISTRADOR' }), { id: id(1) })
  assert.deepEqual(calls, [['/categorias', { method: 'POST', json: normalized(), signal: undefined }]])
})

test('normaliza espaços externos sem alterar maiúsculas e descrição vazia vira null', () => {
  assert.deepEqual(normalizeCategoria({ nome: '  CaTeGoRiA  ', descricao: ' \t ' }), { nome: 'CaTeGoRiA', descricao: null })
  assert.deepEqual(validateCategoria({ nome: 'x'.repeat(80), descricao: 'd'.repeat(500) }), {})
})

test('valida nome/descricao e U+0000 antes do POST sem truncar', async () => {
  let calls = 0; const service = createCategoriaCadastroService(async () => { calls++; return response() })
  for (const invalid of [
    { nome: '', descricao: '' }, { nome: ' ', descricao: '' }, { nome: 'n'.repeat(81), descricao: '' },
    { nome: 'x\u0000', descricao: '' }, { nome: 'Categoria', descricao: 'd'.repeat(501) },
    { nome: 'Categoria', descricao: 'x\u0000' },
  ]) {
    assert.ok(Object.keys(validateCategoria(invalid)).length)
    await assert.rejects(service.create(invalid), TypeError)
  }
  assert.equal(calls, 0)
})

test('service recusa resposta malformada ou campos que não correspondem ao payload normalizado', async () => {
  for (const change of [{ id: 'x' }, { nome: 'Outro' }, { descricao: null }]) {
    await assert.rejects(createCategoriaCadastroService(async () => ({ ...response(), ...change })).create(draft()), error => error instanceof ApiError && error.kind === 'protocol')
  }
  for (const value of [undefined, null, [], 'texto']) await assert.rejects(createCategoriaCadastroService(async () => value).create(draft()), ApiError)
})

function fixture({ create, user = () => actor() } = {}) {
  const calls = []
  const model = createCategoriaCadastroModel({ create: async (body, signal) => { calls.push({ body, signal }); return create ? create(body, signal) : { id: id(1) } } }, user)
  return { model, calls }
}
function prepare(model, value = draft()) { model.initialize(); model.change('nome', value.nome); model.change('descricao', value.descricao) }

test('initialize não envia; valida localmente e sucesso limpa draft e impede reenvio', async () => {
  const { model, calls } = fixture(); model.initialize(); await model.submit(); assert.equal(calls.length, 0); assert.ok(model.getState().fields.nome)
  prepare(model); await model.submit(); assert.deepEqual(calls[0].body, draft()); assert.equal(model.getState().savedId, id(1)); assert.deepEqual(model.getState().draft, { nome: '', descricao: '' })
  model.change('nome', 'Outra'); await model.submit(); assert.equal(calls.length, 1); model.dispose()
})

for (const user of [null, actor('USUARIO'), actor('MODERADOR'), actor('ADMINISTRADOR', 'invalido')]) {
  test('semADMIN/UUID válido não envia e limpa o rascunho ' + String(user?.perfil), async () => {
    const { model, calls } = fixture({ user: () => user }); prepare(model); await model.submit()
    assert.equal(model.getState().denied, true); assert.equal(calls.length, 0); assert.deepEqual(model.getState().draft, { nome: '', descricao: '' }); model.dispose()
  })
}

test('em voo bloqueia edição, duplicidade e preparar outro formulário', async () => {
  const pending = deferred(), { model, calls } = fixture({ create: () => pending.promise }); prepare(model); const sending = model.submit()
  model.change('nome', 'Alterado'); model.prepareNew(); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().draft.nome, draft().nome)
  pending.resolve(response()); await sending; assert.equal(model.getState().savedId, id(1)); model.dispose()
})

test('400 mantém rascunho e não ecoa ProblemDetail', async () => {
  const { model, calls } = fixture({ create: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO', errors: [{ field: 'nome', message: 'PRIVADO' }] }) } })
  prepare(model); await model.submit(); assert.deepEqual(model.getState().draft, draft()); assert.ok(model.getState().fields.nome); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
  model.change('nome', 'Outra categoria'); await model.submit(); assert.equal(calls.length, 2); model.dispose()
})

test('409 bloqueia nome normalizado sem diferenciar caixa; descrição não afasta conflito', async () => {
  const { model, calls } = fixture({ create: async () => { throw new ApiError('http', 409) } })
  prepare(model); await model.submit(); assert.equal(model.getState().conflict, true)
  model.change('nome', ' ' + normalized().nome.toUpperCase() + ' '); model.change('descricao', 'Outra descrição'); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().conflict, true)
  model.change('nome', 'Categoria diferente'); await model.submit(); assert.equal(calls.length, 2); model.dispose()
})

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) {
  test('resultado incerto exige descarte explícito sem retry: ' + error.kind + error.status, async () => {
    const { model, calls } = fixture({ create: async () => { throw error } }); prepare(model); await model.submit()
    assert.equal(model.getState().uncertain, true); model.change('nome', 'Outro'); await model.submit(); assert.equal(calls.length, 1)
    model.prepareNew(); assert.equal(model.getState().uncertain, false); assert.deepEqual(model.getState().draft, { nome: '', descricao: '' }); await model.submit(); assert.equal(calls.length, 1); model.dispose()
  })
}

for (const status of [401, 403, 404]) {
  test('POST ' + status + ' remove alvo/draft e exige reinicialização', async () => {
    const { model, calls } = fixture({ create: async () => { throw new ApiError('http', status) } }); prepare(model); await model.submit()
    assert.equal(model.getState().denied, true); assert.deepEqual(model.getState().draft, { nome: '', descricao: '' }); model.change('nome', 'Outro'); await model.submit(); assert.equal(calls.length, 1)
    model.initialize(); assert.equal(model.getState().denied, false); model.dispose()
  })
}

for (const change of ['account', 'profile', 'logout', 'dispose']) {
  test('POST atrasado após ' + change + ' é abortado/ignorado', async () => {
    let user = actor(); const pending = deferred(), { model, calls } = fixture({ user: () => user, create: () => pending.promise }); prepare(model); const sending = model.submit()
    if (change === 'account') user = actor('ADMINISTRADOR', id(9))
    if (change === 'profile') user = actor('MODERADOR')
    if (change === 'logout') user = null
    if (change === 'dispose') model.dispose(); else model.initialize()
    pending.reject(new ApiError('http', 403)); await sending; assert.equal(calls[0].signal.aborted, true); assert.equal(model.getState().savedId, '')
    model.dispose()
  })
}

test('perda de perfil ADMIN sem watcher impede POST e limpa dados', async () => {
  let user = actor(); const { model, calls } = fixture({ user: () => user }); prepare(model); user = actor('USUARIO'); await model.submit()
  assert.equal(calls.length, 0); assert.equal(model.getState().denied, true); assert.deepEqual(model.getState().draft, { nome: '', descricao: '' }); model.dispose()
})
