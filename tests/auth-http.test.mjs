import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthService } from '../src/features/auth/auth-service.ts'
import { createSession, SESSION_KEY } from '../src/features/auth/session.ts'

test('fetch HTTP real com servidor sintetico: login, restauracao, 401 vazio e logout', async context => {
  const credentials = { email: 'pessoa@example.test', senha: 'senha-sintetica' }
  const token = 'header.payload.signature'
  const user = { id: '665c3961-c1c9-48ce-a64b-51203042dcee', nome: 'Pessoa', email: credentials.email, perfil: 'USUARIO', dataCadastro: '2026-10-22T12:00:00Z' }
  let rejected = false, loginCalls = 0, meCalls = 0
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.cookie, undefined)
    if (request.url === '/api/v1/auth/login' && request.method === 'POST') {
      loginCalls++
      assert.equal(request.headers.authorization, undefined)
      let body = ''
      for await (const chunk of request) body += chunk
      assert.deepEqual(JSON.parse(body), credentials)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ accessToken: token, tokenType: 'Bearer', expiresIn: 900, expiresAt: new Date(Date.now() + 900000).toISOString() }))
    } else if (request.url === '/api/v1/usuarios/me') {
      meCalls++
      assert.equal(request.headers.authorization, `Bearer ${token}`)
      if (rejected) { response.writeHead(401, { 'WWW-Authenticate': 'Bearer' }); response.end(); return }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(user))
    } else { response.writeHead(404); response.end() }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const service = createAuthService(createHttpClient(base))
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const session = createSession(service, storage)
  await session.login(credentials)
  assert.deepEqual(session.getState().user, user)
  const reloaded = createSession(service, storage)
  await reloaded.restore()
  assert.equal(reloaded.getState().status, 'authenticated')
  assert.equal(loginCalls, 1)
  assert.equal(meCalls, 2)
  rejected = true
  const rejectedSession = createSession(service, storage)
  await rejectedSession.restore()
  assert.equal(rejectedSession.getState().status, 'anonymous')
  assert.equal(values.has(SESSION_KEY), false)
  session.logout()
  assert.equal(session.getToken(), null)
  assert.equal(loginCalls, 1)
})
