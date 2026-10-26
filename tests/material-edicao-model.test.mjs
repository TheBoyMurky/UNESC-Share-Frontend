import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMaterialEdicaoModel, editHasChanges } from '../src/features/material/material-edicao-model.ts'
import { ApiError } from '../src/shared/http/client.ts'
import { mockService, deferred, page } from './catalog-fixtures.mjs'
import { detail, id, metadata, references } from './material-edicao-fixtures.mjs'

function fixture(overrides = {}, options = mockService()) {
  let identity = id(8)
  const calls = []
  const service = {
    load: async (key, signal) => { calls.push({ type: 'load', key, signal }); return overrides.load ? overrides.load(key, signal) : detail() },
    references: async (data, signal) => { calls.push({ type: 'references', signal }); return overrides.references ? overrides.references(data, signal) : references() },
    save: async (key, data, signal) => { calls.push({ type: 'save', key, data, signal }); return overrides.save ? overrides.save(key, data, signal) : { ...detail(), ...data, status: 'PENDENTE' } },
  }
  const model = createMaterialEdicaoModel(service, options, () => identity)
  return { model, calls, options, setIdentity: value => { identity = value } }
}

test('preenche original e referencias porUUID, carrega quatro seletores e evitaPUT sem alteracao', async () => {
  const { model, calls, options } = fixture()
  await model.load(id(10))
  assert.equal(model.getState().draft.titulo, detail().titulo)
  assert.deepEqual(model.getState().draft.disciplinaId, id(5))
  assert.equal(options.calls.length, 4)
  assert.equal(editHasChanges(model.getState()), false)
  model.changeText('titulo', ' ' + detail().titulo + ' ')
  await model.submit()
  assert.equal(calls.filter(call => call.type === 'save').length, 0)
})

test('original fora das primeiras100 permanece selecionado e paginacao nao trunca opcoes', async () => {
  const options = mockService({ options: async (_, __, number) => number === 0 ? page(Array.from({ length: 100 }, (_, i) => ({ id: id(100 + i), nome: 'Opção' })), 0, 100, 101) : page([{ id: id(5), nome: 'Original atualizado' }], 1, 100, 101) })
  const { model } = fixture({}, options)
  await model.load(id(10))
  assert.equal(model.getState().selectors.disciplinas.options.length, 101)
  assert.equal(model.getState().draft.disciplinaId, id(5))
  await model.loadOptions('disciplinas', true)
  assert.equal(model.getState().selectors.disciplinas.options.length, 101)
  assert.equal(model.getState().selectors.disciplinas.options.find(item => item.id === id(5)).nome, 'Original atualizado')
})

for (const data of [{ ...detail(), usuarioId: id(99) }, { ...detail(), status: 'BLOQUEADO' }, { ...detail(), status: 'REMOVIDO' }]) {
  test('terceiro/bloqueado/removido nao abre formulario nem consulta referencias ou fazPUT', async () => {
    const { model, calls, options } = fixture({ load: async () => data })
    await model.load(id(10)); model.changeText('titulo', 'Outro'); await model.submit()
    assert.equal(model.getState().material, null)
    assert.ok(model.getState().loadError)
    assert.deepEqual(calls.map(call => call.type), ['load'])
    assert.equal(options.calls.length, 0)
  })
}

test('UUID invalido ou identidade ausente nao fazHTTP', async () => {
  const { model, calls, setIdentity } = fixture()
  await model.load('privado')
  setIdentity(null); await model.load(id(10))
  assert.equal(calls.length, 0)
})

test('PUT envia quatro campos, limpa estado privado apos sucesso e impede reenvio', async () => {
  const { model, calls } = fixture()
  await model.load(id(10)); model.changeText('titulo', metadata().titulo); model.changeText('descricao', metadata().descricao)
  await model.submit(); await model.submit()
  const saves = calls.filter(call => call.type === 'save')
  assert.equal(saves.length, 1)
  assert.deepEqual(saves[0].data, metadata())
  assert.equal(model.getState().savedId, id(10))
  assert.equal(model.getState().material, null)
  assert.equal(model.getState().draft.descricao, '')
})

test('troca pai limpa filhos preserva textos/categoria; selecao externa e rejeitada', async () => {
  const { model, calls } = fixture()
  await model.load(id(10)); model.changeText('titulo', metadata().titulo)
  await model.changeAcademic('disciplinaId', id(99))
  assert.equal(model.getState().draft.disciplinaId, id(5))
  await model.changeAcademic('instituicaoId', id(2))
  assert.equal(model.getState().draft.cursoId, '')
  assert.equal(model.getState().draft.disciplinaId, '')
  assert.equal(model.getState().draft.categoriaId, id(7))
  await model.submit()
  assert.ok(model.getState().fields.academico)
  assert.equal(calls.some(call => call.type === 'save'), false)
})

