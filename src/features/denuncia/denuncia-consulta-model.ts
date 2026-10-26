import { ApiError } from '../../shared/http/client.ts'
import type { Page } from '../../shared/http/page.ts'
import { validId } from '../material/material-service.ts'
import type { Denuncia, DenunciaResumo, DenunciaService } from './denuncia-service.ts'

export interface DenunciaConsultaState { mode: 'list' | 'detail'; data: Page<DenunciaResumo> | null; report: Denuncia | null; size: number; loading: boolean; error: string }
const empty = (mode: DenunciaConsultaState['mode'] = 'list'): DenunciaConsultaState => ({ mode, data: null, report: null, size: 20, loading: false, error: '' })
export function createDenunciaConsultaModel(service: DenunciaService, userId: () => string | null) {
  let state = empty(), disposed = false, identity: string | null = null, reportId = '', lastNumber = 0, task: AbortController | null = null
  const listeners = new Set<(value: DenunciaConsultaState) => void>()
  const patch = (value: Partial<DenunciaConsultaState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const access = () => {
    if (disposed) return false
    if (!validId(identity) || identity !== userId()) { task?.abort(); task = null; state = empty(state.mode); patch({ error: 'O acesso mudou. Reabra a consulta com a conta atual.' }); return false }
    return true
  }
  const current = (controller: AbortController) => !disposed && task === controller && !controller.signal.aborted && access()
  async function query(number = lastNumber, size = state.size) {
    if (!access()) return
    task?.abort(); task = null; lastNumber = number
    patch({ data: null, report: null, size, loading: true, error: '' })
    if (state.mode === 'detail' && !validId(reportId)) { patch({ loading: false, error: 'Endereço de denúncia inválido.' }); return }
    const controller = new AbortController(); task = controller
    try {
      if (state.mode === 'detail') {
        const report = await service.detail(reportId, controller.signal)
        if (current(controller)) patch({ report, loading: false })
      } else {
        let data = await service.list(number, size, controller.signal)
        if (!current(controller)) return
        if (!data.content.length && number > 0 && number >= data.page.totalPages) {
          data = await service.list(Math.max(0, data.page.totalPages - 1), size, controller.signal)
        }
        if (current(controller)) { lastNumber = data.page.number; patch({ data, loading: false }) }
      }
    } catch (error) {
      if (current(controller)) patch({ loading: false, error: error instanceof ApiError && error.status === 404
        ? 'Denúncia inexistente ou indisponível para esta conta.' : error instanceof ApiError ? error.message : 'Não foi possível consultar suas denúncias. Tente novamente.' })
    } finally { if (task === controller) task = null }
  }
  function initialize(mode: DenunciaConsultaState['mode'], id = '') {
    if (disposed) return
    task?.abort(); task = null; state = empty(mode); reportId = id.toLowerCase(); lastNumber = 0; identity = userId(); patch({})
    return query(0)
  }
  return {
    loadList: () => initialize('list'), loadDetail: (id: string) => initialize('detail', id), reload: () => query(), getState: () => state,
    async setSize(size: number) { if (!disposed && state.mode === 'list' && [20, 50, 100].includes(size)) await query(0, size) },
    async goToPage(number: number) {
      const page = state.data?.page
      if (!access() || state.mode !== 'list' || state.loading || !page || !Number.isSafeInteger(number) || number < 0 || number >= page.totalPages) return
      await query(number)
    },
    subscribe(listener: (value: DenunciaConsultaState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; task?.abort(); task = null; state = empty(); listeners.clear() },
  }
}
