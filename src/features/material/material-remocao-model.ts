import { ApiError } from '../../shared/http/client.ts'
import { validId } from './material-service.ts'
import { canRemoveMaterial, type RemovalSummary, type MaterialRemocaoService } from './material-remocao-service.ts'

export interface MaterialRemocaoState { material: RemovalSummary | null; loading: boolean; loadError: string; confirmed: boolean; sending: boolean; result: '' | 'removed' | 'alreadyRemoved'; error: string; uncertain: boolean }
const empty = (): MaterialRemocaoState => ({ material: null, loading: false, loadError: '', confirmed: false, sending: false, result: '', error: '', uncertain: false })

export function createMaterialRemocaoModel(service: MaterialRemocaoService, userId: () => string | null) {
  let state = empty(), disposed = false, currentId = ''
  const tasks = new Map<string, AbortController>(), listeners = new Set<(value: MaterialRemocaoState) => void>()
  const patch = (value: Partial<MaterialRemocaoState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const cancelAll = () => { for (const task of tasks.values()) task.abort(); tasks.clear() }
  const current = (key: string, task: AbortController, identity: string | null) => {
    if (disposed || tasks.get(key) !== task || task.signal.aborted) return false
    if (identity !== userId()) { cancelAll(); state = empty(); patch({ loadError: 'O acesso mudou. Reabra o material com a conta atual.' }); return false }
    return true
  }
  const eligible = () => !disposed && !state.loading && !state.sending && !state.result && !state.uncertain && !!state.material && canRemoveMaterial(state.material, userId())

  async function load(id: string) {
    if (disposed) return
    cancelAll(); state = empty(); currentId = id.toLowerCase()
    patch({})
    if (!validId(currentId)) { patch({ loadError: 'Endereço de material inválido.' }); return }
    const identity = userId()
    if (!validId(identity)) { patch({ loadError: 'Entre novamente para consultar seus materiais.' }); return }
    const task = new AbortController(); tasks.set('load', task); patch({ loading: true })
    try {
      const material = await service.load(currentId, task.signal)
      if (!current('load', task, identity)) return
      if (material.usuarioId.toLowerCase() !== identity.toLowerCase()) { patch({ loading: false, loadError: 'Material indisponível para remoção nesta conta.' }); return }
      patch({ material, loading: false, result: material.status === 'REMOVIDO' ? 'alreadyRemoved' : '' })
    } catch (error) {
      if (current('load', task, identity)) patch({ loading: false, loadError: error instanceof ApiError ? error.message : 'Não foi possível consultar o material. Tente novamente.' })
    } finally { if (tasks.get('load') === task) tasks.delete('load') }
  }

  async function submit() {
    if (!eligible() || !state.confirmed || !state.material) return
    const material = state.material, identity = userId(), task = new AbortController()
    tasks.set('remove', task)
    // Toda tentativa consome a confirmacao; falha nunca reaproveita consentimento anterior.
    patch({ sending: true, confirmed: false, error: '', uncertain: false })
    try {
      await service.remove(material.id, task.signal)
      if (current('remove', task, identity)) patch({ material: { ...material, status: 'REMOVIDO' }, sending: false, result: 'removed' })
    } catch (error) {
      if (!current('remove', task, identity)) return
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || (error.status ?? 500) >= 500 || error.status === 408
      patch({ sending: false, uncertain, error: uncertain
        ? 'Não foi possível confirmar o resultado. Consulte o estado atual antes de tentar novamente: o material pode ter sido removido.'
        : error instanceof ApiError ? error.message : 'Não foi possível concluir a operação.' })
    } finally { if (tasks.get('remove') === task) tasks.delete('remove') }
  }
  return {
    load, submit, getState: () => state, reload: () => load(currentId),
    setConfirmed(value: boolean) { if (eligible()) patch({ confirmed: value === true }) },
    subscribe(listener: (value: MaterialRemocaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancelAll(); state = empty(); listeners.clear() },
  }
}
