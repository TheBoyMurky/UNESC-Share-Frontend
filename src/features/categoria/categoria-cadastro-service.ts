import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'
import { parseCategoria, type Categoria } from './categoria-service.ts'

export interface CategoriaInput { nome: string; descricao: string }
export type CategoriaFields = Partial<Record<keyof CategoriaInput, string>>
export interface CategoriaCadastroBody { nome: string; descricao: string | null }

export const normalizeCategoria = (input: CategoriaInput): CategoriaCadastroBody => {
  const nome = input.nome.trim(), descricao = input.descricao.trim()
  return { nome, descricao: descricao || null }
}

export function validateCategoria(input: CategoriaInput): CategoriaFields {
  const fields: CategoriaFields = {}
  if (!input.nome.trim() || input.nome.trim().length > 80 || input.nome.includes('\u0000')) fields.nome = 'Informe um nome com até 80 caracteres.'
  if (input.descricao.trim().length > 500 || input.descricao.includes('\u0000')) fields.descricao = 'A descrição deve ter até 500 caracteres.'
  return fields
}

export function createCategoriaCadastroService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  return {
    async create(input: CategoriaInput, signal?: AbortSignal): Promise<{ id: string }> {
      if (Object.keys(validateCategoria(input)).length) throw new TypeError('Confira nome e descrição da categoria.')
      const body = normalizeCategoria(input)
      const categoria: Categoria = parseCategoria(await request('/categorias', { method: 'POST', json: body, signal }))
      if (categoria.nome !== body.nome || categoria.descricao !== body.descricao || !validId(categoria.id)) throw new ApiError('protocol')
      return { id: categoria.id }
    },
  }
}

export type CategoriaCadastroService = ReturnType<typeof createCategoriaCadastroService>
