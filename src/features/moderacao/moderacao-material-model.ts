import type { User } from '../auth/auth-service.ts'
import type { MaterialPendente, ModeracaoMaterialService } from './moderacao-material-service.ts'
import { createModeracaoFilaModel, type ModeracaoFilaState } from './moderacao-fila-model.ts'

export type ModeracaoMaterialState = ModeracaoFilaState<MaterialPendente>
export function createModeracaoMaterialModel(service: ModeracaoMaterialService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  return createModeracaoFilaModel(service, user)
}
