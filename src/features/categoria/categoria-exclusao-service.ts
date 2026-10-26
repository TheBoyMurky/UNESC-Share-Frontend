import { ApiError } from '../../shared/http/client.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { validId } from '../material/material-service.ts'
import { parseCategoria, type Categoria } from './categoria-service.ts'

export type CategoriaDeleteRequest = (path: string, options?: { signal?: AbortSignal }) => Promise<void>

export function createCategoriaExclusaoService(request: CatalogRequest, deleteRequest: CategoriaDeleteRequest) {
  return {
    async load(id: string, signal?: AbortSignal): Promise<Categoria> {
      if (!validId(id)) throw new TypeError('Categoria inválida.')
      id = id.toLowerCase()
      const categoria = parseCategoria(await request(`/categorias/${id}`, { signal }))
      if (categoria.id !== id) throw new ApiError('protocol')
      return categoria
    },
    async remove(id: string, signal?: AbortSignal): Promise<void> {
      if (!validId(id)) throw new TypeError('Categoria inválida.')
      await deleteRequest(`/categorias/${id.toLowerCase()}`, { signal })
    },
  }
}

export type CategoriaExclusaoService = ReturnType<typeof createCategoriaExclusaoService>
