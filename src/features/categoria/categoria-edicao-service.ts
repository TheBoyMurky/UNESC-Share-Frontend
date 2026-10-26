import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'
import { normalizeCategoria, validateCategoria, type CategoriaInput } from './categoria-cadastro-service.ts'
import { parseCategoria } from './categoria-service.ts'

export function createCategoriaEdicaoService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  return {
    async detail(id: string, signal?: AbortSignal) {
      if (!validId(id)) throw new TypeError('Categoria inválida.')
      id = id.toLowerCase()
      const categoria = parseCategoria(await request(`/categorias/${id}`, { signal }))
      if (categoria.id !== id) throw new ApiError('protocol')
      return categoria
    },
    async update(id: string, input: CategoriaInput, signal?: AbortSignal): Promise<{ id: string }> {
      if (!validId(id)) throw new TypeError('Categoria inválida.')
      if (Object.keys(validateCategoria(input)).length) throw new TypeError('Confira nome e descrição da categoria.')
      id = id.toLowerCase()
      const body = normalizeCategoria(input)
      const categoria = parseCategoria(await request(`/categorias/${id}`, { method: 'PUT', json: body, signal }))
      if (categoria.id !== id || categoria.nome !== body.nome || categoria.descricao !== body.descricao) throw new ApiError('protocol')
      return { id }
    },
  }
}

export type CategoriaEdicaoService = ReturnType<typeof createCategoriaEdicaoService>
