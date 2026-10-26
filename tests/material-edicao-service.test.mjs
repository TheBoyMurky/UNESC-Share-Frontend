import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMaterialEdicaoService, canEditMaterial } from '../src/features/material/material-edicao-service.ts'
import { detail, id, metadata, references, referenceDTOs } from './material-edicao-fixtures.mjs'

for (const status of ['PENDENTE', 'PUBLICADO', 'BLOQUEADO', 'REMOVIDO']) {
  test(`visibilidade do botao de edicao em${status} depende de autoria e nao concede privilegio de equipe`, () => {
    for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
      const data = { ...detail(), status, perfil }
      assert.equal(canEditMaterial(data, id(8)), status === 'PENDENTE' || status === 'PUBLICADO')
      assert.equal(canEditMaterial(data, id(99)), false)
      assert.equal(canEditMaterial(data, null), false)
    }
  })
}

test('GET e PUT projetados porUUID, quatro campos sem mecanismos/autor/estado', async () => {
  const signal = new AbortController().signal, calls = []
  const service = createMaterialEdicaoService(async (path, options) => {
    calls.push({ path, options })
    return options.method === 'PUT' ? { ...detail(), ...metadata(), status: 'PENDENTE' } : detail()
  })
  assert.deepEqual(await service.load(id(10), signal), detail())
  const saved = await service.save(id(10), { ...metadata(), titulo: ' ' + metadata().titulo + ' ', usuarioId: id(99), status: 'PUBLICADO', magnetUris: ['nao-enviar'], torrents: ['nao-enviar'] }, signal)
  assert.deepEqual(calls, [{ path: '/materiais/' + id(10), options: { signal } }, { path: '/materiais/' + id(10), options: { method: 'PUT', signal, json: metadata() } }])
  assert.equal(saved.status, 'PENDENTE')
  assert.deepEqual(saved.magnets, detail().magnets)
  assert.deepEqual(saved.torrents, detail().torrents)
})

test('referencias atuais sao quatroGETs vinculados porUUID, sem primeira pagina ou dados pessoais extras', async () => {
  const calls = [], signal = new AbortController().signal, replies = referenceDTOs()
  const service = createMaterialEdicaoService(async (path, options) => { calls.push(path); assert.equal(options.signal, signal); return { ...replies[path], email: 'nao-conservar' } })
  assert.deepEqual(await service.references(detail(), signal), references())
  assert.equal(calls.length, 4)
  assert.ok(calls.every(path => !path.includes('?') && !path.includes('/usuarios')))
})

for (const path of ['/disciplinas/', '/categorias/', '/cursos/', '/instituicoes/']) {
  test(`referencia incorreta em${path} nao e aceita como selecao atual`, async () => {
    const replies = referenceDTOs()
    const service = createMaterialEdicaoService(async key => key.startsWith(path) ? { ...replies[key], id: id(99) } : replies[key])
    await assert.rejects(service.references(detail()), error => error.kind === 'protocol')
  })
}

test('UUID/metadados invalidos impedem GET/PUT e nao ecoam valores', async () => {
  let calls = 0
  const service = createMaterialEdicaoService(async () => { calls++ })
  await assert.rejects(service.load('url-privada'), TypeError)
  await assert.rejects(service.save('url-privada', metadata()), TypeError)
  await assert.rejects(service.save(id(10), { ...metadata(), titulo: ' ' }), TypeError)
  assert.equal(calls, 0)
})

for (const change of [{ id: id(99) }, { status: 'PUBLICADO' }, { status: 'BLOQUEADO' }, { disciplinaId: id(99) }, { categoriaId: id(99) }, { magnets: null }]) {
  test('resposta PUT invalida nao confirma edicao nem dispara repeticao', async () => {
    let calls = 0
    const service = createMaterialEdicaoService(async () => { calls++; return { ...detail(), ...metadata(), status: 'PENDENTE', ...change } })
    await assert.rejects(service.save(id(10), metadata()), error => error.kind === 'protocol')
    assert.equal(calls, 1)
  })
}

test('mecanismo adicionado concorrentemente no retorno nao e rejeitado por comparacao com snapshot antigo', async () => {
  const added = { ...detail().magnets[0], id: id(99) }
  const service = createMaterialEdicaoService(async () => ({ ...detail(), ...metadata(), status: 'PENDENTE', magnets: [...detail().magnets, added] }))
  assert.equal((await service.save(id(10), metadata())).magnets.length, 2)
})
