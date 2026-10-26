import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createPerfilService } from '../src/features/auth/perfil-service.ts'
import { createPerfilModel } from '../src/features/auth/perfil-model.ts'
import { deferred } from './catalog-fixtures.mjs'

const user = { id: '665c3961-c1c9-48ce-a64b-51203042dcee', nome: 'Pessoa de teste', email: 'pessoa@example.test', perfil: 'USUARIO', dataCadastro: '2026-10-22T12:00:00Z' }
const other = { ...user, nome: 'Nome novo', email: 'novo@example.test' }
function setup({ service, updateSession = () => true } = {}) {
  const calls = [], client = service ?? {
    current: async (...args) => { calls.push(['GET', ...args]); return user },
    update: async (...args) => { calls.push(['PUT-profile', ...args]); return other },
    changePassword: async (...args) => { calls.push(['PUT-password', ...args]) },
  }
  const model = createPerfilModel(client, updateSession); model.initialize(user)
  return { model, calls }
}

test('serviço envia somente campos do contrato e valida resposta sem senha/hash', async () => {
  const calls = [], service = createPerfilService(async (...args) => { calls.push(args); if (args[0] === '/usuarios/me/senha') return undefined; return { ...other, senha: 'não conservar', hash: 'não conservar' } })
  assert.deepEqual(await service.update(user.id, { nome: ' Nome novo ', email: ' NOVO@EXAMPLE.TEST ', senhaAtual: 'segredo atual' }, user), other)
  await service.changePassword({ senhaAtual: 'senha atual', novaSenha: 'SenhaNova-123' })
  assert.deepEqual(calls, [
    ['/usuarios/me', { method: 'PUT', json: { nome: 'Nome novo', email: 'novo@example.test', senhaAtual: 'segredo atual' }, signal: undefined }],
    ['/usuarios/me/senha', { method: 'PUT', json: { senhaAtual: 'senha atual', novaSenha: 'SenhaNova-123' }, signal: undefined }],
  ])
  await assert.rejects(createPerfilService(async () => ({ ...other, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })).update(user.id, { nome: other.nome, email: other.email }, user), error => error instanceof ApiError && error.kind === 'protocol')
  await assert.rejects(createPerfilService(async () => ({ status: 'ok' })).changePassword({ senhaAtual: 'senha atual', novaSenha: 'SenhaNova-123' }), error => error instanceof ApiError && error.kind === 'protocol')
})

test('mudança de nome sem mudança de e-mail não envia senha atual', async () => {
  const calls = []; const { model } = setup({ service: {
    current: async () => user,
    update: async (...args) => { calls.push(args); return { ...user, nome: 'Nome atualizado' } },
    changePassword: async () => {},
  } })
  await model.saveProfile({ nome: ' Nome atualizado ', email: user.email, senhaAtual: 'não necessária' })
  assert.equal(model.getState().profileSuccess, 'Dados da conta atualizados.')
  assert.equal(model.getState().user.nome, 'Nome atualizado')
  assert.equal(calls[0][1].senhaAtual, undefined)
  assert.equal(JSON.stringify(model.getState()).includes('não necessária'), false); model.dispose()
})

test('e-mail novo exige senha atual antes de enviar e conflito conserva os dados atuais', async () => {
  let calls = 0; const { model } = setup({ service: { current: async () => user, update: async () => { calls++; throw new ApiError('http', 409) }, changePassword: async () => {} } })
  await model.saveProfile({ nome: user.nome, email: other.email })
  assert.equal(model.getState().profileFields.senhaAtual !== undefined, true); assert.equal(calls, 0)
  await model.saveProfile({ nome: user.nome, email: other.email, senhaAtual: 'SenhaAtual-123' })
  assert.equal(model.getState().profileError, 'Este e-mail já está associado a outra conta.')
  assert.equal(model.getState().user.email, user.email); assert.equal(model.getState().profileUncertain, false); model.dispose()
})

test('resultado incerto de perfil exige GET explícito que atualiza o estado antes de nova edição', async () => {
  let puts = 0, gets = 0; const fresh = { ...user, nome: 'Nome já salvo', email: other.email }
  const { model } = setup({ service: { current: async () => { gets++; return fresh }, update: async () => { puts++; throw new ApiError('network') }, changePassword: async () => {} } })
  await model.saveProfile({ nome: 'Nome já salvo', email: other.email, senhaAtual: 'SenhaAtual-123' })
  assert.equal(model.getState().profileUncertain, true); await model.saveProfile({ nome: 'Outro nome', email: other.email, senhaAtual: 'SenhaAtual-123' }); assert.equal(puts, 1)
  await model.refreshProfile(); assert.equal(gets, 1); assert.equal(model.getState().profileUncertain, false); assert.equal(model.getState().user.email, other.email); assert.equal(model.getState().user.nome, 'Nome já salvo'); model.dispose()
})

test('troca de senha valida localmente, nunca guarda credenciais e exige sair após sucesso', async () => {
  let changed = 0; const { model } = setup({ service: { current: async () => user, update: async () => user, changePassword: async () => { changed++ } } })
  await model.changePassword({ senhaAtual: 'SenhaAtual-123', novaSenha: 'curta', confirmacao: 'curta' }); assert.equal(changed, 0); assert.ok(model.getState().passwordFields.novaSenha)
  await model.changePassword({ senhaAtual: 'SenhaAtual-123', novaSenha: 'SenhaAtual-123', confirmacao: 'SenhaAtual-123' }); assert.equal(changed, 0)
  await model.changePassword({ senhaAtual: 'SenhaAtual-123', novaSenha: 'SenhaNova-456', confirmacao: 'SenhaNova-456' })
  assert.equal(model.getState().passwordChanged, true); assert.equal(changed, 1)
  assert.equal(JSON.stringify(model.getState()).includes('SenhaAtual-123'), false); assert.equal(JSON.stringify(model.getState()).includes('SenhaNova-456'), false)
  await model.changePassword({ senhaAtual: 'SenhaAtual-123', novaSenha: 'OutraSenha-789', confirmacao: 'OutraSenha-789' }); assert.equal(changed, 1); model.dispose()
})

test('resultado incerto de senha bloqueia reenvio até a pessoa sair e entrar novamente', async () => {
  let sends = 0; const { model } = setup({ service: { current: async () => user, update: async () => user, changePassword: async () => { sends++; throw new ApiError('network') } } })
  const input = { senhaAtual: 'SenhaAtual-123', novaSenha: 'SenhaNova-456', confirmacao: 'SenhaNova-456' }
  await model.changePassword(input); assert.equal(model.getState().passwordUncertain, true); await model.changePassword(input); assert.equal(sends, 1); model.dispose()
})

test('troca de conta aborta e ignora atualização de perfil atrasada', async () => {
  const pending = deferred(); let signal
  const { model } = setup({ service: { current: async () => user, update: (...args) => { signal = args[3]; return pending.promise }, changePassword: async () => {} } })
  const saving = model.saveProfile({ nome: other.nome, email: other.email, senhaAtual: 'SenhaAtual-123' })
  model.initialize({ ...user, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'outra@example.test' }); assert.equal(signal.aborted, true)
  pending.resolve(other); await saving
  assert.equal(model.getState().user.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); assert.equal(model.getState().profileSuccess, ''); model.dispose()
})
