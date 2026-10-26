import type { JsonRequest } from '../../shared/http/client.ts'
import { createDenunciaDecisaoService } from './denuncia-decisao-service.ts'
export { validateJustificativa } from './denuncia-decisao-service.ts'

export function createDenunciaAnaliseService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  const service = createDenunciaDecisaoService(request)
  return { start: (id: string, text: string, signal?: AbortSignal) => service.decide(id, 'analise', text, signal) }
}
export type DenunciaAnaliseService = ReturnType<typeof createDenunciaAnaliseService>
