import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { parseDenuncia, type StatusDenuncia } from '../denuncia/denuncia-service.ts'
import { validId } from '../material/material-service.ts'

export const denunciaActions = ['analise', 'procedencia', 'improcedencia'] as const
export type DenunciaAction = typeof denunciaActions[number]
export const denunciaActionInfo: Record<DenunciaAction, { source: StatusDenuncia; target: StatusDenuncia; label: string }> = {
  analise: { source: 'PENDENTE', target: 'EM_ANALISE', label: 'Iniciar análise' },
  procedencia: { source: 'EM_ANALISE', target: 'PROCEDENTE', label: 'Concluir como procedente' },
  improcedencia: { source: 'EM_ANALISE', target: 'IMPROCEDENTE', label: 'Concluir como improcedente' },
}
export const isDenunciaAction = (value: unknown): value is DenunciaAction => denunciaActions.some(action => action === value)
export function validateJustificativa(value: string): string {
  return typeof value !== 'string' || !value.trim() || value.trim().length > 1000 || value.includes('\u0000')
    ? 'Informe uma justificativa com até 1000 caracteres, sem caracteres nulos.' : ''
}
export function createDenunciaDecisaoService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  return {
    async decide(id: string, action: DenunciaAction, justificativa: string, signal?: AbortSignal) {
      if (!validId(id) || !isDenunciaAction(action) || validateJustificativa(justificativa)) throw new TypeError('Confira a denúncia, a decisão e a justificativa.')
      id = id.toLowerCase()
      const report = parseDenuncia(await request(`/denuncias/moderacao/${id}/${action}`, { method: 'POST', json: { justificativa: justificativa.trim() }, signal }))
      if (report.id !== id || report.status !== denunciaActionInfo[action].target) throw new ApiError('protocol')
      return report
    },
  }
}
export type DenunciaDecisaoService = ReturnType<typeof createDenunciaDecisaoService>
