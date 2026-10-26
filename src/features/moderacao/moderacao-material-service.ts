import { ApiError } from '../../shared/http/client.ts'
import { pagination, parsePage } from '../../shared/http/page.ts'
import { validId } from '../material/material-service.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'

export interface MaterialPendente { id: string; titulo: string; status: 'PENDENTE'; dataCadastro: string; visualizacoes: number }

export function createModeracaoMaterialService(request: CatalogRequest) {
  return {
    async list(number = 0, size = 20, signal?: AbortSignal) {
      const params = pagination(number, size)
      params.set('status', 'PENDENTE')
      const data = parsePage(await request('/materiais/moderacao?' + params.toString(), { signal }), value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
        const dto = value as Record<string, unknown>
        if (!validId(dto.id) || typeof dto.titulo !== 'string' || !dto.titulo.trim() || dto.status !== 'PENDENTE'
          || !validId(dto.usuarioId) || !validId(dto.disciplinaId) || !validId(dto.categoriaId)
          || !Number.isSafeInteger(dto.visualizacoes) || (dto.visualizacoes as number) < 0
          || typeof dto.dataCadastro !== 'string' || !Number.isFinite(Date.parse(dto.dataCadastro))) throw new ApiError('protocol')
        return { id: dto.id.toLowerCase(), titulo: dto.titulo, status: 'PENDENTE' as const,
          dataCadastro: dto.dataCadastro, visualizacoes: dto.visualizacoes as number }
      }, number, size)
      if (new Set(data.content.map(item => item.id)).size !== data.content.length) throw new ApiError('protocol')
      return data
    },
  }
}
export type ModeracaoMaterialService = ReturnType<typeof createModeracaoMaterialService>
