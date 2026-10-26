import { ApiError } from '../../shared/http/client.ts'
import { pagination, parsePage, type Page } from '../../shared/http/page.ts'
export type { Page, PageInfo } from '../../shared/http/page.ts'

export interface Option { id: string; nome: string; complemento?: string }
export interface Filters { q: string; instituicaoId: string; cursoId: string; disciplinaId: string; categoriaId: string }
export interface MaterialSummary {
  id: string; titulo: string; status: 'PUBLICADO'; dataCadastro: string; visualizacoes: number
  usuarioId: string; disciplinaId: string; categoriaId: string
}
export type SelectorKind = 'instituicoes' | 'cursos' | 'disciplinas' | 'categorias'
export type CatalogRequest = (path: string, options?: { signal?: AbortSignal }) => Promise<unknown>
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const id = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  return value as Record<string, unknown>
}

export function materialSearchPath(filters: Filters, number = 0, size = 20): string {
  const params = pagination(number, size)
  const q = filters.q.trim()
  if (q.length > 200) throw new TypeError('A busca deve ter no máximo 200 caracteres.')
  if (q) params.set('q', q)
  for (const key of ['instituicaoId', 'cursoId', 'disciplinaId', 'categoriaId'] as const) {
    if (filters[key]) {
      if (!id(filters[key])) throw new TypeError('Filtro acadêmico inválido.')
      params.set(key, filters[key])
    }
  }
  return '/materiais?' + params.toString()
}

export function createCatalogService(request: CatalogRequest) {
  async function options(kind: SelectorKind, parent = '', number = 0, signal?: AbortSignal): Promise<Page<Option>> {
    const params = pagination(number, 100)
    if (kind === 'cursos' || kind === 'disciplinas') {
      if (!id(parent)) throw new TypeError('Selecione o vínculo acadêmico anterior.')
      params.set(kind === 'cursos' ? 'instituicaoId' : 'cursoId', parent)
    }
    const result = await request('/' + kind + '?' + params.toString(), { signal })
    return parsePage(result, value => {
      const data = record(value)
      if (!id(data.id) || !text(data.nome)) throw new ApiError('protocol')
      if (kind === 'cursos' && data.instituicaoId !== parent) throw new ApiError('protocol')
      if (kind === 'disciplinas' && (data.cursoId !== parent || !text(data.codigo))) throw new ApiError('protocol')
      if (kind === 'instituicoes' && !text(data.sigla)) throw new ApiError('protocol')
      return { id: data.id, nome: data.nome,
        complemento: kind === 'instituicoes' ? data.sigla as string : kind === 'disciplinas' ? data.codigo as string : undefined }
    }, number, 100)
  }

  async function search(filters: Filters, number = 0, size = 20, signal?: AbortSignal): Promise<Page<MaterialSummary>> {
    const result = await request(materialSearchPath(filters, number, size), { signal })
    return parsePage(result, value => {
      const data = record(value)
      if (!id(data.id) || !text(data.titulo) || data.status !== 'PUBLICADO' || !id(data.usuarioId)
        || !id(data.disciplinaId) || !id(data.categoriaId) || !integer(data.visualizacoes)
        || typeof data.dataCadastro !== 'string' || !Number.isFinite(Date.parse(data.dataCadastro))) throw new ApiError('protocol')
      return { id: data.id, titulo: data.titulo, status: 'PUBLICADO', usuarioId: data.usuarioId,
        disciplinaId: data.disciplinaId, categoriaId: data.categoriaId, visualizacoes: data.visualizacoes, dataCadastro: data.dataCadastro }
    }, number, size)
  }
  return { options, search }
}

export type CatalogService = ReturnType<typeof createCatalogService>
