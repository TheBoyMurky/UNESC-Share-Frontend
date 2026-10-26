import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { canManageComentario, createComentarioService } from '../src/features/comentario/comentario-service.ts'
import { createComentarioModel } from '../src/features/comentario/comentario-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const comment = (changes = {}) => ({ id: id(30), conteudo: 'Original\n<b>Texto simples</b>', dataCadastro: '2026-10-23T12:00:00Z', status: 'ATIVO', usuarioId: id(8), materialId: id(10), ...changes })
function fixture(overrides = {}, user = () => id(8)) {
  const calls = []
  const service = {
    list: async (material, number, size, signal) => { calls.push({ kind: 'list', material, number, size, signal }); return page([comment()], number, size) },
    create: async () => { calls.push({ kind: 'create' }); return comment() },
    update: async (...args) => { calls.push({ kind: 'update', args }); return comment({ conteudo: args[2].trim() }) },
    remove: async (...args) => { calls.push({ kind: 'remove', args }) },
    ...overrides,
  }
  return { model: createComentarioModel(service, user), calls }
}

test('canManageComentario exige autor ATIVO; nenhum perfil ou donoMaterial concede excecao', () => {
  assert.equal(canManageComentario(comment(), id(8).toUpperCase()), true)
  for (const user of [id(9), null, undefined, 'x']) assert.equal(canManageComentario(comment(), user), false)
  for (const status of ['OCULTO', 'REMOVIDO']) assert.equal(canManageComentario(comment({ status }), id(8)), false)
  assert.equal(canManageComentario(comment({ id: 'x' }), id(8)), false)
})
test('service PUT projeta somente conteudo e valida invariantes da resposta', async () => {
  let call; const signal = new AbortController().signal
  const service = createComentarioService(async (...args) => { call = args; return { ...comment({ conteudo: 'Corrigido' }), email: 'privado' } })
  const result = await service.update(id(10).toUpperCase(), comment(), ' Corrigido\n', id(8), signal)
  assert.deepEqual(call, ['/materiais/' + id(10) + '/comentarios/' + id(30), { method: 'PUT', json: { conteudo: 'Corrigido' }, signal }])
  assert.deepEqual(result, comment({ conteudo: 'Corrigido' })); assert.equal('email' in result, false)
})
for (const [label, changes] of [
  ['id', { id: id(31) }], ['autor', { usuarioId: id(9) }], ['material', { materialId: id(11) }],
  ['data', { dataCadastro: '2026-10-23T13:00:00Z' }], ['estado', { status: 'OCULTO' }], ['texto', { conteudo: 'Outro' }],
]) {
  test('service PUT rejeita alteracao inesperada de ' + label, async () => {
    const service = createComentarioService(async () => comment({ conteudo: 'Corrigido', ...changes }))
    await assert.rejects(service.update(id(10), comment(), 'Corrigido', id(8)), error => error instanceof ApiError && error.kind === 'protocol')
  })
}
test('service DELETE usa apenas UUIDs da rota e helper204; nao envia corpo/autor/status', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createComentarioService(() => assert.fail(), async (...args) => { calls.push(args) })
  assert.equal(await service.remove(id(10), comment(), id(8), signal), undefined)
  assert.deepEqual(calls, [['/materiais/' + id(10) + '/comentarios/' + id(30), { signal }]])
})
test('service bloqueia alvo/autor/Material/UUID invalidos antes de PUT/DELETE', async () => {
  const service = createComentarioService(() => assert.fail(), () => assert.fail())
  for (const [material, target, user] of [[id(10), comment(), id(9)], ['x', comment(), id(8)], [id(11), comment(), id(8)], [id(10), comment({ id: 'x' }), id(8)], [id(10), comment({ status: 'OCULTO' }), id(8)]]) {
    await assert.rejects(service.update(material, target, 'Novo', user), TypeError)
    await assert.rejects(service.remove(material, target, user), TypeError)
  }
})
test('model aceita acao somente sobre proprio comentario carregado na pagina', async () => {
  const { model, calls } = fixture({ list: async () => page([comment({ usuarioId: id(9) })], 0, 20) })
  await model.load(id(10), true)
  for (const target of [id(30), id(99), 'x']) { model.startEdit(target); model.startRemoval(target) }
  await model.submitAction(); assert.equal(model.getState().action, null); assert.equal(calls.length, 0)
})
test('abrir/cancelar edicao ou remocao nao escreve nem consulta GETindividual; preserva draft de novo comentario', async () => {
  const { model, calls } = fixture(); await model.load(id(10), true); model.changeDraft('Novo rascunho')
  model.startEdit(id(30)); assert.equal(model.getState().action.draft, comment().conteudo)
  model.changeActionDraft('Edicao descartavel'); await model.closeAction()
  model.startRemoval(id(30)); await model.submitAction(); await model.closeAction()
  assert.equal(model.getState().action, null); assert.equal(model.getState().draft, 'Novo rascunho'); assert.equal(calls.length, 1)
})
test('acao aberta impede trocar alvo/pagina/tamanho/recarregar/cadastrar/alterar rascunho de cadastro', async () => {
  const { model, calls } = fixture(); await model.load(id(10), true); model.changeDraft('Preservado'); model.startEdit(id(30))
  await model.reload(); await model.setSize(50); await model.goToPage(0); await model.submit(); model.changeDraft('Mudou'); model.startRemoval(id(30))
  assert.equal(calls.length, 1); assert.equal(model.getState().draft, 'Preservado'); assert.equal(model.getState().action.kind, 'edit')
})
test('PUT inalterado/trim igual nao envia e pede alteracao', async () => {
  const { model, calls } = fixture(); await model.load(id(10), true); model.startEdit(id(30))
  model.changeActionDraft('  ' + comment().conteudo + '\n'); await model.submitAction()
  assert.equal(calls.length, 1); assert.ok(model.getState().action.error.includes('Altere'))
})
for (const [label, content] of [['branco', ' \n'], ['longo', 'x'.repeat(4001)], ['nulo', 'a\u0000']]) {
  test('edicao ' + label + ' nao envia nem descarta o draft', async () => {
    const { model, calls } = fixture(); await model.load(id(10), true); model.startEdit(id(30)); model.changeActionDraft(content); await model.submitAction()
    assert.equal(calls.length, 1); assert.equal(model.getState().action.draft, content); assert.ok(model.getState().action.error)
    await assert.rejects(createComentarioService(() => assert.fail()).update(id(10), comment(), content, id(8)), TypeError)
  })
}
test('edicao confirma, preserva novo draft e pagina consultada sem alterar DTO local otimisticamente', async () => {
  let stored = comment(), writes = 0
  const { model } = fixture({
    list: async (material, number, size) => page([stored], number, size, 21),
    update: async (material, target, text) => { writes++; assert.deepEqual(target, stored); stored = { ...stored, conteudo: text.trim() }; return stored },
  })
  await model.load(id(10), true); await model.goToPage(1); model.changeDraft('Novo'); model.startEdit(id(30)); model.changeActionDraft('Corrigido'); await model.submitAction()
  assert.equal(writes, 1); assert.equal(model.getState().action, null); assert.equal(model.getState().data.page.number, 1)
  assert.equal(model.getState().data.content[0].conteudo, 'Corrigido'); assert.equal(model.getState().draft, 'Novo'); assert.equal(model.getState().message, 'Comentário atualizado.')
})
test('DELETE exige checkbox literaltrue, consome consentimento, bloqueia duplicado/fechar/alterar durante voo', async () => {
  const pending = deferred(), writes = []
  const { model } = fixture({ remove: async (...args) => { writes.push(args); return pending.promise } })
  await model.load(id(10), true); model.startRemoval(id(30)); await model.submitAction(); assert.equal(writes.length, 0)
  model.confirmRemoval('true'); await model.submitAction(); assert.equal(writes.length, 0)
  model.confirmRemoval(true); const sending = model.submitAction(); await model.submitAction(); await model.closeAction(); model.confirmRemoval(true)
  assert.equal(writes.length, 1); assert.equal(model.getState().action.confirmed, false); assert.equal(model.getState().action.sending, true)
  pending.resolve(); await sending; assert.equal(model.getState().action, null); assert.ok(model.getState().message.includes('removido'))
})
test('DELETE apos ultima linha da pagina corrige total encolhido uma unica vez', async () => {
  let removed = false; const reads = []
  const { model } = fixture({
    list: async (material, number, size) => { reads.push(number); return removed ? page([], number, size, 0) : page([comment()], number, size, 21) },
    remove: async () => { removed = true },
  })
  await model.load(id(10), true); await model.goToPage(1); model.startRemoval(id(30)); model.confirmRemoval(true); await model.submitAction()
  assert.deepEqual(reads, [0, 1, 1, 0]); assert.equal(model.getState().data.page.totalElements, 0)
})
for (const kind of ['edit', 'remove']) {
  test(kind + ': duplo envio bloqueado e erro na recarga nao invalida sucesso confirmado', async () => {
    let reads = 0, writes = 0; const pending = deferred()
    const { model } = fixture({ list: async () => { if (++reads > 1) throw new ApiError('network'); return page([comment()], 0, 20) }, update: async () => { writes++; return pending.promise }, remove: async () => { writes++; return pending.promise } })
    await model.load(id(10), true); if (kind === 'edit') { model.startEdit(id(30)); model.changeActionDraft('Novo') } else { model.startRemoval(id(30)); model.confirmRemoval(true) }
    const sending = model.submitAction(); await model.submitAction(); pending.resolve(comment({ conteudo: 'Novo' })); await sending
    assert.equal(writes, 1); assert.equal(model.getState().action, null); assert.ok(model.getState().message); assert.ok(model.getState().loadError); assert.equal(model.getState().uncertain, false)
  })
}
for (const kind of ['edit', 'remove']) {
  for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) {
    test(kind + ' incerto ' + error.kind + '/' + error.status + ': bloqueia reenvio ate fechar e atualizar, sem tentativa automatica', async () => {
      let writes = 0, reads = 0
      const fail = async () => { writes++; throw error }
      const { model } = fixture({ list: async () => { reads++; return page([comment()], 0, 20) }, update: fail, remove: fail })
      await model.load(id(10), true); if (kind === 'edit') { model.startEdit(id(30)); model.changeActionDraft('Novo') } else { model.startRemoval(id(30)); model.confirmRemoval(true) }
      await model.submitAction(); assert.equal(model.getState().action.uncertain, true); assert.equal(model.getState().action.confirmed, false)
      model.confirmRemoval(true); model.changeActionDraft('Outro'); await model.submitAction(); await model.reload()
      assert.equal(writes, 1); assert.equal(reads, 1)
      await model.closeAction(); assert.equal(reads, 2); assert.equal(model.getState().action, null); assert.equal(writes, 1)
      model.startRemoval(id(30)); await model.submitAction(); assert.equal(writes, 1, 'nova confirmacao obrigatoria')
    })
  }
}
test('GET falho apos fechar acao incerta impede selecionar snapshot antigo ou novo POST', async () => {
  let reads = 0
  const { model, calls } = fixture({ list: async () => { if (++reads > 1) throw new ApiError('network'); return page([comment()], 0, 20) }, remove: async () => { throw new ApiError('network') } })
  await model.load(id(10), true); model.changeDraft('Novo'); model.startRemoval(id(30)); model.confirmRemoval(true); await model.submitAction(); await model.closeAction()
  model.startRemoval(id(30)); await model.submit(); assert.equal(model.getState().action, null); assert.equal(model.getState().data, null); assert.equal(calls.length, 0)
})
for (const status of [401, 403, 404, 409, 400]) {
  test('erro de mutacao ' + status + ' nao ecoa texto privado e respeita acesso/conflito/confirmacao consumida', async () => {
    const { model } = fixture({ remove: async () => { throw new ApiError('http', status, { title: 'PRIVADO', detail: 'PRIVADO', errors: [] }) } })
    await model.load(id(10), true); model.startRemoval(id(30)); model.confirmRemoval(true); await model.submitAction()
    assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    if ([401, 403, 404].includes(status)) { assert.equal(model.getState().data, null); assert.equal(model.getState().action, null); assert.equal(model.getState().unavailable, true) }
    else { assert.equal(model.getState().action.confirmed, false); assert.equal(model.getState().action.uncertain, false); assert.equal(model.getState().action.blocked, status === 409) }
  })
}
test('400 de PUT permite corrigir texto;409 exige lista nova sem repetir mutacao', async () => {
  let status = 400, writes = 0
  const { model } = fixture({ update: async () => { writes++; throw new ApiError('http', status) } })
  await model.load(id(10), true); model.startEdit(id(30)); model.changeActionDraft('Novo'); await model.submitAction()
  model.changeActionDraft('Corrigido'); status = 409; await model.submitAction(); model.changeActionDraft('Ignorar'); await model.submitAction()
  assert.equal(writes, 2); assert.equal(model.getState().action.draft, 'Corrigido'); await model.closeAction(); assert.equal(model.getState().action, null)
})
for (const kind of ['edit', 'remove']) {
  for (const change of ['conta', 'material', 'dispose']) {
    test(kind + ': resposta antiga apos ' + change + ' nao restaura selecao/texto/mensagem', async () => {
      const pending = deferred(); let user = id(8), signal
      const operation = async (...args) => { signal = args.at(-1); return pending.promise }
      const { model, calls } = fixture({ update: operation, remove: operation }, () => user)
      await model.load(id(10), true); if (kind === 'edit') { model.startEdit(id(30)); model.changeActionDraft('Novo') } else { model.startRemoval(id(30)); model.confirmRemoval(true) }
      const sending = model.submitAction()
      if (change === 'conta') user = id(9)
      if (change === 'material') await model.load(id(11), true)
      if (change === 'dispose') model.dispose()
      pending.resolve(comment()); await sending
      assert.equal(signal.aborted, true); assert.equal(model.getState().action, null); assert.equal(model.getState().message, ''); assert.equal(calls.length, change === 'material' ? 2 : 1)
    })
  }
}
test('mudanca de conta antes da confirmacao impede DELETE e limpa alvo/rascunho', async () => {
  let user = id(8)
  const { model, calls } = fixture({}, () => user); await model.load(id(10), true); model.startRemoval(id(30)); user = id(9); model.confirmRemoval(true); await model.submitAction()
  assert.equal(calls.length, 1); assert.equal(model.getState().action, null); assert.equal(model.getState().data, null)
})
test('envioPOSTincerto impede iniciar edicao/remocao ate reconciliacao explicita existente', async () => {
  const { model } = fixture({ create: async () => { throw new ApiError('network') } })
  await model.load(id(10), true); model.changeDraft('Novo'); await model.submit(); model.startEdit(id(30)); model.startRemoval(id(30))
  assert.equal(model.getState().action, null); assert.equal(model.getState().uncertain, true)
})
