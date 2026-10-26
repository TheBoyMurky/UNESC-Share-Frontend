import { ApiError } from '../../shared/http/client.ts'
import { pagination, parsePage, type Page } from '../../shared/http/page.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { validId } from '../material/material-service.ts'

export interface Curso { id: string; nome: string; descricao: string | null; instituicaoId: string }
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  return value as Record<string, unknown>
}
export function parseCurso(value: unknown, instituicaoId: string): Curso {
  const dto = record(value)
  const validText = (text: unknown, limit: number) => typeof text === 'string' && !!text.trim() && text.length <= limit && !text.includes('\u0000')
  if (!validId(dto.id) || !validText(dto.nome, 150) || !(dto.descricao === null || typeof dto.descricao === 'string' && dto.descricao.length <= 1000 && !dto.descricao.includes('\u0000'))
    || !validId(dto.instituicaoId) || dto.instituicaoId.toLowerCase() !== instituicaoId) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), nome: dto.nome as string, descricao: dto.descricao as string | null, instituicaoId }
}
export function createCursoService(request: CatalogRequest) {
  return {
    async detail(id: string, signal?: AbortSignal): Promise<Curso> {
      if (!validId(id)) throw new TypeError('Curso inválido.')
      id = id.toLowerCase()
      const dto = record(await request(`/cursos/${id}`, { signal }))
      if (!validId(dto.instituicaoId)) throw new ApiError('protocol')
      const course = parseCurso(dto, dto.instituicaoId.toLowerCase())
      if (course.id !== id) throw new ApiError('protocol')
      return course
    },
    async list(instituicaoId: string, number = 0, size = 20, signal?: AbortSignal): Promise<Page<Curso>> {
      if (!validId(instituicaoId)) throw new TypeError('Instituição inválida.')
      const parent = instituicaoId.toLowerCase(), params = pagination(number, size)
      params.set('instituicaoId', parent)
      const data = parsePage(await request(`/cursos?${params.toString()}`, { signal }), value => parseCurso(value, parent), number, size)
      if (new Set(data.content.map(course => course.id)).size !== data.content.length) throw new ApiError('protocol')
      if (data.content.length && (number >= data.page.totalPages || data.content.length > data.page.totalElements - number * size)) throw new ApiError('protocol')
      return data
    },
  }
}
export type CursoService = ReturnType<typeof createCursoService>
