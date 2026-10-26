import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import type { Categoria } from './categoria-service.ts'
import type { CategoriaExclusaoService } from './categoria-exclusao-service.ts'

export interface CategoriaExclusaoState { id: string; categoria: Categoria | null; loading: boolean; loadError: string; confirmed: boolean; sending: boolean; deleted: boolean; denied: boolean; unavailable: boolean; conflict: boolean; uncertain: boolean; error: string }
const empty = (id = ''): CategoriaExclusaoState => ({ id, categoria: null, loading: false, loadError: '', confirmed: false, sending: false, deleted: false, denied: false, unavailable: false, conflict: false, uncertain: false, error: '' })

export function createCategoriaExclusaoModel(service: CategoriaExclusaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null
  const listeners = new Set<(value: CategoriaExclusaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<CategoriaExclusaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny() { cancel(); state = { ...empty(state.id), denied: true, error: 'Ação disponível somente para administradores. Reabra a área com uma conta administradora.' }; emit() }
  function access() { if (disposed) return false; if (!context || signature() !== context) { deny(); return false } return !state.denied }
  const current = (version: number) => !disposed && generation === version && access()

  async function load(id: string) {
    if (disposed) return
    const actor = signature(); cancel(); const version = generation; context = actor
    if (!actor || !validId(id)) { state = { ...empty(), denied: true, loadError: 'Categoria ou acesso inválido.' }; emit(); return }
    id = id.toLowerCase(); state = { ...empty(id), loading: true }; emit(); task = new AbortController()
    try {
      const categoria = await service.load(id, task.signal)
      if (!current(version)) return
      if (categoria.id !== id) throw new ApiError('protocol')
      state = { ...empty(id), categoria }; emit()
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && [401, 403].includes(error.status ?? 0)) { deny(); return }
      if (error instanceof ApiError && error.status === 404) state = { ...empty(id), unavailable: true, loadError: 'A categoria não está disponível. A consulta não confirma o resultado de uma exclusão anterior.' }
      else state = { ...empty(id), loadError: 'Não foi possível consultar a categoria. Tente novamente.' }
      emit()
    } finally { if (version === generation) task = null }
  }

  const eligible = () => access() && !!state.categoria && !state.loading && !state.sending && !state.deleted && !state.denied && !state.unavailable && !state.uncertain && !state.conflict
  return {
    load,
    async reload() { if (!disposed && state.id && !state.loading && !state.sending) await load(state.id) },
    setConfirmed(value: boolean) { if (eligible()) patch({ confirmed: value === true }) },
    async submit() {
      if (!eligible() || !state.confirmed || !state.categoria) return
      const target = state.categoria, version = generation; task = new AbortController()
      patch({ sending: true, confirmed: false, error: '' })
      try {
        await service.remove(target.id, task.signal)
        if (current(version)) patch({ sending: false, deleted: true, categoria: target })
      } catch (error) {
        if (!current(version)) return
        if (error instanceof ApiError && [401, 403].includes(error.status ?? 0)) { deny(); return }
        if (error instanceof ApiError && error.status === 404) { state = { ...empty(state.id), unavailable: true, loadError: 'A categoria não está mais disponível. Esta resposta não confirma a exclusão.' }; emit(); return }
        if (error instanceof ApiError && error.kind === 'http' && error.status === 409) patch({ sending: false, conflict: true, error: 'A categoria tem materiais vinculados ou mudou durante a operação. A API não confirmou a exclusão; consulte os dados atuais antes de decidir novamente.' })
        else {
          const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
          patch({ sending: false, uncertain, error: uncertain
            ? 'Não foi possível confirmar o resultado. A categoria pode ter sido excluída; consulte os dados atuais antes de preparar outra confirmação.'
            : 'A API não confirmou a exclusão. Consulte a categoria antes de decidir novamente.' })
        }
      } finally { if (version === generation) task = null }
    },
    getState: () => state,
    subscribe(listener: (value: CategoriaExclusaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
