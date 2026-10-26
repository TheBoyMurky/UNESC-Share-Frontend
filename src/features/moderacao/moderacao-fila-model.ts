import { ApiError } from '../../shared/http/client.ts'
import type { Page } from '../../shared/http/page.ts'
import type { User } from '../auth/auth-service.ts'
import { canModerate } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'

export interface ModeracaoFilaState<T> { data: Page<T> | null; size: number; loading: boolean; error: string; denied: boolean }
export const emptyModeracaoFilaState = <T>(): ModeracaoFilaState<T> => ({ data: null, size: 20, loading: false, error: '', denied: false })

export function createModeracaoFilaModel<T>(service: { list(number: number, size: number, signal?: AbortSignal): Promise<Page<T>> }, user: () => Pick<User, 'id' | 'perfil'> | null, unavailableStatuses: readonly number[] = [401, 403]) {
  const empty = () => emptyModeracaoFilaState<T>()
  let state = empty(), disposed = false, context = '', lastNumber = 0, task: AbortController | null = null
  const listeners = new Set<(value: ModeracaoFilaState<T>) => void>()
  const patch = (value: Partial<ModeracaoFilaState<T>>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const signature = () => { const value = user(); return value && validId(value.id) && canModerate(value) ? value.id.toLowerCase() + ':' + value.perfil : '' }
  const access = () => {
    if (disposed) return false
    if (!context || signature() !== context) {
      task?.abort(); task = null; state = empty(); patch({ denied: true, error: 'O acesso à equipe não está disponível nesta conta. Reabra a área com o perfil autorizado.' }); return false
    }
    return !state.denied
  }
  const current = (controller: AbortController) => !disposed && task === controller && !controller.signal.aborted && access()
  async function query(number = lastNumber, size = state.size) {
    if (!access()) return
    task?.abort(); const controller = new AbortController(); task = controller; lastNumber = number
    patch({ data: null, size, loading: true, error: '' })
    try {
      let data = await service.list(number, size, controller.signal)
      if (!current(controller)) return
      if (!data.content.length && number > 0 && number >= data.page.totalPages) {
        data = await service.list(Math.max(0, data.page.totalPages - 1), size, controller.signal)
      }
      if (current(controller)) { lastNumber = data.page.number; patch({ data, loading: false }) }
    } catch (error) {
      if (!current(controller)) return
      const denied = error instanceof ApiError && unavailableStatuses.includes(error.status ?? 0)
      patch({ data: null, loading: false, denied, error: error instanceof ApiError && error.status === 403
        ? 'A API negou acesso à fila de moderação. Confira seu acesso antes de reabrir esta área.'
        : error instanceof ApiError ? error.message : 'Não foi possível consultar a fila. Tente novamente.' })
    } finally { if (task === controller) task = null }
  }
  return {
    async initialize() {
      if (disposed) return
      task?.abort(); task = null; state = empty(); context = signature(); lastNumber = 0; patch({})
      await query(0)
    },
    reload: () => query(), getState: () => state,
    async setSize(size: number) { if ([20, 50, 100].includes(size)) await query(0, size) },
    async goToPage(number: number) {
      const page = state.data?.page
      if (!access() || state.loading || !page || !Number.isSafeInteger(number) || number < 0 || number >= page.totalPages) return
      await query(number)
    },
    subscribe(listener: (value: ModeracaoFilaState<T>) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; task?.abort(); task = null; state = empty(); listeners.clear() },
  }
}
