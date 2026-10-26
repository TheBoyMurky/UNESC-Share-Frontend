import { ApiError } from '../../shared/http/client.ts'
import type { Page } from '../../shared/http/page.ts'
import type { User } from '../auth/auth-service.ts'
import { validId } from '../material/material-service.ts'
import type { Categoria, CategoriaService } from './categoria-service.ts'

export interface CategoriaConsultaState {
  mode: 'list' | 'detail'; data: Page<Categoria> | null; categoria: Categoria | null; size: number
  loading: boolean; error: string; unavailable: boolean
}
const empty = (mode: CategoriaConsultaState['mode'] = 'list'): CategoriaConsultaState => ({ mode, data: null, categoria: null, size: 20, loading: false, error: '', unavailable: false })

export function createCategoriaConsultaModel(service: CategoriaService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, context = '', categoriaId = '', lastNumber = 0, task: AbortController | null = null
  const listeners = new Set<(value: CategoriaConsultaState) => void>()
  const patch = (value: Partial<CategoriaConsultaState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
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
    patch({ data: null, categoria: null, size, loading: true, error: '' })
    try {
      if (state.mode === 'detail') {
        const categoria = await service.detail(categoriaId, controller.signal)
        if (current(controller)) patch({ categoria, loading: false })
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
        error: state.mode === 'detail' && code === 404 ? 'Categoria inexistente ou indisponível para esta consulta.'
          : code === 401 || code === 403 ? 'A API não autorizou esta consulta. Reabra a área para conferir seu acesso.'
            : 'Não foi possível consultar as categorias. Tente carregar novamente.' })
    } finally { if (task === controller) task = null }
  }
  async function initialize(mode: CategoriaConsultaState['mode'], id = '') {
    if (disposed) return
    task?.abort(); task = null; state = empty(mode); context = signature(); categoriaId = id.toLowerCase(); lastNumber = 0; patch({})
    if (!access()) return
    if (mode === 'detail' && !validId(categoriaId)) { patch({ unavailable: true, error: 'Endereço de categoria inválido.' }); return }
    await query(0)
  }
  return {
    loadList: () => initialize('list'),
    loadDetail: (id: string) => initialize('detail', id),
    reload: () => query(),
    getState: () => state,
    async setSize(size: number) { if (!disposed && state.mode === 'list' && [20, 50, 100].includes(size)) await query(0, size) },
    async goToPage(number: number) {
      const page = state.data?.page
      if (!access() || state.mode !== 'list' || state.loading || !page || !Number.isSafeInteger(number) || number < 0 || number >= page.totalPages) return
      await query(number)
    },
    subscribe(listener: (value: CategoriaConsultaState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; task?.abort(); task = null; state = empty(); categoriaId = ''; context = ''; listeners.clear() },
  }
}
