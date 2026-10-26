import { ApiError } from '../../shared/http/client.ts'
import { pagination, parsePage } from '../../shared/http/page.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { validId } from '../material/material-service.ts'

export interface Instituicao { id: string; nome: string; sigla: string }
export function parseInstituicao(value: unknown): Instituicao {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  const dto = value as Record<string, unknown>
  const text = (input: unknown, max: number): input is string => typeof input === 'string' && !!input.trim() && input.length <= max && !input.includes('\u0000')
  if (!validId(dto.id) || !text(dto.nome, 180) || !text(dto.sigla, 30)) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), nome: dto.nome, sigla: dto.sigla }
}
export function createInstituicaoService(request: CatalogRequest) {
  return {
    async list(number = 0, size = 20, signal?: AbortSignal) {
      const params = pagination(number, size)
      const data = parsePage(await request(`/instituicoes?${params.toString()}`, { signal }), parseInstituicao, number, size)
      if (new Set(data.content.map(item => item.id)).size !== data.content.length) throw new ApiError('protocol')
      if (data.content.length && (number >= data.page.totalPages || data.content.length > data.page.totalElements - number * size)) throw new ApiError('protocol')
      return data
    },
    async detail(id: string, signal?: AbortSignal) {
      if (!validId(id)) throw new TypeError('Instituição inválida.')
      id = id.toLowerCase()
      const dto = parseInstituicao(await request(`/instituicoes/${id}`, { signal }))
      if (dto.id !== id) throw new ApiError('protocol')
      return dto
    },
  }
}
export type InstituicaoService = ReturnType<typeof createInstituicaoService>
