import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createCursoService, parseCurso } from '../src/features/curso/curso-service.ts'
import { createCursoConsultaModel } from '../src/features/curso/curso-consulta-model.ts'
import { deferred, id, page } from './catalog-fixtures.mjs'

const parent = id(1), course = (n = 2, instituicaoId = parent) => ({ id: id(n), nome: 'Ciência da Computação', descricao: null, instituicaoId })
const actor = (perfil = 'USUARIO', key = id(8)) => ({ id: key, perfil })
const validPage = (items = [course()], number = 0, size = 20, total = items.length) => page(items, number, size, total)

test('service filtra por instituicao e valida UUID, DTO4campos, vínculo, pagina e IDs unicos', async () => {
  const calls = [], service = createCursoService(async (...args) => { calls.push(args); return validPage([{ ...course(), extra: 'PRIVADO' }]) })
  const result = await service.list(parent.toUpperCase(), 0, 20)
  assert.deepEqual(result.content, [course()]); assert.equal(calls[0][0], `/cursos?page=0&size=20&instituicaoId=${parent}`)
  assert.deepEqual(Object.keys(result.content[0]).sort(), ['descricao', 'id', 'instituicaoId', 'nome'])
  await assert.rejects(service.list('invalid'), TypeError); assert.equal(calls.length, 1)
  for (const value of [{ ...course(), instituicaoId: id(9) }, { ...course(), nome: ' ' }, { ...course(), nome: 'x'.repeat(151) }, { ...course(), descricao: 'x'.repeat(1001) }, { ...course(), descricao: 'x\u0000' }, { ...course(), id: 'not-a-uuid' }]) assert.throws(() => parseCurso(value, parent), ApiError)
  await assert.rejects(createCursoService(async () => validPage([course(), course()])).list(parent), error => error instanceof ApiError && error.kind === 'protocol')
})

test('service preserva descricao nullable e rejeita metadados/pagina fora do contrato', async () => {
  const response = validPage([{ ...course(), descricao: '  Descrição literal <script>  ', disciplinas: ['PRIVADO'] }])
  assert.deepEqual((await createCursoService(async () => response).list(parent)).content[0], { ...course(), descricao: '  Descrição literal <script>  ' })
  for (const invalid of [validPage([course()], 1, 20), validPage([course()], 0, 20, 0), { ...validPage(), page: { ...validPage().page, size: 10 } }]) await assert.rejects(createCursoService(async () => invalid).list(parent), ApiError)
})

function setup({ list, user = () => actor() } = {}) {
  const calls = [], model = createCursoConsultaModel({ list: (...args) => { calls.push(args); return list ? list(...args) : Promise.resolve(validPage()) } }, { detail: async idValue => ({ id: idValue.toLowerCase(), nome: 'UNESC', sigla: 'UNESC' }) }, user)
  return { model, calls }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('modelo carrega pagina0/20 e permite navegacao/tamanho20-50-100 com recarga explicita', async () => {
  const { model, calls } = setup(); model.load(parent); await tick(); assert.equal(model.getState().data.page.number, 0); assert.equal(calls[0][0], parent)
  model.setSize(50); await tick(); assert.equal(calls.at(-1)[2], 50)
  model.setSize(100); await tick(); assert.equal(calls.at(-1)[2], 100)
  model.setSize(10); await tick(); assert.equal(calls.at(-1)[2], 100)
  model.goToPage(1); await tick(); assert.equal(model.getState().data.page.number, 0, 'nao deve navegar alem das paginas existentes')
  await model.reload(); assert.equal(calls.length, 4); model.dispose()
})

test('modelo corrige uma vez pagina esvaziada inclusive para pagina0 e nao faz retry em loop', async () => {
  let count = 0; const { model } = setup({ list: async (_id, number, size) => { count++; if (count === 1) return validPage([course()], number, size, 21); if (count === 2) return validPage([], number, size, 1); return validPage([course()], number, size, 1) } })
  model.load(parent); await tick(); model.goToPage(1); await tick(); assert.equal(count, 3); assert.equal(model.getState().data.page.number, 0); model.dispose()
})

test('UUID de rota invalido nao envia; lista vazia e distinta de falha de rede', async () => {
  const { model, calls } = setup(); model.load('invalid'); assert.equal(calls.length, 0); assert.equal(model.getState().unavailable, true); model.dispose()
  const empty = setup({ list: async (_id, number, size) => validPage([], number, size, 0) }); empty.model.load(parent); await tick(); assert.deepEqual(empty.model.getState().data.content, []); empty.model.dispose()
  const failed = setup({ list: async () => { throw new ApiError('network') } }); failed.model.load(parent); await tick(); assert.equal(failed.model.getState().error.includes('Não foi possível'), true); assert.equal(failed.model.getState().data, null); failed.model.dispose()
})

for (const status of [401, 403]) test('API ' + status + ' retira a pagina e bloqueia ate recarga da tela', async () => {
  let calls = 0; const { model } = setup({ list: async () => { calls++; throw new ApiError('http', status) } }); model.load(parent); await tick(); model.reload(); await tick(); assert.equal(calls, 1); assert.equal(model.getState().data, null); assert.equal(model.getState().unavailable, true); model.dispose()
})

test('troca de conta ou instituicao aborta consulta anterior e ignora resposta atrasada', async () => {
  const old = deferred(); let requests = 0, user = actor('USUARIO'); const { model, calls } = setup({ list: () => ++requests === 1 ? old.promise : Promise.resolve(validPage([course(3, id(9))])), user: () => user })
  model.load(parent); await tick(); const signal = calls[0][3]; user = actor('USUARIO', id(9)); model.load(id(9)); await tick(); old.resolve(validPage([course(4)])); await tick()
  assert.equal(signal.aborted, true); assert.equal(model.getState().instituicaoId, id(9)); assert.equal(model.getState().data.content[0].instituicaoId, id(9)); model.dispose()
})

test('mudanca de perfil/dispose descarta consulta antiga', async () => {
  for (const mode of ['profile', 'dispose']) {
    const old = deferred(), fresh = deferred(); let count = 0, user = actor(); const { model, calls } = setup({ list: () => ++count === 1 ? old.promise : fresh.promise, user: () => user }); model.load(parent); await tick(); const signal = calls[0][3]
    if (mode === 'profile') { user = actor('MODERADOR'); model.load(parent) } else model.dispose()
    assert.equal(signal.aborted, true)
    if (mode === 'profile') { await tick(); fresh.resolve(validPage([course(3)])); await tick(); old.resolve(validPage([course(4)])); await tick(); assert.equal(model.getState().data.content[0].id, id(3)) }
    else { old.resolve(validPage()); await tick(); assert.equal(model.getState().data, null) }
    model.dispose()
  }
})
