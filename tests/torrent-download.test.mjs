import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHttpClient, MAX_TORRENT_BYTES } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { torrentBytes } from './material-fixtures.mjs'

const base = 'http://localhost:8080/api/v1'
const response = (bytes = torrentBytes, headers = {}) => new Response(bytes, { headers: { 'Content-Type': 'application/x-bittorrent', ...headers } })

test('download pede somente metainfo com Bearer, sem cookies/redirecionamentos', async () => {
  const client = createHttpClient(base, async (url, options) => {
    assert.equal(String(url), base + '/materiais/exemplo/torrents/exemplo')
    assert.equal(options.method, 'GET')
    assert.equal(options.headers.get('Authorization'), 'Bearer sintetico')
    assert.equal(options.headers.get('Accept'), 'application/x-bittorrent, application/problem+json, application/json')
    assert.equal(options.headers.has('Content-Type'), false)
    assert.equal(options.credentials, 'omit')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.redirect, 'error')
    return response(torrentBytes, { 'Content-Length': String(torrentBytes.length), 'Content-Disposition': 'attachment; filename="nao-confiar.torrent"' })
  })
  const result = await client.torrent('/materiais/exemplo/torrents/exemplo', { token: 'sintetico' })
  assert.equal(result.blob.type, 'application/x-bittorrent')
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), torrentBytes)
})

for (const status of [401, 403, 404, 503]) {
  test(`download HTTP${status} sem corpo nao gera Blob nem exige JSON`, async () => {
    const client = createHttpClient(base, async () => new Response(null, { status }))
    await assert.rejects(client.torrent('/materiais/a/torrents/b'), error => error.status === status && error.kind === 'http')
  })
}

test('503 ProblemDetail preserva status e nao oferece mensagem SQL/corpo como arquivo', async () => {
  const client = createHttpClient(base, async () => new Response('{"detail":"Arquivo indisponivel."}', { status: 503, headers: { 'Content-Type': 'application/problem+json' } }))
  await assert.rejects(client.torrent('/arquivo'), error => error.status === 503 && error.problem.detail === 'Arquivo indisponivel.')
})

for (const type of ['application/pdf', 'application/zip', 'text/html', 'application/json', 'application/octet-stream']) {
  test(`resposta200 ${type} nao e salva como .torrent`, async () => {
    const client = createHttpClient(base, async () => response(torrentBytes, { 'Content-Type': type }))
    await assert.rejects(client.torrent('/arquivo'), error => error.kind === 'protocol')
  })
}

for (const length of ['0', '-1', 'invalido', String(MAX_TORRENT_BYTES + 1), String(torrentBytes.length + 1)]) {
  test(`tamanho declarado invalido/inconsistente ${length} e rejeitado`, async () => {
    const client = createHttpClient(base, async () => response(torrentBytes, { 'Content-Length': length }))
    await assert.rejects(client.torrent('/arquivo'), error => error.kind === 'protocol')
  })
}

test('stream sem Content-Length e limitado durante leitura, nao apenas apos montar Blob', async () => {
  let cancelled = false
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1048576)); }, cancel() { cancelled = true } })
  const client = createHttpClient(base, async () => response(stream))
  await assert.rejects(client.torrent('/arquivo'), error => error.kind === 'protocol')
  assert.equal(cancelled, true)
})

test('arquivo vazio e status parcial nao sao oferecidos', async () => {
  for (const reply of [response(new Uint8Array()), new Response(torrentBytes, { status: 206, headers: { 'Content-Type': 'application/x-bittorrent' } })]) {
    const client = createHttpClient(base, async () => reply)
    await assert.rejects(client.torrent('/arquivo'), error => error.kind === 'protocol')
  }
})

test('falha de stream nao revela causa sensivel', async () => {
  const client = createHttpClient(base, async () => response(new ReadableStream({ start(controller) { controller.error(new Error('privado')) } })))
  await assert.rejects(client.torrent('/arquivo'), error => error.kind === 'network' && !String(error).includes('privado'))
})

test('download abortado nao retorna arquivo', async () => {
  const controller = new AbortController()
  const client = createHttpClient(base, async () => { controller.abort(); return response() })
  await assert.rejects(client.torrent('/arquivo', { signal: controller.signal }), error => error.name === 'AbortError')
})

test('401 binario invalida token usado;403 nao encerra sessao', async () => {
  for (const status of [401, 403]) {
    const rejected = []
    const client = createAuthenticatedClient(createHttpClient(base, async () => new Response(null, { status })), {
      getToken: () => 'token-antigo', rejectToken: token => rejected.push(token),
    })
    await assert.rejects(client.torrent('/arquivo'), error => error.status === status)
    assert.deepEqual(rejected, status === 401 ? ['token-antigo'] : [])
  }
})

test('sem sessao helper binario nao dispara HTTP', async () => {
  let calls = 0
  const client = createAuthenticatedClient(createHttpClient(base, async () => { calls++; return response() }), { getToken: () => null, rejectToken: () => assert.fail() })
  await assert.rejects(client.torrent('/arquivo'), error => error.status === 401)
  assert.equal(calls, 0)
})
