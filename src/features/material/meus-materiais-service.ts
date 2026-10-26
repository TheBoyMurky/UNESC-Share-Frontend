import { ApiError } from '../../shared/http/client.ts'
import { pagination, parsePage, type Page } from '../../shared/http/page.ts'
import type { CatalogRequest, MaterialSummary } from '../catalogo/catalog-service.ts'
import { validId, type MaterialStatus } from './material-service.ts'

export const materialStates: MaterialStatus[] = ['PENDENTE', 'PUBLICADO', 'BLOQUEADO', 'REMOVIDO']
export const materialStateLabels: Record<MaterialStatus, string> = { PENDENTE: 'Pendente', PUBLICADO: 'Publicado', BLOQUEADO: 'Bloqueado', REMOVIDO: 'Removido' }
export interface OwnFilters { q: string; status: '' | MaterialStatus }
export type OwnMaterialSummary = Omit<MaterialSummary, 'status'> & { status: MaterialStatus }

export function ownMaterialsPath(filters: OwnFilters, number = 0, size = 20) {
  const params = pagination(number, size), q = filters.q.trim()
  if (q.length > 200) throw new TypeError('A busca deve ter no máximo 200 caracteres.')
  if (filters.status && !materialStates.includes(filters.status)) throw new TypeError('Estado de material inválido.')
  if (q) params.set('q', q)
  if (filters.status) params.set('status', filters.status)
  // A identidade e derivada exclusivamente do JWT no servidor; nao aceitar usuarioId/sort extras.
  return '/materiais/meus?' + params.toString()
}

export function createOwnMaterialsService(request: CatalogRequest) {
  async function search(filters: OwnFilters, number = 0, size = 20, signal?: AbortSignal): Promise<Page<OwnMaterialSummary>> {
    const result = await request(ownMaterialsPath(filters, number, size), { signal })
    return parsePage(result, value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
      const data = value as Record<string, unknown>
      if (!validId(data.id) || typeof data.titulo !== 'string' || !data.titulo.trim()
        || !materialStates.some(status => status === data.status) || (filters.status && data.status !== filters.status)
        || !validId(data.usuarioId) || !validId(data.disciplinaId) || !validId(data.categoriaId)
        || !Number.isSafeInteger(data.visualizacoes) || (data.visualizacoes as number) < 0
        || typeof data.dataCadastro !== 'string' || !Number.isFinite(Date.parse(data.dataCadastro))) throw new ApiError('protocol')
      return { id: data.id, titulo: data.titulo, status: data.status as MaterialStatus, usuarioId: data.usuarioId,
        disciplinaId: data.disciplinaId, categoriaId: data.categoriaId, dataCadastro: data.dataCadastro, visualizacoes: data.visualizacoes as number }
    }, number, size)
  }
  return { search }
}
export type OwnMaterialsService = ReturnType<typeof createOwnMaterialsService>
