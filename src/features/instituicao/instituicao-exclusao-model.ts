import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import type { Instituicao } from './instituicao-service.ts'
import type { InstituicaoExclusaoService } from './instituicao-exclusao-service.ts'

export interface InstituicaoExclusaoState { id: string; institution: Instituicao | null; loading: boolean; loadError: string; confirmed: boolean; sending: boolean; deleted: boolean; denied: boolean; unavailable: boolean; conflict: boolean; uncertain: boolean; error: string }
const empty = (id = ''): InstituicaoExclusaoState => ({ id, institution: null, loading: false, loadError: '', confirmed: false, sending: false, deleted: false, denied: false, unavailable: false, conflict: false, uncertain: false, error: '' })
export function createInstituicaoExclusaoModel(service: InstituicaoExclusaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null
  const listeners = new Set<(value: InstituicaoExclusaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<InstituicaoExclusaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny() { cancel(); state = { ...empty(state.id), denied: true, error: 'Ação indisponível nesta consulta. Reabra a área com uma conta administradora.' }; emit() }
  function access() { if (disposed) return false; if (!context || signature() !== context) { deny(); return false } return !state.denied }
  const current = (version: number) => !disposed && generation === version && access()
  async function load(id: string) {
    if (disposed) return
    const actor = signature(); cancel(); const version = generation; context = actor
    if (!actor || !validId(id)) { state = { ...empty(), denied: true, loadError: 'Instituição ou acesso inválido.' }; emit(); return }
    id = id.toLowerCase(); state = { ...empty(id), loading: true }; emit(); task = new AbortController()
    try {
      const institution = await service.load(id, task.signal)
      if (!current(version)) return
      if (institution.id !== id) throw new ApiError('protocol')
      state = { ...empty(id), institution }; emit()
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && error.status === 401) { deny(); return }
      if (error instanceof ApiError && error.status === 403) { deny(); return }
      if (error instanceof ApiError && error.status === 404) state = { ...empty(id), unavailable: true, loadError: 'A instituição não está disponível. A consulta não permite confirmar o resultado de uma exclusão anterior.' }
      else state = { ...empty(id), loadError: 'Não foi possível consultar a instituição. Tente novamente.' }
      emit()
    } finally { if (version === generation) task = null }
  }
  const eligible = () => access() && !!state.institution && !state.loading && !state.sending && !state.deleted && !state.denied && !state.unavailable && !state.uncertain && !state.conflict
  return {
    load,
    reload() { if (!disposed && state.id && !state.loading && !state.sending) void load(state.id) },
    setConfirmed(value: boolean) { if (eligible()) patch({ confirmed: value === true }) },
    async submit() {
      if (!eligible() || !state.confirmed || !state.institution) return
      const target = state.institution, version = generation; task = new AbortController()
      patch({ sending: true, confirmed: false, error: '' })
      try {
        await service.remove(target.id, task.signal)
        if (current(version)) patch({ sending: false, deleted: true, institution: target })
      } catch (error) {
        if (!current(version)) return
        if (error instanceof ApiError && error.status === 401) { deny(); return }
        if (error instanceof ApiError && error.status === 403) { deny(); return }
        if (error instanceof ApiError && error.status === 404) { state = { ...empty(state.id), unavailable: true, loadError: 'A instituição não está disponível. Nenhum sucesso foi confirmado por esta resposta.' }; emit(); return }
        if (error instanceof ApiError && error.kind === 'http' && error.status === 409) patch({ sending: false, conflict: true, error: 'A instituição possui cursos vinculados ou mudou durante a operação. A API não confirmou a exclusão; consulte os dados antes de outra tentativa.' })
        else {
          const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
          patch({ sending: false, uncertain, error: uncertain
            ? 'Não foi possível confirmar o resultado. Consulte a instituição antes de preparar uma nova confirmação. Ela pode ter sido excluída.'
            : 'A API não confirmou a exclusão. Consulte novamente antes de tentar outra vez.' })
        }
      } finally { if (version === generation) task = null }
    },
    getState: () => state,
    subscribe(listener: (value: InstituicaoExclusaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
