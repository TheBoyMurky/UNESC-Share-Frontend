// Executado exclusivamente pelo ComentarioFrontendIT do backend; stdin contem apenas fixtures/JWTs de teste.
import assert from 'node:assert/strict'
import { ApiError, createHttpClient } from '../../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../../src/features/auth/authenticated-client.ts'
import { createComentarioService } from '../../src/features/comentario/comentario-service.ts'
import { createModeracaoComentarioService } from '../../src/features/moderacao/moderacao-comentario-service.ts'
import { createComentarioDecisaoModel } from '../../src/features/moderacao/comentario-decisao-model.ts'
import { validId } from '../../src/features/material/material-service.ts'
import { randomBytes } from 'node:crypto'
import { createMaterialMagnetAdicaoService } from '../../src/features/material/material-magnet-adicao-service.ts'
import { createMaterialMagnetAdicaoModel } from '../../src/features/material/material-magnet-adicao-model.ts'
import { createMaterialTorrentAdicaoService } from '../../src/features/material/material-torrent-adicao-service.ts'
import { createMaterialTorrentAdicaoModel } from '../../src/features/material/material-torrent-adicao-model.ts'
import { createInstituicaoService } from '../../src/features/instituicao/instituicao-service.ts'
import { createInstituicaoConsultaModel } from '../../src/features/instituicao/instituicao-consulta-model.ts'
import { createInstituicaoCadastroService } from '../../src/features/instituicao/instituicao-cadastro-service.ts'
import { createInstituicaoCadastroModel } from '../../src/features/instituicao/instituicao-cadastro-model.ts'

