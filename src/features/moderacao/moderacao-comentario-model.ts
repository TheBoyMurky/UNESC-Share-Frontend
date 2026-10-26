import type { User } from '../auth/auth-service.ts'
import { validId } from '../material/material-service.ts'
import { createModeracaoFilaModel } from './moderacao-fila-model.ts'
import type { ModeracaoComentarioService } from './moderacao-comentario-service.ts'

export function createModeracaoComentarioModel(service: Pick<ModeracaoComentarioService, 'list'>, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let materialId = '', disposed = false
  const queue = createModeracaoFilaModel({ list: (number, size, signal) => {
    if (!validId(materialId)) throw new TypeError('Material inválido.')
    return service.list(materialId, number, size, signal)
  } }, user, [401, 403, 404])
  return {
    ...queue,
    async load(id: string) { if (!disposed) { materialId = id.toLowerCase(); await queue.initialize() } },
    dispose() { disposed = true; materialId = ''; queue.dispose() },
  }
}
