import { ApiError } from '../../shared/http/client.ts'
import { pagination, parsePage, type Page } from '../../shared/http/page.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { validId } from '../material/material-service.ts'

export interface Categoria { id: string; nome: string; descricao: string | null }

export function parseCategoria(value: unknown): Categoria {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  const dto = value as Record<string, unknown>
  const text = (input: unknown, max: number) => typeof input === 'string' && !!input.trim() && input.length <= max && !input.includes('\u0000')
  if (!validId(dto.id) || !text(dto.nome, 80)
    || !(dto.descricao === null || text(dto.descricao, 500))) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), nome: dto.nome as string, descricao: dto.descricao as string | null }
}

export function createCategoriaService(request: CatalogRequest) {
  return {
    async list(number = 0, size = 20, signal?: AbortSignal): Promise<Page<Categoria>> {
      const params = pagination(number, size)
      const data = parsePage(await request(`/categorias?${params.toString()}`, { signal }), parseCategoria, number, size)
      if (new Set(data.content.map(item => item.id)).size !== data.content.length) throw new ApiError('protocol')
      if (data.content.length && (number >= data.page.totalPages || data.content.length > data.page.totalElements - number * size)) throw new ApiError('protocol')
      return data
    },
    async detail(id: string, signal?: AbortSignal): Promise<Categoria> {
      if (!validId(id)) throw new TypeError('Categoria inválida.')
      id = id.toLowerCase()
      const categoria = parseCategoria(await request(`/categorias/${id}`, { signal }))
      if (categoria.id !== id) throw new ApiError('protocol')
      return categoria
    },
  }
}

export type CategoriaService = ReturnType<typeof createCategoriaService>
