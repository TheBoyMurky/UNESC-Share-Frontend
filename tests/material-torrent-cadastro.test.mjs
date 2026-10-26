import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMaterialCadastroService, validateTorrentFile } from '../src/features/material/material-cadastro-service.ts'
import { createMaterialCadastroModel } from '../src/features/material/material-cadastro-model.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createHttpClient, ApiError, MAX_TORRENT_BYTES } from '../src/shared/http/client.ts'
import { detail, torrentBytes } from './material-fixtures.mjs'
import { input, id, magnetUri, prepare } from './material-cadastro-fixtures.mjs'
import { mockService, deferred } from './catalog-fixtures.mjs'

const metadata = () => { const { magnetUris, ...fields } = input(); return fields }
const file = (name = 'material.torrent', bytes = torrentBytes, type = '') => new File([bytes], name, { type })
const created = () => ({ ...detail(), status: 'PENDENTE', magnets: [] })

test('multipart tem exatamente JSON projetado e arquivo original, sem Magnets/autor/status ou chamadas JSON', async () => {
  const controller = new AbortController(), selected = file()
  let calls = 0
  const service = createMaterialCadastroService(async () => assert.fail('JSON nao deve ser chamado'), async (path, options) => {
    calls++
    assert.equal(path, '/materiais')
    assert.equal(options.signal, controller.signal)
    assert.deepEqual([...options.form.keys()], ['material', 'arquivo'])
    const part = options.form.get('material'), binary = options.form.get('arquivo')
    assert.equal(part.type, 'application/json')
    assert.deepEqual(JSON.parse(await part.text()), metadata())
    assert.equal(binary.name, selected.name)
    assert.deepEqual(new Uint8Array(await binary.arrayBuffer()), torrentBytes)
    return { ...created(), email: 'nao-conservar' }
  })
  assert.deepEqual(await service.cadastrarComTorrent({ ...input(), titulo: ' ' + input().titulo + ' ', usuarioId: id(99), status: 'PUBLICADO', caminhoArquivo: '/privado' }, selected, controller.signal), { id: id(10) })
  assert.equal(calls, 1)
})

test('arquivo aceita1byte/2MiB e MIMEvariavel sem afirmar validacao de metainfo', () => {
  for (const selected of [file('MATERIAL.TORRENT', new Uint8Array(1), 'application/octet-stream'), file('material.torrent', new Uint8Array(MAX_TORRENT_BYTES)), file('exemplo.torrent', torrentBytes, 'application/x-bittorrent')]) assert.equal(validateTorrentFile(selected), '')
})

for (const selected of [null, file('material.pdf'), file('material.torrent.exe'), file('.oculto.torrent'), file(' material.torrent'), file('a/b.torrent'), file('a\\b.torrent'), file('a:b.torrent'), file('a%20b.torrent'), file('a\nb.torrent'), file('a'.repeat(256) + '.torrent'), file('vazio.torrent', new Uint8Array()), file('grande.torrent', new Uint8Array(MAX_TORRENT_BYTES + 1))]) {
  test('arquivo ausente/invalido nao inicia POST e erro nao ecoa nome/caminho', async () => {
    assert.ok(validateTorrentFile(selected))
    let calls = 0
    const service = createMaterialCadastroService(async () => { calls++ }, async () => { calls++ })
    await assert.rejects(service.cadastrarComTorrent(metadata(), selected), TypeError)
    assert.equal(calls, 0)
  })
}

test('metadados invalidos impedem multipart antes de montar request', async () => {
  let calls = 0
  const service = createMaterialCadastroService(async () => { calls++ }, async () => { calls++ })
  await assert.rejects(service.cadastrarComTorrent({ ...metadata(), titulo: ' ' }, file()), TypeError)
  assert.equal(calls, 0)
})

for (const change of [{ status: 'PUBLICADO' }, { torrents: [] }, { torrents: [detail().torrents[0], { ...detail().torrents[0], id: id(99) }] }, { magnets: detail().magnets }, { disciplinaId: id(99) }, { categoriaId: id(99) }, { torrents: [{ ...detail().torrents[0], tamanho: 1 }] }]) {
  test('resposta naoPENDENTE/incompleta/divergente e protocolo, sem GET ou novoPOST', async () => {
    let calls = 0
    const service = createMaterialCadastroService(async () => assert.fail(), async () => { calls++; return { ...created(), ...change } })
    await assert.rejects(service.cadastrarComTorrent(metadata(), file()), error => error.kind === 'protocol')
    assert.equal(calls, 1)
  })
}

test('helper multipart envia FormData sem Content-Type manual com Bearer e politicas existentes', async () => {
  const form = new FormData(), controller = new AbortController()
  form.append('arquivo', file())
  const client = createHttpClient('https://example.test/api/v1', async (url, init) => {
    assert.equal(String(url), 'https://example.test/api/v1/materiais')
    assert.equal(init.method, 'POST')
    assert.equal(init.body, form)
    assert.equal(init.headers.has('Content-Type'), false)
    assert.equal(init.headers.get('Authorization'), 'Bearer sintetico')
    assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error')
    assert.equal(init.signal, controller.signal)
    return new Response('{"ok":true}', { status: 201, headers: { 'Content-Type': 'application/json' } })
  })
  assert.deepEqual(await client.multipart('/materiais', { form, token: 'sintetico', signal: controller.signal }), { ok: true })
})

