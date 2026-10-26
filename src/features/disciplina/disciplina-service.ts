import { ApiError } from '../../shared/http/client.ts'
import { pagination, parsePage, type Page } from '../../shared/http/page.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { validId } from '../material/material-service.ts'

export interface Disciplina { id: string; nome: string; descricao: string | null; codigo: string; cursoId: string }
export function parseDisciplina(value: unknown, cursoId: string): Disciplina {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  const dto = value as Record<string, unknown>
  const text = (input: unknown, limit: number): input is string => typeof input === 'string' && !!input.trim() && input.length <= limit && !input.includes('\u0000')
  if (!validId(dto.id) || !text(dto.nome, 150)
    || !(dto.descricao === null || typeof dto.descricao === 'string' && dto.descricao.length <= 1000 && !dto.descricao.includes('\u0000'))
    || !text(dto.codigo, 30) || !validId(dto.cursoId) || dto.cursoId.toLowerCase() !== cursoId) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), nome: dto.nome, descricao: dto.descricao as string | null, codigo: dto.codigo, cursoId }
}

export function createDisciplinaService(request: CatalogRequest) {
  return {
    async list(cursoId: string, number = 0, size = 20, signal?: AbortSignal): Promise<Page<Disciplina>> {
      if (!validId(cursoId)) throw new TypeError('Curso inválido.')
      const parent = cursoId.toLowerCase(), params = pagination(number, size)
      params.set('cursoId', parent)
      const page = parsePage(await request(`/disciplinas?${params.toString()}`, { signal }), value => parseDisciplina(value, parent), number, size)
      if (new Set(page.content.map(item => item.id)).size !== page.content.length) throw new ApiError('protocol')
      if (page.content.length && (number >= page.page.totalPages || page.content.length > page.page.totalElements - number * size)) throw new ApiError('protocol')
      return page
    },
  }
}
export type DisciplinaService = ReturnType<typeof createDisciplinaService>
