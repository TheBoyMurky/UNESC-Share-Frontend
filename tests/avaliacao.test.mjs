import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createAvaliacaoService, notaEmCentavos, formatNota, podeAvaliar } from '../src/features/avaliacao/avaliacao-service.ts'
import { createAvaliacaoModel } from '../src/features/avaliacao/avaliacao-model.ts'
import { id, deferred } from './catalog-fixtures.mjs'

const mine = (changes = {}) => ({ id: id(40), nota: 4.25, dataCadastro: '2026-10-23T12:00:00Z', usuarioId: id(8), materialId: id(10), ...changes })
const summary = (changes = {}) => ({ media: null, quantidade: 0, ...changes })
function fixture(overrides = {}, user = () => id(8)) {
  const calls = []
  const service = {
    read: async (...args) => { calls.push({ kind: 'read', args }); return { minha: null, resumo: summary() } },
    resumo: async (...args) => { calls.push({ kind: 'summary', args }); return summary({ media: 4.25, quantidade: 1 }) },
    create: async (...args) => { calls.push({ kind: 'create', args }); return mine({ nota: notaEmCentavos(args[1]) / 100 }) },
    ...overrides,
  }
  return { model: createAvaliacaoModel(service, user), calls }
}

test('nota: centesimos exatos para todas as501notas, virgula/ponto, zero e formatacao pt-BR2casas', () => {
  for (let cents = 0; cents <= 500; cents++) {
    const decimal = (cents / 100).toFixed(2)
    assert.equal(notaEmCentavos(decimal), cents); assert.equal(notaEmCentavos(decimal.replace('.', ',')), cents)
    assert.equal(notaEmCentavos(String(JSON.parse(JSON.stringify(cents / 100)))), cents)
  }
  assert.equal(notaEmCentavos(' 4,5 '), 450); assert.equal(notaEmCentavos('5'), 500); assert.equal(notaEmCentavos('0'), 0)
  assert.equal(formatNota(0), '0,00'); assert.equal(formatNota(4.5), '4,50'); assert.equal(formatNota(5), '5,00')
})
for (const text of ['', ' ', '-1', '-0', '+4', '5.01', '6', '4.000', '0,001', '1e0', '4,', '.5', '04', '4,2.5', 'NaN', 'Infinity', '4\u0000']) {
  test('nota invalida nao e arredondada/convenientemente convertida: ' + JSON.stringify(text), async () => {
    assert.equal(notaEmCentavos(text), null)
    await assert.rejects(createAvaliacaoService(() => assert.fail()).create(id(10), text, id(8), id(9)), TypeError)
  })
}
test('autoavaliacao bloqueada por UUID, perfil de equipe nao concede excecao', async () => {
  assert.equal(podeAvaliar(id(9), id(8)), true)
  for (const user of [id(9).toUpperCase(), null, undefined, 'x']) assert.equal(podeAvaliar(id(9), user), false)
  await assert.rejects(createAvaliacaoService(() => assert.fail()).create(id(10), '4', id(8), id(8)), TypeError)
})
test('read404minha exige resumo200 depois antes de declarar ausencia, nao usa mensagens/Location', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createAvaliacaoService(async (path, options) => {
    calls.push({ path, options }); if (path.endsWith('/minha')) throw new ApiError('http', 404, { detail: 'PRIVADO', errors: [] })
    return { ...summary(), usuarioId: 'extra' }
  })
  assert.deepEqual(await service.read(id(10).toUpperCase(), id(8), signal), { minha: null, resumo: summary() })
  assert.deepEqual(calls.map(item => item.path), ['/materiais/' + id(10) + '/avaliacoes/minha', '/materiais/' + id(10) + '/avaliacoes/resumo'])
  assert.equal(calls.every(item => item.options.signal === signal), true)
})
test('404minha+404resumo permanece erro de acesso, sem afirmar ausencia', async () => {
  let calls = 0
  await assert.rejects(createAvaliacaoService(async () => { calls++; throw new ApiError('http', 404) }).read(id(10), id(8)), error => error.status === 404)
  assert.equal(calls, 2)
})
test('read de nota existente projeta somente propria identidade e resumo agregado', async () => {
  const service = createAvaliacaoService(async path => path.endsWith('/minha') ? { ...mine(), email: 'privado', perfil: 'extra' } : { ...summary({ media: 0, quantidade: 1 }), soma: 'extra' })
  assert.deepEqual(await service.read(id(10), id(8)), { minha: mine(), resumo: summary({ media: 0, quantidade: 1 }) })
})
for (const [label, changes] of [['id', { id: 'x' }], ['usuario', { usuarioId: id(9) }], ['material', { materialId: id(11) }], ['data', { dataCadastro: 'x' }], ['nota string', { nota: '4.25' }], ['tres casas', { nota: 4.251 }], ['intervalo', { nota: 6 }]]) {
  test('service rejeita DTO proprio invalido: ' + label, async () => {
    await assert.rejects(createAvaliacaoService(async () => mine(changes)).read(id(10), id(8)), error => error instanceof ApiError && error.kind === 'protocol')
  })
}
test('resumo rejeita null indevido, media falsa zero, quantidade insegura/fracao e fora da escala', async () => {
  for (const dto of [null, [], summary({ quantidade: -1 }), summary({ quantidade: 0.5 }), summary({ quantidade: Number.MAX_SAFE_INTEGER + 1 }), summary({ media: 0 }), summary({ quantidade: 1 }), summary({ media: '4.5', quantidade: 1 }), summary({ media: 5.01, quantidade: 1 }), summary({ media: 4.251, quantidade: 1 })]) {
    await assert.rejects(createAvaliacaoService(async () => dto).resumo(id(10)), ApiError)
  }
})
test('POST apenas nota numerica, sem autor/Material/perfil/query; DTO confirma nota enviada', async () => {
  let call
  const service = createAvaliacaoService(async (...args) => { call = args; return { ...mine({ nota: 0 }), extra: 'privado' } })
  assert.deepEqual(await service.create(id(10), '0,00', id(8), id(9)), mine({ nota: 0 }))
  assert.deepEqual(call, ['/materiais/' + id(10) + '/avaliacoes', { method: 'POST', json: { nota: 0 }, signal: undefined }])
  await assert.rejects(createAvaliacaoService(async () => mine()).create(id(10), '3,50', id(8), id(9)), ApiError)
})
test('UUID/conta invalidos bloqueiam HTTP, abort aposminha impede proximoGET', async () => {
  const service = createAvaliacaoService(() => assert.fail())
  await assert.rejects(service.read('../x', id(8)), TypeError); await assert.rejects(service.resumo('x'), TypeError); await assert.rejects(service.read(id(10), 'x'), TypeError)
  const task = new AbortController(); let calls = 0
  await assert.rejects(createAvaliacaoService(async () => { calls++; task.abort(); return mine() }).read(id(10), id(8), task.signal), error => error.name === 'AbortError')
  assert.equal(calls, 1)
})
test('401/rede/protocolo de minha nao sao ausencia nem provocam GETresumo', async () => {
  for (const error of [new ApiError('http', 401), new ApiError('http', 403), new ApiError('network'), new ApiError('protocol')]) {
    let calls = 0
    await assert.rejects(createAvaliacaoService(async () => { calls++; throw error }).read(id(10), id(8)), expected => expected === error)
    assert.equal(calls, 1)
  }
})
test('model nao consulta/escreve semPUBLICADO/UUID/autor/conta validos', async () => {
  for (const [material, author, published, user] of [[id(10), id(9), false, id(8)], ['x', id(9), true, id(8)], [id(10), 'x', true, id(8)], [id(10), id(9), true, null]]) {
    const { model, calls } = fixture({}, () => user); await model.load(material, author, published); model.changeNota('4'); await model.submit(); assert.equal(calls.length, 0); assert.equal(model.getState().unavailable, true)
  }
})
test('autor pode consultar resumo mas nuncaPOST mesmo semnota e emperfilqualquer', async () => {
  const { model, calls } = fixture(); await model.load(id(10), id(8), true); model.changeNota('5'); await model.submit()
  assert.equal(calls.length, 1); assert.deepEqual(model.getState().resumo, summary())
})
test('minha ausente e media null nao viram nota zero, nota existente0 impedePOST', async () => {
  const { model } = fixture(); await model.load(id(10), id(9), true)
  assert.equal(model.getState().minha, null); assert.equal(model.getState().resumo.media, null); assert.equal(model.getState().checked, true)
  const existing = fixture({ read: async () => ({ minha: mine({ nota: 0 }), resumo: summary({ media: 0, quantidade: 1 }) }) })
  await existing.model.load(id(10), id(9), true); existing.model.changeNota('5'); await existing.model.submit()
  assert.equal(existing.calls.length, 0); assert.equal(existing.model.getState().minha.nota, 0)
})
test('entrada invalida nao envia e preserva rascunho para correcao', async () => {
  const { model, calls } = fixture(); await model.load(id(10), id(9), true); model.changeNota('4,251'); await model.submit()
  assert.equal(calls.length, 1); assert.equal(model.getState().nota, '4,251'); assert.ok(model.getState().formError)
})
test('POST duplicado/edicao/recarga bloqueados emvoo; sucesso mostraDTO, limpa nota e obtem resumo sem media local', async () => {
  const pending = deferred(), writes = []
  const { model, calls } = fixture({ create: async (...args) => { writes.push(args); return pending.promise } })
  await model.load(id(10), id(9), true); model.changeNota('4,25'); const sending = model.submit()
  await model.submit(); model.changeNota('5'); await model.reload(); assert.equal(writes.length, 1); assert.equal(model.getState().nota, '4,25')
  pending.resolve(mine()); await sending
  assert.equal(model.getState().minha.nota, 4.25); assert.equal(model.getState().nota, ''); assert.equal(model.getState().message, 'Avaliação cadastrada.')
  assert.deepEqual(calls.map(item => item.kind), ['read', 'summary']); assert.deepEqual(model.getState().resumo, summary({ media: 4.25, quantidade: 1 }))
  await model.submit(); assert.equal(writes.length, 1)
})
test('falha rede na recarga resumo preserva confirmacao e propria nota; nunca reenviar', async () => {
  const { model, calls } = fixture({ resumo: async () => { throw new ApiError('network') } })
  await model.load(id(10), id(9), true); model.changeNota('0'); await model.submit()
  assert.equal(model.getState().minha.nota, 0); assert.equal(model.getState().resumo, null); assert.ok(model.getState().readError); assert.ok(model.getState().message)
  await model.submit(); assert.equal(calls.filter(item => item.kind === 'create').length, 1)
})
test('erro GET nao e ausencia, nao permitePOST e retry preserva entrada', async () => {
  let fail = true
  const { model, calls } = fixture({ read: async () => { if (fail) throw new ApiError('network'); return { minha: null, resumo: summary() } } })
  await model.load(id(10), id(9), true); model.changeNota('4'); await model.submit(); assert.equal(calls.length, 0); assert.equal(model.getState().checked, false)
  fail = false; await model.reload(); assert.equal(model.getState().nota, '4'); assert.equal(model.getState().checked, true); assert.equal(model.getState().readError, '')
})
for (const status of [401, 403, 404]) {
  test('GET' + status + ' remove resumo/nota/draft e bloqueia acesso', async () => {
    let fail = false
    const { model } = fixture({ read: async () => { if (fail) throw new ApiError('http', status); return { minha: null, resumo: summary() } } })
    await model.load(id(10), id(9), true); model.changeNota('4'); fail = true; await model.reload()
    assert.equal(model.getState().resumo, null); assert.equal(model.getState().minha, null); assert.equal(model.getState().nota, ''); assert.equal(model.getState().unavailable, true)
  })
}
for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503), new ApiError('http', 409)]) {
  test('POST' + error.kind + '/' + error.status + ' exige consulta+acaoexplicita para tentaraposnota ausente, sem reenvio automatico', async () => {
    let writes = 0
    const { model } = fixture({ create: async () => { writes++; throw error } })
    await model.load(id(10), id(9), true); model.changeNota('4'); await model.submit(); model.prepareRetry(); await model.submit()
    assert.equal(writes, 1); assert.equal(model.getState().nota, '4'); assert.equal(model.getState().reviewed, false)
    await model.reload(); await model.submit(); assert.equal(writes, 1); assert.equal(model.getState().reviewed, true)
    model.prepareRetry(); assert.equal(writes, 1); await model.submit(); assert.equal(writes, 2)
  })
}
test('reconciliacao dePOSTincerto encontra nota atual e encerra formulario sem alegar autoria temporal', async () => {
  let found = false, writes = 0
  const { model } = fixture({ read: async () => ({ minha: found ? mine({ nota: 3 }) : null, resumo: summary() }), create: async () => { writes++; found = true; throw new ApiError('network') } })
  await model.load(id(10), id(9), true); model.changeNota('4'); await model.submit(); await model.reload(); model.prepareRetry(); await model.submit()
  assert.equal(writes, 1); assert.equal(model.getState().minha.nota, 3); assert.equal(model.getState().uncertain, false); assert.equal(model.getState().nota, '')
  assert.equal(model.getState().message, 'Sua avaliação atual foi encontrada. Confira a nota abaixo.')
})
test('consulta falha aposconflito nao libera prepareRetry', async () => {
  let fail = false
  const { model } = fixture({ read: async () => { if (fail) throw new ApiError('network'); return { minha: null, resumo: summary() } }, create: async () => { throw new ApiError('http', 409) } })
  await model.load(id(10), id(9), true); model.changeNota('4'); await model.submit(); fail = true; await model.reload(); model.prepareRetry()
  assert.equal(model.getState().conflict, true); assert.equal(model.getState().checked, false)
})
test('400 permite correcao sem ecoarProblemDetail,403 impede escrita sem apagar sessao,404retiraacesso', async () => {
  for (const status of [400, 403, 404, 401]) {
    let writes = 0
    const { model } = fixture({ create: async () => { writes++; throw new ApiError('http', status, { title: 'PRIVADO', detail: 'PRIVADO', errors: [] }) } })
    await model.load(id(10), id(9), true); model.changeNota('4'); await model.submit()
    assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false); assert.equal(writes, 1)
    if (status === 403) { assert.equal(model.getState().forbidden, true); assert.ok(model.getState().resumo); await model.submit(); assert.equal(writes, 1) }
    if ([401, 404].includes(status)) assert.equal(model.getState().unavailable, true)
    if (status === 400) { model.changeNota('3'); await model.submit(); assert.equal(writes, 2) }
  }
})
for (const change of ['conta', 'material', 'dispose']) {
  test('POSTatrasado apos' + change + ' nao restaura nota/mensagem nem consulta resumo antigo', async () => {
    const pending = deferred(); let user = id(8), signal
    const { model, calls } = fixture({ create: async (...args) => { signal = args.at(-1); return pending.promise } }, () => user)
    await model.load(id(10), id(9), true); model.changeNota('4'); const sending = model.submit()
    if (change === 'conta') user = id(7)
    if (change === 'material') await model.load(id(11), id(9), true)
    if (change === 'dispose') model.dispose()
    pending.resolve(mine()); await sending
    assert.equal(signal.aborted, true); assert.equal(model.getState().minha, null); assert.equal(model.getState().message, ''); assert.equal(calls.some(item => item.kind === 'summary'), false)
  })
}
test('GETatrasado/cancelado nao sobrepoe novoMaterial, nova consulta ignora resumo antigo aposPOST', async () => {
  const pending = deferred(), oldSummary = deferred(); let phase = 'old'
  const { model } = fixture({ read: async () => phase === 'old' ? pending.promise : { minha: null, resumo: summary() }, resumo: async () => oldSummary.promise })
  const first = model.load(id(10), id(9), true); phase = 'new'; await model.load(id(11), id(9), true); pending.resolve({ minha: mine(), resumo: summary({ media: 4.25, quantidade: 1 }) }); await first
  assert.equal(model.getState().minha, null)
  model.changeNota('4'); const sending = model.submit(); await Promise.resolve(); await model.reload(); oldSummary.resolve(summary({ media: 4, quantidade: 1 })); await sending
  assert.equal(model.getState().minha, null); assert.deepEqual(model.getState().resumo, summary())
})
test('troca conta antesdePOST limpa draft e nao envia identidade anterior', async () => {
  let user = id(8)
  const { model, calls } = fixture({}, () => user); await model.load(id(10), id(9), true); model.changeNota('4'); user = id(7); await model.submit()
  assert.equal(calls.length, 1); assert.equal(model.getState().nota, ''); assert.equal(model.getState().unavailable, true)
})