for (const status of [400, 401, 403, 409, 413, 415, 503]) {
  test(`helper multipart preserva status${status} vazio e invalida somente401 do token usado`, async () => {
    const rejected = []
    const authenticated = createAuthenticatedClient(createHttpClient('https://example.test/api/v1', async () => new Response(null, { status })), { getToken: () => 'atual', rejectToken: used => rejected.push(used) })
    await assert.rejects(authenticated.multipart('/materiais', { form: new FormData() }), error => error instanceof ApiError && error.status === status)
    assert.deepEqual(rejected, status === 401 ? ['atual'] : [])
  })
}

test('multipart sem token ou rota externa nao faz HTTP, falha de rede sanitizada e cancelamento preservado', async () => {
  let calls = 0
  const client = createHttpClient('https://example.test/api/v1', async () => { calls++; throw new Error('caminho-ou-token-privado') })
  const authenticated = createAuthenticatedClient(client, { getToken: () => null, rejectToken: () => assert.fail() })
  await assert.rejects(authenticated.multipart('/materiais', { form: new FormData() }), error => error.status === 401)
  await assert.rejects(client.multipart('//outro.test', { form: new FormData(), token: 'sintetico' }), TypeError)
  assert.equal(calls, 0)
  await assert.rejects(client.multipart('/materiais', { form: new FormData() }), error => error.kind === 'network' && !String(error).includes('privado'))
  const controller = new AbortController(); controller.abort()
  await assert.rejects(client.multipart('/materiais', { form: new FormData(), signal: controller.signal }), error => error.name === 'AbortError')
})

test('troca de mecanismo limpa dados inativos preserva metadados/referencias e nao permite envio misto', async () => {
  const calls = []
  const model = createMaterialCadastroModel(mockService(), { cadastrar: async data => { calls.push(['json', data]); return { id: id(10) } }, cadastrarComTorrent: async (data, selected) => { calls.push(['multipart', data, selected]); return { id: id(10) } } })
  await prepare(model)
  model.setMode('TORRENT'); model.selectTorrent([file()])
  model.changeMagnet(0, magnetUri); model.addMagnet()
  assert.deepEqual(model.getState().draft.magnetUris, [''])
  assert.equal(model.getState().draft.disciplinaId, id(5))
  await model.submit()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'multipart')
  assert.deepEqual(calls[0][1], metadata())
  assert.equal(model.getState().file, null)
  assert.equal(model.getState().createdId, id(10))
  await model.submit(); assert.equal(calls.length, 1)
})

test('troca de volta limpa File/URIs, opcao invalida ignorada e referencia permanece', async () => {
  const model = createMaterialCadastroModel(mockService(), { cadastrar: async () => assert.fail() })
  await prepare(model)
  model.setMode('TORRENT'); model.selectTorrent([file()]); model.setMode('MAGNET')
  assert.equal(model.getState().file, null)
  assert.deepEqual(model.getState().draft.magnetUris, [''])
  assert.equal(model.getState().draft.titulo, input().titulo)
  model.setMode('OUTRO'); assert.equal(model.getState().mode, 'MAGNET')
})

test('selecao vazia/multipla/invalida limpa File anterior, pode remover/reselecionar mesmoFile e nao envia', async () => {
  let calls = 0
  const model = createMaterialCadastroModel(mockService(), { cadastrar: async () => { calls++ }, cadastrarComTorrent: async () => { calls++ } })
  await prepare(model); model.setMode('TORRENT')
  const selected = file()
  for (const files of [[], [selected, selected], [file('invalido.pdf')]]) {
    model.selectTorrent([selected]); model.selectTorrent(files)
    assert.equal(model.getState().file, null)
    await model.submit(); assert.equal(calls, 0)
    assert.ok(model.getState().fields.arquivo)
  }
  model.selectTorrent([selected]); model.clearTorrent(); assert.equal(model.getState().file, null)
  model.selectTorrent([selected]); assert.equal(model.getState().file, selected)
})

test('envio multipart pendente bloqueia troca/arquivo/duploPOST; dispose aborta e ignora sucesso', async () => {
  const pending = deferred(); let calls = 0, signal
  const model = createMaterialCadastroModel(mockService(), { cadastrar: async () => assert.fail(), cadastrarComTorrent: async (_, __, provided) => { calls++; signal = provided; return pending.promise } })
  await prepare(model); model.setMode('TORRENT'); const selected = file(); model.selectTorrent([selected])
  const running = model.submit()
  model.setMode('MAGNET'); model.selectTorrent([file('outro.torrent')]); model.clearTorrent(); await model.submit()
  assert.equal(calls, 1); assert.equal(model.getState().file, selected)
  model.dispose(); assert.equal(signal.aborted, true)
  pending.resolve({ id: id(10) }); await running
  assert.equal(model.getState().file, null); assert.equal(model.getState().createdId, '')
})

for (const error of [new ApiError('http', 413), new ApiError('http', 415), new ApiError('http', 409), new ApiError('http', 503), new ApiError('network'), new ApiError('protocol')]) {
  test('erro multipart conserva File em RAM para correcao e nao repete automaticamente', async () => {
    let calls = 0
    const model = createMaterialCadastroModel(mockService(), { cadastrar: async () => assert.fail(), cadastrarComTorrent: async () => { calls++; throw error } })
    await prepare(model); model.setMode('TORRENT'); const selected = file(); model.selectTorrent([selected]); await model.submit()
    assert.equal(calls, 1); assert.equal(model.getState().file, selected); assert.equal(model.getState().createdId, '')
    assert.equal(model.getState().uncertain, error.status === 503 || error.kind !== 'http')
    model.dispose(); assert.equal(model.getState().file, null)
  })
}
