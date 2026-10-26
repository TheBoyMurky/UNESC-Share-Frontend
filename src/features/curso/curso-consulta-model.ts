import { ApiError } from '../../shared/http/client.ts'
import type { Page } from '../../shared/http/page.ts'
import type { User } from '../auth/auth-service.ts'
import { validId } from '../material/material-service.ts'
import type { Instituicao, InstituicaoService } from '../instituicao/instituicao-service.ts'
import type { Curso, CursoService } from './curso-service.ts'

export interface CursosState { instituicaoId: string; instituicao: Instituicao | null; data: Page<Curso> | null; size: number; loading: boolean; error: string; unavailable: boolean }
const empty = (instituicaoId = ''): CursosState => ({ instituicaoId, instituicao: null, data: null, size: 20, loading: false, error: '', unavailable: false })
export function createCursoConsultaModel(service: CursoService, institutions: InstituicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, context = '', lastNumber = 0, task: AbortController | null = null
  const listeners = new Set<(value: CursosState) => void>()
  const patch = (value: Partial<CursosState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const signature = () => { const actor = user(); return actor && validId(actor.id) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  function access() {
    if (disposed) return false
    if (!context || context !== signature()) { task?.abort(); task = null; state = empty(state.instituicaoId); patch({ unavailable: true, error: 'O acesso mudou. Reabra a consulta com a conta atual.' }); return false }
    return !state.unavailable
  }
  const current = (controller: AbortController) => !disposed && task === controller && !controller.signal.aborted && access()
  async function query(number = lastNumber, size = state.size) {
    if (!access() || !state.instituicao) return
    task?.abort(); const controller = new AbortController(); task = controller; lastNumber = number
    patch({ data: null, size, loading: true, error: '' })
    try {
      let data = await service.list(state.instituicaoId, number, size, controller.signal)
      if (!current(controller)) return
      if (!data.content.length && number > 0 && number >= data.page.totalPages) data = await service.list(state.instituicaoId, Math.max(0, data.page.totalPages - 1), size, controller.signal)
      if (current(controller)) { lastNumber = data.page.number; patch({ data, loading: false }) }
    } catch (error) {
      if (!current(controller)) return
      const code = error instanceof ApiError ? error.status : null
      patch({ loading: false, unavailable: code === 401 || code === 403,
        error: code === 401 || code === 403 ? 'A API não autorizou a consulta. Reabra a área para conferir seu acesso.' : 'Não foi possível consultar os cursos. Tente carregar novamente.' })
    } finally { if (task === controller) task = null }
  }
  async function load(instituicaoId: string) {
    if (disposed) return
    task?.abort(); task = null; context = signature(); lastNumber = 0
    if (!validId(instituicaoId)) { state = { ...empty(), unavailable: true, error: 'Endereço de instituição inválido.' }; patch({}); return }
    instituicaoId = instituicaoId.toLowerCase(); state = { ...empty(instituicaoId), loading: true }; patch({})
    if (!access()) return
    const controller = new AbortController(); task = controller
    try {
      const institution = await institutions.detail(instituicaoId, controller.signal)
      if (!current(controller)) return
      if (institution.id !== instituicaoId) throw new ApiError('protocol')
      patch({ instituicao: institution, loading: false })
      await query(0)
    } catch (error) {
      if (!current(controller)) return
      const code = error instanceof ApiError ? error.status : null
      patch({ loading: false, unavailable: code === 401 || code === 403 || code === 404,
        error: code === 404 ? 'Instituição inexistente ou indisponível para esta consulta.'
          : code === 401 || code === 403 ? 'A API não autorizou esta consulta. Reabra a área para conferir seu acesso.'
            : 'Não foi possível consultar a instituição. Tente carregar novamente.' })
    } finally { if (task === controller) task = null }
  }
  return {
    load, reload: () => { if (!state.loading) { if (state.instituicao) void query(); else void load(state.instituicaoId) } }, getState: () => state,
    setSize(size: number) { if (!disposed && state.data && !state.loading && [20, 50, 100].includes(size)) void query(0, size) },
    goToPage(number: number) { const page = state.data?.page; if (!access() || state.loading || !page || !Number.isSafeInteger(number) || number < 0 || number >= page.totalPages) return; void query(number) },
    subscribe(listener: (value: CursosState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; task?.abort(); task = null; state = empty(); context = ''; listeners.clear() },
  }
}
