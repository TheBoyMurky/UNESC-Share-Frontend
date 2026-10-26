import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createPerfilService } from '../src/features/auth/perfil-service.ts'
import { id } from './catalog-fixtures.mjs'

test('HTTP sintético usa Bearer e contratos PUT de perfil e senha com 204 estrito', { timeout: 10000 }, async context => {
  const uuid = id(1), token = 'test.access.token', original = { id: uuid, nome: 'Pessoa', email: 'pessoa@example.test', perfil: 'USUARIO', dataCadastro: '2026-10-22T12:00:00Z' }
  let user = { ...original }, passwordBody
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); assert.equal(url.search, ''); assert.equal(request.headers.authorization, 'Bearer ' + token); assert.equal(request.headers.cookie, undefined)
    let raw = ''; for await (const chunk of request) raw += chunk
    if (request.method === 'GET') {
      assert.equal(url.pathname, '/api/v1/usuarios/me'); assert.equal(raw, '')
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(user)); return
    }
    if (url.pathname === '/api/v1/usuarios/me') {
      assert.equal(request.method, 'PUT'); assert.equal(request.headers['content-type'], 'application/json')
      const body = JSON.parse(raw); assert.deepEqual(Object.keys(body).sort(), ['email', 'nome', 'senhaAtual']); assert.equal(body.senhaAtual, 'SenhaAtual-123')
      user = { ...user, nome: body.nome, email: body.email }; response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(user)); return
    }
    assert.equal(url.pathname, '/api/v1/usuarios/me/senha'); assert.equal(request.method, 'PUT'); assert.equal(request.headers['content-type'], 'application/json')
    passwordBody = JSON.parse(raw); assert.deepEqual(Object.keys(passwordBody).sort(), ['novaSenha', 'senhaAtual']); response.writeHead(204); response.end()
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const baseUrl = 'http://127.0.0.1:' + server.address().port + '/api/v1'
  const raw = createHttpClient(baseUrl), authenticated = createAuthenticatedClient(raw, { getToken: () => token, rejectToken: () => assert.fail('401 inesperado') })
  const service = createPerfilService(authenticated.json)
  const updated = await service.update(uuid, { nome: 'Novo Nome', email: 'novo@example.test', senhaAtual: 'SenhaAtual-123' }, original)
  assert.equal(updated.nome, 'Novo Nome'); assert.equal(updated.email, 'novo@example.test')
  await service.current(); await service.changePassword({ senhaAtual: 'SenhaAtual-123', novaSenha: 'SenhaNova-456' })
  assert.deepEqual(passwordBody, { senhaAtual: 'SenhaAtual-123', novaSenha: 'SenhaNova-456' })
})
