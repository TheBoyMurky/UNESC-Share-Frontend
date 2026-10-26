import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import type { Instituicao } from '../instituicao/instituicao-service.ts'
import type { Curso } from './curso-service.ts'
import type { CursoExclusaoService } from './curso-exclusao-service.ts'

export interface CursoExclusaoState { id: string; instituicaoId: string; curso: Curso | null; instituicao: Instituicao | null; loading: boolean; loadError: string; confirmed: boolean; sending: boolean; deleted: boolean; denied: boolean; unavailable: boolean; conflict: boolean; uncertain: boolean; error: string }
const empty = (instituicaoId = '', id = ''): CursoExclusaoState => ({ id, instituicaoId, curso: null, instituicao: null, loading: false, loadError: '', confirmed: false, sending: false, deleted: false, denied: false, unavailable: false, conflict: false, uncertain: false, error: '' })
export function createCursoExclusaoModel(service: CursoExclusaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null
  const listeners = new Set<(value: CursoExclusaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<CursoExclusaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny(message = 'Exclusão indisponível nesta consulta. Reabra a área com uma conta administradora.') {
    cancel(); state = { ...empty(state.instituicaoId, state.id), denied: true, error: message }; emit()
  }
  function access() {
    if (disposed) return false
    if (!context || signature() !== context) { deny('O acesso mudou. Reabra a exclusão com uma conta administradora.'); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && access()
  async function load(instituicaoId: string, id: string) {
    if (disposed) return
    const actor = signature(); cancel(); const version = generation; context = actor
    if (!actor || !validId(instituicaoId) || !validId(id)) {
      state = { ...empty(), denied: !actor, unavailable: !!actor, loadError: actor ? 'Endereço do curso ou instituição inválido.' : 'Exclusão disponível somente para administradores.' }; emit(); return
    }
    instituicaoId = instituicaoId.toLowerCase(); id = id.toLowerCase()
    state = { ...empty(instituicaoId, id), loading: true }; emit(); task = new AbortController()
    try {
      const target = await service.load(instituicaoId, id, task.signal)
      if (!current(version)) return
      if (target.curso.id !== id || target.curso.instituicaoId !== instituicaoId || target.instituicao.id !== instituicaoId) throw new ApiError('protocol')
      state = { ...empty(instituicaoId, id), curso: target.curso, instituicao: target.instituicao }; emit()
    } catch (error) {
      if (!current(version)) return
      const code = error instanceof ApiError ? error.status : null
      if (code === 401 || code === 403) deny('A API não autorizou esta operação. Reabra a área para conferir o acesso.')
      else if (code === 404) { state = { ...empty(instituicaoId, id), unavailable: true, loadError: 'Curso ou instituição não está disponível. A consulta não confirma o resultado de uma exclusão anterior.' }; emit() }
      else { state = { ...empty(instituicaoId, id), loadError: 'Não foi possível consultar o curso e sua instituição. Tente novamente.' }; emit() }
    } finally { if (version === generation) task = null }
  }
  const eligible = () => access() && !!state.curso && !!state.instituicao && !state.loading && !state.sending && !state.deleted && !state.denied && !state.unavailable && !state.uncertain && !state.conflict
  return {
    load,
    reload() { if (!disposed && state.id && state.instituicaoId && !state.loading && !state.sending) void load(state.instituicaoId, state.id) },
    setConfirmed(value: boolean) { if (eligible()) patch({ confirmed: value === true }) },
    async submit() {
      if (!eligible() || !state.confirmed || !state.curso) return
      const target = state.curso, version = generation; task = new AbortController()
      patch({ sending: true, confirmed: false, error: '' })
      try {
        await service.remove(target.id, task.signal)
        if (current(version)) patch({ sending: false, deleted: true, curso: target })
      } catch (error) {
        if (!current(version)) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { deny('A API não autorizou a exclusão. Reabra a área para conferir o acesso.'); return }
        if (error instanceof ApiError && error.status === 404) {
          state = { ...empty(state.instituicaoId, state.id), unavailable: true, loadError: 'O curso não está mais disponível. Esta resposta não confirma a exclusão solicitada.' }; emit(); return
        }
        if (error instanceof ApiError && error.kind === 'http' && error.status === 409) patch({ sending: false, conflict: true, error: 'A API não confirmou a exclusão. O curso pode ter disciplinas vinculadas ou o estado pode ter mudado. Consulte os dados antes de decidir novamente.' })
        else {
          const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
          patch({ sending: false, uncertain, error: uncertain
            ? 'Não foi possível confirmar o resultado. Consulte o curso antes de preparar uma nova confirmação. Ele pode ter sido excluído.'
            : 'A API não confirmou a exclusão. Consulte novamente antes de tentar outra vez.' })
        }
      } finally { if (version === generation) task = null }
    },
    getState: () => state,
    subscribe(listener: (value: CursoExclusaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
