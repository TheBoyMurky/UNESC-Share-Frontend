import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createDisciplinaService } from '../src/features/disciplina/disciplina-service.ts'
import { createDisciplinaConsultaModel } from '../src/features/disciplina/disciplina-consulta-model.ts'
import { deferred, id, page } from './catalog-fixtures.mjs'

const institutionId = id(1), courseId = id(2), discipline = (n = 3, parent = courseId) => ({ id: id(n), nome: 'Algoritmos e Programação', descricao: null, codigo: 'CCO100', cursoId: parent })
const validPage = (items = [discipline()], number = 0, size = 20, total = items.length) => page(items, number, size, total)
const actor = (perfil = 'USUARIO', key = id(8)) => ({ id: key, perfil })
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)) }

test('service restringe consulta ao curso, projeta DTO e valida página, UUID, campos e vínculo', async () => {
  const calls = [], service = createDisciplinaService(async (...args) => { calls.push(args); return validPage([{ ...discipline(), extra: 'PRIVADO' }]) })
  const result = await service.list(courseId.toUpperCase())
  assert.deepEqual(result.content, [discipline()]); assert.equal(calls[0][0], `/disciplinas?page=0&size=20&cursoId=${courseId}`)
  assert.deepEqual(Object.keys(result.content[0]).sort(), ['codigo', 'cursoId', 'descricao', 'id', 'nome'])
  await assert.rejects(service.list('invalido'), TypeError); assert.equal(calls.length, 1)
  for (const value of [
    { ...discipline(), cursoId: id(9) }, { ...discipline(), id: 'ruim' }, { ...discipline(), nome: ' ' },
    { ...discipline(), nome: 'x'.repeat(151) }, { ...discipline(), descricao: 'x'.repeat(1001) },
    { ...discipline(), descricao: 'x\u0000' }, { ...discipline(), codigo: 'x'.repeat(31) }, { ...discipline(), codigo: ' ' },
  ]) await assert.rejects(createDisciplinaService(async () => validPage([value])).list(courseId), ApiError)
  await assert.rejects(createDisciplinaService(async () => validPage([discipline(), discipline()])).list(courseId), ApiError)
  for (const invalid of [validPage([discipline()], 1, 20), validPage([discipline()], 0, 20, 0), { ...validPage(), page: { ...validPage().page, size: 10 } }]) await assert.rejects(createDisciplinaService(async () => invalid).list(courseId), ApiError)
})

function setup({ list, user = () => actor(), belongs = true } = {}) {
  const calls = []
  const service = createDisciplinaService(async (...args) => {
    calls.push(args)
    if (list) return list(...args)
    const params = new URLSearchParams(args[0].split('?')[1]), number = Number(params.get('page')), size = Number(params.get('size'))
    return validPage([discipline()], number, size, 1)
  })
  const courses = { detail: async idValue => ({ id: idValue.toLowerCase(), nome: 'Ciência da Computação', descricao: null, instituicaoId: belongs ? institutionId : id(9) }) }
  const institutions = { detail: async idValue => ({ id: idValue.toLowerCase(), nome: 'UNESC', sigla: 'UNESC' }) }
  return { model: createDisciplinaConsultaModel(service, courses, institutions, user), calls }
}

test('modelo confirma vínculo institucional, pagina e recarrega com tamanhos permitidos', async () => {
  const { model, calls } = setup(); model.load(institutionId, courseId); await tick()
  assert.equal(model.getState().curso.id, courseId); assert.equal(model.getState().data.page.number, 0)
  model.setSize(50); await tick(); assert.equal(new URLSearchParams(calls.at(-1)[0].split('?')[1]).get('size'), '50')
  model.setSize(100); await tick(); assert.equal(new URLSearchParams(calls.at(-1)[0].split('?')[1]).get('size'), '100')
  model.setSize(10); assert.equal(new URLSearchParams(calls.at(-1)[0].split('?')[1]).get('size'), '100')
  model.goToPage(1); await tick(); assert.equal(model.getState().data.page.number, 0)
  await model.reload(); assert.equal(calls.length, 4); model.dispose()
})

test('modelo rejeita curso de outra instituição e separa vazio de erro', async () => {
  const mismatch = setup({ belongs: false }); mismatch.model.load(institutionId, courseId); await tick()
  assert.equal(mismatch.calls.length, 0); assert.equal(mismatch.model.getState().data, null); assert.ok(mismatch.model.getState().error); mismatch.model.dispose()
  const empty = setup({ list: async () => validPage([], 0, 20, 0) }); empty.model.load(institutionId, courseId); await tick()
  assert.deepEqual(empty.model.getState().data.content, []); empty.model.dispose()
  const failed = setup({ list: async () => { throw new ApiError('network') } }); failed.model.load(institutionId, courseId); await tick()
  assert.equal(failed.model.getState().error.includes('Não foi possível'), true); assert.equal(failed.model.getState().data, null); failed.model.dispose()
})

test('modelo corrige página esvaziada uma vez e trata 401/403 como acesso indisponível', async () => {
  let count = 0; const model = setup({ list: async (path, options) => { count++; const params = new URLSearchParams(path.split('?')[1]), number = Number(params.get('page')), size = Number(params.get('size')); if (options.signal?.aborted) throw new Error('aborted'); return count === 1 ? validPage([discipline()], number, size, 21) : validPage([], number, size, 1) } }).model
  model.load(institutionId, courseId); await tick(); model.goToPage(1); await tick(); assert.equal(count, 3); assert.equal(model.getState().data.page.number, 0); model.dispose()
  for (const status of [401, 403]) {
    let requests = 0; const denied = setup({ list: async () => { requests++; throw new ApiError('http', status) } }).model
    denied.load(institutionId, courseId); await tick(); denied.reload(); await tick(); assert.equal(requests, 1); assert.equal(denied.getState().unavailable, true); denied.dispose()
  }
})

test('troca de identidade ou perfil aborta e ignora a resposta antiga; dispose também', async () => {
  for (const change of ['identity', 'profile', 'dispose']) {
    const old = deferred(), fresh = deferred(); let requests = 0, user = actor(); const { model, calls } = setup({ user: () => user, list: () => ++requests === 1 ? old.promise : fresh.promise })
    model.load(institutionId, courseId); await tick(); const signal = calls[0][1].signal
    if (change === 'identity') { user = actor('USUARIO', id(9)); model.load(institutionId, id(10)) }
    if (change === 'profile') { user = actor('MODERADOR'); model.load(institutionId, courseId) }
    if (change === 'dispose') model.dispose()
    assert.equal(signal.aborted, true)
    if (change === 'dispose') { old.resolve(validPage()); await tick(); assert.equal(model.getState().data, null) }
    else { for (let i = 0; i < 20 && calls.length < 2; i++) await tick(); fresh.resolve(validPage([discipline(4, change === 'identity' ? id(10) : courseId)])); await tick(); old.resolve(validPage([discipline(5)])); await tick(); assert.equal(model.getState().data.content[0].id, id(4)) }
    model.dispose()
  }
})
