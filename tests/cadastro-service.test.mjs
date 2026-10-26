import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCadastroService } from '../src/features/auth/cadastro-service.ts'
import { ApiError } from '../src/shared/http/client.ts'

const user = { id: '665c3961-c1c9-48ce-a64b-51203042dcee', nome: 'Pessoa sintética', email: 'pessoa@example.test', perfil: 'USUARIO', dataCadastro: '2026-10-22T12:00:00Z' }
const draft = { nome: '  Pessoa sintética  ', email: '  PESSOA@example.test  ', senha: ' senha-sintetica ' }

test('cadastro POST publico projeta so nome/email/senha e preserva senha exatamente', async () => {
  const controller = new AbortController()
  let calls = 0
  const service = createCadastroService({ json: async (path, options) => {
    calls++
    assert.equal(path, '/auth/cadastro')
    assert.deepEqual(options, { method: 'POST', signal: controller.signal, json: { nome: 'Pessoa sintética', email: 'PESSOA@example.test', senha: draft.senha } })
    assert.equal(options.token, undefined)
    return { ...user, senha: 'nunca-conservar', accessToken: 'nunca-conservar' }
  } })
  assert.equal(await service.cadastrar({ ...draft, confirmacao: draft.senha, perfil: 'ADMINISTRADOR', id: user.id }, controller.signal), undefined)
  assert.equal(calls, 1)
})

for (const [label, result] of [
  ['nulo', null], ['array', []], ['objeto vazio', {}], ['UUID', { ...user, id: 'invalido' }],
  ['nome', { ...user, nome: ' ' }], ['email', { ...user, email: null }], ['data', { ...user, dataCadastro: 'invalida' }],
  ['moderador', { ...user, perfil: 'MODERADOR' }], ['administrador', { ...user, perfil: 'ADMINISTRADOR' }],
]) {
  test(`cadastro rejeita resposta ${label} sem conservar dados pessoais`, async () => {
    const service = createCadastroService({ json: async () => result })
    await assert.rejects(service.cadastrar(draft), error => error instanceof ApiError && error.kind === 'protocol' && !error.message.includes(user.email))
  })
}

test('cadastro propaga erro HTTP sem retry, login ou consulta de usuario', async () => {
  let calls = 0
  const expected = new ApiError('http', 409)
  const service = createCadastroService({ json: async () => { calls++; throw expected } })
  await assert.rejects(service.cadastrar(draft), error => error === expected)
  assert.equal(calls, 1)
})
