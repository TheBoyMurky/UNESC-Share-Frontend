import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createComentarioService, validateComentario } from '../src/features/comentario/comentario-service.ts'
import { createComentarioModel } from '../src/features/comentario/comentario-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'

const comment = (n = 30, changes = {}) => ({ id: id(n), conteudo: 'Texto sintético\n<script>alert(1)</script>', dataCadastro: '2026-10-23T12:00:00Z', status: 'ATIVO', usuarioId: id(8), materialId: id(10), ...changes })
const fixture = (overrides = {}, user = () => id(8)) => {
  const calls = []
  const service = {
    list: async (material, number, size, signal) => { calls.push({ material, number, size, signal }); return page([], number, size, 0) },
    create: async (material, text, identity, signal) => { calls.push({ material, text, identity, signal }); return comment(30, { conteudo: text }) },
    ...overrides,
  }
  return { model: createComentarioModel(service, user), calls }
}

test('service lista projeta seis campos, pagina/Bearer externo, preserva texto simples e sinal', async () => {
  const signal = new AbortController().signal, calls = []
  const service = createComentarioService(async (...args) => { calls.push(args); return page([{ ...comment(), email: 'privado', nome: 'nao mostrar' }], 1, 20, 21) })
  const dto = await service.list(id(10).toUpperCase(), 1, 20, signal)
  assert.deepEqual(calls, [['/materiais/' + id(10) + '/comentarios?page=1&size=20', { signal }]])
  assert.deepEqual(dto.content, [comment()]); assert.equal(JSON.stringify(dto).includes('privado'), false)
})

test('service POST projeta apenas conteudo trim, valida identidade/Material/ATIVO e nao envia usuarioId', async () => {
  let call
  const service = createComentarioService(async (...args) => { call = args; return comment(30, { conteudo: 'Texto' }) })
  await service.create(id(10), '  Texto \n', id(8))
  assert.deepEqual(call, ['/materiais/' + id(10) + '/comentarios', { method: 'POST', json: { conteudo: 'Texto' }, signal: undefined }])
})

for (const [label, content] of [['branco', ' \n\t'], ['longo', 'a'.repeat(4001)], ['nulo', 'teste\u0000']]) {
  test('validacao ' + label + ' impede POST antes do HTTP', async () => {
    assert.ok(validateComentario(content))
    const service = createComentarioService(() => assert.fail('HTTP indevido'))
    await assert.rejects(service.create(id(10), content, id(8)), TypeError)
    const { model, calls } = fixture(); await model.load(id(10), true); model.changeDraft(content); await model.submit()
    assert.equal(calls.length, 1); assert.ok(model.getState().error); assert.equal(model.getState().draft, content)
  })
}
test('limite4000 UTF16 aceita texto/dobra emoji sem arredondar ou truncar', () => {
  assert.equal(validateComentario('🙂'.repeat(2000)), '')
  assert.ok(validateComentario('🙂'.repeat(2001)))
})

for (const [label, mutation] of [
  ['uuid', { id: 'invalido' }], ['autor', { usuarioId: null }], ['material', { materialId: id(99) }],
  ['oculto', { status: 'OCULTO' }], ['removido', { status: 'REMOVIDO' }], ['data', { dataCadastro: 'x' }],
  ['texto vazio', { conteudo: '' }], ['texto ausente', { conteudo: null }], ['texto longo', { conteudo: 'a'.repeat(4001) }],
]) {
  test('service rejeita DTO de comentario: ' + label, async () => {
    const service = createComentarioService(async () => page([comment(30, mutation)], 0, 20))
    await assert.rejects(service.list(id(10)), error => error instanceof ApiError && error.kind === 'protocol')
  })
}
test('service rejeita pagina inconsistente e IDs duplicados', async () => {
  for (const dto of [page([comment()], 1, 20), { content: [], page: { number: 0, size: 20, totalElements: 21, totalPages: 1 } }, page([comment(), comment()], 0, 20)]) {
    await assert.rejects(createComentarioService(async () => dto).list(id(10)), ApiError)
  }
})
test('service rejeita UUID/query/tamanho invalidos antes de HTTP', async () => {
  const service = createComentarioService(() => assert.fail('HTTP indevido'))
  await assert.rejects(service.list('../privado'), TypeError)
  for (const [number, size] of [[-1, 20], [0.5, 20], [0, 101], [0, 0]]) await assert.rejects(service.list(id(10), number, size), TypeError)
  await assert.rejects(service.create(id(10), 'Texto', 'nao-uuid'), TypeError)
})
test('service resposta POST de outra identidade/texto/material e rejeitada como incerta', async () => {
  for (const mutation of [{ usuarioId: id(9) }, { conteudo: 'Outro' }, { materialId: id(11) }]) {
    await assert.rejects(createComentarioService(async () => comment(30, mutation)).create(id(10), comment().conteudo, id(8)), ApiError)
  }
})

