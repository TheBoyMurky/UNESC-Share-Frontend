import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSession, SESSION_KEY } from '../src/features/auth/session.ts'
import { ApiError } from '../src/shared/http/client.ts'

const user = { id: '665c3961-c1c9-48ce-a64b-51203042dcee', nome: 'Pessoa', email: 'pessoa@example.test', perfil: 'USUARIO', dataCadastro: '2026-10-22T12:00:00Z' }
const access = { accessToken: 'header.payload.signature', expiresAt: 2000000 }
const credentials = { email: user.email, senha: 'sintetica-nao-guardar' }
function fixture(overrides = {}, saved = null) {
  let time = 1000000
  const values = new Map([['outra-chave', 'preservar']])
  if (saved !== null) values.set(SESSION_KEY, saved)
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  }
  const service = { login: async () => access, me: async () => user, ...overrides }
  const session = createSession(service, storage, () => time)
  return { session, values, storage, setTime: value => { time = value } }
}

test('login valida usuario antes de persistir, sem armazenar senha/perfil/dados pessoais', async () => {
  const f = fixture({ me: async token => {
    assert.equal(token, access.accessToken)
    assert.equal(f.values.has(SESSION_KEY), false)
    return user
  } })
  await f.session.login(credentials)
  assert.equal(f.session.getState().status, 'authenticated')
  assert.deepEqual(f.session.getState().user, user)
  assert.deepEqual(JSON.parse(f.values.get(SESSION_KEY)), access)
  assert.equal(f.values.get(SESSION_KEY).includes(credentials.senha), false)
  assert.equal(f.values.get(SESSION_KEY).includes(user.email), false)
  assert.equal(JSON.stringify(f.session.getState()).includes(access.accessToken), false)
})

