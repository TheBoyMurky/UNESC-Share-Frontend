import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createMaterialMagnetAdicaoService, canAddMaterialMagnets, validateMagnetAddition } from '../src/features/material/material-magnet-adicao-service.ts'
import { createMaterialMagnetAdicaoModel } from '../src/features/material/material-magnet-adicao-model.ts'
import { detail, id } from './material-fixtures.mjs'
import { deferred } from './catalog-fixtures.mjs'

const uri = (number = 1) => 'magnet:?xt=urn:btih:' + number.toString(16).padStart(40, '0')
const actor = (perfil = 'USUARIO', key = id(8)) => ({ id: key, perfil })
const snapshot = (changes = {}) => { const dto = { ...detail(), ...changes }; return Object.fromEntries(['id', 'titulo', 'status', 'usuarioId', 'dataCadastro', 'magnets', 'torrents'].map(key => [key, dto[key]])) }
const added = (original = detail(), extra = {}) => ({ ...original, status: 'PENDENTE', magnets: [...original.magnets, { id: id(22), magnetUri: uri(), infoHash: '0'.repeat(39) + '1', dataCadastro: '2026-10-26T12:00:00Z' }], ...extra })
function fixture({ load, add, user = () => actor() } = {}) {
  const calls = []
  const model = createMaterialMagnetAdicaoModel({
    load: async (key, signal) => { calls.push({ kind: 'load', key, signal }); return load ? load(key, signal) : snapshot({ id: key }) },
    add: async (material, uris, userId, signal) => { calls.push({ kind: 'add', material, uris, userId, signal }); return add ? add(material, uris, userId, signal) : { id: material.id } },
  }, user)
  return { model, calls }
}
async function prepare(model) { await model.load(id(10)); model.changeUri(0, '  ' + uri() + '  '); model.setConfirmed(true) }

