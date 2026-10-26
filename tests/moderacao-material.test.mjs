import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { canModerate } from '../src/features/auth/permissions.ts'
import { createModeracaoMaterialService } from '../src/features/moderacao/moderacao-material-service.ts'
import { createModeracaoMaterialModel } from '../src/features/moderacao/moderacao-material-model.ts'
import { id, page, material, deferred } from './catalog-fixtures.mjs'

const pending = (changes = {}) => ({ ...material(), status: 'PENDENTE', ...changes })
const staff = (perfil = 'MODERADOR', userId = id(8)) => ({ id: userId, perfil })
function fixture(overrides = {}, user = () => staff()) {
  const calls = []
  const service = { list: async (number, size, signal) => { calls.push({ number, size, signal }); return page([pending()], number, size) }, ...overrides }
  return { model: createModeracaoMaterialModel(service, user), calls }
}

test('canModerate usa somente perfis conhecidos de /me, nao depende de nome/corpo de Material/JWTdecodificado', () => {
  for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) assert.equal(canModerate({ perfil }), true)
  for (const value of [null, undefined, {}, { perfil: 'USUARIO' }, { perfil: 'moderador' }, { perfil: 'DESCONHECIDO' }, { roles: ['ADMINISTRADOR'] }]) assert.equal(canModerate(value), false)
})
test('service GETfila envia statusPENDENTE/pagina e projeta5campos sem autor/academico/dados privados extras', async () => {
  const calls = [], signal = new AbortController().signal
  const source = { ...pending(), titulo: '<script>texto literal</script>', email: 'privado', descricao: 'privado', magnetUri: 'privado' }
  const service = createModeracaoMaterialService(async (...args) => { calls.push(args); return page([source], 1, 20, 21) })
  const data = await service.list(1, 20, signal)
  assert.deepEqual(calls, [['/materiais/moderacao?page=1&size=20&status=PENDENTE', { signal }]])
  assert.deepEqual(data.content, [{ id: source.id, titulo: source.titulo, status: 'PENDENTE', dataCadastro: source.dataCadastro, visualizacoes: 0 }])
  assert.equal(JSON.stringify(data).includes('privado'), false); assert.equal('usuarioId' in data.content[0], false)
})
for (const status of ['PUBLICADO', 'BLOQUEADO', 'REMOVIDO', null]) {
  test('service nao transforma ' + status + ' em pendente nem aceita estado inesperado', async () => {
    await assert.rejects(createModeracaoMaterialService(async () => page([pending({ status })], 0, 20)).list(), error => error instanceof ApiError && error.kind === 'protocol')
  })
}
for (const [label, changes] of [['id', { id: 'x' }], ['autor', { usuarioId: 'x' }], ['disciplina', { disciplinaId: 'x' }], ['categoria', { categoriaId: 'x' }], ['titulo', { titulo: ' ' }], ['data', { dataCadastro: 'x' }], ['views', { visualizacoes: -1 }]]) {
  test('service rejeita DTO invalido: ' + label, async () => {
    await assert.rejects(createModeracaoMaterialService(async () => page([pending(changes)], 0, 20)).list(), ApiError)
  })
}
test('service valida paginacao antes deHTTP e rejeita pagina/IDs duplicados', async () => {
  const noRequest = createModeracaoMaterialService(() => assert.fail())
  for (const [number, size] of [[-1, 20], [0.5, 20], [0, 0], [0, 101]]) await assert.rejects(noRequest.list(number, size), TypeError)
  for (const dto of [page([pending()], 1, 20), page([pending(), pending()], 0, 20), { content: [], page: { number: 0, size: 20, totalElements: 21, totalPages: 1 } }]) {
    await assert.rejects(createModeracaoMaterialService(async () => dto).list(), ApiError)
  }
})
for (const user of [null, staff('USUARIO'), staff('DESCONHECIDO'), staff('MODERADOR', 'x')]) {
  test('modelo impedeHTTP sem identidade e equipe validas: ' + JSON.stringify(user), async () => {
    const { model, calls } = fixture({}, () => user); await model.initialize(); await model.reload(); await model.setSize(50); await model.goToPage(0)
    assert.equal(calls.length, 0); assert.equal(model.getState().denied, true); assert.equal(model.getState().data, null)
  })
}
for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test('modelo aceita ' + perfil + ' sem filtrar por propria autoria ou fazer escritas', async () => {
    const { model, calls } = fixture({}, () => staff(perfil)); await model.initialize()
    assert.equal(calls.length, 1); assert.ok(model.getState().data); assert.equal(model.getState().denied, false)
  })
}
test('paginacao20/50/100 e atualizacao preservam pagina, mudar tamanho volta0 e invalidos nao consultam', async () => {
  const reads = []
  const { model } = fixture({ list: async (number, size) => { reads.push([number, size]); return page([pending()], number, size, 101) } })
  await model.initialize(); await model.goToPage(5); await model.reload(); assert.deepEqual(reads.slice(-2), [[5, 20], [5, 20]])
  await model.setSize(50); assert.deepEqual(reads.at(-1), [0, 50]); await model.setSize(100); assert.deepEqual(reads.at(-1), [0, 100])
  const count = reads.length; await model.setSize(21); for (const number of [-1, NaN, 0.5, 99]) await model.goToPage(number); assert.equal(reads.length, count)
})
test('pagina encolhida faz uma unica correcao, inclusive totalzero', async () => {
  let shrink = false; const reads = []
  const { model } = fixture({ list: async (number, size) => { reads.push(number); return shrink ? page([], number, size, 0) : page([pending()], number, size, 21) } })
  await model.initialize(); shrink = true; await model.goToPage(1); assert.deepEqual(reads, [0, 1, 0]); assert.equal(model.getState().data.page.totalElements, 0)
})
test('rede/protocolo nao viram fila vazia; retry limpa erro e nao preserva dados anteriores', async () => {
  let failure = false
  const { model } = fixture({ list: async () => { if (failure) throw new ApiError('network'); return page([], 0, 20) } })
  await model.initialize(); assert.deepEqual(model.getState().data.content, []); failure = true; await model.reload(); assert.equal(model.getState().data, null); assert.ok(model.getState().error); assert.equal(model.getState().denied, false)
  failure = false; await model.reload(); assert.equal(model.getState().error, ''); assert.deepEqual(model.getState().data.content, [])
})
for (const status of [401, 403]) {
  test('API' + status + ' retira dados e bloqueia consultas repetidas nesta instancia sem mensagens privadas', async () => {
    let fail = false, reads = 0
    const { model } = fixture({ list: async () => { reads++; if (fail) throw new ApiError('http', status, { title: 'PRIVADO', detail: 'PRIVADO', errors: [] }); return page([pending()], 0, 20) } })
    await model.initialize(); fail = true; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().denied, true); assert.equal(model.getState().error.includes('PRIVADO'), false)
    await model.reload(); await model.setSize(50); assert.equal(reads, 2)
  })
}
test('nova consulta limpa fila durante carregamento e resposta antiga nao sobrepoe tamanho novo', async () => {
  const old = deferred(); let reads = 0, signal
  const { model } = fixture({ list: async (number, size, s) => { if (++reads === 1) { signal = s; return old.promise } return page([], number, size) } })
  const first = model.initialize(); await model.setSize(50); old.resolve(page([pending()], 0, 20)); await first
  assert.equal(signal.aborted, true); assert.equal(model.getState().data.page.size, 50); assert.deepEqual(model.getState().data.content, [])
})
for (const change of ['conta', 'perfil', 'equipe', 'dispose']) {
  test('resposta antiga apos ' + change + ' nao restaura fila privada', async () => {
    const pendingResponse = deferred(); let user = staff(), signal
    const { model } = fixture({ list: async (number, size, s) => { signal = s; return pendingResponse.promise } }, () => user)
    const reading = model.initialize()
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose()
    pendingResponse.resolve(page([pending()], 0, 20)); await reading
    assert.equal(signal.aborted, true); assert.equal(model.getState().data, null)
  })
}
test('perda de perfil aposconsulta limpa dados no proximo acesso e nao mandaHTTP', async () => {
  let user = staff()
  const { model, calls } = fixture({}, () => user); await model.initialize(); user = staff('USUARIO'); await model.reload()
  assert.equal(model.getState().data, null); assert.equal(model.getState().denied, true); assert.equal(calls.length, 1)
})
test('reinicializacao por nova conta autorizada cancela e nao herda fila anterior', async () => {
  const old = deferred(); let user = staff(), reads = 0
  const { model } = fixture({ list: async () => ++reads === 1 ? old.promise : page([], 0, 20) }, () => user)
  const first = model.initialize(); user = staff('ADMINISTRADOR', id(9)); await model.initialize(); old.resolve(page([pending()], 0, 20)); await first
  assert.equal(model.getState().denied, false); assert.deepEqual(model.getState().data.content, [])
})