test('atualizar dados atuais altera apenas memoria e nao persiste nome ou e-mail', async () => {
  const f = fixture()
  await f.session.login(credentials)
  const updated = { ...user, nome: 'Nome alterado', email: 'novo@example.test' }
  assert.equal(f.session.updateUser(updated), true)
  assert.deepEqual(f.session.getState().user, updated)
  assert.deepEqual(JSON.parse(f.values.get(SESSION_KEY)), access)
  assert.equal(f.values.get(SESSION_KEY).includes(updated.nome), false)
  assert.equal(f.values.get(SESSION_KEY).includes(updated.email), false)
  assert.equal(f.session.updateUser({ ...updated, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), false)
})

test('restaura token na mesma aba apenas apos consultar me novamente', async () => {
  let calls = 0
  const f = fixture({ me: async () => { calls++; return user } }, JSON.stringify(access))
  assert.equal(f.session.getState().status, 'anonymous')
  await f.session.restore()
  assert.equal(calls, 1)
  assert.equal(f.session.getState().status, 'authenticated')
  await f.session.restore()
  assert.equal(calls, 1)
})

test('armazenamento vazio nao causa chamadas de autenticacao', async () => {
  const f = fixture({ me: async () => { assert.fail('nao consultar') } })
  await f.session.restore()
  assert.equal(f.session.getState().status, 'anonymous')
})

for (const saved of ['{malformado', '{}', 'null', JSON.stringify({ ...access, accessToken: '\r\n' }), JSON.stringify({ ...access, expiresAt: 'amanha' }), 'x'.repeat(10001)]) {
  test('acesso salvo invalido e descartado sem expor conteudo', async () => {
    const f = fixture({ me: async () => { assert.fail('nao consultar') } }, saved)
    await f.session.restore()
    assert.equal(f.session.getState().status, 'anonymous')
    assert.equal(f.values.has(SESSION_KEY), false)
    assert.equal(f.values.get('outra-chave'), 'preservar')
  })
}

test('acesso salvo expirado e removido sem consultar a API', async () => {
  const f = fixture({ me: async () => { assert.fail('nao consultar') } }, JSON.stringify({ ...access, expiresAt: 1000000 }))
  await f.session.restore()
  assert.equal(f.session.getState().status, 'anonymous')
  assert.equal(f.values.has(SESSION_KEY), false)
  assert.match(f.session.getState().message, /expirou/)
})

test('expiracao invalida usuario/token e notifica assinantes', async () => {
  const f = fixture()
  let changes = 0
  const unsubscribe = f.session.subscribe(() => { changes++ })
  await f.session.login(credentials)
  f.setTime(access.expiresAt)
  assert.equal(f.session.getToken(), null)
  assert.equal(f.session.getState().user, null)
  assert.equal(f.values.has(SESSION_KEY), false)
  assert.ok(changes >= 3)
  unsubscribe()
})

test('401 na restauracao remove token, sem login/retry automaticos', async () => {
  let calls = 0
  const f = fixture({ me: async () => { calls++; throw new ApiError('http', 401) } }, JSON.stringify(access))
  await f.session.restore()
  assert.equal(calls, 1)
  assert.equal(f.values.has(SESSION_KEY), false)
  assert.equal(f.session.getState().status, 'anonymous')
})

test('rede indisponivel ou 403 nao apaga acesso salvo e nao libera rota protegida', async () => {
  for (const error of [new ApiError('network'), new ApiError('http', 403)]) {
    const f = fixture({ me: async () => { throw error } }, JSON.stringify(access))
    await f.session.restore()
    assert.equal(f.session.getState().status, 'unavailable')
    assert.equal(f.session.getState().user, null)
    assert.equal(f.session.getToken(), null)
    assert.equal(f.values.has(SESSION_KEY), true)
  }
})

test('logout remove somente a chave do projeto e nao chama API de revogacao inexistente', async () => {
  const f = fixture()
  await f.session.login(credentials)
  f.session.logout()
  assert.equal(f.session.getToken(), null)
  assert.equal(f.values.has(SESSION_KEY), false)
  assert.equal(f.values.get('outra-chave'), 'preservar')
})

test('login incorreto nao persiste credenciais ou token', async () => {
  const f = fixture({ login: async () => { throw new ApiError('http', 401) } })
  await assert.rejects(f.session.login(credentials), error => error.status === 401)
  assert.equal(f.session.getState().status, 'anonymous')
  assert.equal(f.values.has(SESSION_KEY), false)
})

test('me rejeitado apos login nao publica usuario ou token', async () => {
  const f = fixture({ me: async () => { throw new ApiError('http', 401) } })
  await f.session.login(credentials)
  assert.equal(f.session.getState().status, 'anonymous')
  assert.equal(f.values.has(SESSION_KEY), false)
})

test('falha de quota nao resulta em fallback silencioso para memoria ou localStorage', async () => {
  const f = fixture()
  f.storage.setItem = () => { throw new Error('quota-sintetica') }
  await assert.rejects(f.session.login(credentials), /Não foi possível salvar/)
  assert.equal(f.session.getState().status, 'anonymous')
  assert.equal(f.session.getToken(), null)
})

test('armazenamento bloqueado e tratado sem expor excecao original', async () => {
  const f = fixture()
  f.storage.getItem = () => { throw new Error('detalhe-privado') }
  await f.session.restore()
  assert.equal(f.session.getState().status, 'anonymous')
  assert.equal(f.session.getState().message.includes('detalhe-privado'), false)
})

test('restauracoes concorrentes compartilham validacao', async () => {
  let resolve, calls = 0
  const wait = new Promise(r => { resolve = r })
  const f = fixture({ me: async () => { calls++; return wait } }, JSON.stringify(access))
  const a = f.session.restore(), b = f.session.restore()
  resolve(user)
  await Promise.all([a, b])
  assert.equal(calls, 1)
})

test('logout durante validacao impede resposta atrasada de restaurar usuario', async () => {
  let resolve
  const wait = new Promise(r => { resolve = r })
  const f = fixture({ me: async () => wait }, JSON.stringify(access))
  const restoring = f.session.restore()
  f.session.logout()
  resolve(user)
  await restoring
  assert.equal(f.session.getState().status, 'anonymous')
  assert.equal(f.values.has(SESSION_KEY), false)
})

test('401 atrasado de outro token nao derruba novo login', async () => {
  const f = fixture()
  await f.session.login(credentials)
  f.session.rejectToken('outro.token.antigo')
  assert.equal(f.session.getState().status, 'authenticated')
  f.session.rejectToken(access.accessToken)
  assert.equal(f.session.getState().status, 'anonymous')
})

test('login em andamento nao ressuscita sessao apos logout', async () => {
  let resolve
  const wait = new Promise(r => { resolve = r })
  const f = fixture({ login: async () => wait })
  const loggingIn = f.session.login(credentials)
  f.session.logout()
  resolve(access)
  await loggingIn
  assert.equal(f.session.getState().status, 'anonymous')
  assert.equal(f.values.has(SESSION_KEY), false)
})
