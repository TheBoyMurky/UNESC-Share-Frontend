import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAuthService } from '../src/features/auth/auth-service.ts'

const user = { id: '665c3961-c1c9-48ce-a64b-51203042dcee', nome: 'Pessoa de teste', email: 'pessoa@example.test', perfil: 'USUARIO', dataCadastro: '2026-10-22T12:00:00Z' }
const dto = { accessToken: 'header.payload.signature', tokenType: 'Bearer', expiresIn: 900, expiresAt: '2026-10-22T12:15:00Z' }

test('login usa rota publica e retorna somente acesso/expiracao validada', async () => {
  const credentials = { email: user.email, senha: 'sintetica' }
  const service = createAuthService({ json: async (path, options) => {
    assert.equal(path, '/auth/login')
    assert.deepEqual(options, { method: 'POST', json: credentials })
    return { ...dto, senha: 'nunca-conservar' }
  } })
  assert.deepEqual(await service.login(credentials), { accessToken: dto.accessToken, expiresAt: Date.parse(dto.expiresAt) })
})

test('me usa Bearer explicito e projeta DTO sem senha/hash extras', async () => {
  const service = createAuthService({ json: async (path, options) => {
    assert.equal(path, '/usuarios/me')
    assert.deepEqual(options, { token: dto.accessToken })
    return { ...user, senha: 'nunca-conservar', hash: 'nunca-conservar' }
  } })
  assert.deepEqual(await service.me(dto.accessToken), user)
})

for (const invalid of [null, {}, { ...dto, tokenType: 'Basic' }, { ...dto, expiresAt: 'invalido' }, { ...dto, accessToken: 'sem-segmentos' }]) {
  test('login rejeita contrato invalido sem ecoar payload', async () => {
    const service = createAuthService({ json: async () => invalid })
    await assert.rejects(service.login({ email: 'a@b.test', senha: 'sintetica' }), error => error.kind === 'protocol')
  })
}

test('me rejeita perfil/UUID/data invalidos em vez de confiar em dados adulterados', async () => {
  for (const invalid of [{ ...user, perfil: 'ROOT' }, { ...user, id: 'invalido' }, { ...user, dataCadastro: 'invalida' }]) {
    const service = createAuthService({ json: async () => invalid })
    await assert.rejects(service.me(dto.accessToken), error => error.kind === 'protocol')
  }
})
