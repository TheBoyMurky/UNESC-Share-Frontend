import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createMaterialModel } from '../src/features/material/material-model.ts'
import { deferred } from './catalog-fixtures.mjs'
import { academic, detail, id, magnetUri, payload } from './material-fixtures.mjs'

function fixture(overrides = {}, actions = {}) {
  const saves = [], copies = [], calls = []
  const service = {
    detail: async (key, signal) => { calls.push({ kind: 'detail', signal }); return detail(Number(key.slice(0, 8))) },
    academic: async (_, signal) => { calls.push({ kind: 'academic', signal }); return academic },
    download: async (materialId, torrentId, signal) => { calls.push({ kind: 'download', materialId, torrentId, signal }); return payload() }, ...overrides,
  }
  const model = createMaterialModel(service, { save: value => { saves.push(value) }, copy: async value => { copies.push(value) }, ...actions })
  return { model, calls, saves, copies }
}

test('carrega material e quatro nomes via servico, sem salvar/copiar automaticamente', async () => {
  const f = fixture(); await f.model.load(id(10))
  assert.deepEqual(f.model.getState().material, detail())
  assert.deepEqual(f.model.getState().academic, academic)
  assert.equal(f.saves.length, 0); assert.equal(f.copies.length, 0)
})

test('ID invalido nao consulta servico', async () => {
  const f = fixture(); await f.model.load('invalido')
  assert.equal(f.calls.length, 0)
  assert.ok(f.model.getState().error)
})

for (const status of [401, 403, 404, 503]) {
  test(`erro detalhe${status} nao apresenta metadados/mecanismos nem infere existencia privada`, async () => {
    const f = fixture({ detail: async () => { throw new ApiError('http', status) } })
    await f.model.load(id(10))
    assert.equal(f.model.getState().material, null)
    assert.ok(f.model.getState().error)
    assert.equal(f.calls.length, 0)
  })
}

test('falha de nomes nao oculta material e mecanismos; tentativa e independente', async () => {
  let failed = true
  const f = fixture({ academic: async () => { if (failed) throw new ApiError('network'); return academic } })
  await f.model.load(id(10))
  assert.equal(f.model.getState().material.torrents.length, 1)
  assert.ok(f.model.getState().academicError)
  failed = false; await f.model.loadAcademic()
  assert.deepEqual(f.model.getState().academic, academic)
})

test('download so aceita mecanismo da pagina carregada, com pai correto e sem repetir enquanto pendente', async () => {
  const wait = deferred()
  let calls = 0
  const f = fixture({ download: async (materialId, torrentId) => { calls++; assert.equal(materialId, id(10)); assert.equal(torrentId, id(20)); return wait.promise } })
  await f.model.load(id(10)); await f.model.download(id(99))
  assert.equal(calls, 0)
  const downloading = f.model.download(id(20))
  await f.model.download(id(20)); assert.equal(calls, 1)
  wait.resolve(payload()); await downloading
  assert.equal(f.saves.length, 1)
  assert.equal(f.model.getState().downloads[id(20)].message, 'Solicitação enviada ao navegador.')
})

test('erro de download e individual, nao afirma que navegador salvou arquivo', async () => {
  const f = fixture({ download: async () => { throw new ApiError('http', 503) } })
  await f.model.load(id(10)); await f.model.download(id(20))
  assert.equal(f.saves.length, 0)
  assert.ok(f.model.getState().downloads[id(20)].error)
  assert.equal(f.model.getState().downloads[id(20)].message, '')
})

test('copiar usa URI exata, sem ler clipboard ou abrir cliente', async () => {
  const f = fixture(); await f.model.load(id(10)); await f.model.copy(id(21))
  assert.deepEqual(f.copies, [magnetUri])
  assert.equal(f.model.getState().copies[id(21)].message, 'Magnet copiado.')
})

test('clipboard negado/indisponivel oferece copia manual sem expor causa', async () => {
  const f = fixture({}, { copy: async () => { throw new Error('privado') } })
  await f.model.load(id(10)); await f.model.copy(id(21))
  assert.equal(f.model.getState().copies[id(21)].manual, true)
  assert.equal(f.model.getState().copies[id(21)].message.includes('privado'), false)
})

test('URI insegura ouID desconhecido nao chegam ao clipboard', async () => {
  const f = fixture({ detail: async () => ({ ...detail(), magnets: [{ ...detail().magnets[0], magnetUri: 'javascript:alert(1)' }] }) })
  await f.model.load(id(10)); await f.model.copy(id(21)); await f.model.copy(id(99))
  assert.equal(f.copies.length, 0)
})

test('troca deID ignora detalhe antigo mesmo quando servico ignora cancelamento', async () => {
  const wait = deferred()
  const f = fixture({ detail: async key => key === id(10) ? wait.promise : detail(11) })
  const old = f.model.load(id(10)); await f.model.load(id(11))
  wait.resolve(detail(10)); await old
  assert.equal(f.model.getState().material.id, id(11))
})

test('download atrasado apos troca de material nunca inicia save', async () => {
  const wait = deferred()
  const f = fixture({ download: async () => wait.promise })
  await f.model.load(id(10)); const downloading = f.model.download(id(20))
  await f.model.load(id(11)); wait.resolve(payload()); await downloading
  assert.equal(f.saves.length, 0)
  assert.deepEqual(f.model.getState().downloads, {})
})

test('dispose no logout/desmontagem aborta download e nao salva apos resposta atrasada', async () => {
  const wait = deferred()
  let signal
  const f = fixture({ download: async (_, __, value) => { signal = value; return wait.promise } })
  await f.model.load(id(10)); const downloading = f.model.download(id(20))
  f.model.dispose(); assert.equal(signal.aborted, true)
  wait.resolve(payload()); await downloading
  assert.equal(f.saves.length, 0)
})

test('clipboard tardio apos troca de material nao altera mensagens da nova pagina', async () => {
  const wait = deferred()
  const f = fixture({}, { copy: async () => wait.promise })
  await f.model.load(id(10)); const copying = f.model.copy(id(21))
  await f.model.load(id(11)); wait.resolve(); await copying
  assert.deepEqual(f.model.getState().copies, {})
})

test('dispose impede novas chamadas, tentativas e notificacoes', async () => {
  const f = fixture(); let notifications = 0
  f.model.subscribe(() => { notifications++ }); f.model.dispose()
  await f.model.load(id(10)); await f.model.retry(); await f.model.copy(id(21)); await f.model.download(id(20))
  assert.equal(f.calls.length, 0); assert.equal(notifications, 0)
})
