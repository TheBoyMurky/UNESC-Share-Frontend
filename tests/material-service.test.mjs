import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMaterialService, safeMagnetUri } from '../src/features/material/material-service.ts'
import { detail, hash, id, magnetUri, payload } from './material-fixtures.mjs'

test('detalhe projeta DTO sem caminhos/dados pessoais/entidades extras', async () => {
  const data = detail()
  const service = createMaterialService(async path => { assert.equal(path, '/materiais/' + id(10)); return { ...data, email: 'privado', torrents: data.torrents.map(item => ({ ...item, caminhoArquivo: 'privado' })) } }, async () => payload())
  assert.deepEqual(await service.detail(id(10)), data)
})

for (const status of ['PENDENTE', 'PUBLICADO', 'BLOQUEADO', 'REMOVIDO']) {
  test(`detalhe ${status} autorizado pela API nao e rejeitado por regra nova do frontend`, async () => {
    const service = createMaterialService(async () => ({ ...detail(), status }), async () => payload())
    assert.equal((await service.detail(id(10))).status, status)
  })
}

for (const changes of [{ id: id(99) }, { status: 'OUTRO' }, { descricao: null }, { dataCadastro: 'invalida' }, { torrents: null }, { magnets: null },
  { torrents: [{ ...detail().torrents[0], infoHash: 'invalido' }] }, { magnets: [{ ...detail().magnets[0], magnetUri: 'javascript:alert(1)' }] }]) {
  test('detalhe ou mecanismo invalido nao e exposto como acao de compartilhamento', async () => {
    const service = createMaterialService(async () => ({ ...detail(), ...changes }), async () => payload())
    await assert.rejects(service.detail(id(10)), error => error.kind === 'protocol')
  })
}

test('v2 SHA256 e metadados sem mecanismos sao aceitos sem criar links falsos', async () => {
  const data = { ...detail(), torrents: [], magnets: [{ ...detail().magnets[0], infoHash: 'b'.repeat(64), magnetUri: 'magnet:?xt=urn:btmh:1220' + 'b'.repeat(64) }] }
  const service = createMaterialService(async () => data, async () => payload())
  assert.deepEqual(await service.detail(id(10)), data)
  const empty = createMaterialService(async () => ({ ...detail(), magnets: [], torrents: [] }), async () => payload())
  assert.equal((await empty.detail(id(10))).magnets.length, 0)
})

test('IDs duplicados de mecanismos sao rejeitados', async () => {
  const service = createMaterialService(async () => ({ ...detail(), magnets: [detail().magnets[0], detail().magnets[0]] }), async () => payload())
  await assert.rejects(service.detail(id(10)), error => error.kind === 'protocol')
})

test('contexto academico faz apenas quatro consultas vinculadas', async () => {
  const calls = []
  const replies = { ['/disciplinas/' + id(5)]: { id: id(5), nome: 'Disciplina', codigo: '123', cursoId: id(3) },
    ['/categorias/' + id(7)]: { id: id(7), nome: 'Resumo' }, ['/cursos/' + id(3)]: { id: id(3), nome: 'Curso', instituicaoId: id(1) }, ['/instituicoes/' + id(1)]: { id: id(1), nome: 'Instituicao' } }
  const service = createMaterialService(async path => { calls.push(path); return replies[path] }, async () => payload())
  assert.deepEqual(await service.academic(detail()), { instituicao: 'Instituicao', curso: 'Curso', disciplina: 'Disciplina', codigo: '123', categoria: 'Resumo' })
  assert.equal(calls.length, 4)
})

test('download usa rota composta e nomeUUID, nunca Content-Disposition ou nome original malicioso', async () => {
  const service = createMaterialService(async () => assert.fail(), async path => {
    assert.equal(path, `/materiais/${id(10)}/torrents/${id(20)}`)
    return { blob: payload().blob, contentDisposition: 'attachment; filename="../../exemplo.exe"' }
  })
  assert.equal((await service.download(id(10), id(20))).filename, id(20) + '.torrent')
})

test('ID invalido nao acessa API e nao e ecoado em erro', async () => {
  let calls = 0
  const service = createMaterialService(async () => { calls++ }, async () => { calls++ })
  await assert.rejects(service.detail('privado'), error => error instanceof TypeError && !String(error).includes('privado'))
  await assert.rejects(service.download(id(10), 'invalido'), TypeError)
  assert.equal(calls, 0)
})

for (const uri of [magnetUri, 'magnet:?xt=urn:btih:' + 'A'.repeat(32), 'MAGNET:?xt=urn:btmh:1220' + 'b'.repeat(64)]) {
  test('somente protocolo Magnet suportado pode virar href', () => assert.equal(safeMagnetUri(uri), true))
}
for (const uri of ['https://example.com', 'javascript:alert(1)', 'data:text/html,privado', ' magnet:?xt=urn:btih:' + hash,
  magnetUri + '#fragmento', 'magnet://host/path?xt=urn:btih:' + hash, 'magnet:?xt=urn:btih:' + hash + '&xt=urn:btih:' + hash, 'magnet:?xt=invalido', magnetUri + '\n']) {
  test('URI insegura/nao suportada nao vira link nem clipboard', () => assert.equal(safeMagnetUri(uri), false))
}
