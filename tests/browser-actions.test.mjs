import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBrowserActions } from '../src/features/material/browser-actions.ts'
import { payload } from './material-fixtures.mjs'

// Objetos simulados: nao abre navegador, cliente externo ou clipboard real.
function platform(context, failure = false) {
  const descriptors = ['document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  const revoked = [], copied = [], links = []
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL
  URL.createObjectURL = () => 'blob:teste'
  URL.revokeObjectURL = value => revoked.push(value)
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => { const link = { click() { if (failure) throw new Error('privado'); this.clicked = true }, remove() { this.removed = true } }; links.push(link); return link },
    body: { append(link) { link.appended = true } },
  } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { copied.push(value) } } } })
  context.after(() => {
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  })
  return { revoked, copied, links }
}

test('adapter simulado usa anchor/blob, remove elemento e liberaURL no dispose', context => {
  const fake = platform(context), actions = createBrowserActions()
  context.after(() => actions.dispose())
  actions.save(payload())
  assert.equal(fake.links[0].download, payload().filename)
  assert.equal(fake.links[0].href, 'blob:teste')
  assert.equal(fake.links[0].clicked, true); assert.equal(fake.links[0].removed, true)
  assert.equal(fake.revoked.length, 0)
  actions.dispose(); assert.deepEqual(fake.revoked, ['blob:teste'])
})

test('falha ao pedir download remove elemento/revogaURL sem expor causa', context => {
  const fake = platform(context, true), actions = createBrowserActions()
  assert.throws(() => actions.save(payload()), error => !String(error).includes('privado'))
  assert.equal(fake.links[0].removed, true)
  assert.deepEqual(fake.revoked, ['blob:teste'])
})

test('adapter nao permite nome executavel, nome de caminho ou MIME de conteudo academico', context => {
  const fake = platform(context), actions = createBrowserActions()
  for (const file of [{ ...payload(), filename: '../../privado.exe' }, { ...payload(), blob: new Blob(['PDF'], { type: 'application/pdf' }) }]) {
    assert.throws(() => actions.save(file), /metadados inválido/)
  }
  assert.equal(fake.links.length, 0)
})

test('adapter copia apenas texto solicitado por acao explicita; nunca le clipboard', async context => {
  const fake = platform(context), actions = createBrowserActions()
  await actions.copy('texto-sintetico')
  assert.deepEqual(fake.copied, ['texto-sintetico'])
})

test('clipboard ausente gera erro tratavel para fallback manual', async context => {
  platform(context); globalThis.navigator.clipboard = undefined
  await assert.rejects(createBrowserActions().copy('texto'), /indisponível/)
})
