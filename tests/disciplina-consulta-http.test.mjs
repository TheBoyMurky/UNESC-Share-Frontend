import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createHttpClient } from '../src/shared/http/client.ts'
import { createAuthenticatedClient } from '../src/features/auth/authenticated-client.ts'
import { createInstituicaoService } from '../src/features/instituicao/instituicao-service.ts'
import { createCursoService } from '../src/features/curso/curso-service.ts'
import { createDisciplinaService } from '../src/features/disciplina/disciplina-service.ts'
import { createDisciplinaConsultaModel } from '../src/features/disciplina/disciplina-consulta-model.ts'
import { id, page } from './catalog-fixtures.mjs'

test('HTTP lista disciplinas do curso com Bearer, DTO enxuto e 403 sem logout', { timeout: 10000 }, async context => {
  const institutionId = id(1), courseId = id(2), credential = 'test.user.signature', item = { id: id(3), nome: 'Algoritmos e Programação', descricao: null, codigo: 'CCO100', cursoId: courseId, segredo: 'PRIVADO' }, requests = []
  let responseStatus = 200
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost'); requests.push(url)
    assert.equal(request.method, 'GET'); assert.equal(request.headers.authorization, 'Bearer ' + credential); assert.equal(request.headers.cookie, undefined)
    response.setHeader('Content-Type', 'application/json')
    if (url.pathname === `/api/v1/instituicoes/${institutionId}`) { response.writeHead(200); response.end(JSON.stringify({ id: institutionId, nome: 'UNESC', sigla: 'UNESC' })); return }
    if (url.pathname === `/api/v1/cursos/${courseId}`) { response.writeHead(200); response.end(JSON.stringify({ id: courseId, nome: 'Ciência da Computação', descricao: null, instituicaoId: institutionId })); return }
    assert.equal(url.pathname, '/api/v1/disciplinas'); assert.equal(url.searchParams.get('cursoId'), courseId)
    response.writeHead(responseStatus); response.end(responseStatus === 200 ? JSON.stringify(page([item], Number(url.searchParams.get('page')), Number(url.searchParams.get('size')), 1)) : JSON.stringify({ detail: 'PRIVADO' }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); context.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  let currentToken = credential; const rejected = [], client = createHttpClient(`http://127.0.0.1:${server.address().port}/api/v1`)
  const authenticated = createAuthenticatedClient(client, { getToken: () => currentToken, rejectToken: used => { rejected.push(used); if (currentToken === used) currentToken = null } })
  const model = createDisciplinaConsultaModel(createDisciplinaService(authenticated.json), createCursoService(authenticated.json), createInstituicaoService(authenticated.json), () => currentToken ? { id: id(8), perfil: 'USUARIO' } : null)
  model.load(institutionId, courseId); for (let i = 0; i < 100 && model.getState().loading; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.deepEqual(model.getState().data.content.map(({ id: key, nome, codigo }) => ({ id: key, nome, codigo })), [{ id: id(3), nome: item.nome, codigo: item.codigo }])
  assert.deepEqual([...requests.at(-1).searchParams.keys()], ['page', 'size', 'cursoId']); assert.equal(JSON.stringify(model.getState()).includes('PRIVADO'), false)
  responseStatus = 403; model.reload(); for (let i = 0; i < 100 && model.getState().loading; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(model.getState().unavailable, true); assert.equal(model.getState().data, null); assert.deepEqual(rejected, []); assert.equal(currentToken, credential)
  model.dispose()
})
