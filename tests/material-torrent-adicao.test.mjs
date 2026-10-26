import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, MAX_TORRENT_BYTES } from '../src/shared/http/client.ts'
import { createMaterialTorrentAdicaoService } from '../src/features/material/material-torrent-adicao-service.ts'
import { createMaterialTorrentAdicaoModel } from '../src/features/material/material-torrent-adicao-model.ts'
import { detail, id, torrentBytes } from './material-fixtures.mjs'
import { deferred } from './catalog-fixtures.mjs'

const file = () => new File([torrentBytes], 'adicao.torrent', { type: 'application/x-bittorrent' })
const receipt = () => ({ id: id(22), nomeArquivo: file().name, infoHash: 'b'.repeat(40), tamanho: file().size, dataCadastro: '2026-10-26T12:00:00Z' })
const actor = (perfil = 'USUARIO', key = id(8)) => ({ id: key, perfil })
const snapshot = (changes = {}) => { const dto = { ...detail(), ...changes }; return Object.fromEntries(['id', 'titulo', 'status', 'usuarioId', 'dataCadastro', 'magnets', 'torrents'].map(key => [key, dto[key]])) }
function fixture({ load, add, user = () => actor() } = {}) {
  const calls = []
  const model = createMaterialTorrentAdicaoModel({
    load: async (key, signal) => { calls.push({ kind: 'load', key, signal }); return load ? load(key, signal) : snapshot({ id: key }) },
    add: async (material, selected, userId, signal) => { calls.push({ kind: 'add', material, selected, userId, signal }); return add ? add(material, selected, userId, signal) : { id: material.id, torrentId: id(22) } },
  }, user)
  return { model, calls }
}
async function prepare(model) { await model.load(id(10)); model.selectFiles([file()]); model.setConfirmed(true) }

