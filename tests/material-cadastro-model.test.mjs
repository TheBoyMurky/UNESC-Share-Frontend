import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMaterialCadastroModel } from '../src/features/material/material-cadastro-model.ts'
import { ApiError } from '../src/shared/http/client.ts'
import { deferred, mockService, page } from './catalog-fixtures.mjs'
import { id, input, magnetUri, prepare } from './material-cadastro-fixtures.mjs'

function fixture(write = async () => ({ id: id(10) }), options = mockService()) {
  const posts = []
  const model = createMaterialCadastroModel(options, { cadastrar: async (data, signal) => { posts.push({ data, signal }); return write(data, signal) } })
  return { model, posts, options }
}

test('inicia apenas instituicoes/categorias sem buscar materiais nem enviar POST', async () => {
  const { model, posts, options } = fixture()
  await model.initialize()
  assert.deepEqual(options.calls.map(call => call.kind), ['instituicoes', 'categorias'])
  assert.equal(posts.length, 0)
})

test('trocar pai limpa filhos, preserva categoria/texto/URIs e nao envia POST', async () => {
  const { model, posts } = fixture()
  await prepare(model)
  await model.changeAcademic('instituicaoId', id(2))
  assert.equal(model.getState().draft.cursoId, '')
  assert.equal(model.getState().draft.disciplinaId, '')
  assert.equal(model.getState().draft.categoriaId, id(7))
  assert.equal(model.getState().draft.titulo, input().titulo)
  assert.deepEqual(model.getState().draft.magnetUris, [magnetUri])
  assert.equal(posts.length, 0)
})

test('selecao fora das opcoes inclusive chave de prototipo nao altera identidade ou referencias', async () => {
  const { model } = fixture()
  await prepare(model)
  await model.changeAcademic('disciplinaId', id(99)); await model.changeAcademic('__proto__', id(99)); await model.changeAcademic('usuarioId', id(99))
  assert.equal(model.getState().draft.disciplinaId, id(5))
  assert.equal(model.getState().draft.usuarioId, undefined)
})

test('resposta atrasada de curso e ignorada ao trocar instituicao', async () => {
  const pending = deferred()
  const options = mockService({ options: async (kind, parent, number) => kind === 'cursos' && parent === id(1) ? pending.promise : page([{ id: id(kind === 'instituicoes' ? 1 : 4), nome: 'Opção' }, ...(kind === 'instituicoes' ? [{ id: id(2), nome: 'Outra' }] : [])], number) })
  const { model } = fixture(undefined, options)
  await model.initialize()
  const old = model.changeAcademic('instituicaoId', id(1))
  const oldCall = options.calls.at(-1)
  await model.changeAcademic('instituicaoId', id(2))
  pending.resolve(page([{ id: id(3), nome: 'Antigo' }]))
  await old
  assert.equal(oldCall.signal.aborted, true)
  assert.equal(model.getState().selectors.cursos.options[0].id, id(4))
})

test('opcoes alem100 preservam anteriores em falha e permitem repetir pagina correta', async () => {
  let failing = true
  const options = mockService({ options: async (_, __, number) => {
    if (number === 1 && failing) throw new Error('privado')
    return number === 0 ? page(Array.from({ length: 100 }, (_, i) => ({ id: id(i + 100), nome: 'Opção' })), 0, 100, 101) : page([{ id: id(200), nome: 'Outra' }], 1, 100, 101)
  } })
  const { model } = fixture(undefined, options)
  await model.loadOptions('instituicoes'); await model.loadOptions('instituicoes', true)
  assert.equal(model.getState().selectors.instituicoes.options.length, 100)
  assert.equal(model.getState().selectors.instituicoes.error.includes('privado'), false)
  failing = false; await model.loadOptions('instituicoes', true)
  assert.equal(model.getState().selectors.instituicoes.options.length, 101)
  assert.equal(options.calls.at(-1).number, 1)
  const before = options.calls.length
  await model.loadOptions('instituicoes', true)
  assert.equal(options.calls.length, before)
})

test('uma falha inicial nao impede outro seletor e permite retry', async () => {
  let failing = true
  const options = mockService({ options: async (kind, _, number) => { if (kind === 'instituicoes' && failing) throw new ApiError('network'); return page([{ id: id(7), nome: 'Opção' }], number) } })
  const { model } = fixture(undefined, options)
  await model.initialize()
  assert.ok(model.getState().selectors.instituicoes.error)
  assert.equal(model.getState().selectors.categorias.options.length, 1)
  failing = false; await model.loadOptions('instituicoes')
  assert.equal(model.getState().selectors.instituicoes.error, '')
})

test('referencias obrigatorias e campos invalidos impedem POST', async () => {
  const { model, posts } = fixture()
  await model.submit()
  assert.equal(posts.length, 0)
  assert.ok(model.getState().fields.academico)
  await prepare(model); model.changeText('titulo', ' '); await model.submit()
  assert.ok(model.getState().fields.titulo)
  assert.equal(posts.length, 0)
})

