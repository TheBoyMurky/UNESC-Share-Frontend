import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMaterialCadastroService, validateMaterialCadastro } from '../src/features/material/material-cadastro-service.ts'
import { created, id, input, magnetUri } from './material-cadastro-fixtures.mjs'

test('POST atomico projeta cinco campos, sem autor/estado/hash/instituicao/curso ou chamadas adicionais', async () => {
  let calls = 0
  const controller = new AbortController()
  const service = createMaterialCadastroService(async (path, options) => {
    calls++
    assert.equal(path, '/materiais')
    assert.deepEqual(options, { method: 'POST', signal: controller.signal, json: input() })
    return { ...created(), caminhoArquivo: 'nao-conservar', email: 'nao-conservar' }
  })
  assert.deepEqual(await service.cadastrar({ ...input(), titulo: ' ' + input().titulo + ' ', descricao: ' ' + input().descricao + ' ', magnetUris: [' ' + magnetUri + ' '], usuarioId: id(99), status: 'PUBLICADO', instituicaoId: id(1), cursoId: id(3), infoHash: 'privado' }, controller.signal), { id: id(10) })
  assert.equal(calls, 1)
})

test('limites validos titulo200/descricao4000 e1..10magnets v1/v2/Base32', () => {
  for (const uri of [magnetUri, 'magnet:?xt=urn:btih:' + 'A'.repeat(32), 'magnet:?xt=urn:btmh:1220' + 'b'.repeat(64)]) {
    assert.deepEqual(validateMaterialCadastro({ ...input(), titulo: 'a'.repeat(200), descricao: 'a'.repeat(4000), magnetUris: [uri] }), {})
  }
  assert.deepEqual(validateMaterialCadastro({ ...input(), magnetUris: Array.from({ length: 10 }, (_, i) => 'magnet:?xt=urn:btih:' + String(i).repeat(40)) }), {})
})

for (const [field, value] of [
  ['titulo', ' '], ['titulo', 'a'.repeat(201)], ['titulo', 'a\u0000b'], ['descricao', ' '], ['descricao', 'a'.repeat(4001)], ['descricao', 'a\u0000b'],
  ['disciplinaId', 'invalido'], ['categoriaId', 'invalido'], ['magnetUris', []], ['magnetUris', Array(11).fill(magnetUri)],
  ['magnetUris', ['https://example.test/privado']], ['magnetUris', ['javascript:privado']], ['magnetUris', [magnetUri + '&xt=urn:btih:' + 'b'.repeat(40)]],
  ['magnetUris', [magnetUri + '#privado']], ['magnetUris', [magnetUri + '&dn=' + 'a'.repeat(4000)]], ['magnetUris', [magnetUri, ' ' + magnetUri + ' ']],
]) {
  test(`campo ${field} invalido impede POST sem ecoar URIs`, async () => {
    let calls = 0
    const invalid = { ...input(), [field]: value }
    assert.ok(validateMaterialCadastro(invalid)[field])
    await assert.rejects(createMaterialCadastroService(async () => { calls++ }).cadastrar(invalid), error => error instanceof TypeError && !error.message.includes(magnetUri))
    assert.equal(calls, 0)
  })
}

for (const change of [{ id: 'invalido' }, { status: 'PUBLICADO' }, { visualizacoes: 1 }, { magnets: [] }, { torrents: [{ ...created().magnets[0] }] }, { disciplinaId: id(99) }, { categoriaId: id(99) }, { magnets: [{ ...created().magnets[0], magnetUri: 'javascript:privado' }] }]) {
  test('resposta invalida/naoPENDENTE/incompleta nao confirma cadastro nem inicia GET ou novo POST', async () => {
    let calls = 0
    await assert.rejects(createMaterialCadastroService(async () => { calls++; return { ...created(), ...change } }).cadastrar(input()), error => error.kind === 'protocol')
    assert.equal(calls, 1)
  })
}
