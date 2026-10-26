import { ApiError } from '../../shared/http/client.ts'
import type { Page } from '../../shared/http/page.ts'
import { materialStates, type OwnFilters, type OwnMaterialSummary, type OwnMaterialsService } from './meus-materiais-service.ts'

export interface OwnMaterialsState {
  filters: OwnFilters; pageSize: number; applied: OwnFilters | null; appliedSize: number
  data: Page<OwnMaterialSummary> | null; loading: boolean; error: string
}
const emptyFilters = (): OwnFilters => ({ q: '', status: '' })
const empty = (): OwnMaterialsState => ({ filters: emptyFilters(), pageSize: 20, applied: null, appliedSize: 20, data: null, loading: false, error: '' })
export const ownFiltersChanged = (state: OwnMaterialsState) => !state.applied || state.filters.q.trim() !== state.applied.q
  || state.filters.status !== state.applied.status || state.pageSize !== state.appliedSize

export function createOwnMaterialsModel(service: OwnMaterialsService) {
  let state = empty(), disposed = false, task: AbortController | null = null
  const listeners = new Set<(value: OwnMaterialsState) => void>()
  const patch = (value: Partial<OwnMaterialsState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const current = (controller: AbortController) => !disposed && task === controller && !controller.signal.aborted

  async function run(filters: OwnFilters, number: number, size: number) {
    task?.abort()
    const controller = new AbortController()
    task = controller
    patch({ applied: { ...filters }, appliedSize: size, data: null, loading: true, error: '' })
    try {
      let data = await service.search(filters, number, size, controller.signal)
      if (!current(controller)) return
      // Apenas uma correcao de pagina se o total encolher; nao prometer snapshot entre GETs.
      if (!data.content.length && number > 0 && data.page.totalPages > 0 && number >= data.page.totalPages) {
        data = await service.search(filters, data.page.totalPages - 1, size, controller.signal)
      }
      if (current(controller)) patch({ data, loading: false })
    } catch (error) {
      if (current(controller)) patch({ loading: false, error: error instanceof ApiError ? error.message : 'Não foi possível carregar seus materiais. Tente novamente.' })
    } finally { if (task === controller) task = null }
  }

  async function search() { if (!disposed) await run({ ...state.filters, q: state.filters.q.trim() }, 0, state.pageSize) }
  async function goToPage(number: number) {
    const page = state.data?.page
    if (disposed || state.loading || ownFiltersChanged(state) || !state.applied || !page
      || !Number.isSafeInteger(number) || number < 0 || number >= page.totalPages) return
    await run({ ...state.applied }, number, state.appliedSize)
  }
  return {
    search, initialize: search, goToPage, getState: () => state,
    changeFilter(key: keyof OwnFilters, value: string) {
      if (disposed || (key === 'q' && value.length > 200)) return
      if (key === 'status' && value !== '' && !materialStates.some(status => status === value)) return
      if (key === 'q' || key === 'status') patch({ filters: { ...state.filters, [key]: value } })
    },
    setPageSize(size: number) { if (!disposed && [20, 50, 100].includes(size)) patch({ pageSize: size }) },
    async clearFilters() { if (!disposed) { patch({ filters: emptyFilters() }); await search() } },
    subscribe(listener: (value: OwnMaterialsState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; task?.abort(); task = null; state = empty(); listeners.clear() },
  }
}
