import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createDenunciaService } from '../src/features/denuncia/denuncia-service.ts'
import { createDenunciaCadastroModel } from '../src/features/denuncia/denuncia-cadastro-model.ts'
import { createDenunciaConsultaModel } from '../src/features/denuncia/denuncia-consulta-model.ts'
import { id } from './catalog-fixtures.mjs'
import { detail } from './material-fixtures.mjs'

test('HTTP sintetico: POSTmotivo-descricao, consultasJWTproprias/paginas/estados/privado,409/incerto e ausencia de replay', { timeout: 10000 }, async context => {
  const credential = 'header.payload.signature', otherCredential = 'header.other.signature', secret = 'CORPO PRIVADO NAO ECOAR'
  let rows = [], posts = 0, materialReads = 0, published = true, mode = 201, sequence = 100
  const makeRow = (changes = {}) => ({ id: id(++sequence), motivo: 'LINK_INVALIDO', descricao: 'Relato sintético\n<b>Texto literal</b>', status: 'PENDENTE', dataCadastro: '2026-10-23T12:00:00Z', materialId: id(10), owner: id(8), ...changes })
  const dto = row => { const { owner, ...data } = row; return { ...data, email: secret, usuarioId: owner, tituloMaterial: secret } }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'), root = '/api/v1', user = request.headers.authorization === 'Bearer ' + credential ? id(8) : id(7)
    assert.ok([credential, otherCredential].some(token => request.headers.authorization === 'Bearer ' + token)); assert.equal(request.headers.cookie, undefined)
    const json = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', Location: 'https://invalid.example/ignore-location' }); response.end(JSON.stringify(body)) }
    if (request.method === 'GET') {
      if (url.pathname === root + '/materiais/' + id(10)) { materialReads++; assert.equal(url.search, ''); json(200, { ...detail(), status: published ? 'PUBLICADO' : 'BLOQUEADO' }); return }
      if (url.pathname === root + '/denuncias/minhas') {
        assert.deepEqual([...url.searchParams.keys()], ['page', 'size'])
        const number = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('size')), own = rows.filter(row => row.owner === user)
        json(200, { content: own.slice(number * size, (number + 1) * size).map(dto), page: { number, size, totalElements: own.length, totalPages: Math.ceil(own.length / size) } }); return
      }
      assert.ok(url.pathname.startsWith(root + '/denuncias/')); assert.equal(url.search, '')
      const found = rows.find(row => row.id === url.pathname.split('/').at(-1) && row.owner === user)
      json(found ? 200 : 404, found ? dto(found) : { title: secret, detail: secret }); return
    }
    assert.equal(request.method, 'POST'); assert.equal(url.pathname, root + '/materiais/' + id(10) + '/denuncias'); assert.equal(url.search, ''); assert.equal(request.headers['content-type'], 'application/json')
    let text = ''; for await (const chunk of request) text += chunk
    const input = JSON.parse(text); assert.deepEqual(Object.keys(input), ['motivo', 'descricao']); assert.equal(input.descricao, input.descricao.trim()); posts++
    if (!published) { json(404, { detail: secret }); return }
    if (rows.some(row => row.owner === user && row.materialId === id(10) && ['PENDENTE', 'EM_ANALISE'].includes(row.status))) { json(409, { detail: secret }); return }
    const row = makeRow({ owner: user, ...input })
    if ([201, 503, 'lost', 'malformed', 'wrongdto'].includes(mode)) rows.push(row)
    if (mode === 'lost') { response.destroy(); return }
    if (mode === 'malformed') { response.writeHead(201, { 'Content-Type': 'application/json' }); response.end('{broken'); return }
    if (mode === 'wrongdto') { json(201, dto({ ...row, materialId: id(11) })); return }
    json(mode, mode === 201 ? dto(row) : { title: secret, detail: secret, errors: [{ field: 'descricao', message: secret, rejectedValue: secret }] })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  let token = credential, rejected = []
  const authenticated = createAuthenticatedClient(client, { getToken: () => token, rejectToken: used => { rejected.push(used); token = null } })
  const service = createDenunciaService(authenticated.json)
  const createModel = () => createDenunciaCadastroModel(service, () => token ? id(8) : null)
  const cadastro = createModel(); await cadastro.load(id(10)); cadastro.changeField('motivo', 'OUTRO'); cadastro.changeField('descricao', ' Relato próprio\n')
  await cadastro.submit(); assert.equal(posts, 1); assert.equal(cadastro.getState().createdId, rows[0].id); assert.deepEqual(cadastro.getState().draft, { motivo: '', descricao: '' })
  const created = rows[0]; cadastro.dispose()
  const duplicate = createModel(); await duplicate.load(id(10)); duplicate.changeField('motivo', 'SPAM'); duplicate.changeField('descricao', 'Outro motivo'); await duplicate.submit(); assert.equal(duplicate.getState().blocked, 'conflict'); assert.equal(rows.length, 1); duplicate.dispose()
  created.status = 'PROCEDENTE'
  const again = createModel(); await again.load(id(10)); again.changeField('motivo', 'SPAM'); again.changeField('descricao', 'Novo relato'); await again.submit(); assert.notEqual(again.getState().createdId, created.id); assert.equal(rows.length, 2); again.dispose()
  rows = Array.from({ length: 21 }, (_, n) => makeRow({ status: ['PENDENTE', 'EM_ANALISE', 'PROCEDENTE', 'IMPROCEDENTE'][n % 4] }))
  const otherReport = makeRow({ owner: id(7) }); rows.push(otherReport); const beforeReads = materialReads
  const consulta = createDenunciaConsultaModel(service, () => token ? id(8) : null)
  await consulta.loadList(); assert.equal(consulta.getState().data.page.totalElements, 21); assert.equal(consulta.getState().data.content.length, 20)
  assert.equal(JSON.stringify(consulta.getState()).includes(secret), false); assert.equal('descricao' in consulta.getState().data.content[0], false)
  await consulta.goToPage(1); assert.equal(consulta.getState().data.content.length, 1); published = false
  await consulta.loadDetail(rows[0].id); assert.equal(consulta.getState().report.descricao, rows[0].descricao); assert.equal(materialReads, beforeReads)
  await consulta.loadDetail(otherReport.id); assert.equal(consulta.getState().report, null); assert.ok(consulta.getState().error); assert.equal(JSON.stringify(consulta.getState()).includes(secret), false)
  consulta.dispose()
  const other = createAuthenticatedClient(client, { getToken: () => otherCredential, rejectToken: () => assert.fail() })
  const ownB = await createDenunciaService(other.json).list(); assert.equal(ownB.page.totalElements, 1); assert.equal(ownB.content[0].id, otherReport.id)
  const privateForm = createModel(); const postCount = posts; await privateForm.load(id(10)); privateForm.changeField('motivo', 'OUTRO'); await privateForm.submit(); assert.equal(posts, postCount); assert.equal(privateForm.getState().unavailable, true); privateForm.dispose()
  for (const next of [400, 401, 403, 404, 409, 503, 'lost', 'malformed', 'wrongdto']) {
    rows = []; published = true; mode = next; token = credential; rejected = []
    const instance = createModel(); await instance.load(id(10)); instance.changeField('motivo', 'LINK_INVALIDO'); instance.changeField('descricao', 'Relato de teste')
    const before = posts; await instance.submit(); assert.equal(posts, before + 1); assert.equal(JSON.stringify(instance.getState()).includes(secret), false)
    assert.deepEqual(rejected, next === 401 ? [credential] : [])
    if ([409, 503, 'lost', 'malformed', 'wrongdto'].includes(next)) {
      await instance.submit(); await instance.retry(); assert.equal(posts, before + 1); assert.ok(instance.getState().blocked)
      const own = await service.list(); assert.equal(own.page.totalElements, next === 409 ? 0 : 1)
    }
    instance.dispose()
  }
})
