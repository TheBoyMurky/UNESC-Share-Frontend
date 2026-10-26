import { ApiError } from '../../shared/http/client.ts'
import type { Page } from '../../shared/http/page.ts'
import type { User } from '../auth/auth-service.ts'
import { canModerate } from '../auth/permissions.ts'
import type { Denuncia } from '../denuncia/denuncia-service.ts'
import { validId } from '../material/material-service.ts'
import type { DenunciaEvento, ModeracaoDenunciaService } from './moderacao-denuncia-service.ts'

export interface ModeracaoDenunciaDetalheState {
  report: Denuncia | null; history: Page<DenunciaEvento> | null; size: number; loading: boolean; error: string; denied: boolean; historyLoading: boolean; historyError: string
}
export const emptyDenunciaDetalheState = (): ModeracaoDenunciaDetalheState => ({ report: null, history: null, size: 20, loading: false, error: '', denied: false, historyLoading: false, historyError: '' })
export function createModeracaoDenunciaDetalheModel(service: Pick<ModeracaoDenunciaService, 'detail' | 'history'>, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = emptyDenunciaDetalheState(), disposed = false, context = '', reportId = '', lastNumber = 0
  const tasks = new Map<string, AbortController>(), listeners = new Set<(value: ModeracaoDenunciaDetalheState) => void>()
  const patch = (value: Partial<ModeracaoDenunciaDetalheState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const cancel = () => { tasks.forEach(task => task.abort()); tasks.clear() }
  const signature = () => { const value = user(); return value && validId(value.id) && canModerate(value) ? value.id.toLowerCase() + ':' + value.perfil : '' }
  function deny(message: string) { cancel(); state = emptyDenunciaDetalheState(); patch({ denied: true, error: message }) }
  function access() {
    if (disposed) return false
    if (!context || context !== signature()) { deny('O acesso à equipe mudou. Reabra a consulta com uma conta autorizada.'); return false }
    return !state.denied
  }
  const current = (key: string, task: AbortController) => !disposed && tasks.get(key) === task && !task.signal.aborted && access()
  const unavailable = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)
  const message = (error: unknown) => error instanceof ApiError && error.status === 404 ? 'Denúncia inexistente ou indisponível para esta conta.'
    : error instanceof ApiError ? error.message : 'Não foi possível consultar os dados. Tente novamente.'

  async function history(number = lastNumber, size = state.size) {
    if (!access() || !state.report || state.loading) return
    tasks.get('history')?.abort(); const task = new AbortController(); tasks.set('history', task); lastNumber = number
    patch({ history: null, size, historyLoading: true, historyError: '' })
    try {
      let data = await service.history(reportId, number, size, task.signal)
      if (!current('history', task)) return
      if (!data.content.length && number > 0 && number >= data.page.totalPages) data = await service.history(reportId, Math.max(0, data.page.totalPages - 1), size, task.signal)
      if (current('history', task)) { lastNumber = data.page.number; patch({ history: data, historyLoading: false }) }
    } catch (error) {
      if (!current('history', task)) return
      if (unavailable(error)) deny(message(error))
      else patch({ history: null, historyLoading: false, historyError: message(error) })
    } finally { if (tasks.get('history') === task) tasks.delete('history') }
  }
  async function load(id: string) {
    if (disposed) return
    cancel(); state = emptyDenunciaDetalheState(); reportId = id.toLowerCase(); context = signature(); lastNumber = 0; patch({})
    if (!access()) return
    if (!validId(reportId)) { patch({ error: 'Endereço de denúncia inválido.' }); return }
    const task = new AbortController(); tasks.set('detail', task); patch({ loading: true })
    try {
      const report = await service.detail(reportId, task.signal)
      if (!current('detail', task)) return
      patch({ report, loading: false })
      await history(0)
    } catch (error) {
      if (!current('detail', task)) return
      if (unavailable(error)) deny(message(error))
      else patch({ loading: false, error: message(error) })
    } finally { if (tasks.get('detail') === task) tasks.delete('detail') }
  }
  return {
    load, getState: () => state,
    async reload() { if (!disposed && !state.denied) await load(reportId) },
    reloadHistory: () => history(),
    async setSize(size: number) { if ([20, 50, 100].includes(size)) await history(0, size) },
    async goToPage(number: number) {
      const page = state.history?.page
      if (!access() || state.historyLoading || !page || !Number.isSafeInteger(number) || number < 0 || number >= page.totalPages) return
      await history(number)
    },
    subscribe(listener: (value: ModeracaoDenunciaDetalheState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = emptyDenunciaDetalheState(); listeners.clear() },
  }
}
