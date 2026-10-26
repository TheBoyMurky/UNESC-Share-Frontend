import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { pagination, parsePage } from '../../shared/http/page.ts'
import { parseComentarioModeracao } from '../comentario/comentario-service.ts'
import { validId } from '../material/material-service.ts'

export interface ComentarioEvento { id: string; comentarioId: string; responsavelId: string; motivo: string; estadoAnterior: 'ATIVO' | 'OCULTO'; estadoNovo: 'ATIVO' | 'OCULTO'; dataCadastro: string }
export function validateMotivoComentario(value: string): string {
  return typeof value !== 'string' || !value.trim() || value.trim().length > 1000 || value.includes('\u0000')
    ? 'Informe um motivo com até 1000 caracteres, sem caracteres nulos.' : ''
}
export const comentarioDecisionInfo = {
  ocultacao: { source: 'ATIVO', target: 'OCULTO', label: 'Ocultar comentário', noun: 'ocultação', result: 'Ocultação' },
  reexibicao: { source: 'OCULTO', target: 'ATIVO', label: 'Reexibir comentário', noun: 'reexibição', result: 'Reexibição' },
} as const
export type ComentarioDecision = keyof typeof comentarioDecisionInfo
function parseEvento(value: unknown, expected: string): ComentarioEvento {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  const dto = value as Record<string, unknown>
  const transition = dto.estadoAnterior === 'ATIVO' && dto.estadoNovo === 'OCULTO' || dto.estadoAnterior === 'OCULTO' && dto.estadoNovo === 'ATIVO'
  if (!validId(dto.id) || !validId(dto.comentarioId) || dto.comentarioId.toLowerCase() !== expected || !validId(dto.responsavelId) || !transition
    || typeof dto.motivo !== 'string' || !dto.motivo.trim() || dto.motivo.length > 1000 || dto.motivo.includes('\u0000')
    || typeof dto.dataCadastro !== 'string' || !Number.isFinite(Date.parse(dto.dataCadastro))) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), comentarioId: expected, responsavelId: dto.responsavelId.toLowerCase(), motivo: dto.motivo,
    estadoAnterior: dto.estadoAnterior as 'ATIVO' | 'OCULTO', estadoNovo: dto.estadoNovo as 'ATIVO' | 'OCULTO', dataCadastro: dto.dataCadastro }
}

export function createModeracaoComentarioService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  async function decide(kind: ComentarioDecision, materialId: string, comentarioId: string, motivo: string, signal?: AbortSignal) {
    if (!validId(materialId) || !validId(comentarioId) || validateMotivoComentario(motivo)) throw new TypeError('Confira o Material, o comentário e o motivo.')
    materialId = materialId.toLowerCase(); comentarioId = comentarioId.toLowerCase()
    const comment = parseComentarioModeracao(await request(`/materiais/${materialId}/comentarios/${comentarioId}/${kind}`, { method: 'POST', json: { motivo: motivo.trim() }, signal }), materialId)
    if (comment.id !== comentarioId || comment.status !== comentarioDecisionInfo[kind].target) throw new ApiError('protocol')
    return comment
  }
  return {
    async list(materialId: string, number = 0, size = 20, signal?: AbortSignal) {
      if (!validId(materialId)) throw new TypeError('Material inválido.')
      materialId = materialId.toLowerCase()
      const params = pagination(number, size)
      const data = parsePage(await request(`/materiais/${materialId}/comentarios/moderacao?${params.toString()}`, { signal }), value => parseComentarioModeracao(value, materialId), number, size)
      if (new Set(data.content.map(item => item.id)).size !== data.content.length) throw new ApiError('protocol')
      return data
    },
    async history(materialId: string, comentarioId: string, number = 0, size = 20, signal?: AbortSignal) {
      if (!validId(materialId) || !validId(comentarioId)) throw new TypeError('Material ou comentário inválido.')
      materialId = materialId.toLowerCase(); comentarioId = comentarioId.toLowerCase()
      const params = pagination(number, size)
      const data = parsePage(await request(`/materiais/${materialId}/comentarios/${comentarioId}/historico-moderacao?${params.toString()}`, { signal }), value => parseEvento(value, comentarioId), number, size)
      if (new Set(data.content.map(item => item.id)).size !== data.content.length) throw new ApiError('protocol')
      return data
    },
    async hide(materialId: string, comentarioId: string, motivo: string, signal?: AbortSignal) {
      return decide('ocultacao', materialId, comentarioId, motivo, signal)
    },
    async reveal(materialId: string, comentarioId: string, motivo: string, signal?: AbortSignal) {
      return decide('reexibicao', materialId, comentarioId, motivo, signal)
    },
  }
}
export type ModeracaoComentarioService = ReturnType<typeof createModeracaoComentarioService>
