import { ApiError } from '../../shared/http/client.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { validId } from '../material/material-service.ts'
import { parseInstituicao, type Instituicao } from '../instituicao/instituicao-service.ts'
import { parseCurso, type Curso } from './curso-service.ts'

export type CursoDeleteRequest = (path: string, options?: { signal?: AbortSignal }) => Promise<void>

export function createCursoExclusaoService(request: CatalogRequest, deleteRequest: CursoDeleteRequest) {
  return {
    async load(instituicaoId: string, id: string, signal?: AbortSignal): Promise<{ curso: Curso; instituicao: Instituicao }> {
      if (!validId(instituicaoId) || !validId(id)) throw new TypeError('Curso ou instituição inválidos.')
      instituicaoId = instituicaoId.toLowerCase(); id = id.toLowerCase()
      const raw = await request(`/cursos/${id}`, { signal })
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError('protocol')
      const course = parseCurso(raw, instituicaoId)
      if (course.id !== id) throw new ApiError('protocol')
      const institutionRaw = await request(`/instituicoes/${instituicaoId}`, { signal })
      const institution = parseInstituicao(institutionRaw)
      if (institution.id !== instituicaoId) throw new ApiError('protocol')
      return { curso: course, instituicao: institution }
    },
    async remove(id: string, signal?: AbortSignal): Promise<void> {
      if (!validId(id)) throw new TypeError('Curso inválido.')
      await deleteRequest(`/cursos/${id.toLowerCase()}`, { signal })
    },
  }
}
export type CursoExclusaoService = ReturnType<typeof createCursoExclusaoService>