test('service GET unico projeta snapshot e POST FormData soarquivo semJSON nemseguirLocation', async () => {
  const calls = [], selected = file(), signal = new AbortController().signal
  const service = createMaterialTorrentAdicaoService(async (...args) => { calls.push(args); return { ...detail(), email: 'EXTRA PRIVADO' } }, async (path, options) => {
    calls.push([path, options]); assert.deepEqual([...options.form.keys()], ['arquivo']); const part = options.form.get('arquivo'); assert.equal(part.name, selected.name); assert.equal(part.size, selected.size); assert.deepEqual(new Uint8Array(await part.arrayBuffer()), torrentBytes)
    assert.equal('json' in options, false); assert.equal('headers' in options, false); return { ...receipt(), caminhoArquivo: 'PRIVADO' }
  })
  assert.deepEqual(await service.load(id(10).toUpperCase(), signal), snapshot())
  assert.deepEqual(await service.add(snapshot(), selected, id(8), signal), { id: id(10), torrentId: id(22) })
  assert.equal(calls[0][0], `/materiais/${id(10)}`); assert.deepEqual(calls[0][1], { signal }); assert.equal(calls[1][0], `/materiais/${id(10)}/torrents`); assert.equal(calls[1][1].signal, signal)
})
test('service validaMaterial-autoria-estado-saldo efileantesHTTP', async () => {
  const service = createMaterialTorrentAdicaoService(() => assert.fail(), () => assert.fail())
  await assert.rejects(service.load('../x'), TypeError)
  for (const material of [snapshot({ id: 'x' }), snapshot({ usuarioId: id(9) }), snapshot({ status: 'BLOQUEADO' }), snapshot({ status: 'REMOVIDO' }), snapshot({ torrents: Array(10).fill(detail().torrents[0]) })]) await assert.rejects(service.add(material, file(), id(8)), TypeError)
  for (const selected of [null, new Blob(['x']), new File([], 'a.torrent'), new File(['pdf'], 'a.pdf'), new File(['x'], '../a.torrent'), new File([new Uint8Array(MAX_TORRENT_BYTES + 1)], 'a.torrent')]) await assert.rejects(service.add(snapshot(), selected, id(8)), TypeError)
})
test('service reusa validacao2MiB sem inspecionar metainfo no navegador', async () => {
  const selected = new File([new Uint8Array(MAX_TORRENT_BYTES)], 'limite.torrent')
  const service = createMaterialTorrentAdicaoService(() => assert.fail(), async () => ({ ...receipt(), nomeArquivo: selected.name, tamanho: selected.size }))
  assert.deepEqual(await service.add(snapshot(), selected, id(8)), { id: id(10), torrentId: id(22) })
})
test('service recusaDTO semrecibo novo/nome-tamanho-divergentes/hashnaov1/data/camposinvalidos', async () => {
  for (const changes of [{ id: id(20) }, { id: 'x' }, { nomeArquivo: 'outro.torrent' }, { tamanho: 1 }, { infoHash: 'b'.repeat(64) }, { dataCadastro: 'x' }]) await assert.rejects(createMaterialTorrentAdicaoService(() => assert.fail(), async () => ({ ...receipt(), ...changes })).add(snapshot(), file(), id(8)), error => error instanceof ApiError && error.kind === 'protocol')
  await assert.rejects(createMaterialTorrentAdicaoService(() => assert.fail(), async () => undefined).add(snapshot(), file(), id(8)), ApiError)
})
for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' soautoriaPENDENTE/PUBLICADO semexcecaodeequipe', async () => {
    for (const status of ['PENDENTE', 'PUBLICADO']) {
      const { model, calls } = fixture({ user: () => actor(perfil), load: async () => snapshot({ status }) }); await prepare(model); await model.submit()
      assert.deepEqual(calls.map(x => x.kind), ['load', 'add']); assert.equal(model.getState().savedId, id(10)); assert.equal(model.getState().torrentId, id(22)); assert.equal(model.getState().material, null); assert.equal(model.getState().file, null); model.dispose()
    }
    const { model, calls } = fixture({ user: () => actor(perfil), load: async () => snapshot({ usuarioId: id(9) }) }); await prepare(model); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().denied, true); assert.equal(model.getState().file, null); model.dispose()
  })
}
test('limite10 independenteMagnets eMaterialprivado naoenvia', async () => {
  for (const material of [snapshot({ status: 'BLOQUEADO' }), snapshot({ status: 'REMOVIDO' }), snapshot({ torrents: Array(10).fill(detail().torrents[0]) })]) {
    const { model, calls } = fixture({ load: async () => material }); await prepare(model); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().file, null); model.dispose()
  }
  const { model, calls } = fixture({ load: async () => snapshot({ magnets: Array(10).fill(detail().magnets[0]) }) }); await prepare(model); await model.submit(); assert.equal(calls.length, 2); model.dispose()
})
test('selecao exigeumFile/invalidacao limpa anterior e trocar-limpar consomeconfirmacao', async () => {
  const { model, calls } = fixture(); await prepare(model)
  for (const files of [[], [file(), file()], [new File(['x'], 'a.pdf')]]) { model.selectFiles(files); assert.equal(model.getState().file, null); assert.equal(model.getState().confirmed, false); assert.ok(model.getState().fieldError) }
  model.selectFiles([file()]); model.setConfirmed(true); model.selectFiles([file()]); assert.equal(model.getState().confirmed, false)
  model.setConfirmed(true); model.clearFile(); assert.equal(model.getState().file, null); assert.equal(model.getState().confirmed, false); await model.submit(); assert.equal(calls.length, 1); model.dispose()
})
test('confirmarsemfile naoeenvio/consomeconfirmacao e naoexibe nomeprivadonoerro', async () => {
  const { model, calls } = fixture(); await model.load(id(10)); model.setConfirmed(true); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().confirmed, false); assert.ok(model.getState().fieldError); model.dispose()
})
test('emvoo trava selecao/limpeza/confirmacao/recarga/duplicidade', async () => {
  const pending = deferred(), { model, calls } = fixture({ add: () => pending.promise }); await prepare(model); const sending = model.submit(); const original = model.getState().file
  model.selectFiles([new File(['x'], 'outro.torrent')]); model.clearFile(); model.setConfirmed(true); await model.reload(); await model.submit(); assert.equal(calls.length, 2); assert.equal(model.getState().file, original); assert.equal(model.getState().confirmed, false)
  pending.resolve({ id: id(10), torrentId: id(22) }); await sending; assert.equal(model.getState().file, null); await model.submit(); assert.equal(calls.length, 2); model.dispose()
})
for (const code of [400, 413, 415]) {
  test('POST' + code + ' soltaFile eexigereelecao-confirmacao semcorpoprivado', async () => {
    const { model, calls } = fixture({ add: async () => { throw new ApiError('http', code, { detail: 'PRIVADO', errors: [] }) } }); await prepare(model); await model.submit()
    assert.ok(model.getState().material); assert.equal(model.getState().file, null); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().error.includes('PRIVADO'), false); await model.submit(); assert.equal(calls.length, 2)
    model.selectFiles([file()]); model.setConfirmed(true); await model.submit(); assert.equal(calls.length, 3); model.dispose()
  })
}
for (const error of [new ApiError('http', 409), new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) {
  test('conflito/incerto ' + error.kind + error.status + ' liberafile-snapshot exigeGETnovo semretry', async () => {
    const { model, calls } = fixture({ add: async () => { throw error } }); await prepare(model); await model.submit()
    assert.equal(model.getState().mustReload, true); assert.equal(model.getState().material, null); assert.equal(model.getState().file, null); assert.equal(model.getState().torrentId, '')
    model.selectFiles([file()]); model.setConfirmed(true); await model.submit(); assert.equal(calls.length, 2); await model.reload(); assert.equal(calls.at(-1).kind, 'load'); assert.equal(model.getState().file, null); assert.equal(model.getState().confirmed, false); model.dispose()
  })
}
for (const code of [401, 403, 404]) {
  test('POST' + code + ' retiratodosdados e bloqueiaatecargaexplicita', async () => {
    const { model, calls } = fixture({ add: async () => { throw new ApiError('http', code) } }); await prepare(model); await model.submit(); assert.equal(model.getState().denied, true); assert.equal(model.getState().file, null); assert.equal(model.getState().material, null)
    await model.reload(); await model.submit(); assert.equal(calls.length, 2); await model.load(id(10)); assert.equal(calls.length, 3); model.dispose()
  })
}
test('GETnegado retiraalvo, rede/protocolo daoerrosemregistrovazio nemFile', async () => {
  for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 503), new ApiError('http', 401), new ApiError('http', 403), new ApiError('http', 404)]) {
    const { model } = fixture({ load: async () => { throw error } }); await model.load(id(10)); assert.equal(model.getState().material, null); assert.equal(model.getState().file, null); assert.ok(model.getState().loadError); assert.equal(model.getState().denied, [401, 403, 404].includes(error.status)); model.dispose()
  }
})
for (const change of ['Material', 'conta', 'perfil', 'logout', 'dispose']) {
  test('POSTatrasado apos ' + change + ' aborta/ignora File-recibo-sucesso', async () => {
    let user = actor(); const pending = deferred(), { model, calls } = fixture({ user: () => user, add: () => pending.promise }); await prepare(model); const sending = model.submit()
    if (change === 'conta') user = actor('USUARIO', id(9))
    if (change === 'perfil') user = actor('ADMINISTRADOR')
    if (change === 'logout') user = null
    if (change === 'dispose') model.dispose(); else await model.load(change === 'Material' ? id(11) : id(10))
    pending.reject(new ApiError('http', 403)); await sending; assert.equal(calls[1].signal.aborted, true); assert.equal(model.getState().file, null); assert.equal(model.getState().torrentId, ''); assert.equal(model.getState().savedId, ''); model.dispose()
  })
}
test('UUID/contaausente semGET eperdadecontasemwatcher impedePOST/descartaFile', async () => {
  const invalid = fixture({ user: () => null }); await invalid.model.load(id(10)); assert.equal(invalid.calls.length, 0); invalid.model.dispose()
  const bad = fixture(); await bad.model.load('x'); assert.equal(bad.calls.length, 0); bad.model.dispose()
  let user = actor(); const { model, calls } = fixture({ user: () => user }); await prepare(model); user = actor('USUARIO', id(9)); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().file, null); model.dispose()
})
