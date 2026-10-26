import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createModeracaoComentarioService } from '../src/features/moderacao/moderacao-comentario-service.ts'
import { createComentarioConsultaEquipeModel } from '../src/features/moderacao/comentario-consulta-equipe-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const comment = (changes = {}) => ({ id: id(30), materialId: id(10), usuarioId: id(8), status: 'ATIVO', conteudo: 'TEXTO DO COMENTÁRIO PRIVADO', dataCadastro: '2026-10-25T12:00:00Z', ...changes })
const event = (changes = {}) => ({ id: id(70), comentarioId: id(30), responsavelId: id(9), motivo: 'Motivo\n<script>texto literal</script>', estadoAnterior: 'ATIVO', estadoNovo: 'OCULTO', dataCadastro: '2026-10-25T13:00:00Z', ...changes })
const staff = (perfil = 'MODERADOR', key = id(8)) => ({ id: key, perfil })
function fixture({ list, history, user = () => staff() } = {}) {
  const calls = []
  const model = createComentarioConsultaEquipeModel({
    list: async (key, number, size, signal) => { calls.push({ kind: 'list', key, number, size, signal }); return list ? list(key, number, size, signal) : page([comment({ materialId: key }), comment({ id: id(31), materialId: key, status: 'OCULTO' })], number, size) },
    history: async (materialId, target, number, size, signal) => { calls.push({ kind: 'history', materialId, target, number, size, signal }); return history ? history(materialId, target, number, size, signal) : page([event({ comentarioId: target })], number, size) },
  }, user)
  return { model, calls }
}

