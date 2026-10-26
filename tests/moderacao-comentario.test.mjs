import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createComentarioService } from '../src/features/comentario/comentario-service.ts'
import { createModeracaoComentarioService } from '../src/features/moderacao/moderacao-comentario-service.ts'
import { createModeracaoComentarioModel } from '../src/features/moderacao/moderacao-comentario-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const comment = (changes = {}) => ({ id: id(30), materialId: id(10), usuarioId: id(8), status: 'ATIVO', conteudo: 'Texto\n<script>literal</script>', dataCadastro: '2026-10-25T12:00:00Z', ...changes })
const staff = (perfil = 'MODERADOR', key = id(8)) => ({ id: key, perfil })
function fixture(list, user = () => staff()) {
  const calls = []
  const model = createModeracaoComentarioModel({ list: async (key, number, size, signal) => { calls.push({ key, number, size, signal }); return list ? list(key, number, size, signal) : page([comment({ materialId: key })], number, size) } }, user)
  return { model, calls }
}
test('service GETmoderacao semfiltros/corpo eprojeta seis campos ATIVO/OCULTO preservandotexto eordem', async () => {
  const calls = [], signal = new AbortController().signal
  const rows = [comment({ id: id(31), status: 'OCULTO' }), comment()]
  const service = createModeracaoComentarioService(async (...args) => { calls.push(args); return page(rows.map(row => ({ ...row, email: 'PRIVADO', nome: 'PRIVADO', perfil: 'PRIVADO', caminhoArquivo: 'PRIVADO' })), 1, 20, 22) })
  assert.deepEqual((await service.list(id(10).toUpperCase(), 1, 20, signal)).content, rows)
  assert.deepEqual(calls, [[`/materiais/${id(10)}/comentarios/moderacao?page=1&size=20`, { signal }]])
})
test('parser comum continua aceitando apenasATIVO e rejeitaOCULTO/REMOVIDO, mesmoaposrefatoracao', async () => {
  assert.deepEqual((await createComentarioService(async () => page([comment()], 0, 20)).list(id(10))).content, [comment()])
  for (const status of ['OCULTO', 'REMOVIDO']) await assert.rejects(createComentarioService(async () => page([comment({ status })], 0, 20)).list(id(10)), ApiError)
})
test('service rejeita REMOVIDO/DTOinvalido/materialcruzado e naoaceita texto fora do contrato', async () => {
  for (const changes of [{ status: 'REMOVIDO', conteudo: 'TEXTO REMOVIDO PRIVADO' }, { status: 'NOVO' }, { id: 'x' }, { materialId: id(11) }, { usuarioId: 'x' }, { conteudo: '' }, { conteudo: null }, { conteudo: 'a'.repeat(4001) }, { conteudo: 'a\u0000' }, { dataCadastro: 'x' }]) {
    await assert.rejects(createModeracaoComentarioService(async () => page([comment(changes)], 0, 20)).list(id(10)), error => error instanceof ApiError && error.kind === 'protocol')
  }
})
test('UUID/paginacao invalidos antesHTTP, IDsduplicados/pagina incoerente rejeitados', async () => {
  const service = createModeracaoComentarioService(() => assert.fail())
  await assert.rejects(service.list('../x'), TypeError)
  for (const [number, size] of [[-1, 20], [0.5, 20], [0, 0], [0, 101]]) await assert.rejects(service.list(id(10), number, size), TypeError)
  for (const dto of [page([comment(), comment()], 0, 20), page([comment()], 1, 20), { content: [], page: { number: 0, size: 20, totalElements: 21, totalPages: 1 } }]) await assert.rejects(createModeracaoComentarioService(async () => dto).list(id(10)), ApiError)
})
for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' consulta comentario proprio/oculto sem novasmutacoes ou restricao deautoria', async () => {
    const { model, calls } = fixture((key, number, size) => page([comment({ status: 'OCULTO', materialId: key })], number, size), () => staff(perfil))
    await model.load(id(10)); assert.equal(calls.length, 1); assert.equal(model.getState().data.content[0].status, 'OCULTO'); assert.equal(model.getState().data.content[0].usuarioId, id(8))
    for (const name of ['ocultar', 'reexibir', 'create', 'update', 'remove', 'submit']) assert.equal(name in model, false); model.dispose()
  })
}
for (const user of [null, staff('USUARIO'), staff('DESCONHECIDO'), staff('MODERADOR', 'x')]) {
  test('sem equipe/identidade validas nao consulta: ' + JSON.stringify(user), async () => {
    const { model, calls } = fixture(undefined, () => user); await model.load(id(10)); await model.reload(); await model.setSize(50); await model.goToPage(0)
    assert.equal(calls.length, 0); assert.equal(model.getState().denied, true); assert.equal(model.getState().data, null); model.dispose()
  })
}
test('UUIDinvalido nao consultado e pagina/tamanho reiniciados ao trocar Material', async () => {
  const { model, calls } = fixture((key, number, size) => page([comment({ materialId: key })], number, size, 101))
  await model.load('x'); assert.equal(calls.length, 0); assert.equal(model.getState().data, null)
  await model.load(id(10)); await model.goToPage(3); await model.reload(); assert.deepEqual(calls.slice(-2).map(x => [x.key, x.number, x.size]), [[id(10), 3, 20], [id(10), 3, 20]])
  await model.setSize(50); assert.deepEqual([calls.at(-1).number, calls.at(-1).size], [0, 50]); await model.setSize(100)
  const before = calls.length; await model.setSize(21); await model.goToPage(-1); await model.goToPage(99); assert.equal(calls.length, before)
  await model.load(id(11)); assert.equal(model.getState().size, 20); assert.deepEqual([calls.at(-1).key, calls.at(-1).number, calls.at(-1).size], [id(11), 0, 20]); model.dispose()
})
test('pagina encolhida fazcorrecao unica mesmoMaterial, inclusivezero', async () => {
  let shrink = false
  const { model, calls } = fixture((key, number, size) => page(shrink ? [] : [comment({ materialId: key })], number, size, shrink ? 0 : 21))
  await model.load(id(10)); shrink = true; await model.goToPage(1)
  assert.deepEqual(calls.map(x => [x.key, x.number]), [[id(10), 0], [id(10), 1], [id(10), 0]]); assert.equal(model.getState().data.page.totalElements, 0); model.dispose()
})
for (const status of [401, 403, 404]) {
  test('GET' + status + ' retira textos e bloqueia novasconsultas na instancia sem ecoar corpo', async () => {
    let fail = false
    const { model, calls } = fixture((key, number, size) => { if (fail) throw new ApiError('http', status, { detail: 'PRIVADO', errors: [] }); return page([comment({ status: 'OCULTO' })], number, size) })
    await model.load(id(10)); fail = true; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().denied, true); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
    await model.reload(); await model.setSize(50); assert.equal(calls.length, 2); model.dispose()
  })
}
test('erro de rede/protocolo nao vira lista vazia nem preservatexto; retry explicito limpaerro', async () => {
  let mode = 'ok'
  const service = createModeracaoComentarioService(async () => { if (mode === 'network') throw new ApiError('network'); return page(mode === 'removed' ? [comment(), comment({ id: id(31), status: 'REMOVIDO', conteudo: 'PRIVADO' })] : [comment({ status: 'OCULTO' })], 0, 20) })
  const model = createModeracaoComentarioModel(service, () => staff()); await model.load(id(10))
  for (const failure of ['network', 'removed']) { mode = failure; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().denied, false); assert.ok(model.getState().error); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false) }
  mode = 'ok'; await model.reload(); assert.equal(model.getState().error, ''); assert.equal(model.getState().data.content[0].status, 'OCULTO'); model.dispose()
})
for (const change of ['conta', 'perfil', 'equipe', 'dispose']) {
  test('resposta antiga apos ' + change + ' nao restaura texto decomentarios', async () => {
    const pending = deferred(); let user = staff(), signal
    const { model } = fixture(async (_key, _number, _size, s) => { signal = s; return pending.promise }, () => user)
    const loading = model.load(id(10))
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose()
    pending.resolve(page([comment({ status: 'OCULTO' })], 0, 20)); await loading
    assert.equal(signal.aborted, true); assert.equal(model.getState().data, null); model.dispose()
  })
}
test('403antigo deoutro Material nao limpa pagina nova nem retorna texto anterior', async () => {
  const pending = deferred(); let reads = 0, signal
  const { model } = fixture(async (key, number, size, s) => { if (++reads === 1) { signal = s; return pending.promise } return page([comment({ materialId: key, status: 'OCULTO' })], number, size) })
  const loading = model.load(id(10)); await model.load(id(11)); pending.reject(new ApiError('http', 403)); await loading
  assert.equal(signal.aborted, true); assert.equal(model.getState().denied, false); assert.equal(model.getState().data.content[0].materialId, id(11)); model.dispose()
})
test('novaquery limpa textos imediatamente e tamanho novo nao recebe resposta antiga', async () => {
  const pending = deferred(); let reads = 0
  const { model } = fixture(async (key, number, size) => ++reads === 2 ? pending.promise : page([comment({ materialId: key })], number, size))
  await model.load(id(10)); const loading = model.reload(); assert.equal(model.getState().data, null)
  await model.setSize(50); pending.resolve(page([comment({ status: 'OCULTO' })], 0, 20)); await loading
  assert.equal(model.getState().data.page.size, 50); assert.equal(model.getState().data.content[0].status, 'ATIVO'); model.dispose()
})
