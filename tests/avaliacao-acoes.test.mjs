import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createAvaliacaoService, notaEmCentavos } from '../src/features/avaliacao/avaliacao-service.ts'
import { createAvaliacaoModel } from '../src/features/avaliacao/avaliacao-model.ts'
import { id, deferred } from './catalog-fixtures.mjs'

const mine = (changes = {}) => ({ id: id(40), nota: 4.25, dataCadastro: '2026-10-23T12:00:00Z', usuarioId: id(8), materialId: id(10), ...changes })
const summary = { media: 4.25, quantidade: 1 }
function fixture(overrides = {}, user = () => id(8)) {
  const calls = []
  const service = {
    read: async (...args) => { calls.push({ kind: 'read', args }); return { minha: mine(), resumo: summary } },
    resumo: async (...args) => { calls.push({ kind: 'summary', args }); return summary },
    create: async (...args) => { calls.push({ kind: 'create', args }); return mine() },
    update: async (...args) => { calls.push({ kind: 'update', args }); return mine({ nota: notaEmCentavos(args[2]) / 100 }) },
    remove: async (...args) => { calls.push({ kind: 'remove', args }) }, ...overrides,
  }
  return { model: createAvaliacaoModel(service, user), calls }
}

test('service PUT /minha projeta so nota numerica e preserva DTO/identidade/data', async () => {
  let call; const signal = new AbortController().signal
  const service = createAvaliacaoService(async (...args) => { call = args; return { ...mine({ nota: 0 }), email: 'privado' } })
  assert.deepEqual(await service.update(id(10).toUpperCase(), mine(), ' 0,00 ', id(8), id(9), signal), mine({ nota: 0 }))
  assert.deepEqual(call, ['/materiais/' + id(10) + '/avaliacoes/minha', { method: 'PUT', json: { nota: 0 }, signal }])
})
for (const [label, changes] of [['UUID', { id: id(41) }], ['autor', { usuarioId: id(7) }], ['material', { materialId: id(11) }], ['data', { dataCadastro: '2026-10-23T13:00:00Z' }], ['nota', { nota: 4.5 }], ['tipo', { nota: '3.25' }]]) {
  test('PUT resposta inesperada de ' + label + ' gera protocolo, nao prova protecao contra geracao concorrente', async () => {
    const service = createAvaliacaoService(async () => mine({ nota: 3.25, ...changes }))
    await assert.rejects(service.update(id(10), mine(), '3,25', id(8), id(9)), error => error instanceof ApiError && error.kind === 'protocol')
  })
}
test('service PUT rejeita autoavaliacao/DTOalheio/rota/UUIDinvalidos antes deHTTP', async () => {
  const service = createAvaliacaoService(() => assert.fail())
  for (const [material, original, user, author] of [[id(10), mine(), id(8), id(8)], [id(10), mine(), id(7), id(9)], [id(11), mine(), id(8), id(9)], ['x', mine(), id(8), id(9)], [id(10), mine({ id: 'x' }), id(8), id(9)]]) {
    await assert.rejects(service.update(material, original, '3', user, author), TypeError)
  }
})
test('service DELETE atua em /minha sem selecionar UUID de Avaliacao/autor/corpo/query, mesmo autorMaterial', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createAvaliacaoService(() => assert.fail(), async (...args) => { calls.push(args) })
  assert.equal(await service.remove(id(10), id(8), signal), undefined)
  assert.deepEqual(calls, [['/materiais/' + id(10) + '/avaliacoes/minha', { signal }]])
  await assert.rejects(service.remove('x', id(8)), TypeError); await assert.rejects(service.remove(id(10), 'x'), TypeError)
})
test('nao existe acao sem propria nota carregada nem sobre DTOalheio', async () => {
  for (const minha of [null, mine({ usuarioId: id(7) }), mine({ materialId: id(11) })]) {
    const { model, calls } = fixture({ read: async () => ({ minha, resumo: summary }) })
    await model.load(id(10), id(9), true); model.startEdit(); model.startRemoval(); model.confirmRemoval(true); await model.submitAction()
    assert.equal(model.getState().action, null); assert.equal(calls.length, 0)
  }
})
test('autoavaliacao legada nao pode ser editada, mas pode ser removida pela propria conta', async () => {
  const { model, calls } = fixture(); await model.load(id(10), id(8), true); model.startEdit(); assert.equal(model.getState().action, null)
  model.startRemoval(); model.confirmRemoval(true); await model.submitAction(); assert.equal(calls.filter(item => item.kind === 'remove').length, 1)
})
test('abrir/cancelar painel nao escreve nem reconsulta e nova confirmacao nao herda marcacao anterior', async () => {
  const { model, calls } = fixture(); await model.load(id(10), id(9), true); model.startEdit()
  assert.equal(model.getState().action.nota, '4,25'); model.changeActionNota('3'); await model.closeAction()
  model.startRemoval(); model.confirmRemoval(true); await model.closeAction(); model.startRemoval(); await model.submitAction()
  assert.equal(model.getState().action.confirmed, false); assert.equal(calls.length, 1)
})
test('painel impede trocar tipo, recarregar, novo cadastro e editar draft de cadastro', async () => {
  const { model, calls } = fixture(); await model.load(id(10), id(9), true); model.startEdit(); model.startRemoval(); await model.reload(); model.changeNota('1'); await model.submit()
  assert.equal(model.getState().action.kind, 'edit'); assert.equal(model.getState().nota, ''); assert.equal(calls.length, 1)
})
for (const [label, input] of [['vazio', ' '], ['casas', '4,250'], ['intervalo', '5.01'], ['expoente', '4e0'], ['inalterado', '4.25']]) {
  test('edicao ' + label + ' nao envia nem arredonda nota', async () => {
    const { model, calls } = fixture(); await model.load(id(10), id(9), true); model.startEdit(); model.changeActionNota(input); await model.submitAction()
    assert.equal(calls.length, 1); assert.equal(model.getState().action.nota, input); assert.ok(model.getState().action.error)
    if (label !== 'inalterado') await assert.rejects(createAvaliacaoService(() => assert.fail()).update(id(10), mine(), input, id(8), id(9)), TypeError)
  })
}
test('PUT muda nota, preserva UUID/data e recebe novos totais do servidor sem calcular localmente', async () => {
  const { model, calls } = fixture({ resumo: async () => ({ media: 2.5, quantidade: 2 }) })
  await model.load(id(10), id(9), true); model.startEdit(); model.changeActionNota('0,00'); await model.submitAction()
  assert.deepEqual(model.getState().minha, mine({ nota: 0 })); assert.deepEqual(model.getState().resumo, { media: 2.5, quantidade: 2 })
  assert.equal(model.getState().action, null); assert.equal(model.getState().message, 'Avaliação atualizada.'); assert.deepEqual(calls.map(item => item.kind), ['read', 'update'])
})
test('DELETE exige literaltrue, consome consentimento e bloqueia duploenvio/fechar/alterar durante voo', async () => {
  const pending = deferred(), writes = []
  const { model } = fixture({ remove: async (...args) => { writes.push(args); return pending.promise } })
  await model.load(id(10), id(9), true); model.startRemoval(); await model.submitAction(); model.confirmRemoval('true'); await model.submitAction(); assert.equal(writes.length, 0)
  model.confirmRemoval(true); const sending = model.submitAction(); await model.submitAction(); model.confirmRemoval(true); await model.closeAction()
  assert.equal(writes.length, 1); assert.equal(model.getState().action.confirmed, false); assert.equal(model.getState().action.sending, true)
  pending.resolve(); await sending; assert.equal(model.getState().action, null); assert.ok(model.getState().message.includes('confirmada'))
})
test('DELETE confirmado faz GETs antes de liberar novoPOST, que representa uma nova avaliacao', async () => {
  let stored = mine()
  const { model, calls } = fixture({ read: async () => ({ minha: stored, resumo: stored ? summary : { media: null, quantidade: 0 } }), remove: async () => { stored = null }, create: async () => { stored = mine({ id: id(41), nota: 0, dataCadastro: '2026-10-23T13:00:00Z' }); return stored } })
  await model.load(id(10), id(9), true); model.startRemoval(); model.confirmRemoval(true); await model.submitAction()
  assert.equal(model.getState().minha, null); assert.equal(model.getState().checked, true); assert.deepEqual(model.getState().resumo, { media: null, quantidade: 0 })
  model.changeNota('0'); await model.submit(); assert.equal(model.getState().minha.id, id(41)); assert.equal(model.getState().minha.nota, 0); assert.equal(calls.filter(item => item.kind === 'summary').length, 1)
})
test('remocao usa nota atual: recriacao entre selecao e DELETE nao tem protecao de geracao', async () => {
  let stored = mine()
  const { model } = fixture({ read: async () => ({ minha: stored, resumo: stored ? summary : { media: null, quantidade: 0 } }), remove: async () => { assert.equal(stored.id, id(41)); stored = null } })
  await model.load(id(10), id(9), true); model.startRemoval(); model.confirmRemoval(true); stored = mine({ id: id(41), nota: 1 }); await model.submitAction()
  assert.equal(stored, null); assert.equal(model.getState().minha, null)
})
test('DELETE permitido aposMaterialprivado;204 seguido deGET404 preserva so confirmacao fixa sem nota privada', async () => {
  let privateMaterial = false
  const { model } = fixture({ read: async () => { if (privateMaterial) throw new ApiError('http', 404); return { minha: mine(), resumo: summary } }, remove: async () => {} })
  await model.load(id(10), id(9), true); model.startRemoval(); model.confirmRemoval(true); privateMaterial = true; await model.submitAction()
  assert.equal(model.getState().unavailable, true); assert.equal(model.getState().minha, null); assert.equal(model.getState().resumo, null); assert.ok(model.getState().message.includes('confirmada'))
})
for (const kind of ['edit', 'remove']) {
  test(kind + ': erroredeGETdepois de sucesso nao pede reenviar a mutacao', async () => {
    let reads = 0
    const { model, calls } = fixture({ read: async () => { if (++reads > 1) throw new ApiError('network'); return { minha: mine(), resumo: summary } }, resumo: async () => { throw new ApiError('network') } })
    await model.load(id(10), id(9), true)
    if (kind === 'edit') { model.startEdit(); model.changeActionNota('3') } else { model.startRemoval(); model.confirmRemoval(true) }
    await model.submitAction(); await model.submitAction(); assert.equal(model.getState().action, null); assert.ok(model.getState().message); assert.ok(model.getState().readError)
    assert.equal(calls.filter(item => item.kind === (kind === 'edit' ? 'update' : 'remove')).length, 1)
    if (kind === 'edit') assert.equal(model.getState().minha.nota, 3)
    else assert.equal(model.getState().checked, false)
  })
}
for (const kind of ['edit', 'remove']) {
  for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503), new ApiError('http', 409)]) {
    test(kind + ' falha' + error.kind + '/' + error.status + ' exige fechar e consultar antes de outra selecao, sem replay', async () => {
      let writes = 0, stored = mine()
      const operation = async () => { writes++; stored = mine({ id: id(41), nota: 1 }); throw error }
      const { model } = fixture({ read: async () => ({ minha: stored, resumo: summary }), update: operation, remove: operation })
      await model.load(id(10), id(9), true); if (kind === 'edit') { model.startEdit(); model.changeActionNota('3') } else { model.startRemoval(); model.confirmRemoval(true) }
      await model.submitAction(); model.confirmRemoval(true); model.changeActionNota('2'); await model.submitAction(); await model.reload(); assert.equal(writes, 1)
      assert.equal(model.getState().action.confirmed, false); await model.closeAction(); assert.equal(model.getState().minha.id, id(41)); assert.equal(writes, 1)
      model.startRemoval(); await model.submitAction(); assert.equal(writes, 1); assert.equal(model.getState().action.confirmed, false)
    })
  }
}
test('reconsulta falha apos resultado incerto remove snapshot e impede nova acao ou POST', async () => {
  let reads = 0
  const { model, calls } = fixture({ read: async () => { if (++reads > 1) throw new ApiError('network'); return { minha: mine(), resumo: summary } }, remove: async () => { throw new ApiError('network') } })
  await model.load(id(10), id(9), true); model.startRemoval(); model.confirmRemoval(true); await model.submitAction(); await model.closeAction(); model.startRemoval(); await model.submit()
  assert.equal(model.getState().action, null); assert.equal(model.getState().minha, null); assert.equal(model.getState().checked, false); assert.equal(calls.length, 0)
})
test('400PUTpermitecorrecao,403bloqueiaedicao mas preserva caminho de retirada propria', async () => {
  let status = 400, writes = 0
  const { model, calls } = fixture({ update: async () => { writes++; throw new ApiError('http', status, { title: 'PRIVADO', detail: 'PRIVADO', errors: [] }) } })
  await model.load(id(10), id(9), true); model.startEdit(); model.changeActionNota('3'); await model.submitAction(); assert.equal(model.getState().action.blocked, false)
  model.changeActionNota('2'); status = 403; await model.submitAction(); await model.submitAction(); assert.equal(writes, 2); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
  await model.closeAction(); model.startEdit(); assert.equal(model.getState().action, null); model.startRemoval(); model.confirmRemoval(true); await model.submitAction()
  assert.equal(calls.filter(item => item.kind === 'remove').length, 1)
})
for (const status of [401, 404]) {
  test('PUT' + status + ' limpa acesso e nao vira POST/upsert', async () => {
    const { model, calls } = fixture({ update: async () => { throw new ApiError('http', status) } })
    await model.load(id(10), id(9), true); model.startEdit(); model.changeActionNota('3'); await model.submitAction(); model.changeNota('2'); await model.submit()
    assert.equal(model.getState().unavailable, true); assert.equal(model.getState().action, null); assert.equal(calls.filter(item => item.kind === 'create').length, 0)
  })
}
for (const kind of ['edit', 'remove']) {
  for (const change of ['conta', 'material', 'dispose']) {
    test(kind + ' resposta antiga apos' + change + ' nao restaura alvo/nota/mensagem/consulta', async () => {
      const pending = deferred(); let user = id(8), signal
      const operation = async (...args) => { signal = args.at(-1); return pending.promise }
      const { model, calls } = fixture({ update: operation, remove: operation }, () => user)
      await model.load(id(10), id(9), true); if (kind === 'edit') { model.startEdit(); model.changeActionNota('3') } else { model.startRemoval(); model.confirmRemoval(true) }
      const sending = model.submitAction()
      if (change === 'conta') user = id(7)
      if (change === 'material') await model.load(id(11), id(9), true)
      if (change === 'dispose') model.dispose()
      pending.resolve(mine({ nota: 3 })); await sending
      assert.equal(signal.aborted, true); assert.equal(model.getState().action, null); assert.equal(model.getState().message, '')
      assert.equal(calls.some(item => item.kind === 'summary'), false); assert.equal(calls.filter(item => item.kind === 'read').length, change === 'material' ? 2 : 1)
    })
  }
}
test('troca de conta antesdeconfirmar impedeDELETE e limpa alvo', async () => {
  let user = id(8)
  const { model, calls } = fixture({}, () => user); await model.load(id(10), id(9), true); model.startRemoval(); user = id(7); model.confirmRemoval(true); await model.submitAction()
  assert.equal(model.getState().action, null); assert.equal(model.getState().minha, null); assert.equal(calls.length, 1)
})
