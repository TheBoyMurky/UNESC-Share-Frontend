import { ApiError } from '../../shared/http/client.ts'
import type { Page } from '../../shared/http/page.ts'
import type { User } from '../auth/auth-service.ts'
import { validId } from '../material/material-service.ts'
import type { Curso, CursoService } from '../curso/curso-service.ts'
import type { Instituicao, InstituicaoService } from '../instituicao/instituicao-service.ts'
import type { Disciplina, DisciplinaService } from './disciplina-service.ts'

export interface DisciplinasState {
  instituicaoId: string; cursoId: string; instituicao: Instituicao | null; curso: Curso | null
  data: Page<Disciplina> | null; size: number; loading: boolean; error: string; unavailable: boolean
}
const empty = (instituicaoId = '', cursoId = ''): DisciplinasState => ({ instituicaoId, cursoId, instituicao: null, curso: null, data: null, size: 20, loading: false, error: '', unavailable: false })

export function createDisciplinaConsultaModel(service: DisciplinaService, courses: CursoService, institutions: InstituicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, context = '', lastNumber = 0, task: AbortController | null = null
  const listeners = new Set<(value: DisciplinasState) => void>()
  const patch = (value: Partial<DisciplinasState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const signature = () => { const actor = user(); return actor && validId(actor.id) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  function access() {
    if (disposed) return false
    if (!context || context !== signature()) { task?.abort(); task = null; state = empty(state.instituicaoId, state.cursoId); patch({ unavailable: true, error: 'O acesso mudou. Reabra a consulta com a conta atual.' }); return false }
    return !state.unavailable
  }
  const current = (controller: AbortController) => !disposed && task === controller && !controller.signal.aborted && access()
  async function query(number = lastNumber, size = state.size) {
    if (!access() || !state.curso) return
    task?.abort(); const controller = new AbortController(); task = controller; lastNumber = number
    patch({ data: null, size, loading: true, error: '' })
    try {
      let data = await service.list(state.cursoId, number, size, controller.signal)
      if (!current(controller)) return
      if (!data.content.length && number > 0 && number >= data.page.totalPages) data = await service.list(state.cursoId, Math.max(0, data.page.totalPages - 1), size, controller.signal)
      if (current(controller)) { lastNumber = data.page.number; patch({ data, loading: false }) }
    } catch (error) {
      if (!current(controller)) return
      const code = error instanceof ApiError ? error.status : null
      patch({ loading: false, unavailable: code === 401 || code === 403,
        error: code === 401 || code === 403 ? 'A API não autorizou a consulta. Reabra a área para conferir seu acesso.' : 'Não foi possível consultar as disciplinas. Tente carregar novamente.' })
    } finally { if (task === controller) task = null }
  }
  async function load(instituicaoId: string, cursoId: string) {
    if (disposed) return
    task?.abort(); task = null; context = signature(); lastNumber = 0
    if (!validId(instituicaoId) || !validId(cursoId)) { state = { ...empty(), unavailable: true, error: 'Endereço de instituição ou curso inválido.' }; patch({}); return }
    instituicaoId = instituicaoId.toLowerCase(); cursoId = cursoId.toLowerCase()
    state = { ...empty(instituicaoId, cursoId), loading: true }; patch({})
    if (!access()) return
    const controller = new AbortController(); task = controller
    try {
      const [institution, course] = await Promise.all([
        institutions.detail(instituicaoId, controller.signal), courses.detail(cursoId, controller.signal),
      ])
      if (!current(controller)) return
      if (institution.id !== instituicaoId || course.id !== cursoId || course.instituicaoId !== instituicaoId) throw new ApiError('protocol')
      patch({ instituicao: institution, curso: course, loading: false })
      await query(0)
    } catch (error) {
      if (!current(controller)) return
      const code = error instanceof ApiError ? error.status : null
      patch({ loading: false, unavailable: code === 401 || code === 403 || code === 404,
        error: code === 404 ? 'Instituição ou curso inexistente ou indisponível para esta consulta.'
          : code === 401 || code === 403 ? 'A API não autorizou esta consulta. Reabra a área para conferir seu acesso.'
            : 'Não foi possível consultar o curso. Tente carregar novamente.' })
    } finally { if (task === controller) task = null }
  }
  return {
    load, reload: () => { if (!state.loading) { if (state.curso) void query(); else void load(state.instituicaoId, state.cursoId) } }, getState: () => state,
    setSize(size: number) { if (!disposed && state.data && !state.loading && [20, 50, 100].includes(size)) void query(0, size) },
    goToPage(number: number) { const page = state.data?.page; if (!access() || state.loading || !page || !Number.isSafeInteger(number) || number < 0 || number >= page.totalPages) return; void query(number) },
    subscribe(listener: (value: DisciplinasState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; task?.abort(); task = null; state = empty(); context = ''; listeners.clear() },
  }
}
