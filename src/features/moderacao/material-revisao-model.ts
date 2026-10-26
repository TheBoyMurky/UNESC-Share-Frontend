import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canModerate } from '../auth/permissions.ts'
import { createMaterialModel, emptyMaterialState, type MaterialState } from '../material/material-model.ts'
import { validId, type MaterialService } from '../material/material-service.ts'

type MaterialModel = ReturnType<typeof createMaterialModel>
type BrowserActions = Parameters<typeof createMaterialModel>[1]

// Compoe o leitor existente: nao duplica parser, nomes academicos, download ou copia.
export function createMaterialRevisaoModel(service: MaterialService, actions: BrowserActions, user: () => Pick<User, 'id' | 'perfil'> | null): MaterialModel {
  let state = emptyMaterialState(), disposed = false, generation = 0, context = '', currentId = ''
  let inner: MaterialModel | null = null, unsubscribe: (() => void) | null = null
  const listeners = new Set<(value: MaterialState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const signature = () => { const value = user(); return value && validId(value.id) && canModerate(value) ? value.id.toLowerCase() + ':' + value.perfil : '' }
  function reset(error = '') {
    generation++; unsubscribe?.(); unsubscribe = null; inner?.dispose(); inner = null; context = ''
    state = { ...emptyMaterialState(), error }; emit()
  }
  function ensure(version: number, key: string) {
    if (disposed || version !== generation) throw new DOMException('Consulta substituída.', 'AbortError')
    if (!key || signature() !== key) {
      reset('O acesso à equipe mudou. Reabra a revisão com uma conta autorizada.')
      throw new DOMException('Acesso alterado.', 'AbortError')
    }
  }
  async function guarded<T>(version: number, key: string, operation: () => Promise<T> | T): Promise<T> {
    ensure(version, key)
    try { const value = await operation(); ensure(version, key); return value }
    catch (error) {
      if (!disposed && version === generation) {
        if (signature() !== key) reset('O acesso à equipe mudou. Reabra a revisão com uma conta autorizada.')
        else if (error instanceof ApiError && [401, 403].includes(error.status ?? 0)) reset(error.status === 403
          ? 'A API negou acesso à revisão. Confira seu acesso antes de reabrir esta área.' : error.message)
      }
      throw error
    }
  }
  async function load(id: string) {
    if (disposed) return
    currentId = id.toLowerCase(); reset()
    const key = signature()
    if (!key) { state = { ...state, error: 'A revisão é restrita à equipe de moderação.' }; emit(); return }
    if (!validId(currentId)) { state = { ...state, error: 'Endereço de material inválido.' }; emit(); return }
    context = key
    const version = generation
    inner = createMaterialModel({
      detail: (id, signal) => guarded(version, key, () => service.detail(id, signal)),
      academic: (material, signal) => guarded(version, key, () => service.academic(material, signal)),
      download: (materialId, torrentId, signal) => guarded(version, key, () => service.download(materialId, torrentId, signal)),
    }, {
      save: download => guarded(version, key, () => actions.save(download)),
      copy: uri => guarded(version, key, () => actions.copy(uri)),
    })
    unsubscribe = inner.subscribe(value => {
      if (disposed || version !== generation) return
      if (signature() !== key) { reset('O acesso à equipe mudou. Reabra a revisão com uma conta autorizada.'); return }
      state = value; emit()
    })
    await inner.load(currentId)
  }
  function allowed() {
    if (disposed || !inner) return false
    if (!context || signature() !== context) { reset('O acesso à equipe mudou. Reabra a revisão com uma conta autorizada.'); return false }
    return true
  }
  return {
    load, retry: () => load(currentId), getState: () => state,
    async loadAcademic() { if (allowed()) await inner!.loadAcademic() },
    async download(id: string) { if (allowed()) await inner!.download(id) },
    async copy(id: string) { if (allowed()) await inner!.copy(id) },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; reset(); listeners.clear() },
  }
}
