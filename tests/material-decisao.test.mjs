import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { canDecideMaterial, createMaterialDecisaoService } from '../src/features/moderacao/material-decisao-service.ts'
import { createMaterialDecisaoModel } from '../src/features/moderacao/material-decisao-model.ts'
import { deferred } from './catalog-fixtures.mjs'
import { academic, detail, id, payload, magnetUri } from './material-fixtures.mjs'

const staff = (perfil = 'MODERADOR', key = id(8)) => ({ id: key, perfil })
function fixture({ status = 'PENDENTE', user = () => staff(), decide, read, names, download } = {}) {
  let source = { ...detail(), status }; const writes = [], reads = [], copies = [], saves = []
  const model = createMaterialDecisaoModel({
    detail: async (key, signal) => { reads.push({ key, signal }); return read ? read(key, signal) : structuredClone(source) },
    academic: names ?? (async () => academic), download: download ?? (async () => payload()),
  }, { copy: async uri => { copies.push(uri) }, save: value => { saves.push(value) } }, {
    decide: async (key, action, signal) => { writes.push({ key, action, signal }); if (decide) return decide(key, action, signal); source = { ...source, status: action === 'publicar' ? 'PUBLICADO' : 'BLOQUEADO' }; return source },
  }, user)
  return { model, writes, reads, copies, saves }
}
for (const action of ['publicar', 'bloquear']) {
  test('service ' + action + ': POST sem corpo, UUID normalizado, resposta projetada e estado conferido', async () => {
    const calls = [], controller = new AbortController()
    const service = createMaterialDecisaoService(async (...args) => { calls.push(args); return { ...detail(), status: action === 'publicar' ? 'PUBLICADO' : 'BLOQUEADO', segredo: 'PRIVADO' } })
    const result = await service.decide(id(10).toUpperCase(), action, controller.signal)
    assert.deepEqual(calls, [[`/materiais/${id(10)}/${action === 'publicar' ? 'publicacao' : 'bloqueio'}`, { method: 'POST', signal: controller.signal }]])
    assert.equal('segredo' in result, false)
  })
}
test('service rejeita alvo/acao invalidos antesHTTP e resposta de outroUUID/estado ou publicacao sem mecanismo', async () => {
  let calls = 0, response = { ...detail(), status: 'PUBLICADO' }
  const service = createMaterialDecisaoService(async () => { calls++; return response })
  await assert.rejects(service.decide('../x', 'publicar'), TypeError); await assert.rejects(service.decide(id(10), 'restaurar'), TypeError); assert.equal(calls, 0)
  for (const value of [undefined, { ...response, id: id(99) }, { ...response, status: 'PENDENTE' }, { ...response, magnets: [], torrents: [] }]) {
    response = value; await assert.rejects(service.decide(id(10), 'publicar'), error => error instanceof ApiError && error.kind === 'protocol')
  }
})
for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' publica proprio Material com confirmacao consumida e reconsulta, sem autoPOST', async () => {
    const { model, writes, reads } = fixture({ user: () => staff(perfil) }); await model.load(id(10))
    assert.equal(model.getState().material.usuarioId, id(8)); assert.equal(writes.length, 0)
    await model.submit(); model.choose('publicar'); await model.submit(); assert.equal(writes.length, 0)
    model.setConfirmed(true); await model.submit()
    assert.equal(writes.length, 1); assert.equal(writes[0].action, 'publicar'); assert.equal(reads.length, 2)
    assert.equal(model.getState().material.status, 'PUBLICADO'); assert.equal(model.getDecisionState().confirmed, false); assert.ok(model.getDecisionState().message)
    await model.submit(); assert.equal(writes.length, 1); model.dispose()
  })
  test(perfil + ' pode publicar Material de outro autor sem impersonar autoria', async () => {
    const { model, writes } = fixture({ user: () => staff(perfil, id(9)) }); await model.load(id(10)); model.choose('publicar'); model.setConfirmed(true); await model.submit()
    assert.equal(writes.length, 1); assert.equal(model.getState().material.usuarioId, id(8)); model.dispose()
  })
}
for (const [status, publish, block] of [['PENDENTE', true, true], ['PUBLICADO', false, true], ['BLOQUEADO', false, true], ['REMOVIDO', false, false]]) {
  test('decisoes no estado ' + status + ' preservam regras de publicacao/bloqueio', async () => {
    const { model, writes } = fixture({ status }); await model.load(id(10))
    assert.equal(model.canChoose('publicar'), publish); assert.equal(model.canChoose('bloquear'), block)
    if (!publish) { model.choose('publicar'); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 0) }
    if (block) { model.choose('bloquear'); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 1); assert.equal(model.getState().material.status, 'BLOQUEADO') }
    else { model.choose('bloquear'); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 0) }
    model.dispose()
  })
}
test('publicacao sem mecanismo indisponivel; usuario comum/sem conta/UUID invalido nao decide', async () => {
  assert.equal(canDecideMaterial({ ...detail(), status: 'PENDENTE', torrents: [], magnets: [] }, staff(), 'publicar'), false)
  for (const user of [null, staff('USUARIO'), staff('DESCONHECIDO'), staff('MODERADOR', 'x')]) {
    const { model, writes, reads } = fixture({ user: () => user }); await model.load(id(10)); model.choose('publicar'); model.setConfirmed(true); await model.submit()
    assert.equal(reads.length, 0); assert.equal(writes.length, 0); model.dispose()
  }
})
test('trocar acao/cancelar/recarga consome confirmacao e selecao bloqueia copia/download', async () => {
  const { model, writes, copies, saves } = fixture(); await model.load(id(10)); model.choose('publicar'); model.setConfirmed(true)
  await model.copy(id(21)); await model.download(id(20)); assert.equal(copies.length + saves.length, 0)
  model.choose('bloquear'); assert.equal(model.getDecisionState().confirmed, false); model.setConfirmed(true); model.cancel(); await model.submit(); assert.equal(writes.length, 0)
  model.choose('publicar'); model.setConfirmed(true); await model.retry(); await model.submit(); assert.equal(writes.length, 0); assert.equal(model.getDecisionState().action, '')
  await model.copy(id(21)); assert.deepEqual(copies, [magnetUri]); model.dispose()
})
test('aguarda leitura/nomes e download antes de permitir decisao', async () => {
  const names = deferred(), started = deferred(), file = deferred()
  const { model } = fixture({ names: async () => { started.resolve(); return names.promise }, download: async () => file.promise })
  const loading = model.load(id(10)); await started.promise; model.choose('publicar'); assert.equal(model.getDecisionState().action, '')
  names.resolve(academic); await loading; const downloading = model.download(id(20)); model.choose('publicar'); assert.equal(model.getDecisionState().action, '')
  file.resolve(payload()); await downloading; model.choose('publicar'); assert.equal(model.getDecisionState().action, 'publicar'); model.dispose()
})
test('emvoo bloqueia repeticao/troca/cancelamento/recarga e sucesso faz somenteGET', async () => {
  const pending = deferred(), { model, writes, reads } = fixture({ decide: () => pending.promise })
  await model.load(id(10)); model.choose('publicar'); model.setConfirmed(true); const sending = model.submit()
  await model.submit(); model.choose('bloquear'); model.cancel(); model.setConfirmed(true); await model.retry()
  assert.equal(writes.length, 1); assert.equal(reads.length, 1); assert.equal(model.getDecisionState().action, 'publicar'); assert.equal(model.getDecisionState().confirmed, false)
  pending.resolve({ ...detail(), status: 'PUBLICADO' }); await sending; assert.equal(reads.length, 2); assert.equal(writes.length, 1)
  // GET pode mostrar estado alterado por outra transacao; nao se sobrescreve com respostaPOST.
  assert.equal(model.getState().material.status, 'PENDENTE'); assert.ok(model.getDecisionState().message); model.dispose()
})
for (const error of [new ApiError('http', 409), new ApiError('network'), new ApiError('protocol', 200), new ApiError('http', 408), new ApiError('http', 503), new ApiError('http', 400)]) {
  test('falha ' + error.kind + '/' + error.status + ' exige GETnovo e nova escolha/confirmacao, sem retryPOST', async () => {
    const { model, writes, reads } = fixture({ decide: async () => { throw error } }); await model.load(id(10)); model.choose('publicar'); model.setConfirmed(true); await model.submit()
    assert.equal(model.getDecisionState().requiresReload, true); assert.equal(model.getDecisionState().confirmed, false); assert.ok(model.getDecisionState().error)
    model.cancel(); model.choose('bloquear'); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 1)
    await model.retry(); assert.equal(reads.length, 2); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 1)
    model.choose('publicar'); model.setConfirmed(true); await model.submit(); assert.equal(writes.length, 2); model.dispose()
  })
}
for (const status of [401, 403, 404]) {
  test('POST' + status + ' retira revisao/URIs/confirmacao sem refletir erro privado', async () => {
    const { model } = fixture({ decide: async () => { throw new ApiError('http', status, { detail: magnetUri, errors: [] }) } })
    await model.load(id(10)); await model.copy(id(21)); model.choose('publicar'); model.setConfirmed(true); await model.submit()
    assert.equal(model.getState().material, null); assert.equal(model.getState().academic, null); assert.deepEqual(model.getState().copies, {}); assert.equal(model.getDecisionState().action, '')
    assert.equal(JSON.stringify(model.getState()).includes(magnetUri), false); assert.ok(model.getState().error); model.dispose()
  })
}
for (const change of ['conta', 'perfil', 'equipe', 'rota', 'dispose']) {
  test('POST antigo apos ' + change + ' nao altera revisao nova e abort nao prova rollback', async () => {
    const pending = deferred(); let user = staff()
    const { model, writes } = fixture({ user: () => user, decide: () => pending.promise, read: async key => ({ ...detail(Number(key.slice(0, 8))), status: 'PENDENTE' }) })
    await model.load(id(10)); model.choose('publicar'); model.setConfirmed(true); const sending = model.submit()
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose()
    else await model.load(change === 'rota' ? id(11) : id(10))
    pending.reject(new ApiError('http', 403)); await sending
    assert.equal(writes[0].signal.aborted, true); assert.equal(model.getDecisionState().message, ''); assert.equal(model.getDecisionState().error, '')
    assert.equal(model.getState().material?.id ?? null, change === 'dispose' || change === 'perfil' ? null : change === 'rota' ? id(11) : id(10)); model.dispose()
  })
}
test('perda de perfil sem recarregar durante POST descarta resposta/dados', async () => {
  let user = staff(); const pending = deferred(), { model } = fixture({ user: () => user, decide: () => pending.promise })
  await model.load(id(10)); model.choose('publicar'); model.setConfirmed(true); const sending = model.submit(); user = staff('USUARIO')
  pending.resolve({ ...detail(), status: 'PUBLICADO' }); await sending; assert.equal(model.getState().material, null); assert.equal(model.getDecisionState().message, ''); model.dispose()
})
test('falhaGET apos POSTconfirmado preserva aviso sem repetir mutacao', async () => {
  let reads = 0
  const { model, writes } = fixture({ read: async () => { if (++reads > 1) throw new ApiError('network'); return { ...detail(), status: 'PENDENTE' } } })
  await model.load(id(10)); model.choose('publicar'); model.setConfirmed(true); await model.submit()
  assert.equal(writes.length, 1); assert.equal(model.getState().material, null); assert.ok(model.getState().error); assert.ok(model.getDecisionState().message); assert.equal(model.canChoose('publicar'), false); model.dispose()
})
