import type { User } from '../auth/auth-service.ts'
import { estados, type DenunciaResumo, type StatusDenuncia } from '../denuncia/denuncia-service.ts'
import { createModeracaoFilaModel, type ModeracaoFilaState } from './moderacao-fila-model.ts'
import type { ModeracaoDenunciaService } from './moderacao-denuncia-service.ts'

export interface ModeracaoDenunciaState extends ModeracaoFilaState<DenunciaResumo> { status: StatusDenuncia }
export function createModeracaoDenunciaModel(service: Pick<ModeracaoDenunciaService, 'list'>, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let status: StatusDenuncia = 'PENDENTE', disposed = false
  const queue = createModeracaoFilaModel({ list: (number, size, signal) => service.list(status, number, size, signal) }, user)
  return {
    ...queue,
    async initialize() { if (!disposed) { status = 'PENDENTE'; await queue.initialize() } },
    async setStatus(value: string) {
      if (disposed || !estados.some(item => item === value)) return
      status = value as StatusDenuncia
      await queue.setSize(queue.getState().size)
    },
    getState: (): ModeracaoDenunciaState => ({ ...queue.getState(), status }),
    subscribe(listener: (value: ModeracaoDenunciaState) => void) { return queue.subscribe(value => listener({ ...value, status })) },
    dispose() { disposed = true; status = 'PENDENTE'; queue.dispose() },
  }
}
