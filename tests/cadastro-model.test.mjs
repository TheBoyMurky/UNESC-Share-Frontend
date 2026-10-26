import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCadastroModel, validateCadastro } from '../src/features/auth/cadastro-model.ts'
import { ApiError } from '../src/shared/http/client.ts'

const valid = { nome: 'Pessoa sintética', email: 'pessoa@example.test', senha: ' senha-sintetica ', confirmacao: ' senha-sintetica ' }
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }

test('validacao aceita limites de nome/email e senha ASCII8..64 sem trim da senha', () => {
  for (const senha of ['a'.repeat(8), 'a'.repeat(64), '  abcdef  ']) {
    assert.deepEqual(validateCadastro({ ...valid, nome: 'a'.repeat(120), email: 'a'.repeat(241) + '@example.test', senha, confirmacao: senha }), {})
  }
})

for (const [field, value] of [
  ['nome', '  '], ['nome', 'a'.repeat(121)], ['email', ''], ['email', 'sem-arroba'], ['email', 'a@@b.test'],
  ['email', 'a b@example.test'], ['email', 'a'.repeat(255) + '@b.test'],
  ['senha', 'a'.repeat(7)], ['senha', 'a'.repeat(65)], ['senha', ' '.repeat(8)],
  ['senha', 'á'.repeat(37)], ['senha', '😀'.repeat(19)], ['confirmacao', 'diferente'], ['confirmacao', ''],
]) {
  test(`validacao rejeita ${field} invalido sem ecoar entrada`, () => {
    const input = { ...valid, [field]: value }
    if (field === 'senha') input.confirmacao = value
    const errors = validateCadastro(input)
    assert.ok(errors[field])
    assert.equal(Object.values(errors).some(message => value.length > 10 && message.includes(value)), false)
  })
}

test('UTF8 aceita exatamente72bytes e rejeita73 sem truncar ou arredondar', () => {
  for (const senha of ['á'.repeat(36), '😀'.repeat(18)]) assert.deepEqual(validateCadastro({ ...valid, senha, confirmacao: senha }), {})
  const senha = 'á'.repeat(36) + 'a'
  assert.ok(validateCadastro({ ...valid, senha, confirmacao: senha }).senha)
})

test('modelo invalido nao envia HTTP e permite correcao', async () => {
  let calls = 0
  const model = createCadastroModel({ cadastrar: async () => { calls++ } })
  await model.submit({ ...valid, confirmacao: 'outra' })
  assert.equal(calls, 0)
  assert.ok(model.getState().fields.confirmacao)
  await model.submit(valid)
  assert.equal(calls, 1)
  assert.equal(model.getState().succeeded, true)
  assert.deepEqual(model.getState().fields, {})
})

test('modelo envia so tres campos e nao guarda senha, confirmacao ou DTO no estado', async () => {
  let sent
  const model = createCadastroModel({ cadastrar: async (input, signal) => {
    sent = input
    assert.equal(signal.aborted, false)
    assert.equal(model.getState().sending, true)
    assert.equal(JSON.stringify(model.getState()).includes(valid.senha), false)
    return { email: valid.email, senha: valid.senha, perfil: 'ADMINISTRADOR' }
  } })
  await model.submit(valid)
  assert.deepEqual(sent, { nome: valid.nome, email: valid.email, senha: valid.senha })
  assert.deepEqual(model.getState(), { sending: false, succeeded: true, error: '', fields: {} })
  assert.equal(JSON.stringify(model.getState()).includes(valid.email), false)
})

test('nao duplica POST pendente nem envia novo POST apos sucesso', async () => {
  const task = deferred()
  let calls = 0
  const model = createCadastroModel({ cadastrar: () => { calls++; return task.promise } })
  const first = model.submit(valid)
  await model.submit(valid)
  assert.equal(calls, 1)
  task.resolve()
  await first
  await model.submit(valid)
  assert.equal(calls, 1)
})

test('400 mapeia so campos conhecidos com mensagens locais sem ecoar ProblemDetail', async () => {
  const secret = 'NUNCA-MOSTRAR-CREDENCIAL'
  const model = createCadastroModel({ cadastrar: async () => { throw new ApiError('http', 400, {
    title: secret, detail: secret, errors: [
      { field: 'nome', message: secret }, { field: 'email', message: secret },
      { field: 'senha', message: secret }, { field: 'senhaCompativelComBCrypt', message: secret },
      { field: 'perfil', message: secret }, { field: secret, message: secret },
    ],
  }) } })
  await model.submit(valid)
  assert.deepEqual(Object.keys(model.getState().fields).sort(), ['email', 'nome', 'senha'])
  assert.equal(JSON.stringify(model.getState()).includes(secret), false)
  assert.equal(model.getState().succeeded, false)
})

for (const status of [401, 403, 409, 429]) {
  test(`HTTP${status} encerra envio sem autenticar nem conservar causa`, async () => {
    const model = createCadastroModel({ cadastrar: async () => { throw new ApiError('http', status) } })
    await model.submit(valid)
    assert.equal(model.getState().sending, false)
    assert.equal(model.getState().succeeded, false)
    assert.ok(model.getState().error)
    if (status === 409) assert.match(model.getState().error, /já está cadastrado/)
  })
}

for (const [label, error] of [
  ['rede', new ApiError('network')], ['protocolo', new ApiError('protocol')], ['500', new ApiError('http', 500)],
  ['503', new ApiError('http', 503)], ['408', new ApiError('http', 408)], ['desconhecido', new Error('senha-ou-url-privada')],
]) {
  test(`resultado ${label} pode ser incerto: orienta login e nao repete cadastro automaticamente`, async () => {
    let calls = 0
    const model = createCadastroModel({ cadastrar: async () => { calls++; throw error } })
    await model.submit(valid)
    assert.equal(calls, 1)
    assert.equal(model.getState().succeeded, false)
    assert.match(model.getState().error, /conta pode ter sido criada/)
    assert.equal(model.getState().error.includes('senha-ou-url-privada'), false)
  })
}

test('409 permite uma nova tentativa explicita com dados corrigidos', async () => {
  let calls = 0
  const model = createCadastroModel({ cadastrar: async () => { if (++calls === 1) throw new ApiError('http', 409) } })
  await model.submit(valid)
  await model.submit({ ...valid, email: 'outra@example.test' })
  assert.equal(calls, 2)
  assert.deepEqual(model.getState(), { sending: false, succeeded: true, error: '', fields: {} })
})

for (const fails of [false, true]) {
  test(`desmontagem aborta sinal e ignora ${fails ? 'erro' : 'sucesso'} atrasado sem nova requisicao`, async () => {
    const task = deferred()
    let signal, calls = 0, changes = 0
    const model = createCadastroModel({ cadastrar: (input, provided) => { signal = provided; calls++; return task.promise } })
    model.subscribe(() => { changes++ })
    const pending = model.submit(valid)
    model.dispose()
    const before = changes
    assert.equal(signal.aborted, true)
    if (fails) task.reject(new ApiError('network')); else task.resolve()
    await pending
    await model.submit(valid)
    assert.equal(calls, 1)
    assert.equal(changes, before)
    assert.deepEqual(model.getState(), { sending: false, succeeded: false, error: '', fields: {} })
  })
}