test('service GET unico porUUID projeta snapshot semdadosacademicos/descricao/extras', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createMaterialMagnetAdicaoService(async (...args) => { calls.push(args); return { ...detail(), email: 'PRIVADO' } })
  assert.deepEqual(await service.load(id(10).toUpperCase(), signal), snapshot())
  assert.deepEqual(calls, [[`/materiais/${id(10)}`, { signal }]])
  await assert.rejects(service.load('../x'), TypeError)
})
test('service POST somente magnetUris trim, estadoPENDENTE/identidade/mecanismos preservados e sucesso soUUID', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createMaterialMagnetAdicaoService(async (...args) => { calls.push(args); return { ...added(), email: 'PRIVADO' } })
  assert.deepEqual(await service.add(snapshot(), ['  ' + uri() + '  '], id(8), signal), { id: id(10) })
  assert.deepEqual(calls, [[`/materiais/${id(10)}/magnets`, { method: 'POST', json: { magnetUris: [uri()] }, signal }]])
})
test('validacao lote1..10/saldo4000/v1-v2-base32/duplicataexata sem reimplementarhashbackend', async () => {
  assert.equal(validateMagnetAddition([uri()], 9), '')
  assert.equal(validateMagnetAddition(Array.from({ length: 10 }, (_, i) => uri(i + 1)), 0), '')
  for (const value of ['magnet:?xt=urn:btih:' + 'A'.repeat(32), 'magnet:?xt=urn:btmh:1220' + 'a'.repeat(64)]) assert.equal(validateMagnetAddition([value], 0), '')
  for (const [uris, existing] of [[[], 0], [[uri()], 10], [[uri(), uri(2)], 9], [[uri()], -1], [[uri()], 1.5], [[uri(), ' ' + uri() + ' '], 0], [[''], 0], [[null], 0], [['https://invalid.test'], 0], [[uri() + '&xt=urn:btih:' + 'b'.repeat(40)], 0], [[uri() + '\u0000'], 0], [[uri() + '&dn=' + 'x'.repeat(4000)], 0]]) assert.ok(validateMagnetAddition(uris, existing))
  const service = createMaterialMagnetAdicaoService(() => assert.fail())
  for (const original of [snapshot({ status: 'BLOQUEADO' }), snapshot({ status: 'REMOVIDO' }), snapshot({ usuarioId: id(9) }), snapshot({ id: 'x' })]) await assert.rejects(service.add(original, [uri()], id(8)), TypeError)
  await assert.rejects(service.add(snapshot(), [uri(), uri()], id(8)), TypeError)
})
test('service rejeita resposta errada deestado-autor-data-ID e perdade mecanismos/sem acrescimo', async () => {
  const source = detail()
  const responses = [added(source, { id: id(11) }), added(source, { status: 'PUBLICADO' }), added(source, { usuarioId: id(9) }), added(source, { dataCadastro: '2026-10-26T12:00:00Z' }), added(source, { torrents: [] }), added(source, { magnets: source.magnets }), added(source, { torrents: [{ ...source.torrents[0], tamanho: 999 }] }), added(source, { magnets: [{ ...source.magnets[0], magnetUri: uri(4) }, added().magnets[1]] })]
  for (const response of responses) await assert.rejects(createMaterialMagnetAdicaoService(async () => response).add(snapshot(), [uri()], id(8)), error => error instanceof ApiError && error.kind === 'protocol')
})
test('service aceita concorrencia com acrescimoextra/metadados novos semexigir snapshot da consulta', async () => {
  const dto = added()
  dto.titulo = 'Alterado em outra aba'; dto.descricao = 'Outro texto'; dto.categoriaId = id(9); dto.visualizacoes++
  dto.magnets.push({ id: id(23), magnetUri: uri(2), infoHash: '0'.repeat(39) + '2', dataCadastro: dto.dataCadastro })
  assert.deepEqual(await createMaterialMagnetAdicaoService(async () => dto).add(snapshot(), [uri()], id(8)), { id: id(10) })
})
test('service rejeita limite incoerente doDTO mesmo aposparse valido', async () => {
  const dto = detail(); dto.magnets = Array.from({ length: 11 }, (_, i) => ({ id: id(100 + i), magnetUri: uri(i + 1), infoHash: (i + 1).toString(16).padStart(40, '0'), dataCadastro: dto.dataCadastro }))
  await assert.rejects(createMaterialMagnetAdicaoService(async () => dto).load(id(10)), ApiError)
})
for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' adiciona apenas aosproprios emPENDENTE/PUBLICADO semprivilegio para terceiros', async () => {
    for (const status of ['PENDENTE', 'PUBLICADO']) {
      const { model, calls } = fixture({ user: () => actor(perfil), load: async () => snapshot({ status }) }); await prepare(model); await model.submit()
      assert.deepEqual(calls.map(x => x.kind), ['load', 'add']); assert.equal(calls[1].userId, id(8)); assert.equal(model.getState().savedId, id(10)); assert.equal(model.getState().material, null); assert.deepEqual(model.getState().uris, []); assert.equal(model.getState().confirmed, false); model.dispose()
    }
    const { model, calls } = fixture({ user: () => actor(perfil), load: async () => snapshot({ usuarioId: id(9) }) }); await model.load(id(10)); model.changeUri(0, uri()); model.setConfirmed(true); await model.submit()
    assert.equal(calls.length, 1); assert.equal(model.getState().material, null); assert.equal(model.getState().denied, true); model.dispose()
  })
}
test('limite10 eestadoBLOQUEADO/REMOVIDO nunca enviam, capacidadeeindependente deTorrents', async () => {
  for (const status of ['BLOQUEADO', 'REMOVIDO']) {
    const { model, calls } = fixture({ load: async () => snapshot({ status }) }); await prepare(model); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().material, null); model.dispose()
  }
  const full = snapshot({ magnets: Array.from({ length: 10 }, (_, i) => ({ ...detail().magnets[0], id: id(100 + i) })) })
  assert.equal(canAddMaterialMagnets(full, id(8)), false)
  const { model, calls } = fixture({ load: async () => full }); await prepare(model); model.addField(); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().material.magnets.length, 10); assert.deepEqual(model.getState().uris, []); model.dispose()
})
test('campos respeitam saldo, edicao/linha/tentativa consomemconfirmacao e mantemordem', async () => {
  const { model, calls } = fixture({ load: async () => snapshot({ magnets: Array.from({ length: 8 }, (_, i) => ({ ...detail().magnets[0], id: id(100 + i) })) }) }); await prepare(model)
  model.addField(); assert.equal(model.getState().confirmed, false); model.addField(); assert.equal(model.getState().uris.length, 2)
  model.changeUri(1, uri(2)); model.setConfirmed(true); model.removeField(0); assert.deepEqual(model.getState().uris, [uri(2)]); assert.equal(model.getState().confirmed, false)
  for (const key of [-1, 9, 0.5]) { model.changeUri(key, 'x'); model.removeField(key) }
  await model.submit(); assert.equal(calls.length, 1); model.setConfirmed(true); await model.submit(); assert.equal(calls.length, 2); model.dispose()
})
test('validador local nao envia loteinvalido/consomeconfirmacao sem ecoarURI', async () => {
  const { model, calls } = fixture(); await prepare(model); model.changeUri(0, 'PRIVADO-invalido'); model.setConfirmed(true); await model.submit()
  assert.equal(calls.length, 1); assert.ok(model.getState().fieldError); assert.equal(model.getState().fieldError.includes('PRIVADO'), false); assert.equal(model.getState().confirmed, false); model.dispose()
})
test('emvoo trava repeticao/edicao/campos/confirmacao/recarga', async () => {
  const pending = deferred(), { model, calls } = fixture({ add: () => pending.promise }); await prepare(model); const saving = model.submit()
  model.changeUri(0, uri(2)); model.addField(); model.removeField(0); model.setConfirmed(true); await model.submit(); await model.reload()
  assert.equal(calls.length, 2); assert.equal(model.getState().sending, true); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().uris.length, 1)
  pending.resolve({ id: id(10) }); await saving; assert.equal(model.getState().savedId, id(10)); await model.submit(); assert.equal(calls.length, 2); model.dispose()
})
test('400 preserva draft consomeconfirmacao e ignoraProblemDetailprivado', async () => {
  const { model, calls } = fixture({ add: async () => { throw new ApiError('http', 400, { detail: 'PRIVADO', errors: [{ field: 'magnetUris[0]', message: 'PRIVADO' }] }) } }); await prepare(model); await model.submit()
  assert.ok(model.getState().material); assert.equal(model.getState().uris[0].trim(), uri()); assert.equal(model.getState().confirmed, false); assert.equal(model.getState().error.includes('PRIVADO'), false)
  await model.submit(); assert.equal(calls.length, 2); model.setConfirmed(true); await model.submit(); assert.equal(calls.length, 3); model.dispose()
})
for (const failure of [new ApiError('http', 409), new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) {
  test('conflito/incerto ' + failure.kind + failure.status + ' descartadados bloqueiareenvio ateGETnovo/novaconfirmacao', async () => {
    const { model, calls } = fixture({ add: async () => { throw failure } }); await prepare(model); await model.submit()
    assert.equal(model.getState().mustReload, true); assert.equal(model.getState().material, null); assert.deepEqual(model.getState().uris, []); assert.equal(model.getState().savedId, '')
    model.changeUri(0, uri()); model.setConfirmed(true); await model.submit(); assert.equal(calls.length, 2); await model.reload(); assert.equal(calls.at(-1).kind, 'load'); assert.deepEqual(model.getState().uris, ['']); assert.equal(model.getState().confirmed, false); model.dispose()
  })
}
for (const code of [401, 403, 404]) {
  test('POST' + code + ' retira todosdados/draft e bloqueiaretry ate novacarga', async () => {
    const { model, calls } = fixture({ add: async () => { throw new ApiError('http', code) } }); await prepare(model); await model.submit()
    assert.equal(model.getState().denied, true); assert.equal(model.getState().material, null); assert.deepEqual(model.getState().uris, []); await model.reload(); await model.submit(); assert.equal(calls.length, 2); await model.load(id(10)); assert.equal(calls.length, 3); model.dispose()
  })
}
test('GETrede/protocolo nao viramregistrovazio e acesso negado retira dados sem reconsultaautomatica', async () => {
  for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 503), new ApiError('http', 401), new ApiError('http', 403), new ApiError('http', 404)]) {
    const { model } = fixture({ load: async () => { throw error } }); await model.load(id(10)); assert.equal(model.getState().material, null); assert.ok(model.getState().loadError); assert.equal(model.getState().denied, [401, 403, 404].includes(error.status)); model.dispose()
  }
})
for (const change of ['Material', 'conta', 'perfil', 'logout', 'dispose']) {
  test('POSTatrasado apos ' + change + ' abortado/ignorado nao repoe URI nem sucesso', async () => {
    let user = actor(); const pending = deferred(), { model, calls } = fixture({ user: () => user, add: () => pending.promise }); await prepare(model); const saving = model.submit()
    if (change === 'conta') user = actor('USUARIO', id(9))
    if (change === 'perfil') user = actor('ADMINISTRADOR')
    if (change === 'logout') user = null
    if (change === 'dispose') model.dispose(); else await model.load(change === 'Material' ? id(11) : id(10))
    pending.reject(new ApiError('http', 403)); await saving; assert.equal(calls[1].signal.aborted, true); assert.equal(model.getState().savedId, ''); assert.equal(model.getState().uris.some(x => x.includes('magnet:')), false); model.dispose()
  })
}
test('semUUID/conta nao enviaGET; mudancadecontasemwatcher retira draft antesPOST', async () => {
  const invalid = fixture({ user: () => null }); await invalid.model.load(id(10)); assert.equal(invalid.calls.length, 0); invalid.model.dispose()
  const bad = fixture(); await bad.model.load('x'); assert.equal(bad.calls.length, 0); bad.model.dispose()
  let user = actor(); const { model, calls } = fixture({ user: () => user }); await prepare(model); user = actor('USUARIO', id(9)); await model.submit(); assert.equal(calls.length, 1); assert.equal(model.getState().material, null); assert.deepEqual(model.getState().uris, []); model.dispose()
})
