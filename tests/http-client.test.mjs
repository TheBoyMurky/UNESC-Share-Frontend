import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, createHttpClient } from '../src/shared/http/client.ts'

const base = 'http://localhost:8080/api/v1'
const response = (data, status = 200, type = 'application/json') => new Response(data, { status, headers: { 'Content-Type': type } })

test('envia JSON e Bearer apenas no header, sem cookies, cache ou redirects', async () => {
  let sent
  const client = createHttpClient(base, async (url, init) => { sent = { url, init }; return response('{"ok":true}') })
  assert.deepEqual(await client.json('/usuarios/me', { method: 'POST', json: { exemplo: 1 }, token: 'token-sintetico' }), { ok: true })
  assert.equal(String(sent.url), base + '/usuarios/me')
  assert.equal(sent.init.headers.get('Authorization'), 'Bearer token-sintetico')
  assert.equal(sent.init.headers.get('Content-Type'), 'application/json')
  assert.equal(sent.init.credentials, 'omit')
  assert.equal(sent.init.cache, 'no-store')
  assert.equal(sent.init.redirect, 'error')
  assert.equal(sent.init.body, '{"exemplo":1}')
})

test('GET sem token nao envia Authorization nem Content-Type desnecessario', async () => {
  const client = createHttpClient(base, async (_, init) => {
    assert.equal(init.headers.has('Authorization'), false)
    assert.equal(init.headers.has('Content-Type'), false)
    return response('{}')
  })
  await client.json('/exemplo')
})

for (const path of ['https://outro.example/api/v1', '//outro.example', '/../fora', '/%2e%2e/fora', '/\\outro.example']) {
  test(`rejeita rota fora da API: ${path}`, async () => {
    let calls = 0
    const client = createHttpClient(base, async () => { calls++; return response('{}') })
    await assert.rejects(client.json(path, { token: 'segredo-sintetico' }), TypeError)
    assert.equal(calls, 0)
  })
}

test('ProblemDetail conserva apenas campos de apresentacao, sem valores rejeitados extras', async () => {
  const client = createHttpClient(base, async () => response(JSON.stringify({ detail: 'Dados inválidos.', status: 400,
    errors: [{ field: 'email', message: 'E-mail inválido.', rejectedValue: 'privado' }, { field: 1 }], senha: 'privado' }), 400, 'application/problem+json'))
  await assert.rejects(client.json('/auth/login'), error => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 400)
    assert.equal(error.problem.detail, 'Dados inválidos.')
    assert.deepEqual(error.problem.errors, [{ field: 'email', message: 'E-mail inválido.' }])
    assert.equal(JSON.stringify(error).includes('privado'), false)
    return true
  })
})

for (const status of [401, 403, 409, 500]) {
  test(`erro HTTP ${status} sem corpo nao exige JSON`, async () => {
    const client = createHttpClient(base, async () => new Response(null, { status }))
    await assert.rejects(client.json('/usuarios/me'), error => error instanceof ApiError && error.status === status && error.problem === null)
  })
}

test('erro JSON malformado preserva status sem ecoar corpo', async () => {
  const client = createHttpClient(base, async () => response('segredo-sintetico', 401))
  await assert.rejects(client.json('/usuarios/me'), error => error.status === 401 && !String(error).includes('segredo-sintetico'))
})

test('HTML de erro nao e apresentado como mensagem', async () => {
  const client = createHttpClient(base, async () => response('<script>privado</script>', 502, 'text/html'))
  await assert.rejects(client.json('/usuarios/me'), error => error.status === 502 && error.problem === null && !String(error).includes('privado'))
})

test('204 nao tenta consumir corpo', async () => {
  const client = createHttpClient(base, async () => new Response(null, { status: 204 }))
  assert.equal(await client.json('/exemplo'), undefined)
})

for (const [body, type] of [['{malformado', 'application/json'], ['<html>privado</html>', 'text/html']]) {
  test(`sucesso com contrato invalido (${type}) e erro de protocolo`, async () => {
    const client = createHttpClient(base, async () => response(body, 200, type))
    await assert.rejects(client.json('/usuarios/me'), error => error.kind === 'protocol' && !String(error).includes('privado'))
  })
}

test('falha de rede nao conserva credenciais, URL ou cause', async () => {
  const client = createHttpClient(base, async () => { throw new Error('segredo-sintetico') })
  await assert.rejects(client.json('/auth/login'), error => error.kind === 'network' && error.cause === undefined && !String(error).includes('segredo'))
})

test('cancelamento mantem AbortError sem mensagem original', async () => {
  const client = createHttpClient(base, async () => { throw new DOMException('segredo', 'AbortError') })
  await assert.rejects(client.json('/usuarios/me'), error => error.name === 'AbortError' && !String(error).includes('segredo'))
})
