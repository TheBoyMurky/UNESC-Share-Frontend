import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createMaterialRevisaoModel } from '../src/features/moderacao/material-revisao-model.ts'
import { emptyMaterialState } from '../src/features/material/material-model.ts'
import { deferred } from './catalog-fixtures.mjs'
import { academic, detail, id, magnetUri, payload } from './material-fixtures.mjs'

const staff = (perfil = 'MODERADOR', userId = id(8)) => ({ id: userId, perfil })
function fixture(overrides = {}, actions = {}, user = () => staff()) {
  const calls = [], saved = [], copied = []
  const service = {
    detail: async (key, signal) => { calls.push({ kind: 'detail', key, signal }); return { ...detail(Number(key.slice(0, 8))), status: 'PENDENTE' } },
    academic: async (material, signal) => { calls.push({ kind: 'academic', materialId: material.id, signal }); return academic },
    download: async (materialId, torrentId, signal) => { calls.push({ kind: 'download', materialId, torrentId, signal }); return payload() }, ...overrides,
  }
  const model = createMaterialRevisaoModel(service, { save: value => { saved.push(value) }, copy: async uri => { copied.push(uri) }, ...actions }, user)
  return { model, calls, saved, copied }
}

for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test('revisao ' + perfil + ' reutiliza leitura/nomes sem copiar/baixar automaticamente, inclusive material proprio', async () => {
    const { model, calls, saved, copied } = fixture({}, {}, () => staff(perfil)); await model.load(id(10))
    assert.equal(model.getState().material.usuarioId, id(8)); assert.equal(model.getState().material.status, 'PENDENTE'); assert.deepEqual(model.getState().academic, academic)
    assert.deepEqual(calls.map(item => item.kind), ['detail', 'academic']); assert.equal(saved.length, 0); assert.equal(copied.length, 0)
  })
}
for (const user of [null, staff('USUARIO'), staff('DESCONHECIDO'), staff('MODERADOR', 'x')]) {
  test('sem equipe valida nao consulta material privado mesmo seforautor: ' + JSON.stringify(user), async () => {
    const { model, calls, saved, copied } = fixture({}, {}, () => user); await model.load(id(10)); await model.loadAcademic(); await model.copy(id(21)); await model.download(id(20))
    assert.equal(calls.length, 0); assert.equal(saved.length, 0); assert.equal(copied.length, 0); assert.equal(model.getState().material, null); assert.ok(model.getState().error)
  })
}
test('UUID invalido nao consulta e revisao nao oferece metodos de mutacao', async () => {
  const { model, calls } = fixture(); await model.load('x'); assert.equal(calls.length, 0)
  for (const key of ['publicar', 'bloquear', 'remove', 'update', 'submit']) assert.equal(key in model, false)
})
for (const status of ['PENDENTE', 'PUBLICADO', 'BLOQUEADO', 'REMOVIDO']) {
  test('le estado atual ' + status + ' sem converter paraPENDENTE ou alterar registro', async () => {
    const source = { ...detail(), status }
    const { model, calls } = fixture({ detail: async () => source }); await model.load(id(10))
    assert.equal(model.getState().material.status, status); assert.equal(source.status, status); assert.deepEqual(calls.map(item => item.kind), ['academic'])
  })
}
test('download e copia explicitos reutilizam mecanismos conhecidos e impedem duplicidade emvoo', async () => {
  const pending = deferred(); let downloads = 0
  const { model, saved, copied } = fixture({ download: async (material, torrent) => { downloads++; assert.equal(material, id(10)); assert.equal(torrent, id(20)); return pending.promise } })
  await model.load(id(10)); await model.download(id(99)); await model.copy(id(99)); const downloading = model.download(id(20)); await model.download(id(20)); assert.equal(downloads, 1)
  pending.resolve(payload()); await downloading; await model.copy(id(21)); assert.equal(saved.length, 1); assert.equal(saved[0].filename, id(20) + '.torrent'); assert.deepEqual(copied, [magnetUri])
})
test('falha de nomes porrede preserva metadados e mecanismos, retry somente de nomes', async () => {
  let failed = true
  const { model, calls } = fixture({ academic: async () => { if (failed) throw new ApiError('network'); return academic } })
  await model.load(id(10)); assert.ok(model.getState().material); assert.ok(model.getState().academicError)
  failed = false; await model.loadAcademic(); assert.deepEqual(model.getState().academic, academic); assert.equal(calls.filter(item => item.kind === 'detail').length, 1)
})
for (const status of [401, 403]) {
  for (const operation of ['detail', 'academic', 'download']) {
    test(operation + status + ' retira todos os metadados/URIs sem expor causa', async () => {
      const { model } = fixture({ [operation]: async () => { throw new ApiError('http', status, { title: magnetUri, detail: magnetUri, errors: [] }) } })
      await model.load(id(10)); if (operation === 'download') await model.download(id(20))
      assert.equal(model.getState().material, null); assert.equal(model.getState().academic, null); assert.deepEqual(model.getState().copies, {}); assert.deepEqual(model.getState().downloads, {})
      assert.ok(model.getState().error); assert.equal(JSON.stringify(model.getState()).includes(magnetUri), false)
    })
  }
}
test('404detalhe nao revela registro, retry explicito pode consultar novamente', async () => {
  let found = false
  const { model } = fixture({ detail: async () => { if (!found) throw new ApiError('http', 404); return detail() } })
  await model.load(id(10)); assert.equal(model.getState().material, null); found = true; await model.retry(); assert.ok(model.getState().material)
})
test('clipboard negado oferece fallback soenquanto escopo continua autorizado', async () => {
  const { model } = fixture({}, { copy: async () => { throw new Error('PRIVADO') } }); await model.load(id(10)); await model.copy(id(21))
  assert.equal(model.getState().copies[id(21)].manual, true); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
})
for (const change of ['conta', 'perfil', 'equipe', 'dispose']) {
  test('resposta detalhe antiga apos' + change + ' nao restaura dados privados', async () => {
    const pending = deferred(); let user = staff(), signal
    const { model } = fixture({ detail: async (key, s) => { signal = s; return pending.promise } }, {}, () => user)
    const loading = model.load(id(10))
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'equipe') user = staff('ADMINISTRADOR')
    if (change === 'dispose') model.dispose()
    pending.resolve(detail()); await loading; assert.equal(signal.aborted, true); assert.equal(model.getState().material, null)
    if (change === 'dispose') assert.deepEqual(model.getState(), emptyMaterialState())
  })
}
test('403atrasado de consulta substituida nao limpa revisao nova da mesma conta eMaterial', async () => {
  const old = deferred(); let reads = 0
  const { model } = fixture({ detail: async () => ++reads === 1 ? old.promise : { ...detail(), titulo: 'Consulta nova' } })
  const first = model.load(id(10)); await model.load(id(10)); old.reject(new ApiError('http', 403)); await first
  assert.equal(model.getState().material.titulo, 'Consulta nova'); assert.equal(model.getState().error, '')
})
test('troca deMaterial cancela nomes e nao mistura contexto academico anterior', async () => {
  const oldNames = deferred(), started = deferred(); let signal
  const { model } = fixture({ academic: async (material, s) => { if (material.id === id(10)) { signal = s; started.resolve(); return oldNames.promise } return { ...academic, curso: 'Outro curso' } } })
  const first = model.load(id(10)); await started.promise
  await model.load(id(11)); oldNames.resolve(academic); await first
  assert.equal(signal.aborted, true); assert.equal(model.getState().material.id, id(11)); assert.equal(model.getState().academic.curso, 'Outro curso')
})
for (const change of ['conta', 'material', 'perfil', 'dispose']) {
  test('download antigo apos' + change + ' nao e entregue ao navegador', async () => {
    const pending = deferred(); let user = staff(), signal
    const { model, saved } = fixture({ download: async (material, torrent, s) => { signal = s; return pending.promise } }, {}, () => user)
    await model.load(id(10)); const downloading = model.download(id(20))
    if (change === 'conta') user = staff('MODERADOR', id(9))
    if (change === 'material') await model.load(id(11))
    if (change === 'perfil') user = staff('USUARIO')
    if (change === 'dispose') model.dispose()
    pending.resolve(payload()); await downloading; assert.equal(signal.aborted, true); assert.equal(saved.length, 0)
  })
}
test('perda deperfil antesdeacao limpaURIs/nomes e impede novas chamadas', async () => {
  let user = staff()
  const { model, calls, saved, copied } = fixture({}, {}, () => user); await model.load(id(10)); user = staff('USUARIO')
  await model.copy(id(21)); await model.download(id(20)); await model.loadAcademic()
  assert.equal(model.getState().material, null); assert.equal(model.getState().academic, null); assert.equal(calls.length, 2); assert.equal(saved.length, 0); assert.equal(copied.length, 0)
})
test('perda deperfil durante copia nao reapresenta URI em fallback nem sucesso antigo', async () => {
  const pending = deferred(); let user = staff()
  const { model } = fixture({}, { copy: async () => pending.promise }, () => user)
  await model.load(id(10)); const copying = model.copy(id(21)); user = staff('USUARIO'); pending.reject(new Error('Clipboard negado')); await copying
  assert.equal(model.getState().material, null); assert.deepEqual(model.getState().copies, {})
})
