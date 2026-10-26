import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMaterialRemocaoService, canRemoveMaterial } from '../src/features/material/material-remocao-service.ts'
import { createMaterialRemocaoModel } from '../src/features/material/material-remocao-model.ts'
import { createHttpClient, ApiError } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { detail, id } from './material-fixtures.mjs'
import { deferred } from './catalog-fixtures.mjs'

const summary = (number = 10, status = 'PUBLICADO') => ({ id: id(number), titulo: detail(number).titulo, usuarioId: id(8), status, torrentCount: 1, magnetCount: 1 })
function fixture(overrides = {}) {
  let identity = id(8)
  const calls = []
  const model = createMaterialRemocaoModel({
    load: async (key, signal) => { calls.push({ type: 'load', key, signal }); return overrides.load ? overrides.load(key, signal) : summary() },
    remove: async (key, signal) => { calls.push({ type: 'remove', key, signal }); if (overrides.remove) await overrides.remove(key, signal) },
  }, () => identity)
  return { model, calls, setIdentity: value => { identity = value } }
}

for (const status of ['PENDENTE', 'PUBLICADO', 'BLOQUEADO', 'REMOVIDO']) {
  test(`link de remocao em${status} exige autor e nao concede excecao de equipe`, () => {
    for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
      const data = { ...detail(), status, perfil }
      assert.equal(canRemoveMaterial(data, id(8)), status !== 'REMOVIDO')
      assert.equal(canRemoveMaterial(data, id(99)), false)
      assert.equal(canRemoveMaterial(data, null), false)
    }
  })
}

test('service consulta alvo porUUID/projeta so resumo e DELETEusa mesmo alvo sem corpo ou parametros de autoria', async () => {
  const signal = new AbortController().signal, reads = [], writes = []
  const service = createMaterialRemocaoService(async (path, options) => { reads.push({ path, options }); return { ...detail(), email: 'nao-conservar', caminhoArquivo: 'nao-conservar' } }, async (path, options) => { writes.push({ path, options }) })
  assert.deepEqual(await service.load(id(10), signal), summary())
  assert.equal(writes.length, 0)
  assert.equal(await service.remove(id(10), signal), undefined)
  assert.deepEqual(reads, [{ path: '/materiais/' + id(10), options: { signal } }])
  assert.deepEqual(writes, [{ path: '/materiais/' + id(10), options: { signal } }])
})

test('UUID invalido e DTO de alvo divergente nao sao aceitos nem ecoam entrada privada', async () => {
  let reads = 0, writes = 0
  const service = createMaterialRemocaoService(async () => { reads++; return detail(99) }, async () => { writes++ })
  await assert.rejects(service.load('url-privada'), TypeError)
  await assert.rejects(service.remove('url-privada'), TypeError)
  assert.equal(reads, 0); assert.equal(writes, 0)
  await assert.rejects(service.load(id(10)), error => error.kind === 'protocol')
  assert.equal(writes, 0)
})

test('DELETEhelper exige204 sem consumirJSON, Bearer somenteheader e sem corpo/ContentType/cookies/cache/redirect', async () => {
  const signal = new AbortController().signal
  const client = createHttpClient('https://example.test/api/v1', async (url, options) => {
    assert.equal(String(url), 'https://example.test/api/v1/materiais/' + id(10))
    assert.equal(options.method, 'DELETE'); assert.equal(options.body, undefined)
    assert.equal(options.headers.get('Authorization'), 'Bearer sintetico')
    assert.equal(options.headers.has('Content-Type'), false)
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error')
    assert.equal(options.signal, signal)
    const response = new Response(null, { status: 204 })
    response.json = () => assert.fail('204 nao deve ler JSON')
    return response
  })
  assert.equal(await client.delete('/materiais/' + id(10), { token: 'sintetico', signal }), undefined)
})

for (const status of [200, 202, 205]) {
  test(`2xxinesperado${status} nao e anunciado como remocao confirmada`, async () => {
    const client = createHttpClient('https://example.test/api/v1', async () => new Response(null, { status }))
    await assert.rejects(client.delete('/materiais/' + id(10)), error => error.kind === 'protocol')
  })
}

