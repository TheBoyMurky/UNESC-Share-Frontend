import { ApiError } from '../../shared/http/client.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { validId } from '../material/material-service.ts'
import { parseCurso, type Curso } from '../curso/curso-service.ts'
import { parseInstituicao, type Instituicao } from '../instituicao/instituicao-service.ts'
import { parseDisciplina, type Disciplina } from './disciplina-service.ts'

export type DisciplinaDeleteRequest = (path: string, options?: { signal?: AbortSignal }) => Promise<void>

export function createDisciplinaExclusaoService(request: CatalogRequest, deleteRequest: DisciplinaDeleteRequest) {
  return {
    async load(instituicaoId: string, cursoId: string, id: string, signal?: AbortSignal): Promise<{ instituicao: Instituicao; curso: Curso; disciplina: Disciplina }> {
      if (!validId(instituicaoId) || !validId(cursoId) || !validId(id)) throw new TypeError('Instituição, curso ou disciplina inválidos.')
      instituicaoId = instituicaoId.toLowerCase(); cursoId = cursoId.toLowerCase(); id = id.toLowerCase()
      const [institutionRaw, courseRaw, disciplineRaw] = await Promise.all([
        request(`/instituicoes/${instituicaoId}`, { signal }), request(`/cursos/${cursoId}`, { signal }), request(`/disciplinas/${id}`, { signal }),
      ])
      const institution = parseInstituicao(institutionRaw), course = parseCurso(courseRaw, instituicaoId), discipline = parseDisciplina(disciplineRaw, cursoId)
      if (institution.id !== instituicaoId || course.id !== cursoId || course.instituicaoId !== instituicaoId || discipline.id !== id || discipline.cursoId !== cursoId) throw new ApiError('protocol')
      return { instituicao: institution, curso: course, disciplina: discipline }
    },
    async remove(id: string, signal?: AbortSignal): Promise<void> {
      if (!validId(id)) throw new TypeError('Disciplina inválida.')
      await deleteRequest(`/disciplinas/${id.toLowerCase()}`, { signal })
    },
  }
}
export type DisciplinaExclusaoService = ReturnType<typeof createDisciplinaExclusaoService>
