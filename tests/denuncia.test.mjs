import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/http/client.ts'
import { createDenunciaService, motivos, estados, validateDenuncia } from '../src/features/denuncia/denuncia-service.ts'
import { createDenunciaCadastroModel } from '../src/features/denuncia/denuncia-cadastro-model.ts'
import { createDenunciaConsultaModel } from '../src/features/denuncia/denuncia-consulta-model.ts'
import { id, page, deferred } from './catalog-fixtures.mjs'
import { detail } from './material-fixtures.mjs'

const report = (changes = {}) => ({ id: id(60), motivo: 'LINK_INVALIDO', descricao: 'Relato sintético\n<script>texto literal</script>', status: 'PENDENTE', dataCadastro: '2026-10-23T12:00:00Z', materialId: id(10), ...changes })
const preview = (changes = {}) => ({ id: id(10), titulo: 'Material sintético', status: 'PUBLICADO', ...changes })
const draft = () => ({ motivo: 'LINK_INVALIDO', descricao: report().descricao })
function fixture(overrides = {}, user = () => id(8)) {
  const calls = []
  const service = {
    material: async (...args) => { calls.push({ kind: 'material', args }); return preview() },
    create: async (...args) => { calls.push({ kind: 'create', args }); return { id: id(60) } },
    list: async (number, size, signal) => { calls.push({ kind: 'list', number, size, signal }); const { descricao, ...summary } = report(); return page([summary], number, size) },
    detail: async (...args) => { calls.push({ kind: 'detail', args }); return report({ id: args[0] }) }, ...overrides,
  }
  return { cadastro: createDenunciaCadastroModel(service, user), consulta: createDenunciaConsultaModel(service, user), calls }
}
const fill = model => { model.changeField('motivo', 'LINK_INVALIDO'); model.changeField('descricao', report().descricao) }