for (const status of [400, 401, 403, 404, 409, 503]) {
  test(`DELETEhelper preserva status${status} vazio; somente401 invalida token utilizado`, async () => {
    const rejected = []
    const client = createAuthenticatedClient(createHttpClient('https://example.test/api/v1', async () => new Response(null, { status })), { getToken: () => 'atual', rejectToken: used => rejected.push(used) })
    await assert.rejects(client.delete('/materiais/' + id(10)), error => error.status === status)
    assert.deepEqual(rejected, status === 401 ? ['atual'] : [])
  })
}

test('DELETE sem acesso/rota externa nao fazHTTP; rede e cancelamento sao sanitizados', async () => {
  let calls = 0
  const client = createHttpClient('https://example.test/api/v1', async () => { calls++; throw new Error('token-ou-URL-privada') })
  const auth = createAuthenticatedClient(client, { getToken: () => null, rejectToken: () => assert.fail() })
  await assert.rejects(auth.delete('/materiais/' + id(10)), error => error.status === 401)
  await assert.rejects(client.delete('//outra.test'), TypeError)
  assert.equal(calls, 0)
  await assert.rejects(client.delete('/materiais/' + id(10)), error => error.kind === 'network' && !String(error).includes('privada'))
  const controller = new AbortController(); controller.abort()
  await assert.rejects(client.delete('/materiais/' + id(10), { signal: controller.signal }), error => error.name === 'AbortError')
})

for (const status of ['PENDENTE', 'PUBLICADO', 'BLOQUEADO']) {
  test(`abrir${status} nao fazDELETE, exige confirmacao e permite remover proprio`, async () => {
    const { model, calls } = fixture({ load: async () => summary(10, status) })
    await model.load(id(10)); await model.submit()
    assert.deepEqual(calls.map(call => call.type), ['load'])
    model.setConfirmed('true'); await model.submit()
    assert.equal(calls.length, 1)
    model.setConfirmed(true); await model.submit(); await model.submit()
    assert.equal(calls.filter(call => call.type === 'remove').length, 1)
    assert.equal(model.getState().result, 'removed')
    assert.equal(model.getState().material.status, 'REMOVIDO')
    assert.equal(model.getState().confirmed, false)
  })
}

test('jaREMOVIDO mostra resultado de consulta sem novoDELETE e sem restauracao', async () => {
  const { model, calls } = fixture({ load: async () => summary(10, 'REMOVIDO') })
  await model.load(id(10)); model.setConfirmed(true); await model.submit()
  assert.equal(model.getState().result, 'alreadyRemoved')
  assert.equal(model.getState().confirmed, false)
  assert.equal(calls.length, 1)
})

test('terceiro nao recebe resumo para confirmar nem enviaDELETE; UUIDinvalido/semidentidade nao fazemHTTP', async () => {
  const { model, calls, setIdentity } = fixture({ load: async () => ({ ...summary(), usuarioId: id(99) }) })
  await model.load('invalido'); setIdentity(null); await model.load(id(10)); assert.equal(calls.length, 0)
  setIdentity(id(8)); await model.load(id(10)); model.setConfirmed(true); await model.submit()
  assert.equal(model.getState().material, null); assert.ok(model.getState().loadError)
  assert.equal(calls.filter(call => call.type === 'remove').length, 0)
})

test('desmarcar cancela confirmacao e recarregar/trocarUUID nao a reaproveita', async () => {
  const { model, calls } = fixture({ load: async key => summary(key === id(10) ? 10 : 11) })
  await model.load(id(10)); model.setConfirmed(true); model.setConfirmed(false); await model.submit()
  model.setConfirmed(true); await model.reload(); await model.submit()
  model.setConfirmed(true); await model.load(id(11)); await model.submit()
  assert.equal(model.getState().material.id, id(11))
  assert.equal(model.getState().confirmed, false)
  assert.equal(calls.filter(call => call.type === 'remove').length, 0)
})

test('GETantigo abortado nao troca alvo atual nem reaplica confirmacao', async () => {
  const pending = deferred(), { model, calls } = fixture({ load: async key => key === id(10) ? pending.promise : summary(11) })
  const old = model.load(id(10)); await model.load(id(11)); model.setConfirmed(true)
  pending.resolve(summary()); await old
  assert.equal(calls[0].signal.aborted, true)
  assert.equal(model.getState().material.id, id(11))
  await model.submit()
  assert.equal(calls.at(-1).key, id(11))
})