test('de1a10campos sem truncar; editar/remover atualiza somente URI indicada', () => {
  const { model } = fixture()
  for (let i = 0; i < 12; i++) model.addMagnet()
  assert.equal(model.getState().draft.magnetUris.length, 10)
  model.changeMagnet(4, magnetUri); model.changeMagnet(-1, 'ignorar')
  model.removeMagnet(3)
  assert.equal(model.getState().draft.magnetUris[3], magnetUri)
  for (let i = 0; i < 12; i++) model.removeMagnet(0)
  assert.equal(model.getState().draft.magnetUris.length, 1)
})

test('sucesso usa snapshot dos cinco campos, limpa URI e impede POST adicional', async () => {
  const { model, posts } = fixture()
  await prepare(model); await model.submit(); await model.submit()
  assert.equal(posts.length, 1)
  assert.deepEqual(posts[0].data, input())
  assert.equal(model.getState().createdId, id(10))
  assert.deepEqual(model.getState().draft.magnetUris, [''])
  assert.equal(model.getState().draft.titulo, '')
})

test('envio pendente bloqueia alteracoes/POSTduplicado/opcoes e pode ser abortado ao sair', async () => {
  const pending = deferred(), { model, posts, options } = fixture(() => pending.promise)
  await prepare(model)
  const sent = model.submit(), before = options.calls.length
  model.changeText('titulo', 'Outro'); model.changeMagnet(0, 'outro'); model.addMagnet(); model.removeMagnet(0)
  await model.changeAcademic('instituicaoId', id(2)); await model.loadOptions('categorias'); await model.refreshAcademic(); await model.submit()
  assert.equal(options.calls.length, before)
  assert.equal(posts.length, 1)
  assert.deepEqual(posts[0].data, input())
  model.dispose(); assert.equal(posts[0].signal.aborted, true)
  pending.resolve({ id: id(10) }); await sent
  assert.equal(model.getState().createdId, '')
  assert.deepEqual(model.getState().draft.magnetUris, [''])
})

test('refresh academico limpa quatro selecoes mas preserva metadados/URIs', async () => {
  const { model } = fixture()
  await prepare(model); await model.refreshAcademic()
  const draft = model.getState().draft
  assert.deepEqual([draft.instituicaoId, draft.cursoId, draft.disciplinaId, draft.categoriaId], ['', '', '', ''])
  assert.equal(draft.titulo, input().titulo)
  assert.deepEqual(draft.magnetUris, [magnetUri])
})

test('400 mapeia campos conhecidos sem ecoar URI/SQL ou valores rejeitados', async () => {
  const secret = 'NAO-ECOAR-URI-PRIVADA'
  const { model } = fixture(async () => { throw new ApiError('http', 400, { title: secret, detail: secret, errors: ['titulo', 'descricao', 'disciplinaId', 'magnetUris[0]', secret].map(field => ({ field, message: secret })) }) })
  await prepare(model); await model.submit()
  assert.deepEqual(Object.keys(model.getState().fields).sort(), ['academico', 'descricao', 'magnetUris', 'titulo'])
  assert.equal(JSON.stringify(model.getState().fields).includes(secret), false)
  assert.equal(model.getState().error.includes(secret), false)
  assert.deepEqual(model.getState().draft.magnetUris, [magnetUri])
})

for (const status of [401, 403, 404, 409]) {
  test(`erro${status} nao anuncia sucesso nem repete POST`, async () => {
    const { model, posts } = fixture(async () => { throw new ApiError('http', status) })
    await prepare(model); await model.submit()
    assert.equal(posts.length, 1)
    assert.equal(model.getState().sending, false)
    assert.equal(model.getState().createdId, '')
    assert.equal(model.getState().uncertain, false)
  })
}

for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 503), new ApiError('http', 408), new Error('uri-privada')]) {
  test('resultado incerto orienta Meus materiais sem retry automatico ou perda do rascunho', async () => {
    const { model, posts } = fixture(async () => { throw error })
    await prepare(model); await model.submit()
    assert.equal(posts.length, 1)
    assert.equal(model.getState().uncertain, true)
    assert.match(model.getState().error, /Confira Meus materiais/)
    assert.equal(model.getState().error.includes('uri-privada'), false)
    assert.deepEqual(model.getState().draft.magnetUris, [magnetUri])
  })
}

test('dispose cancela seletores e ignora falha tardia sem novas chamadas', async () => {
  const pending = deferred(), options = mockService({ options: () => pending.promise }), { model } = fixture(undefined, options)
  let changes = 0
  model.subscribe(() => { changes++ })
  const loading = model.initialize()
  model.dispose(); const before = changes
  assert.ok(options.calls.every(call => call.signal.aborted))
  pending.reject(new Error('privado')); await loading
  await model.initialize(); await model.submit()
  assert.equal(options.calls.length, 2)
  assert.equal(changes, before)
})