for (const motivo of motivos) {
  test('service POST motivo' + motivo + ' envia somente dois campos/trim e guarda soUUID', async () => {
    let call
    const service = createDenunciaService(async (...args) => { call = args; return { ...report({ motivo, descricao: 'Relato' }), usuarioId: 'privado' } })
    assert.deepEqual(await service.create(id(10), { motivo, descricao: ' Relato\n', status: 'PROCEDENTE', usuarioId: id(7) }), { id: id(60) })
    assert.deepEqual(call, ['/materiais/' + id(10) + '/denuncias', { method: 'POST', json: { motivo, descricao: 'Relato' }, signal: undefined }])
  })
}
for (const [label, input] of [['sem motivo', { ...draft(), motivo: '' }], ['enum invalido', { ...draft(), motivo: 'outro' }], ['branco', { ...draft(), descricao: ' \n' }], ['longo', { ...draft(), descricao: 'a'.repeat(2001) }], ['nulo', { ...draft(), descricao: 'a\u0000' }]]) {
  test('validacao' + label + ' impedePOST semexporvalores', async () => {
    assert.ok(Object.keys(validateDenuncia(input)).length)
    await assert.rejects(createDenunciaService(() => assert.fail()).create(id(10), input), TypeError)
    const { cadastro, calls } = fixture(); await cadastro.load(id(10)); cadastro.changeField('motivo', input.motivo); cadastro.changeField('descricao', input.descricao); await cadastro.submit()
    assert.equal(calls.length, 1); assert.deepEqual(cadastro.getState().draft, input); assert.ok(Object.keys(cadastro.getState().errors).length)
  })
}
test('descricao2000 UTF16 e obrigatoria tambem emOUTRO, sem truncar', () => {
  assert.deepEqual(validateDenuncia({ motivo: 'OUTRO', descricao: '🙂'.repeat(1000) }), {})
  assert.ok(validateDenuncia({ motivo: 'OUTRO', descricao: '🙂'.repeat(1001) }).descricao)
  assert.ok(validateDenuncia({ motivo: 'OUTRO', descricao: '' }).descricao)
})
test('materialpreview projeta titulo/UUID/estado semURI/autor/mecanismos', async () => {
  let path
  const service = createDenunciaService(async p => { path = p; return detail() })
  assert.deepEqual(await service.material(id(10)), preview()); assert.equal(path, '/materiais/' + id(10))
})
test('list consulta somente/minhas com page/size, descarta descricao/extras e nao buscaMaterial/autor', async () => {
  const calls = [], signal = new AbortController().signal
  const service = createDenunciaService(async (...args) => { calls.push(args); return page([{ ...report(), email: 'privado', titulo: 'privado' }], 1, 20, 21) })
  const data = await service.list(1, 20, signal)
  assert.deepEqual(calls, [['/denuncias/minhas?page=1&size=20', { signal }]])
  assert.equal('descricao' in data.content[0], false); assert.equal('email' in data.content[0], false); assert.equal('titulo' in data.content[0], false)
})
for (const status of estados) {
  test('detail estado' + status + ' preserva texto simples e projeta seis campos proprios sem Materialextra', async () => {
    let calls = 0
    const service = createDenunciaService(async path => { calls++; assert.equal(path, '/denuncias/' + id(60)); return { ...report({ status }), usuarioId: id(8), nome: 'privado', magnetUri: 'privado' } })
    assert.deepEqual(await service.detail(id(60).toUpperCase()), report({ status })); assert.equal(calls, 1)
  })
}
for (const [label, changes] of [['id', { id: 'x' }], ['Material', { materialId: 'x' }], ['motivo', { motivo: 'NOVO' }], ['estado', { status: 'REMOVIDO' }], ['data', { dataCadastro: 'x' }], ['descricao ausente', { descricao: null }], ['descricao longa', { descricao: 'x'.repeat(2001) }]]) {
  test('DTO rejeitado: ' + label, async () => {
    await assert.rejects(createDenunciaService(async () => report(changes)).detail(id(60)), error => error instanceof ApiError && error.kind === 'protocol')
  })
}
test('POSTresposta tem que confirmar Material/motivo/texto/PENDENTE, detalheUUIDcorreto, pagina consistente', async () => {
  for (const changes of [{ materialId: id(11) }, { motivo: 'SPAM' }, { descricao: 'Outra' }, { status: 'EM_ANALISE' }]) {
    await assert.rejects(createDenunciaService(async () => report(changes)).create(id(10), draft()), ApiError)
  }
  await assert.rejects(createDenunciaService(async () => report({ id: id(61) })).detail(id(60)), ApiError)
  for (const data of [page([report()], 1, 20), page([report(), report()], 0, 20), { content: [], page: { number: 0, size: 20, totalElements: 21, totalPages: 1 } }]) await assert.rejects(createDenunciaService(async () => data).list(), ApiError)
})
test('IDs/paginacao invalidos nao fazemHTTP', async () => {
  const service = createDenunciaService(() => assert.fail())
  await assert.rejects(service.material('../x'), TypeError); await assert.rejects(service.detail('x'), TypeError); await assert.rejects(service.create('x', draft()), TypeError)
  for (const [number, size] of [[-1, 20], [0.5, 20], [0, 101], [0, 0]]) await assert.rejects(service.list(number, size), TypeError)
})
for (const status of ['PENDENTE', 'BLOQUEADO', 'REMOVIDO']) {
  test('cadastro nao abre paraMaterial' + status + ' nem autor/equipe, sem POST', async () => {
    const { cadastro, calls } = fixture({ material: async () => preview({ status }) }); await cadastro.load(id(10)); fill(cadastro); await cadastro.submit()
    assert.equal(cadastro.getState().material, null); assert.equal(cadastro.getState().unavailable, true); assert.equal(calls.length, 0)
  })
}
test('Material proprio PUBLICADO nao tem bloqueio de auto-denuncia, motivo nao tem default', async () => {
  const { cadastro, calls } = fixture(); await cadastro.load(id(10)); assert.equal(cadastro.getState().draft.motivo, '')
  fill(cadastro); await cadastro.submit(); assert.equal(calls.filter(item => item.kind === 'create').length, 1); assert.equal(cadastro.getState().createdId, id(60))
})
test('semUUID/conta nao consulta/cadastra', async () => {
  const first = fixture(); await first.cadastro.load('x'); await first.cadastro.submit(); assert.equal(first.calls.length, 0)
  const second = fixture({}, () => null); await second.cadastro.load(id(10)); await second.consulta.loadList(); assert.equal(second.calls.length, 0)
})
test('POSTbloqueia duploenvio/edicao/retry e sucesso limpa dados semnovoPOST/GET', async () => {
  const pending = deferred(), writes = []
  const { cadastro, calls } = fixture({ create: async (...args) => { writes.push(args); return pending.promise } })
  await cadastro.load(id(10)); fill(cadastro); const sending = cadastro.submit(); await cadastro.submit(); cadastro.changeField('descricao', 'Outro'); await cadastro.retry()
  assert.equal(writes.length, 1); assert.equal(cadastro.getState().draft.descricao, report().descricao); pending.resolve({ id: id(60) }); await sending
  assert.deepEqual(cadastro.getState().draft, { motivo: '', descricao: '' }); assert.equal(cadastro.getState().createdId, id(60)); await cadastro.submit(); assert.equal(writes.length, 1); assert.equal(calls.length, 1)
})
for (const error of [new ApiError('network'), new ApiError('protocol'), new ApiError('http', 408), new ApiError('http', 503), new ApiError('http', 409)]) {
  test('POST' + error.kind + '/' + error.status + ' bloqueia reenvio/retry desta instancia e orienta conferir relatos', async () => {
    let writes = 0
    const { cadastro, calls } = fixture({ create: async () => { writes++; throw error } }); await cadastro.load(id(10)); fill(cadastro); await cadastro.submit(); await cadastro.submit(); await cadastro.retry(); cadastro.changeField('descricao', 'Outro')
    assert.equal(writes, 1); assert.equal(calls.length, 1); assert.equal(cadastro.getState().draft.descricao, report().descricao)
    assert.equal(cadastro.getState().blocked, error.status === 409 ? 'conflict' : 'uncertain'); assert.equal(cadastro.getState().createdId, '')
  })
}
test('400permite corrigir comtexto local semprivado,401/403/404retiramMaterial/draft e nao liberamPOST', async () => {
  for (const status of [400, 401, 403, 404]) {
    let writes = 0
    const { cadastro } = fixture({ create: async () => { writes++; throw new ApiError('http', status, { title: 'PRIVADO', detail: 'PRIVADO', errors: [] }) } }); await cadastro.load(id(10)); fill(cadastro); await cadastro.submit()
    assert.equal(JSON.stringify(cadastro.getState()).includes('PRIVADO'), false)
    if (status === 400) { cadastro.changeField('descricao', 'Corrigido'); await cadastro.submit(); assert.equal(writes, 2) }
    else { assert.equal(cadastro.getState().unavailable, true); assert.equal(cadastro.getState().material, null); assert.equal(cadastro.getState().draft.descricao, ''); await cadastro.submit(); assert.equal(writes, 1) }
  }
})
test('falha de consultaMaterial pode ser repetida sem escrever', async () => {
  let fail = true, reads = 0
  const { cadastro, calls } = fixture({ material: async () => { reads++; if (fail) throw new ApiError('network'); return preview() } })
  await cadastro.load(id(10)); assert.ok(cadastro.getState().loadError); fail = false; await cadastro.retry(); assert.equal(reads, 2); assert.ok(cadastro.getState().material); assert.equal(calls.length, 0)
})
test('lista e detalhe nao confundem vazio com erro e retry mantem pagina/tamanho', async () => {
  let fail = true
  const { consulta } = fixture({ list: async (number, size) => { if (fail) throw new ApiError('network'); return page([], number, size) } })
  await consulta.loadList(); assert.equal(consulta.getState().data, null); assert.ok(consulta.getState().error); fail = false; await consulta.reload()
  assert.equal(consulta.getState().error, ''); assert.deepEqual(consulta.getState().data.content, [])
})
test('paginacao deMinhasdenuncias20/50/100, limites e correcao unica inclusive totalzero', async () => {
  const queries = []; let shrink = false
  const { consulta } = fixture({ list: async (number, size) => { queries.push([number, size]); return shrink ? page([], number, size, 0) : page([report()], number, size, 101) } })
  await consulta.loadList(); await consulta.goToPage(5); assert.deepEqual(queries.at(-1), [5, 20]); await consulta.setSize(50); assert.deepEqual(queries.at(-1), [0, 50])
  const count = queries.length; for (const number of [-1, 99, 0.5]) await consulta.goToPage(number); await consulta.setSize(21); assert.equal(queries.length, count)
  shrink = true; await consulta.goToPage(2); assert.deepEqual(queries.slice(-2), [[2, 50], [0, 50]])
})
test('detalhe invalido/404 nao consultaMaterial nem fabrica dados ou concede excecao de equipe', async () => {
  const { consulta, calls } = fixture({ detail: async () => { throw new ApiError('http', 404, { title: 'PRIVADO', detail: 'PRIVADO', errors: [] }) } })
  await consulta.loadDetail('x'); assert.equal(calls.length, 0); assert.ok(consulta.getState().error)
  await consulta.loadDetail(id(60)); assert.equal(consulta.getState().report, null); assert.equal(consulta.getState().error.includes('PRIVADO'), false); assert.equal(calls.length, 0)
})
test('trocar lista/detalhe aborta e descarta resposta antiga; modo detalhe nao pagina', async () => {
  const old = deferred(); let signal
  const { consulta, calls } = fixture({ list: async (number, size, s) => { signal = s; return old.promise } })
  const first = consulta.loadList(); await consulta.loadDetail(id(61)); old.resolve(page([report()], 0, 20)); await first
  assert.equal(signal.aborted, true); assert.equal(consulta.getState().data, null); assert.equal(consulta.getState().report.id, id(61)); await consulta.setSize(50); await consulta.goToPage(0); assert.equal(calls.length, 1)
})
test('lista velha nao sobrepoe tamanho novo mesmo se transporte ignorar abort', async () => {
  const old = deferred(); let reads = 0
  const { consulta } = fixture({ list: async (number, size) => ++reads === 1 ? old.promise : page([], number, size) })
  const first = consulta.loadList(); await consulta.setSize(100); old.resolve(page([report()], 0, 20)); await first
  assert.equal(consulta.getState().data.page.size, 100); assert.deepEqual(consulta.getState().data.content, [])
})
for (const change of ['conta', 'material', 'dispose']) {
  test('POSTresposta antiga apos' + change + ' nao restaura relato/draft/sucesso', async () => {
    const pending = deferred(); let user = id(8), signal
    const { cadastro } = fixture({ create: async (...args) => { signal = args.at(-1); return pending.promise } }, () => user)
    await cadastro.load(id(10)); fill(cadastro); const sending = cadastro.submit()
    if (change === 'conta') user = id(7)
    if (change === 'material') await cadastro.load(id(11))
    if (change === 'dispose') cadastro.dispose()
    pending.resolve({ id: id(60) }); await sending
    assert.equal(signal.aborted, true); assert.equal(cadastro.getState().createdId, ''); assert.equal(cadastro.getState().draft.descricao, '')
  })
}
for (const mode of ['list', 'detail']) {
  test(mode + ': troca de conta descarta dados antigos e dispose limpa consulta', async () => {
    const old = deferred(); let user = id(8), signal
    const operation = async (...args) => { signal = args.at(-1); return old.promise }
    const { consulta } = fixture({ list: operation, detail: operation }, () => user)
    const reading = mode === 'list' ? consulta.loadList() : consulta.loadDetail(id(60)); user = id(7)
    old.resolve(mode === 'list' ? page([report()], 0, 20) : report()); await reading
    assert.equal(signal.aborted, true); assert.equal(consulta.getState().data, null); assert.equal(consulta.getState().report, null)
    consulta.dispose(); assert.equal(consulta.getState().report, null)
  })
}
test('mudanca de conta antesdePOST limpa draft e nao publica como outra conta', async () => {
  let user = id(8)
  const { cadastro, calls } = fixture({}, () => user); await cadastro.load(id(10)); fill(cadastro); user = id(7); await cadastro.submit()
  assert.equal(calls.length, 1); assert.equal(cadastro.getState().draft.descricao, ''); assert.equal(cadastro.getState().unavailable, true)
})

for (const mode of ['list', 'detail']) {
  for (const status of [401, 403, 404]) {
    test(mode + ' GET' + status + ' posterior limpa dados anteriores e nao mostra erro privado', async () => {
      let fail = false
      const operation = async () => {
        if (fail) throw new ApiError('http', status, { title: 'PRIVADO', detail: 'PRIVADO', errors: [] })
        return mode === 'list' ? page([report()], 0, 20) : report()
      }
      const { consulta } = fixture({ list: operation, detail: operation })
      if (mode === 'list') await consulta.loadList(); else await consulta.loadDetail(id(60))
      assert.ok(mode === 'list' ? consulta.getState().data : consulta.getState().report)
      fail = true; await consulta.reload()
      assert.equal(consulta.getState().data, null); assert.equal(consulta.getState().report, null)
      assert.equal(JSON.stringify(consulta.getState()).includes(report().descricao), false)
      assert.equal(consulta.getState().error.includes('PRIVADO'), false)
    })
  }
}