test('duploDELETEbloqueado e dispose aborta/ignora sucesso sem prometer rollback', async () => {
  const pending = deferred(), { model, calls } = fixture({ remove: () => pending.promise })
  await model.load(id(10)); model.setConfirmed(true)
  const running = model.submit(); model.setConfirmed(true); await model.submit()
  assert.equal(calls.filter(call => call.type === 'remove').length, 1)
  assert.equal(model.getState().confirmed, false)
  model.dispose(); assert.equal(calls.at(-1).signal.aborted, true)
  pending.resolve(); await running; await model.load(id(11)); await model.submit()
  assert.equal(model.getState().material, null); assert.equal(model.getState().result, '')
})

test('trocarUUID duranteDELETE nao transfere confirmacao/sucesso para novo alvo', async () => {
  const pending = deferred()
  const { model, calls } = fixture({ load: async key => summary(key === id(10) ? 10 : 11), remove: () => pending.promise })
  await model.load(id(10)); model.setConfirmed(true)
  const running = model.submit()
  const deletion = calls.at(-1)
  await model.load(id(11)); await model.submit()
  assert.equal(deletion.signal.aborted, true)
  pending.resolve(); await running
  assert.equal(model.getState().material.id, id(11))
  assert.equal(model.getState().material.status, 'PUBLICADO')
  assert.equal(model.getState().confirmed, false)
  assert.equal(model.getState().result, '')
  assert.equal(calls.filter(call => call.type === 'remove').length, 1)
})

test('incerto aindaPUBLICADO exige GETnovo e nova confirmacao antes de outra tentativa', async () => {
  let attempts = 0
  const { model, calls } = fixture({ remove: async () => { if (++attempts === 1) throw new ApiError('network') } })
  await model.load(id(10)); model.setConfirmed(true); await model.submit()
  model.setConfirmed(true); await model.submit(); assert.equal(attempts, 1)
  await model.reload(); await model.submit()
  assert.equal(model.getState().confirmed, false)
  assert.equal(attempts, 1)
  model.setConfirmed(true); await model.submit()
  assert.equal(attempts, 2)
  assert.equal(calls.filter(call => call.type === 'load').length, 2)
  assert.equal(model.getState().result, 'removed')
})

for (const saving of [false, true]) {
  test(`mudar conta durante${saving ? 'DELETE' : 'GET'} descarta dados e resultado antigo`, async () => {
    const pending = deferred(), f = fixture(saving ? { remove: () => pending.promise } : { load: () => pending.promise })
    let running
    if (saving) { await f.model.load(id(10)); f.model.setConfirmed(true); running = f.model.submit() }
    else running = f.model.load(id(10))
    f.setIdentity(id(99)); pending.resolve(saving ? undefined : summary()); await running
    assert.equal(f.model.getState().material, null); assert.equal(f.model.getState().result, '')
    assert.equal(f.model.getState().confirmed, false); assert.ok(f.model.getState().loadError)
  })
}

for (const status of [400, 403, 404, 409]) {
  test(`erro${status} consome confirmacao e exige nova acao explicita sem echo de ProblemDetail`, async () => {
    const { model, calls } = fixture({ remove: async () => { throw new ApiError('http', status, { title: 'URI-privada', detail: 'URI-privada', errors: [] }) } })
    await model.load(id(10)); model.setConfirmed(true); await model.submit(); await model.submit()
    assert.equal(model.getState().confirmed, false); assert.equal(model.getState().result, '')
    assert.equal(model.getState().error.includes('URI-privada'), false)
    assert.equal(calls.filter(call => call.type === 'remove').length, 1)
  })
}

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 503), new ApiError('http', 408), new Error('URI-privada')]) {
  test('resultado incerto bloqueia nova confirmacao/DELETE ate consultar novamente; REMOVIDOobservado nao repete', async () => {
    let removed = false
    const { model, calls } = fixture({ load: async () => summary(10, removed ? 'REMOVIDO' : 'PUBLICADO'), remove: async () => { removed = true; throw error } })
    await model.load(id(10)); model.setConfirmed(true); await model.submit()
    assert.equal(model.getState().uncertain, true); assert.equal(model.getState().confirmed, false)
    model.setConfirmed(true); await model.submit()
    assert.equal(calls.filter(call => call.type === 'remove').length, 1)
    assert.equal(model.getState().error.includes('URI-privada'), false)
    await model.reload(); assert.equal(model.getState().result, 'alreadyRemoved')
    model.setConfirmed(true); await model.submit()
    assert.equal(calls.filter(call => call.type === 'remove').length, 1)
  })
}