for (const published of [false, undefined]) {
  test('model nunca consulta/comenta quando PUBLICADO nao confirmado: ' + published, async () => {
    const { model, calls } = fixture(); await model.load(id(10), published); model.changeDraft('Teste'); await model.submit(); await model.reload()
    assert.equal(calls.length, 0); assert.equal(model.getState().unavailable, true)
  })
}
test('model UUID invalido/sem conta impede consulta', async () => {
  for (const [material, identity] of [['x', id(8)], [id(10), null]]) {
    const { model, calls } = fixture({}, () => identity); await model.load(material, true); await model.submit()
    assert.equal(calls.length, 0); assert.equal(model.getState().unavailable, true)
  }
})
test('pagina vazia e erro sao distintos, draft preservado no retry GET', async () => {
  let fail = true
  const { model } = fixture({ list: async () => { if (fail) throw new ApiError('network'); return page([], 0, 20) } })
  await model.load(id(10), true); model.changeDraft('Rascunho'); assert.equal(model.getState().data, null); assert.ok(model.getState().loadError)
  fail = false; await model.reload(); assert.equal(model.getState().loadError, ''); assert.deepEqual(model.getState().data.content, []); assert.equal(model.getState().draft, 'Rascunho')
})
test('paginacao/setSize/reload preservam draft, limites invalidos nao consultam', async () => {
  const { model, calls } = fixture({ list: async (material, number, size) => { calls.push({ number, size }); return page([comment()], number, size, 101) } })
  await model.load(id(10), true); model.changeDraft('Rascunho'); await model.goToPage(5)
  assert.equal(model.getState().data.page.number, 5)
  await model.setSize(50); assert.deepEqual(calls.at(-1), { number: 0, size: 50 }); assert.equal(model.getState().draft, 'Rascunho')
  const count = calls.length
  for (const n of [-1, 999, NaN, 0.5]) await model.goToPage(n)
  await model.setSize(21); assert.equal(calls.length, count)
})
test('corrige pagina encolhida uma vez inclusive totalzero, sem loop', async () => {
  const numbers = []; let shrinking = false
  const { model } = fixture({ list: async (material, number, size) => { numbers.push(number); return shrinking ? page([], number, size, 0) : page([comment()], number, size, 41) } })
  await model.load(id(10), true); shrinking = true; await model.goToPage(2)
  assert.deepEqual(numbers, [0, 2, 0]); assert.equal(model.getState().data.page.totalElements, 0)
})
test('POST duplicado/edicao/paginacao bloqueados em voo; sucesso limpa draft e recarrega pagina0 sem prepend', async () => {
  const pending = deferred(), writes = []
  const { model, calls } = fixture({ create: async (...args) => { writes.push(args); return pending.promise } })
  await model.load(id(10), true); model.changeDraft('Texto'); const sending = model.submit()
  await model.submit(); model.changeDraft('Outro'); await model.reload(); await model.setSize(50); await model.goToPage(1)
  assert.equal(writes.length, 1); assert.equal(model.getState().draft, 'Texto'); assert.equal(calls.length, 1)
  pending.resolve(comment()); await sending
  assert.equal(model.getState().draft, ''); assert.equal(model.getState().sending, false); assert.ok(model.getState().message.includes('publicado'))
  assert.equal(calls.length, 2); assert.deepEqual(model.getState().data.content, [])
  await model.submit(); assert.equal(writes.length, 1)
})
test('POST confirmado e falha na recarga mantem sucesso, nao transforma em envio incerto', async () => {
  let reads = 0
  const { model } = fixture({ list: async () => { if (++reads > 1) throw new ApiError('network'); return page([], 0, 20) } })
  await model.load(id(10), true); model.changeDraft('Texto'); await model.submit()
  assert.ok(model.getState().message.includes('publicado')); assert.ok(model.getState().loadError)
  assert.equal(model.getState().uncertain, false); assert.equal(model.getState().draft, '')
})
for (const status of [401, 403, 404]) {
  test('acesso ' + status + ' limpa lista/texto e bloqueia novas consultas/escritas sem excecao', async () => {
    let fail = false
    const { model, calls } = fixture({ list: async () => { if (fail) throw new ApiError('http', status); return page([comment()], 0, 20) } })
    await model.load(id(10), true); model.changeDraft('Privado'); fail = true; await model.reload()
    assert.equal(model.getState().data, null); assert.equal(model.getState().draft, ''); assert.equal(model.getState().unavailable, true)
    await model.submit(); await model.reload(); assert.equal(calls.length, 0)
    assert.equal(model.getState().loadError.includes('Privado'), false)
  })
}
test('POST404 apos detalhe PUBLICADO retira lista, nao representa zero comentarios', async () => {
  const { model } = fixture({ create: async () => { throw new ApiError('http', 404) } })
  await model.load(id(10), true); model.changeDraft('Texto'); await model.submit()
  assert.equal(model.getState().unavailable, true); assert.equal(model.getState().data, null)
})
for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503)]) {
  test('envio incerto ' + error.kind + '/' + error.status + ' exige GETnovo e acaoexplicita, nunca repete POST sozinho', async () => {
    let writes = 0
    const { model } = fixture({ create: async () => { writes++; throw error } })
    await model.load(id(10), true); model.changeDraft('Texto'); await model.submit(); await model.submit(); model.prepareRetry()
    assert.equal(model.getState().uncertain, true); assert.equal(writes, 1); assert.equal(model.getState().draft, 'Texto')
    await model.reload(); assert.equal(model.getState().reviewed, true); await model.submit(); assert.equal(writes, 1)
    model.prepareRetry(); assert.equal(model.getState().uncertain, false); assert.equal(writes, 1)
    await model.submit(); assert.equal(writes, 2)
  })
}
test('GET falho nao permite preparar repeticao de envio incerto', async () => {
  let reads = 0
  const { model } = fixture({ list: async () => { if (++reads > 1) throw new ApiError('network'); return page([], 0, 20) }, create: async () => { throw new ApiError('network') } })
  await model.load(id(10), true); model.changeDraft('Texto'); await model.submit(); await model.reload(); model.prepareRetry()
  assert.equal(model.getState().uncertain, true); assert.equal(model.getState().reviewed, false)
})
test('400/409 POST preservam texto, nao ecoam erro privado e permitem correcao sem repetir automaticamente', async () => {
  for (const status of [400, 409]) {
    let writes = 0
    const { model } = fixture({ create: async () => { writes++; throw new ApiError('http', status, { title: 'PRIVADO', detail: 'PRIVADO', errors: [] }) } })
    await model.load(id(10), true); model.changeDraft('Texto'); await model.submit()
    assert.equal(model.getState().uncertain, false); assert.equal(model.getState().draft, 'Texto'); assert.equal(writes, 1)
    assert.equal(model.getState().error.includes('PRIVADO'), false)
  }
})
test('troca de Material cancela/ignora lista anterior e limpa rascunho', async () => {
  const old = deferred(); let signal
  const { model } = fixture({ list: async (material, number, size, s) => { if (material === id(10)) { signal = s; return old.promise } return page([], number, size) } })
  const first = model.load(id(10), true); model.changeDraft('Anterior'); await model.load(id(11), true)
  old.resolve(page([comment()], 0, 20)); await first
  assert.equal(signal.aborted, true); assert.deepEqual(model.getState().data.content, []); assert.equal(model.getState().draft, '')
})
test('troca de pagina ignora resposta atrasada mesmo transporte ignorando abort', async () => {
  const old = deferred(); let calls = 0
  const { model } = fixture({ list: async (material, number, size) => ++calls === 1 ? old.promise : page([], number, size) })
  const first = model.load(id(10), true); await model.setSize(50); old.resolve(page([comment()], 0, 20)); await first
  assert.equal(model.getState().data.page.size, 50); assert.deepEqual(model.getState().data.content, [])
})
for (const action of ['conta', 'dispose', 'material']) {
  test('resposta POST atrasada apos ' + action + ' nao restaura texto/mensagem/consulta', async () => {
    const pending = deferred(); let identity = id(8), signal
    const { model, calls } = fixture({ create: async (material, text, user, s) => { signal = s; return pending.promise } }, () => identity)
    await model.load(id(10), true); model.changeDraft('Antigo'); const sending = model.submit()
    if (action === 'conta') identity = id(9)
    if (action === 'dispose') model.dispose()
    if (action === 'material') await model.load(id(11), true)
    pending.resolve(comment()); await sending
    assert.equal(model.getState().draft, ''); assert.equal(model.getState().message, ''); assert.equal(model.getState().sending, false)
    assert.equal(calls.length, action === 'material' ? 2 : 1); assert.equal(signal.aborted, true)
  })
}
test('mudanca de conta antes de submit limpa estado e nao envia em outra identidade', async () => {
  let identity = id(8)
  const { model, calls } = fixture({}, () => identity); await model.load(id(10), true); model.changeDraft('Antigo'); identity = null; await model.submit()
  assert.equal(calls.length, 1); assert.equal(model.getState().draft, ''); assert.equal(model.getState().data, null)
})
