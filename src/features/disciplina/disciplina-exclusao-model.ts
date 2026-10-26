import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import type { Curso } from '../curso/curso-service.ts'
import type { Instituicao } from '../instituicao/instituicao-service.ts'
import type { Disciplina } from './disciplina-service.ts'
import type { DisciplinaExclusaoService } from './disciplina-exclusao-service.ts'

export interface DisciplinaExclusaoState {
  id: string; instituicaoId: string; cursoId: string; instituicao: Instituicao | null; curso: Curso | null; disciplina: Disciplina | null
  loading: boolean; loadError: string; confirmed: boolean; sending: boolean; deleted: boolean; denied: boolean; unavailable: boolean
  conflict: boolean; uncertain: boolean; error: string
}
const empty = (instituicaoId = '', cursoId = '', id = ''): DisciplinaExclusaoState => ({ id, instituicaoId, cursoId, instituicao: null, curso: null, disciplina: null, loading: false, loadError: '', confirmed: false, sending: false, deleted: false, denied: false, unavailable: false, conflict: false, uncertain: false, error: '' })

export function createDisciplinaExclusaoModel(service: DisciplinaExclusaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null
  const listeners = new Set<(value: DisciplinaExclusaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<DisciplinaExclusaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny(message = 'Exclusão disponível somente para administradores. Reabra a área com uma conta administradora.') {
    cancel(); state = { ...empty(state.instituicaoId, state.cursoId, state.id), denied: true, error: message }; emit()
  }
  function access() {
    if (disposed) return false
    if (!context || signature() !== context) { deny('O acesso mudou. Reabra a exclusão com uma conta administradora.'); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && access()
  async function load(instituicaoId: string, cursoId: string, id: string) {
    if (disposed) return
    const actor = signature(); cancel(); const version = generation; context = actor
    if (!actor || !validId(instituicaoId) || !validId(cursoId) || !validId(id)) {
      state = { ...empty(), denied: !actor, unavailable: !!actor, loadError: actor ? 'Endereço de instituição, curso ou disciplina inválido.' : 'Exclusão disponível somente para administradores.' }; emit(); return
    }
    instituicaoId = instituicaoId.toLowerCase(); cursoId = cursoId.toLowerCase(); id = id.toLowerCase()
    state = { ...empty(instituicaoId, cursoId, id), loading: true }; emit(); task = new AbortController()
    try {
      const target = await service.load(instituicaoId, cursoId, id, task.signal)
      if (!current(version)) return
      if (target.instituicao.id !== instituicaoId || target.curso.id !== cursoId || target.curso.instituicaoId !== instituicaoId || target.disciplina.id !== id || target.disciplina.cursoId !== cursoId) throw new ApiError('protocol')
      state = { ...empty(instituicaoId, cursoId, id), instituicao: target.instituicao, curso: target.curso, disciplina: target.disciplina }; emit()
    } catch (error) {
      if (!current(version)) return
      const code = error instanceof ApiError ? error.status : null
      if (code === 401 || code === 403) deny('A API não autorizou esta operação. Reabra a área para conferir o acesso.')
      else if (code === 404) { state = { ...empty(instituicaoId, cursoId, id), unavailable: true, loadError: 'Instituição, curso ou disciplina não está disponível. A consulta não confirma o resultado de uma exclusão anterior.' }; emit() }
      else { state = { ...empty(instituicaoId, cursoId, id), loadError: 'Não foi possível consultar a disciplina e seus vínculos. Tente novamente.' }; emit() }
    } finally { if (version === generation) task = null }
  }
  const eligible = () => access() && !!state.disciplina && !!state.curso && !!state.instituicao && !state.loading && !state.sending && !state.deleted && !state.denied && !state.unavailable && !state.uncertain && !state.conflict
  return {
    load,
    async reload() { if (!disposed && state.id && state.instituicaoId && state.cursoId && !state.loading && !state.sending) await load(state.instituicaoId, state.cursoId, state.id) },
    setConfirmed(value: boolean) { if (eligible()) patch({ confirmed: value === true }) },
    async submit() {
      if (!eligible() || !state.confirmed || !state.disciplina) return
      const target = state.disciplina, version = generation; task = new AbortController()
      patch({ sending: true, confirmed: false, error: '' })
      try {
        await service.remove(target.id, task.signal)
        if (current(version)) patch({ sending: false, deleted: true, disciplina: target })
      } catch (error) {
        if (!current(version)) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { deny('A API não autorizou a exclusão. Reabra a área para conferir o acesso.'); return }
        if (error instanceof ApiError && error.status === 404) {
          state = { ...empty(state.instituicaoId, state.cursoId, state.id), unavailable: true, loadError: 'A disciplina não está mais disponível. Esta resposta não confirma a exclusão solicitada.' }; emit(); return
        }
        if (error instanceof ApiError && error.kind === 'http' && error.status === 409) patch({ sending: false, conflict: true, error: 'A API não confirmou a exclusão. Pode haver materiais vinculados, inclusive REMOVIDO, ou o estado pode ter mudado. Consulte os dados antes de decidir novamente.' })
        else {
          const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
          patch({ sending: false, uncertain, error: uncertain
            ? 'Não foi possível confirmar o resultado. Consulte a disciplina antes de preparar uma nova confirmação. Ela pode ter sido excluída.'
            : 'A API não confirmou a exclusão. Consulte novamente antes de tentar outra vez.' })
        }
      } finally { if (version === generation) task = null }
    },
    getState: () => state,
    subscribe(listener: (value: DisciplinaExclusaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
