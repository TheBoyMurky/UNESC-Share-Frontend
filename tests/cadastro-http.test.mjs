import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createCadastroService } from '../src/features/auth/cadastro-service.ts'
import { createCadastroModel } from '../src/features/auth/cadastro-model.ts'
import { createSession, SESSION_KEY } from '../src/features/auth/session.ts'

const draft = { nome: 'Pessoa sintética', email: 'pessoa@example.test', senha: ' senha-sintetica ', confirmacao: ' senha-sintetica ' }
const user = { id: '665c3961-c1c9-48ce-a64b-51203042dcee', nome: draft.nome, email: draft.email, perfil: 'USUARIO', dataCadastro: '2026-10-22T12:00:00Z' }

test('cadastro HTTP sintetico:201/409/400/503/resposta perdida, sem Bearer/cookies/login/storage ou retry', { timeout: 8000 }, async context => {
  let mode = 'created', calls = 0
  const server = createServer(async (request, response) => {
    calls++
    assert.equal(request.method, 'POST')
    assert.equal(request.url, '/api/v1/auth/cadastro')
    assert.equal(request.headers.authorization, undefined)
    assert.equal(request.headers.cookie, undefined)
    assert.equal(request.headers['content-type'], 'application/json')
    let body = ''
    for await (const chunk of request) body += chunk
    assert.deepEqual(JSON.parse(body), { nome: draft.nome, email: draft.email, senha: draft.senha })
    if (mode === 'lost') { response.destroy(); return }
    if (mode === 'unavailable') { response.writeHead(503); response.end(); return }
    if (mode === 'unauthorized') { response.writeHead(401); response.end(); return }
    if (mode === 'conflict') { response.writeHead(409); response.end(); return }
    if (mode === 'invalid') {
      response.writeHead(400, { 'Content-Type': 'application/problem+json' })
      response.end(JSON.stringify({ title: draft.senha, detail: draft.email, errors: [{ field: 'senhaCompativelComBCrypt', message: draft.senha }] }))
      return
    }
    response.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(mode === 'malformed' ? '{invalido' : JSON.stringify(user))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const service = createCadastroService(createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`))
  let writes = 0, removals = 0
  const values = new Map([[SESSION_KEY, JSON.stringify({ accessToken: 'header.payload.signature', expiresAt: 2000000 })]])
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes++; values.set(key, value) },
    removeItem: key => { removals++; values.delete(key) },
  }
  const session = createSession({ login: async () => { throw new Error('login nao deve ser chamado') }, me: async () => user }, storage, () => 1000000)
  await session.restore()
  const saved = values.get(SESSION_KEY)
  const anonymous = createSession({ login: async () => { throw new Error('login nao deve ser chamado') }, me: async () => user }, { ...storage, getItem: () => null }, () => 1000000)

  for (const next of ['created', 'conflict', 'invalid', 'unauthorized', 'unavailable', 'malformed', 'lost']) {
    mode = next
    const before = calls
    const model = createCadastroModel(service)
    await model.submit({ ...draft, perfil: 'ADMINISTRADOR', id: user.id })
    assert.equal(calls, before + 1, 'uma unica requisicao por tentativa explicita')
    assert.equal(model.getState().succeeded, mode === 'created')
    assert.equal(model.getState().sending, false)
    if (mode === 'conflict') assert.match(model.getState().error, /já está cadastrado/)
    if (mode === 'invalid') assert.ok(model.getState().fields.senha)
    if (['unavailable', 'malformed', 'lost'].includes(mode)) assert.match(model.getState().error, /conta pode ter sido criada/)
    assert.equal(JSON.stringify(model.getState()).includes(draft.senha), false)
    assert.equal(JSON.stringify(model.getState()).includes(draft.email), false)
    assert.equal(session.getToken(), 'header.payload.signature')
    assert.equal(session.getState().status, 'authenticated')
    assert.equal(anonymous.getState().status, 'anonymous')
    assert.equal(values.get(SESSION_KEY), saved)
    assert.equal(writes, 0)
    assert.equal(removals, 0)
    model.dispose()
  }
})
