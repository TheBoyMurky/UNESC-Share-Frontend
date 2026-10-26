import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createInstituicaoService } from '../src/features/instituicao/instituicao-service.ts'
import { createInstituicaoConsultaModel } from '../src/features/instituicao/instituicao-consulta-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const institution = (changes = {}) => ({ id: id(1), nome: 'Instituição <script>texto literal</script>', sigla: 'TESTE', ...changes })
const actor = (perfil = 'USUARIO', key = id(8)) => ({ id: key, perfil })
function fixture({ list, detail, user = () => actor() } = {}) {
  const calls = []
  const model = createInstituicaoConsultaModel({
    list: async (number, size, signal) => { calls.push({ kind: 'list', number, size, signal }); return list ? list(number, size, signal) : page([institution()], number, size, 101) },
    detail: async (key, signal) => { calls.push({ kind: 'detail', key, signal }); return detail ? detail(key, signal) : institution({ id: key }) },
  }, user)
  return { model, calls }
}

test('service soGET list/detail projeta3campos semcursos/nomesextras/N+1 e preservaordemrecebida', async () => {
  const calls = [], signal = new AbortController().signal, rows = [institution(), institution({ id: id(2), nome: 'Outra' })]
  const service = createInstituicaoService(async (...args) => { calls.push(args); return args[0].includes('?') ? page(rows.map(x => ({ ...x, cursos: ['EXTRA'], email: 'PRIVADO' })), 1, 20, 22) : { ...rows[0], cursos: ['EXTRA'] } })
  assert.deepEqual((await service.list(1, 20, signal)).content, rows)
  assert.deepEqual(await service.detail(id(1).toUpperCase(), signal), rows[0])
  assert.deepEqual(calls, [[`/instituicoes?page=1&size=20`, { signal }], [`/instituicoes/${id(1)}`, { signal }]])
})
test('service validaUUID/paginacao antesHTTP e confereID do detalhe', async () => {
  const service = createInstituicaoService(() => assert.fail())
  await assert.rejects(service.detail('../x'), TypeError)
  for (const args of [[-1, 20], [0.5, 20], [0, 0], [0, 101]]) await assert.rejects(service.list(...args), TypeError)
  await assert.rejects(createInstituicaoService(async () => institution({ id: id(2) })).detail(id(1)), ApiError)
})
test('DTO recusa texto/UUID/nulo/limites masaceita legado semexigir siglamaiuscula', async () => {
  for (const change of [{ id: 'x' }, { nome: '' }, { nome: 'a'.repeat(181) }, { nome: 'x\u0000' }, { sigla: '' }, { sigla: 'a'.repeat(31) }, { sigla: 'x\u0000' }]) await assert.rejects(createInstituicaoService(async () => institution(change)).detail(id(1)), ApiError)
  for (const value of [null, [], 'x']) await assert.rejects(createInstituicaoService(async () => value).detail(id(1)), ApiError)
  const source = institution({ nome: 'a'.repeat(180), sigla: 'b'.repeat(30) }); assert.deepEqual(await createInstituicaoService(async () => source).detail(id(1)), source)
})
test('service recusaIDsduplicados-normalizados/paginafora/contagemincoerente', async () => {
  for (const data of [page([institution(), institution()], 0, 20), page([institution(), institution({ id: id(1).toUpperCase() })], 0, 20), page([institution()], 1, 20, 1), page([institution()], 0, 20, 1)]) {
    const number = data.page.number === 1 ? 1 : data.page.totalElements === 1 ? 1 : 0
    await assert.rejects(createInstituicaoService(async () => data).list(number, 20), ApiError)
  }
})
for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
  test(perfil + ' consulta lista e UUID direto semexigiradministracao ou derivarautorizacaoporperfil', async () => {
    const { model, calls } = fixture({ user: () => actor(perfil) }); await model.loadList(); assert.equal(model.getState().data.content[0].id, id(1)); assert.equal(calls.length, 1)
    await model.loadDetail(id(99)); assert.equal(model.getState().data, null); assert.equal(model.getState().institution.id, id(99)); assert.equal(calls.at(-1).kind, 'detail'); model.dispose()
  })
}
test('lista20/50/100, refreshpreserva e tamanho/reaberturazera pagina', async () => {
  const { model, calls } = fixture(); await model.loadList(); await model.goToPage(2); await model.reload(); assert.deepEqual(calls.slice(-2).map(x => x.number), [2, 2])
  await model.setSize(50); assert.deepEqual([calls.at(-1).number, calls.at(-1).size], [0, 50]); await model.setSize(100)
  const before = calls.length; await model.setSize(21); await model.goToPage(-1); await model.goToPage(0.5); await model.goToPage(99); assert.equal(calls.length, before)
  await model.loadDetail(id(1)); await model.setSize(50); await model.goToPage(1); assert.equal(calls.at(-1).kind, 'detail'); await model.loadList(); assert.equal(model.getState().size, 20); assert.equal(calls.at(-1).number, 0); model.dispose()
})
test('paginaencolhida corrigida umaunica vez inclusivezero, semloopemnovareducao', async () => {
  let empty = false
  const { model, calls } = fixture({ list: async (number, size) => page(empty ? [] : [institution()], number, size, empty ? 0 : 101) }); await model.loadList(); empty = true; await model.goToPage(3)
  assert.deepEqual(calls.slice(-2).map(x => x.number), [3, 0]); assert.deepEqual(model.getState().data.content, []); model.dispose()
})
test('lista nao fazprefetchdedetalhes, abrirUUID retira lista e voltar busca lista nova20/0', async () => {
  const pending = deferred(), { model, calls } = fixture({ detail: () => pending.promise }); await model.loadList(); const opening = model.loadDetail(id(1))
  assert.equal(model.getState().data, null); assert.equal(model.getState().institution, null); assert.equal(model.getState().loading, true)
  await model.loadList(); pending.resolve(institution()); await opening; assert.equal(calls[1].signal.aborted, true); assert.equal(model.getState().mode, 'list'); assert.equal(model.getState().institution, null); model.dispose()
})
test('novoconsulta remove resultado antigo antesGET e ignorapaginaatrasada', async () => {
  const pending = deferred(); let reads = 0
  const { model } = fixture({ list: async (number, size) => ++reads === 2 ? pending.promise : page([institution()], number, size, 101) }); await model.loadList(); const loading = model.reload(); assert.equal(model.getState().data, null)
  await model.setSize(50); pending.resolve(page([], 0, 20)); await loading; assert.equal(model.getState().data.page.size, 50); assert.ok(model.getState().data.content.length); model.dispose()
})
test('vazio e rede-protocolo-5xx diferentes, GETretryexplicito semcorpoprivado', async () => {
  for (const mode of ['list', 'detail']) {
    let fail = false
    const { model } = fixture({ list: async (n, s) => { if (fail) throw new ApiError('http', 503, { detail: 'PRIVADO', errors: [] }); return page([], n, s) }, detail: async key => { if (fail) throw new ApiError('protocol'); return institution({ id: key }) } })
    if (mode === 'list') await model.loadList(); else await model.loadDetail(id(1))
    if (mode === 'list') assert.deepEqual(model.getState().data.content, [])
    fail = true; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().institution, null); assert.ok(model.getState().error); assert.equal(model.getState().unavailable, false); assert.equal(model.getState().error.includes('PRIVADO'), false)
    fail = false; await model.reload(); assert.equal(model.getState().error, ''); model.dispose()
  }
})
for (const code of [401, 403]) {
  test('GET' + code + ' retiratodosdados/bloqueiaretry ate novacarga emambosmodos', async () => {
    for (const mode of ['list', 'detail']) {
      let fail = false
      const { model, calls } = fixture({ list: async (n, s) => { if (fail) throw new ApiError('http', code); return page([institution()], n, s) }, detail: async key => { if (fail) throw new ApiError('http', code); return institution({ id: key }) } })
      if (mode === 'list') await model.loadList(); else await model.loadDetail(id(1))
      fail = true; await model.reload(); assert.equal(model.getState().data, null); assert.equal(model.getState().institution, null); assert.equal(model.getState().unavailable, true)
      const before = calls.length; await model.reload(); await model.setSize(50); assert.equal(calls.length, before); fail = false; await model.loadList(); assert.ok(model.getState().data); model.dispose()
    }
  })
}
test('detalhe404/UUIDinvalido naoviraausenciavazia nemmantemregistroantigo', async () => {
  const { model, calls } = fixture({ detail: async () => { throw new ApiError('http', 404) } }); await model.loadDetail('x'); assert.equal(calls.length, 0)
  await model.loadDetail(id(1)); assert.equal(model.getState().institution, null); assert.equal(model.getState().unavailable, true); await model.reload(); assert.equal(calls.length, 1)
  await model.loadList(); assert.ok(model.getState().data); model.dispose()
})
for (const change of ['UUID', 'conta', 'perfil', 'logout', 'dispose']) {
  test('detalheatrasado apos ' + change + ' abortado-ignorado sem contaminar novoestado', async () => {
    let user = actor(); const pending = deferred(); let reads = 0
    const { model, calls } = fixture({ user: () => user, detail: async key => ++reads === 1 ? pending.promise : institution({ id: key }) }); const loading = model.loadDetail(id(1))
    if (change === 'conta') user = actor('USUARIO', id(9))
    if (change === 'perfil') user = actor('ADMINISTRADOR')
    if (change === 'logout') user = null
    if (change === 'dispose') model.dispose(); else await model.loadDetail(change === 'UUID' ? id(2) : id(1))
    pending.reject(new ApiError('http', 403)); await loading; assert.equal(calls[0].signal.aborted, true)
    if (!['logout', 'dispose'].includes(change)) { assert.equal(model.getState().unavailable, false); assert.equal(model.getState().institution.id, change === 'UUID' ? id(2) : id(1)) }
    else assert.equal(model.getState().institution, null)
    model.dispose()
  })
}
test('semequipeaindaconsulta massemcontaUUIDvalido naoGET/perdadecontextosemwatcherlimpa', async () => {
  for (const user of [null, actor('USUARIO', 'x')]) { const { model, calls } = fixture({ user: () => user }); await model.loadList(); await model.loadDetail(id(1)); assert.equal(calls.length, 0); model.dispose() }
  let user = actor(); const { model, calls } = fixture({ user: () => user }); await model.loadDetail(id(1)); user = actor('MODERADOR'); await model.reload(); assert.equal(calls.length, 1); assert.equal(model.getState().institution, null); assert.equal(model.getState().unavailable, true); model.dispose()
})
