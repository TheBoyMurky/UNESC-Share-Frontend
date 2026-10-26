import { ApiError } from '../../shared/http/client.ts'
import type { CatalogService, Filters, MaterialSummary, Option, Page, PageInfo, SelectorKind } from './catalog-service.ts'

export interface SelectorState { options: Option[]; page: PageInfo | null; loading: boolean; error: string }
export interface CatalogState {
  filters: Filters; pageSize: number; applied: Filters | null; appliedSize: number
  selectors: Record<SelectorKind, SelectorState>
  results: { data: Page<MaterialSummary> | null; loading: boolean; error: string }
}
const emptyFilters = (): Filters => ({ q: '', instituicaoId: '', cursoId: '', disciplinaId: '', categoriaId: '' })
const emptySelector = (): SelectorState => ({ options: [], page: null, loading: false, error: '' })
export const filtersChanged = (state: CatalogState) => state.applied === null || state.pageSize !== state.appliedSize
  || Object.keys(state.filters).some(key => state.filters[key as keyof Filters].trim() !== state.applied?.[key as keyof Filters].trim())

export function createCatalogModel(service: CatalogService) {
  let state: CatalogState = {
    filters: emptyFilters(), pageSize: 20, applied: null, appliedSize: 20,
    selectors: { instituicoes: emptySelector(), cursos: emptySelector(), disciplinas: emptySelector(), categorias: emptySelector() },
    results: { data: null, loading: false, error: '' },
  }
  let disposed = false
  const listeners = new Set<(state: CatalogState) => void>()
  const running = new Map<string, AbortController>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Não foi possível carregar os dados. Tente novamente.'
  const patchSelector = (kind: SelectorKind, patch: Partial<SelectorState>) => {
    state = { ...state, selectors: { ...state.selectors, [kind]: { ...state.selectors[kind], ...patch } } }; emit()
  }
  function cancel(key: string) { running.get(key)?.abort(); running.delete(key) }
  function start(key: string) { cancel(key); const controller = new AbortController(); running.set(key, controller); return controller }
  const current = (key: string, controller: AbortController) => !disposed && !controller.signal.aborted && running.get(key) === controller
  function resetSelector(kind: SelectorKind) { cancel(kind); patchSelector(kind, emptySelector()) }

  async function loadOptions(kind: SelectorKind, append = false) {
    if (disposed || state.selectors[kind].loading) return
    const previous = state.selectors[kind]
    if (append && (!previous.page || previous.page.number + 1 >= previous.page.totalPages)) return
    const parent = kind === 'cursos' ? state.filters.instituicaoId : kind === 'disciplinas' ? state.filters.cursoId : ''
    if ((kind === 'cursos' || kind === 'disciplinas') && !parent) return
    const number = append && previous.page ? previous.page.number + 1 : 0
    const controller = start(kind)
    patchSelector(kind, { loading: true, error: '' })
    try {
      const page = await service.options(kind, parent, number, controller.signal)
      if (!current(kind, controller)) return
      const options = [...new Map([...(append ? previous.options : []), ...page.content].map(item => [item.id, item])).values()]
      patchSelector(kind, { options, page: page.page, loading: false })
    } catch (error) {
      if (current(kind, controller)) patchSelector(kind, { loading: false, error: errorMessage(error) })
    }
  }

  async function changeFilter(key: keyof Filters, value: string) {
    if (disposed) return
    if (key === 'q' && value.length > 200) return
    if (key !== 'q' && value) {
      const kind = ({ instituicaoId: 'instituicoes', cursoId: 'cursos', disciplinaId: 'disciplinas', categoriaId: 'categorias' } as const)[key]
      if (!state.selectors[kind].options.some(option => option.id === value)) return
    }
    const filters = { ...state.filters, [key]: value }
    if (key === 'instituicaoId') { filters.cursoId = ''; filters.disciplinaId = '' }
    if (key === 'cursoId') filters.disciplinaId = ''
    state = { ...state, filters }
    if (key === 'instituicaoId') { resetSelector('cursos'); resetSelector('disciplinas') }
    if (key === 'cursoId') resetSelector('disciplinas')
    emit()
    if (key === 'instituicaoId' && value) await loadOptions('cursos')
    if (key === 'cursoId' && value) await loadOptions('disciplinas')
  }

  async function performSearch(filters: Filters, number: number, size: number) {
    const controller = start('search')
    state = { ...state, applied: { ...filters }, appliedSize: size, results: { data: null, loading: true, error: '' } }; emit()
    try {
      let page = await service.search(filters, number, size, controller.signal)
      if (!current('search', controller)) return
      // Uma unica correcao quando o catalogo encolhe entre duas consultas; sem loop de retries.
      if (!page.content.length && number > 0 && page.page.totalPages > 0 && number >= page.page.totalPages) {
        page = await service.search(filters, page.page.totalPages - 1, size, controller.signal)
      }
      if (current('search', controller)) { state = { ...state, results: { data: page, loading: false, error: '' } }; emit() }
    } catch (error) {
      if (current('search', controller)) { state = { ...state, results: { data: null, loading: false, error: errorMessage(error) } }; emit() }
    }
  }

  async function search() {
    if (!disposed) await performSearch({ ...state.filters, q: state.filters.q.trim() }, 0, state.pageSize)
  }
  async function goToPage(number: number) {
    const page = state.results.data?.page
    if (disposed || state.results.loading || filtersChanged(state) || !state.applied || !page
      || !Number.isInteger(number) || number < 0 || number >= page.totalPages) return
    await performSearch({ ...state.applied }, number, state.appliedSize)
  }
  async function clearFilters() {
    if (disposed) return
    state = { ...state, filters: emptyFilters() }
    resetSelector('cursos'); resetSelector('disciplinas'); emit()
    await search()
  }

  return {
    getState: () => state, loadOptions, changeFilter, search, goToPage, clearFilters,
    setPageSize(size: number) { if (!disposed && [20, 50, 100].includes(size)) { state = { ...state, pageSize: size }; emit() } },
    initialize: () => Promise.all([loadOptions('instituicoes'), loadOptions('categorias'), search()]),
    subscribe(listener: (value: CatalogState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; for (const controller of running.values()) controller.abort(); running.clear(); listeners.clear() },
  }
}
