import { ApiError } from '../../shared/http/client.ts'
import { pagination, parsePage } from '../../shared/http/page.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { validId } from '../material/material-service.ts'
import { estados, parseDenuncia, type StatusDenuncia } from '../denuncia/denuncia-service.ts'

export interface DenunciaEvento { id: string; denunciaId: string; responsavelId: string; justificativa: string; estadoAnterior: StatusDenuncia; estadoNovo: StatusDenuncia; dataCadastro: string }
function uuid(value: string) {
  if (!validId(value)) throw new TypeError('Identificador de denúncia inválido.')
  return value.toLowerCase()
}
function parseEvento(value: unknown, expectedId: string): DenunciaEvento {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  const dto = value as Record<string, unknown>
  const transition = dto.estadoAnterior === 'PENDENTE' && dto.estadoNovo === 'EM_ANALISE'
    || dto.estadoAnterior === 'EM_ANALISE' && (dto.estadoNovo === 'PROCEDENTE' || dto.estadoNovo === 'IMPROCEDENTE')
  if (!validId(dto.id) || !validId(dto.denunciaId) || dto.denunciaId.toLowerCase() !== expectedId || !validId(dto.responsavelId)
    || !transition || typeof dto.justificativa !== 'string' || !dto.justificativa.trim() || dto.justificativa.length > 1000 || dto.justificativa.includes('\u0000')
    || typeof dto.dataCadastro !== 'string' || !Number.isFinite(Date.parse(dto.dataCadastro))) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), denunciaId: expectedId, responsavelId: dto.responsavelId.toLowerCase(), justificativa: dto.justificativa,
    estadoAnterior: dto.estadoAnterior as StatusDenuncia, estadoNovo: dto.estadoNovo as StatusDenuncia, dataCadastro: dto.dataCadastro }
}

export function createModeracaoDenunciaService(request: CatalogRequest) {
  return {
    async list(status: StatusDenuncia = 'PENDENTE', number = 0, size = 20, signal?: AbortSignal) {
      if (!estados.includes(status)) throw new TypeError('Estado de denúncia inválido.')
      const params = pagination(number, size); params.set('status', status)
      const data = parsePage(await request('/denuncias/moderacao?' + params.toString(), { signal }), value => {
        const { descricao: _descricao, ...summary } = parseDenuncia(value)
        if (summary.status !== status) throw new ApiError('protocol')
        return summary
      }, number, size)
      if (new Set(data.content.map(item => item.id)).size !== data.content.length) throw new ApiError('protocol')
      return data
    },
    async detail(id: string, signal?: AbortSignal) {
      const expected = uuid(id), report = parseDenuncia(await request('/denuncias/moderacao/' + expected, { signal }))
      if (report.id !== expected) throw new ApiError('protocol')
      return report
    },
    async history(id: string, number = 0, size = 20, signal?: AbortSignal) {
      const expected = uuid(id), params = pagination(number, size)
      const data = parsePage(await request(`/denuncias/moderacao/${expected}/historico?${params.toString()}`, { signal }), value => parseEvento(value, expected), number, size)
      if (new Set(data.content.map(item => item.id)).size !== data.content.length) throw new ApiError('protocol')
      return data
    },
  }
}
export type ModeracaoDenunciaService = ReturnType<typeof createModeracaoDenunciaService>