let phase = 'setup', model, magnetModel, torrentModel, institutionModel, institutionCreateModel
const status = expected => error => error instanceof ApiError && error.status === expected
try {
  let input = ''
  for await (const chunk of process.stdin) { input += chunk; assert.ok(input.length <= 16384) }
  const fixture = JSON.parse(input), url = new URL(fixture.apiBaseUrl)
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1'); assert.ok(Number(url.port) > 0)
  assert.equal(url.pathname, '/api/v1'); assert.equal(url.username + url.password + url.search + url.hash, '')
  assert.ok(validId(fixture.materialId)); assert.ok(validId(fixture.autor.id)); assert.ok(validId(fixture.equipe.id))
  assert.equal(fixture.autor.perfil, 'USUARIO'); assert.ok(['MODERADOR', 'ADMINISTRADOR'].includes(fixture.equipe.perfil))
  const materialId = fixture.materialId, root = `/materiais/${materialId}/comentarios`
  const http = createHttpClient(fixture.apiBaseUrl)
  function session(actor) {
    let token = actor.token
    const auth = createAuthenticatedClient(http, { getToken: () => token, rejectToken: used => { if (token === used) token = null } })
    const signal = value => value ? AbortSignal.any([value, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000)
    return { token: () => token,
      json: (path, options = {}) => auth.json(path, { ...options, signal: signal(options.signal) }),
      delete: (path, options = {}) => auth.delete(path, { ...options, signal: signal(options.signal) }),
      multipart: (path, options) => auth.multipart(path, { ...options, signal: signal(options.signal) }),
      torrent: (path, options = {}) => auth.torrent(path, { ...options, signal: signal(options.signal) }) }
  }
  const autor = session(fixture.autor), equipe = session(fixture.equipe)
  const comum = createComentarioService(autor.json, autor.delete), equipeComum = createComentarioService(equipe.json, equipe.delete)
  const service = createModeracaoComentarioService(equipe.json)
  model = createComentarioDecisaoModel(service, () => fixture.equipe, () => 'PUBLICADO')

  phase = 'auth'
  await assert.rejects(http.json(root + '/moderacao', { signal: AbortSignal.timeout(5000) }), status(401))
  await assert.rejects(createModeracaoComentarioService(autor.json).list(materialId), status(403))
  assert.ok(autor.token(), '403 nao encerra sessao')

  phase = 'instituicao'
  assert.ok(validId(fixture.instituicaoId))
  institutionModel = createInstituicaoConsultaModel(createInstituicaoService(autor.json), () => fixture.autor)
  await institutionModel.loadDetail(fixture.instituicaoId)
  const institution = institutionModel.getState().institution
  assert.equal(institution.id, fixture.instituicaoId); assert.deepEqual(Object.keys(institution), ['id', 'nome', 'sigla'])
  assert.deepEqual(await createInstituicaoService(equipe.json).detail(fixture.instituicaoId), institution)
  await assert.rejects(http.json(`/instituicoes/${fixture.instituicaoId}`, { signal: AbortSignal.timeout(5000) }), status(401))

  phase = 'instituicao-cadastro'
  const novo = fixture.novaInstituicao
  await assert.rejects(createInstituicaoCadastroService(autor.json).create(novo), status(403))
  const institutionCreateService = createInstituicaoCadastroService(equipe.json)
  institutionCreateModel = createInstituicaoCadastroModel(institutionCreateService, () => fixture.equipe)
  institutionCreateModel.initialize()
  if (fixture.equipe.perfil === 'ADMINISTRADOR') {
    institutionCreateModel.change('nome', '  ' + novo.nome + '  '); institutionCreateModel.change('sigla', '  ' + novo.sigla.toLowerCase() + '  ')
    await institutionCreateModel.submit()
    assert.ok(validId(institutionCreateModel.getState().savedId)); assert.deepEqual(institutionCreateModel.getState().draft, { nome: '', sigla: '' })
    const criado = await createInstituicaoService(equipe.json).detail(institutionCreateModel.getState().savedId)
    assert.equal(criado.nome, novo.nome); assert.equal(criado.sigla, novo.sigla)
    institutionCreateModel.initialize(); institutionCreateModel.change('nome', novo.nome); institutionCreateModel.change('sigla', novo.sigla)
    await institutionCreateModel.submit(); assert.equal(institutionCreateModel.getState().conflict, true); assert.equal(institutionCreateModel.getState().savedId, '')
  } else {
    assert.equal(institutionCreateModel.getState().denied, true)
    await assert.rejects(institutionCreateService.create(novo), status(403))
  }

  phase = 'adicao-magnets'
  const magnetService = createMaterialMagnetAdicaoService(autor.json)
  magnetModel = createMaterialMagnetAdicaoModel(magnetService, () => fixture.autor)
  await magnetModel.load(materialId)
  assert.equal(magnetModel.getState().material.status, 'PUBLICADO')
  magnetModel.changeUri(0, 'magnet:?xt=urn:btih:' + randomBytes(20).toString('hex'))
  magnetModel.setConfirmed(true); await magnetModel.submit()
  assert.equal(magnetModel.getState().savedId, materialId); assert.equal(magnetModel.getState().material, null)
  assert.deepEqual(magnetModel.getState().uris, [])
  const atualizado = await magnetService.load(materialId)
  assert.equal(atualizado.status, 'PENDENTE'); assert.equal(atualizado.magnets.length, 2)
  const publicado = await equipe.json(`/materiais/${materialId}/publicacao`, { method: 'POST' })
  assert.equal(publicado.status, 'PUBLICADO')

  phase = 'adicao-torrent'
  const torrentService = createMaterialTorrentAdicaoService(autor.json, autor.multipart)
  torrentModel = createMaterialTorrentAdicaoModel(torrentService, () => fixture.autor)
  await torrentModel.load(materialId)
  const name = randomBytes(12).toString('hex')
  const bytes = Buffer.concat([Buffer.from(`d4:infod6:lengthi1e4:name${name.length}:${name}12:piece lengthi16384e6:pieces20:`), Buffer.alloc(20), Buffer.from('ee')])
  torrentModel.selectFiles([new File([bytes], 'integracao.torrent', { type: 'application/x-bittorrent' })])
  torrentModel.setConfirmed(true); await torrentModel.submit()
  assert.equal(torrentModel.getState().savedId, materialId); assert.equal(torrentModel.getState().file, null)
  const comTorrent = await torrentService.load(materialId)
  assert.equal(comTorrent.status, 'PENDENTE'); assert.equal(comTorrent.torrents.length, 1); assert.equal(comTorrent.magnets.length, 2)
  assert.equal(comTorrent.torrents[0].id, torrentModel.getState().torrentId)
  const download = await autor.torrent(`/materiais/${materialId}/torrents/${torrentModel.getState().torrentId}`)
  assert.deepEqual(Buffer.from(await download.blob.arrayBuffer()), bytes)
  assert.equal((await equipe.json(`/materiais/${materialId}/publicacao`, { method: 'POST' })).status, 'PUBLICADO')

  phase = 'cadastro'
  const criado = await comum.create(materialId, '  Comentário integrado\n<script>somente texto</script>  ', fixture.autor.id)
  assert.equal(criado.status, 'ATIVO'); assert.equal(criado.conteudo, 'Comentário integrado\n<script>somente texto</script>')
  assert.equal((await comum.list(materialId)).content.length, 1)
  await assert.rejects(createModeracaoComentarioService(autor.json).hide(materialId, criado.id, 'Negativo de permissao'), status(403))
  assert.ok(autor.token())

  phase = 'cors'
  const headers = { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }
  const preflight = await fetch(fixture.apiBaseUrl + root + '/' + criado.id + '/reexibicao', { method: 'OPTIONS', headers, signal: AbortSignal.timeout(5000), redirect: 'error' })
  assert.equal(preflight.status, 200); assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null); assert.equal(preflight.headers.get('set-cookie'), null)
  const allowed = preflight.headers.get('access-control-allow-headers')?.toLowerCase() ?? ''
  assert.ok(allowed.includes('authorization') && allowed.includes('content-type')); await preflight.body?.cancel()
  const denied = await fetch(fixture.apiBaseUrl + root + '/' + criado.id + '/reexibicao', { method: 'OPTIONS', headers: { ...headers, Origin: 'http://localhost:5174' }, signal: AbortSignal.timeout(5000), redirect: 'error' })
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null); await denied.body?.cancel()

  async function decide(kind, id) {
    if (kind === 'ocultacao') model.openHide(id); else model.openReveal(id)
    assert.equal(model.getState().kind, kind); assert.equal(model.getState().target.id, id)
    assert.equal(model.getState().read.data, null)
    model.setMotivo('  Decisão integrada com motivo\nTexto simples  '); model.setConfirmed(true)
    await model.submit()
    const state = model.getState()
    assert.equal(state.panel, false); assert.equal(state.read.denied, false); assert.equal(state.read.error, '')
    assert.ok(state.notice); assert.equal(state.target, null); assert.equal(state.motivo, ''); assert.equal(state.confirmed, false)
  }
  phase = 'ocultacao'
  await model.load(materialId); await decide('ocultacao', criado.id)
  assert.equal(model.getState().read.data.content[0].status, 'OCULTO')
  assert.equal((await comum.list(materialId)).content.length, 0)
  let historico = await service.history(materialId, criado.id)
  assert.equal(historico.content.length, 1); assert.equal(historico.content[0].estadoNovo, 'OCULTO')
  assert.equal(historico.content[0].responsavelId, fixture.equipe.id)
  assert.equal(historico.content[0].motivo, 'Decisão integrada com motivo\nTexto simples')
  assert.equal('conteudo' in historico.content[0], false)

  phase = 'reexibicao'
  await decide('reexibicao', criado.id)
  assert.equal((await comum.list(materialId)).content[0].id, criado.id)
  historico = await service.history(materialId, criado.id)
  assert.deepEqual(historico.content.map(x => [x.estadoAnterior, x.estadoNovo]), [['ATIVO', 'OCULTO'], ['OCULTO', 'ATIVO']])
  await assert.rejects(service.reveal(materialId, criado.id, 'Repeticao invalida'), status(409))
  assert.equal((await service.history(materialId, criado.id)).content.length, 2)

  phase = 'comentario-proprio'
  const proprio = await equipeComum.create(materialId, 'Comentário próprio da equipe', fixture.equipe.id)
  await model.reload(); await decide('ocultacao', proprio.id); await decide('reexibicao', proprio.id)
  assert.equal((await service.history(materialId, proprio.id)).content.length, 2)

  phase = 'material-privado'
  await decide('ocultacao', criado.id)
  await equipe.json(`/materiais/${materialId}/bloqueio`, { method: 'POST' })
  // Simula outra aba: o modelo conserva PUBLICADO observado; o Spring precisa negar a transicao.
  model.openReveal(criado.id); model.setMotivo('Material mudou em outra aba'); model.setConfirmed(true); await model.submit()
  assert.equal(model.getState().mustReload, true); assert.equal(model.getState().target, null); assert.equal(model.getState().notice, '')
  assert.equal((await service.history(materialId, criado.id)).content.length, 3)
  await assert.rejects(comum.list(materialId), status(404))

  phase = 'remocao-historico'
  await model.closeDecision(); await model.openHistory(criado.id)
  assert.equal(model.getState().read.mode, 'history')
  await comum.remove(materialId, criado, fixture.autor.id)
  await model.reload()
  assert.equal(model.getState().read.data.content.length, 3); assert.equal(model.getState().read.selectedId, criado.id)
  assert.equal(JSON.stringify(model.getState()).includes(criado.conteudo), false)
  await model.closeHistory()
  assert.equal(model.getState().read.data.content.some(x => x.id === criado.id), false)
  await assert.rejects(service.reveal(materialId, criado.id, 'Nao restaurar removido'), status(409))
  assert.equal((await service.history(materialId, criado.id)).content.length, 3)

  process.stdout.write(JSON.stringify({ ok: true }))
} catch {
  // Somente marcador fixo de etapa; nunca stack, body, JWT ou dados da fixture em stdout/stderr.
  process.stdout.write(JSON.stringify({ ok: false, phase })); process.exitCode = 1
} finally { model?.dispose(); magnetModel?.dispose(); torrentModel?.dispose(); institutionModel?.dispose(); institutionCreateModel?.dispose() }
