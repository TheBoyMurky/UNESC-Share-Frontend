import type { User } from '../auth/auth-service.ts'
import type { ModeracaoDenunciaService } from './moderacao-denuncia-service.ts'
import type { DenunciaAnaliseService } from './denuncia-analise-service.ts'
import { createDenunciaDecisaoModel, type DenunciaDecisaoState } from './denuncia-decisao-model.ts'

export type DenunciaAnaliseState = DenunciaDecisaoState
// Compatibilidade do incremento de abertura; o ciclo de confirmacao tem uma unica implementacao.
export function createDenunciaAnaliseModel(service: Pick<ModeracaoDenunciaService, 'detail' | 'history'>, analysis: DenunciaAnaliseService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  const model = createDenunciaDecisaoModel(service, { decide: (id, _kind, text, signal) => analysis.start(id, text, signal) }, user, ['analise'])
  return { ...model, canOpen: () => model.canOpen('analise'), open: () => model.open('analise') }
}
