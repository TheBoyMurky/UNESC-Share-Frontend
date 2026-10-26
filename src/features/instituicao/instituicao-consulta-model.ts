import { ApiError } from '../../shared/http/client.ts'
import type { Page } from '../../shared/http/page.ts'
import type { User } from '../auth/auth-service.ts'
import { validId } from '../material/material-service.ts'
import type { Instituicao, InstituicaoService } from './instituicao-service.ts'

export interface InstituicaoConsultaState { mode: 'list' | 'detail'; data: Page<Instituicao> | null; institution: Instituicao | null; size: number; loading: boolean; error: string; unavailable: boolean }
const empty = (mode: InstituicaoConsultaState['mode'] = 'list'): InstituicaoConsultaState => ({ mode, data: null, institution: null, size: 20, loading: false, error: '', unavailable: false })
export function createInstituicaoConsultaModel(service: InstituicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, context = '', institutionId = '', lastNumber = 0, task: AbortController | null = null
  const listeners = new Set<(value: InstituicaoConsultaState) => void>()
  const patch = (value: Partial<InstituicaoConsultaState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const signature = () => { const actor = user(); return actor && validId(actor.id) ? actor.id.toLowerCase() + ':' + actor.perfil : '' }
  function access() {
    if (disposed) return false
    if (!context || context !== signature()) {
      task?.abort(); task = null; state = empty(state.mode); patch({ unavailable: true, error: 'O acesso mudou. Reabra a consulta com a conta atual.' }); return false
    }
    return !state.unavailable
  }
  const current = (controller: AbortController) => !disposed && task === controller && !controller.signal.aborted && access()
  async function query(number = lastNumber, size = state.size) {
    if (!access()) return
    task?.abort(); const controller = new AbortController(); task = controller; lastNumber = number
    patch({ data: null, institution: null, size, loading: true, error: '' })
    try {
      if (state.mode === 'detail') {
        const institution = await service.detail(institutionId, controller.signal)
        if (current(controller)) patch({ institution, loading: false })
      } else {
        let data = await service.list(number, size, controller.signal)
        if (!current(controller)) return
        if (!data.content.length && number > 0 && number >= data.page.totalPages) data = await service.list(Math.max(0, data.page.totalPages - 1), size, controller.signal)
        if (current(controller)) { lastNumber = data.page.number; patch({ data, loading: false }) }
      }
    } catch (error) {
      if (!current(controller)) return
      const code = error instanceof ApiError ? error.status : null
      patch({ loading: false, unavailable: code === 401 || code === 403 || state.mode === 'detail' && code === 404,
        error: state.mode === 'detail' && code === 404 ? 'Instituição inexistente ou indisponível para esta consulta.'
          : code === 401 || code === 403 ? 'A API não autorizou esta consulta. Reabra a área para conferir seu acesso.'
            : 'Não foi possível consultar as instituições. Tente carregar novamente.' })
    } finally { if (task === controller) task = null }
  }
  async function initialize(mode: InstituicaoConsultaState['mode'], id = '') {
    if (disposed) return
    task?.abort(); task = null; state = empty(mode); context = signature(); institutionId = id.toLowerCase(); lastNumber = 0; patch({})
    if (!access()) return
    if (mode === 'detail' && !validId(institutionId)) { patch({ unavailable: true, error: 'Endereço de instituição inválido.' }); return }
    await query(0)
  }
  return {
    loadList: () => initialize('list'), loadDetail: (id: string) => initialize('detail', id), reload: () => query(), getState: () => state,
    async setSize(size: number) { if (!disposed && state.mode === 'list' && [20, 50, 100].includes(size)) await query(0, size) },
    async goToPage(number: number) {
      const page = state.data?.page
      if (!access() || state.mode !== 'list' || state.loading || !page || !Number.isSafeInteger(number) || number < 0 || number >= page.totalPages) return
      await query(number)
    },
    subscribe(listener: (value: InstituicaoConsultaState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; task?.abort(); task = null; state = empty(); institutionId = ''; context = ''; listeners.clear() },
  }
}