test('falha em pagina adicional preserva selecoes e permite retry sem apagar rascunho', async () => {
  let failing = true
  const options = mockService({ options: async (_, __, number) => {
    if (number === 1 && failing) throw new ApiError('network')
    return number === 0 ? page([{ id: id(5), nome: 'Original' }], 0, 100, 101) : page([{ id: id(6), nome: 'Outra' }], 1, 100, 101)
  } })
  const { model } = fixture({}, options)
  await model.load(id(10)); model.changeText('titulo', 'Rascunho')
  await model.loadOptions('disciplinas', true)
  assert.ok(model.getState().selectors.disciplinas.error)
  assert.equal(model.getState().draft.disciplinaId, id(5))
  failing = false; await model.loadOptions('disciplinas', true)
  assert.equal(model.getState().selectors.disciplinas.error, '')
  assert.equal(model.getState().draft.titulo, 'Rascunho')
})

test('carga antiga de outroUUID nao sobrescreve original atual', async () => {
  const pending = deferred()
  const { model, calls } = fixture({ load: async key => key === id(10) ? pending.promise : detail(11) })
  const old = model.load(id(10)); await model.load(id(11))
  pending.resolve(detail()); await old
  assert.equal(model.getState().material.id, id(11))
  assert.equal(calls[0].signal.aborted, true)
})

test('mudanca de conta durante carga ouPUT limpa dados e ignora resposta antiga', async () => {
  for (const saving of [false, true]) {
    const pending = deferred()
    const f = fixture(saving ? { save: () => pending.promise } : { load: () => pending.promise })
    let running
    if (saving) { await f.model.load(id(10)); f.model.changeText('titulo', 'Outro'); running = f.model.submit() }
    else running = f.model.load(id(10))
    f.setIdentity(id(99))
    pending.resolve({ ...detail(), status: 'PENDENTE' }); await running
    assert.equal(f.model.getState().material, null)
    assert.equal(f.model.getState().savedId, '')
    assert.ok(f.model.getState().loadError)
  }
})

test('PUTpendente bloqueia edicao/seletores/duploPUT, dispose aborta e ignora sucesso', async () => {
  const pending = deferred(), { model, calls, options } = fixture({ save: () => pending.promise })
  await model.load(id(10)); model.changeText('titulo', 'Outro')
  const running = model.submit(), before = options.calls.length
  model.changeText('titulo', 'Mais outro'); await model.changeAcademic('instituicaoId', id(2)); await model.loadOptions('categorias'); await model.submit()
  assert.equal(options.calls.length, before)
  assert.equal(calls.filter(call => call.type === 'save').length, 1)
  model.dispose(); assert.equal(calls.at(-1).signal.aborted, true)
  pending.resolve({ ...detail(), status: 'PENDENTE' }); await running
  assert.equal(model.getState().savedId, '')
  assert.equal(model.getState().material, null)
})

test('400 mapeia somente metadados conhecidos sem ecoar mensagem/URI privada', async () => {
  const secret = 'nao-ecoar-URI-privada'
  const { model } = fixture({ save: async () => { throw new ApiError('http', 400, { title: secret, detail: secret, errors: ['titulo', 'descricao', 'disciplinaId', 'magnetUris', secret].map(field => ({ field, message: secret })) }) } })
  await model.load(id(10)); model.changeText('titulo', 'Outro'); await model.submit()
  assert.deepEqual(Object.keys(model.getState().fields).sort(), ['academico', 'descricao', 'titulo'])
  assert.equal(model.getState().error.includes(secret), false)
  assert.equal(JSON.stringify(model.getState().fields).includes(secret), false)
})

for (const error of [new ApiError('http', 401), new ApiError('http', 403), new ApiError('http', 404), new ApiError('http', 409), new ApiError('http', 503), new ApiError('network'), new ApiError('protocol')]) {
  test('falhaPUT nao repete automaticamente nem confirma sucesso, preserva rascunho e indica incerteza quando necessario', async () => {
    const { model, calls } = fixture({ save: async () => { throw error } })
    await model.load(id(10)); model.changeText('titulo', 'Outro'); await model.submit()
    assert.equal(calls.filter(call => call.type === 'save').length, 1)
    assert.equal(model.getState().draft.titulo, 'Outro')
    assert.equal(model.getState().savedId, '')
    assert.equal(model.getState().uncertain, error.status === 503 || error.kind !== 'http')
  })
}

test('recarregar descarta rascunho explicitamente e falha de referencia nao cria formulario parcial', async () => {
  let failing = false
  const { model } = fixture({ references: async () => { if (failing) throw new Error('causa-privada'); return references() } })
  await model.load(id(10)); model.changeText('titulo', 'Outro'); await model.reload()
  assert.equal(model.getState().draft.titulo, detail().titulo)
  failing = true; await model.reload()
  assert.equal(model.getState().material, null)
  assert.equal(model.getState().loadError.includes('privada'), false)
})
