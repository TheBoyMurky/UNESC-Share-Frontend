import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOwnMaterialsService, ownMaterialsPath, materialStates } from '../src/features/material/meus-materiais-service.ts'
import { material, page } from './catalog-fixtures.mjs'
const filters = () => ({ q: '', status: '' })

test('rota propria sem status omite identidade/sort e consulta todos os estados', () => {
  assert.equal(ownMaterialsPath({ ...filters(), usuarioId: 'outro', sort: 'titulo', token: 'privado' }), '/materiais/meus?page=0&size=20')
})

test('texto e estado sao codificados sem escapar da rota e sem enviar parametros extras', () => {
  const url = new URL('https://example.test' + ownMaterialsPath({ q: '  C++ & redes? #/% _  ', status: 'REMOVIDO', usuarioId: 'outro' }, 2, 50))
  assert.equal(url.pathname, '/materiais/meus')
  assert.deepEqual([...url.searchParams], [['page', '2'], ['size', '50'], ['q', 'C++ & redes? #/% _'], ['status', 'REMOVIDO']])
})

for (const status of materialStates) {
  test(`aceita ${status} e preserva DTO projetado sem detalhes privados extras`, async () => {
    const expected = { ...material(), status }
    const controller = new AbortController()
    const service = createOwnMaterialsService(async (path, options) => {
      assert.equal(new URL('https://example.test' + path).searchParams.get('status'), status)
      assert.equal(options.signal, controller.signal)
      return page([{ ...expected, email: 'nao-conservar', descricao: 'nao-conservar', caminhoArquivo: 'nao-conservar', magnets: ['nao-conservar'] }], 0, 20)
    })
    assert.deepEqual(await service.search({ q: '', status }, 0, 20, controller.signal), page([expected], 0, 20))
  })
}

test('consulta sem status aceita os quatro estados na mesma pagina e pagina vazia valida', async () => {
  const items = materialStates.map((status, index) => ({ ...material(10 + index), status }))
  const service = createOwnMaterialsService(async () => page(items, 0, 20))
  assert.deepEqual((await service.search(filters())).content, items)
  assert.deepEqual(await createOwnMaterialsService(async () => page([], 0, 20)).search(filters()), page([], 0, 20))
})

for (const [number, size] of [[-1, 20], [0.5, 20], [Number.MAX_SAFE_INTEGER + 1, 20], [0, 0], [0, 101], [0, 2.5]]) {
  test(`paginacao propria invalida ${number}/${size} nao faz HTTP`, async () => {
    let calls = 0
    const service = createOwnMaterialsService(async () => { calls++ })
    await assert.rejects(service.search(filters(), number, size), TypeError)
    assert.equal(calls, 0)
  })
}

test('filtro invalido e texto acima200 nao fazem HTTP nem ecoam entrada', async () => {
  let calls = 0
  const service = createOwnMaterialsService(async () => { calls++ })
  for (const input of [{ q: 'a'.repeat(201), status: '' }, { q: '', status: 'javascript:privado' }]) {
    await assert.rejects(service.search(input), error => error instanceof TypeError && !error.message.includes('privado'))
  }
  assert.equal(calls, 0)
  assert.ok(ownMaterialsPath({ q: 'a'.repeat(200), status: '' }))
})

for (const invalid of [
  { ...material(), status: 'OUTRO' }, { ...material(), id: 'invalido' }, { ...material(), titulo: ' ' },
  { ...material(), usuarioId: 'invalido' }, { ...material(), categoriaId: null }, { ...material(), disciplinaId: 'invalido' },
  { ...material(), dataCadastro: 'invalida' }, { ...material(), visualizacoes: -1 }, { ...material(), visualizacoes: 1.5 }, null,
]) {
  test('resumo proprio invalido nao e exibido como lista vazia', async () => {
    await assert.rejects(createOwnMaterialsService(async () => page([invalid], 0, 20)).search(filters()), error => error.kind === 'protocol')
  })
}

test('estado divergente de filtro explicito e erro de protocolo, nao reclassificado', async () => {
  await assert.rejects(createOwnMaterialsService(async () => page([material()], 0, 20)).search({ q: '', status: 'PENDENTE' }), error => error.kind === 'protocol')
})

for (const invalid of [null, [], {}, { content: [], page: [] }, page([], 1, 20), page([], 0, 100),
  { content: [], page: { number: 0, size: 20, totalElements: 21, totalPages: 1 } }, page([material()], 0, 20, 0)]) {
  test('pagina propria ausente ou inconsistente e rejeitada', async () => {
    await assert.rejects(createOwnMaterialsService(async () => invalid).search(filters()), error => error.kind === 'protocol')
  })
}