for (const [before, after] of [['ATIVO', 'OCULTO'], ['OCULTO', 'ATIVO']]) {
  test('service historico ' + before + '->' + after + ' confere par/vinculo eprojeta7campos semtexto/extras', async () => {
    const calls = [], signal = new AbortController().signal, source = event({ estadoAnterior: before, estadoNovo: after })
    const service = createModeracaoComentarioService(async (...args) => { calls.push(args); return page([{ ...source, conteudo: 'TEXTO DO COMENTÁRIO PRIVADO', email: 'PRIVADO', nome: 'PRIVADO', usuarioId: id(8) }], 1, 20, 21) })
    assert.deepEqual((await service.history(id(10).toUpperCase(), id(30).toUpperCase(), 1, 20, signal)).content, [source])
    assert.deepEqual(calls, [[`/materiais/${id(10)}/comentarios/${id(30)}/historico-moderacao?page=1&size=20`, { signal }]])
  })
}
test('service rejeita vinculo/agente/transicao/motivo/data invalidos sem aceitarREMOVIDO comoevento', async () => {
  for (const changes of [{ id: 'x' }, { comentarioId: id(31) }, { responsavelId: 'x' }, { estadoAnterior: 'REMOVIDO' }, { estadoNovo: 'REMOVIDO' }, { estadoAnterior: 'ATIVO', estadoNovo: 'ATIVO' }, { motivo: '' }, { motivo: 'a'.repeat(1001) }, { motivo: 'a\u0000' }, { motivo: null }, { dataCadastro: 'x' }]) {
    await assert.rejects(createModeracaoComentarioService(async () => page([event(changes)], 0, 20)).history(id(10), id(30)), error => error instanceof ApiError && error.kind === 'protocol')
  }
  assert.equal((await createModeracaoComentarioService(async () => page([event({ motivo: 'a'.repeat(1000) })], 0, 20)).history(id(10), id(30))).content[0].motivo.length, 1000)
})
test('service validaUUIDs/paginacao antesHTTP, rejeitaIDsduplicados e pagina incoerente', async () => {
  const service = createModeracaoComentarioService(() => assert.fail())
  await assert.rejects(service.history('../x', id(30)), TypeError); await assert.rejects(service.history(id(10), '../x'), TypeError)
  for (const [number, size] of [[-1, 20], [0.5, 20], [0, 0], [0, 101]]) await assert.rejects(service.history(id(10), id(30), number, size), TypeError)
  for (const data of [page([event(), event()], 0, 20), page([event()], 1, 20), { content: [], page: { number: 0, size: 20, totalElements: 21, totalPages: 1 } }]) await assert.rejects(createModeracaoComentarioService(async () => data).history(id(10), id(30)), ApiError)
})
test('service conserva ordem/parcial legado sem exigircontinuidade nem estadoatual', async () => {
  const rows = [event({ id: id(72), estadoAnterior: 'OCULTO', estadoNovo: 'ATIVO' }), event({ id: id(71) })]
  assert.deepEqual((await createModeracaoComentarioService(async () => page(rows, 0, 20)).history(id(10), id(30))).content, rows)
})
for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' seleciona ATIVO/OCULTO conhecido, guarda soUUID e consulta sem mutacoes', async () => {
    const { model, calls } = fixture({ user: () => staff(perfil) }); await model.load(id(10)); assert.equal(calls.length, 1)
    assert.equal(calls.some(x => x.kind === 'history'), false); await model.openHistory(id(31)); assert.equal(model.getState().mode, 'history'); assert.equal(model.getState().selectedId, id(31))
    assert.equal(JSON.stringify(model.getState()).includes('TEXTO DO COMENTÁRIO PRIVADO'), false); assert.equal('usuarioId' in model.getState(), false); assert.equal(model.getState().data.content[0].comentarioId, id(31))
    for (const name of ['ocultar', 'reexibir', 'create', 'remove', 'submit']) assert.equal(name in model, false); model.dispose()
  })
}
test('sem equipe/UUID valido oualvofora dapagina nao consulta historico', async () => {
  for (const user of [null, staff('USUARIO'), staff('DESCONHECIDO'), staff('MODERADOR', 'x')]) {
    const { model, calls } = fixture({ user: () => user }); await model.load(id(10)); await model.openHistory(id(30)); await model.reload(); assert.equal(calls.length, 0); assert.equal(model.getState().data, null); model.dispose()
  }
  const { model, calls } = fixture(); await model.load('x'); assert.equal(calls.length, 0); await model.load(id(10))
  for (const target of ['x', id(99)]) await model.openHistory(target)
  assert.equal(calls.length, 1); assert.equal(model.getState().mode, 'list'); model.dispose()
})
test('abrir retira todaalistatextual antesdeGET, painelunico e fechar fazlistanova semsnapshotantigo', async () => {
  const pending = deferred(); const { model, calls } = fixture({ history: () => pending.promise })
  await model.load(id(10)); const loading = model.openHistory(id(30)); assert.equal(model.getState().mode, 'history'); assert.equal(model.getState().data, null)
  assert.equal(JSON.stringify(model.getState()).includes('TEXTO DO COMENTÁRIO PRIVADO'), false); await model.openHistory(id(31)); assert.equal(calls.length, 2)
  await model.closeHistory(); assert.equal(model.getState().mode, 'list'); assert.equal(calls.at(-1).kind, 'list'); assert.equal(calls[1].signal.aborted, true)
  pending.resolve(page([event()], 0, 20)); await loading; assert.equal(model.getState().mode, 'list'); assert.equal(model.getState().data.content[0].conteudo, comment().conteudo); model.dispose()
})
test('historico continua semrelertexto secomentario removidoaposselacao; volta mostra lista atual', async () => {
  let removed = false
  const { model, calls } = fixture({ list: async (key, number, size) => page(removed ? [] : [comment({ materialId: key })], number, size) })
  await model.load(id(10)); removed = true; await model.openHistory(id(30)); await model.reload()
  assert.deepEqual(calls.map(x => x.kind), ['list', 'history', 'history']); assert.ok(model.getState().data.content.length); assert.equal(JSON.stringify(model.getState()).includes('TEXTO DO COMENTÁRIO PRIVADO'), false)
  await model.closeHistory(); assert.equal(model.getState().mode, 'list'); assert.deepEqual(model.getState().data.content, []); await model.openHistory(id(30)); assert.equal(calls.at(-1).kind, 'list'); model.dispose()
})
test('historico20/50/100, correcao unica inclusivezero, voltar reseta lista20/0', async () => {
  let shrink = false
  const { model, calls } = fixture({ history: async (_key, target, number, size) => page(shrink ? [] : [event({ comentarioId: target })], number, size, shrink ? 0 : 101) })
  await model.load(id(10)); await model.openHistory(id(30)); await model.goToPage(3); await model.reload(); assert.deepEqual(calls.slice(-2).map(x => x.number), [3, 3])
  await model.setSize(50); assert.equal(calls.at(-1).number, 0); await model.setSize(100)
  const before = calls.length; await model.setSize(21); await model.goToPage(-1); await model.goToPage(99); assert.equal(calls.length, before)
  shrink = true; await model.goToPage(1); assert.deepEqual(calls.slice(-2).map(x => [x.number, x.size]), [[1, 100], [0, 100]])
  await model.closeHistory(); assert.equal(model.getState().size, 20); assert.equal(calls.at(-1).number, 0); assert.equal(model.getState().selectedId, null); model.dispose()
})
test('vazio legado nao infere estado, rede/protocolo nao viram vazio nem conservammotivos anteriores', async () => {
  let mode = 'empty'
  const service = createModeracaoComentarioService(async path => {
    if (path.includes('/historico-moderacao')) { if (mode === 'network') throw new ApiError('network'); return page(mode === 'bad' ? [event({ comentarioId: id(99) })] : mode === 'empty' ? [] : [event()], 0, 20) }
    return page([comment({ status: 'OCULTO' })], 0, 20)
  })
  const model = createComentarioConsultaEquipeModel(service, () => staff()); await model.load(id(10)); await model.openHistory(id(30)); assert.deepEqual(model.getState().data.content, [])
  mode = 'ok'; await model.reload(); assert.ok(model.getState().data.content.length)
  for (const failure of ['network', 'bad']) { mode = failure; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().denied, false); assert.ok(model.getState().error) }
  mode = 'empty'; await model.reload(); assert.equal(model.getState().error, ''); assert.deepEqual(model.getState().data.content, []); model.dispose()
})
for (const status of [401, 403, 404]) {
  test('histGET' + status + ' retira alvo/motivos e bloqueiahistorico, volta eGETnovo dalista', async () => {
    let fail = false
    const { model, calls } = fixture({ history: async (_key, target, number, size) => { if (fail) throw new ApiError('http', status, { detail: 'PRIVADO ERRO', errors: [] }); return page([event({ comentarioId: target })], number, size) } })
    await model.load(id(10)); await model.openHistory(id(30)); fail = true; await model.reload()
    assert.equal(model.getState().data, null); assert.equal(model.getState().selectedId, null); assert.equal(model.getState().denied, true); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO ERRO'), false)
    const before = calls.length; await model.reload(); await model.setSize(50); assert.equal(calls.length, before)
    await model.closeHistory(); assert.equal(calls.at(-1).kind, 'list'); assert.equal(model.getState().mode, 'list'); model.dispose()
  })
}
for (const change of ['Material', 'conta', 'perfil', 'equipe', 'dispose']) {
  test('historico atrasado apos ' + change + ' nao restaura motivo/alvo', async () => {
    const pending = deferred(); let user = staff()
    const { model, calls } = fixture({ user: () => user, history: () => pending.promise }); await model.load(id(10)); const loading = model.openHistory(id(30))
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose(); else await model.load(change === 'Material' ? id(11) : id(10))
    pending.reject(new ApiError('http', 403)); await loading
    assert.equal(calls[1].signal.aborted, true); assert.equal(model.getState().mode, 'list'); assert.equal(model.getState().selectedId, null)
    if (!['perfil', 'dispose'].includes(change)) { assert.equal(model.getState().denied, false); assert.equal(model.getState().data.content[0].materialId, change === 'Material' ? id(11) : id(10)) }
    else assert.equal(model.getState().data, null)
    model.dispose()
  })
}
test('resposta dehistorico antigo nao atinge selecao nova aposvoltar elerlista', async () => {
  const pending = deferred(); let reads = 0
  const { model } = fixture({ history: async (_key, target, number, size) => ++reads === 1 ? pending.promise : page([event({ comentarioId: target })], number, size) })
  await model.load(id(10)); const loading = model.openHistory(id(30)); await model.closeHistory(); await model.openHistory(id(31)); pending.resolve(page([event()], 0, 20)); await loading
  assert.equal(model.getState().mode, 'history'); assert.equal(model.getState().selectedId, id(31)); assert.equal(model.getState().data.content[0].comentarioId, id(31)); model.dispose()
})
test('troca de tamanho limpa historico antesdeGET e ignora pagina antiga', async () => {
  const pending = deferred(); let reads = 0
  const { model } = fixture({ history: async (_key, target, number, size) => ++reads === 2 ? pending.promise : page([event({ comentarioId: target })], number, size) })
  await model.load(id(10)); await model.openHistory(id(30)); const loading = model.reload(); assert.equal(model.getState().data, null); await model.setSize(50)
  pending.resolve(page([], 0, 20)); await loading; assert.equal(model.getState().data.page.size, 50); assert.ok(model.getState().data.content.length); model.dispose()
})
test('perda deperfil ao voltar retira dados sem novoGET, mesmo sem watcher', async () => {
  let user = staff(); const { model, calls } = fixture({ user: () => user })
  await model.load(id(10)); await model.openHistory(id(30)); user = staff('USUARIO'); await model.closeHistory()
  assert.equal(calls.length, 2); assert.equal(model.getState().data, null); assert.equal(model.getState().selectedId, null); assert.equal(model.getState().denied, true); model.dispose()
})
test('falha dalista nao abre historico e respostadalista substituida nao volta durantepainel', async () => {
  const pending = deferred(); let reads = 0
  const { model, calls } = fixture({ list: async (key, number, size) => ++reads === 1 ? pending.promise : page([comment({ materialId: key })], number, size) })
  const loading = model.load(id(10)); await model.openHistory(id(30)); assert.equal(calls.length, 1)
  await model.load(id(11)); await model.openHistory(id(30)); pending.resolve(page([comment()], 0, 20)); await loading
  assert.equal(model.getState().mode, 'history'); assert.equal(model.getState().selectedId, id(30)); assert.equal(JSON.stringify(model.getState()).includes('TEXTO DO COMENTÁRIO PRIVADO'), false); model.dispose()
})
