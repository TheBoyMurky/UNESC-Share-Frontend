import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canEditMaterial } from './material-edicao-service.ts'
import { validId } from './material-service.ts'
import { canAddMaterialMagnets, validateMagnetAddition, type MagnetMaterial, type MaterialMagnetAdicaoService } from './material-magnet-adicao-service.ts'

export interface MaterialMagnetAdicaoState {
  material: MagnetMaterial | null; uris: string[]; confirmed: boolean; loading: boolean; sending: boolean
  loadError: string; error: string; fieldError: string; denied: boolean; mustReload: boolean; savedId: string
}
const empty = (): MaterialMagnetAdicaoState => ({ material: null, uris: [], confirmed: false, loading: false, sending: false, loadError: '', error: '', fieldError: '', denied: false, mustReload: false, savedId: '' })
export function createMaterialMagnetAdicaoModel(service: MaterialMagnetAdicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, currentId = '', context = '', task: AbortController | null = null
  const listeners = new Set<(value: MaterialMagnetAdicaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<MaterialMagnetAdicaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) ? actor.id.toLowerCase() + ':' + actor.perfil : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny(message: string) { cancel(); state = { ...empty(), denied: true, loadError: message }; emit() }
  function authorized() {
    if (disposed) return false
    if (!context || context !== signature()) { deny('O acesso mudou. Reabra o Material com a conta atual.'); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && authorized()
  const eligible = () => authorized() && !state.loading && !state.sending && !state.mustReload && !state.savedId && !!state.material && canAddMaterialMagnets(state.material, user()?.id)
  async function load(id: string) {
    if (disposed) return
    cancel(); state = empty(); currentId = id.toLowerCase(); context = signature(); emit()
    if (!authorized()) return
    if (!validId(currentId)) { patch({ loadError: 'Endereço de Material inválido.' }); return }
    task = new AbortController(); const version = generation
    patch({ loading: true })
    try {
      const material = await service.load(currentId, task.signal)
      if (!current(version)) return
      if (!canEditMaterial(material, user()?.id)) { deny('Este Material não aceita novos Magnets nesta conta ou estado.'); return }
      patch({ material, loading: false, uris: material.magnets.length < 10 ? [''] : [] })
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { deny('Material indisponível para esta conta. Reabra a consulta para conferir o acesso.'); return }
      patch({ loading: false, loadError: 'Não foi possível consultar o Material. Tente carregar novamente.' })
    } finally { if (version === generation) task = null }
  }
  async function submit() {
    if (!eligible() || !state.material || !state.confirmed) return
    const fieldError = validateMagnetAddition(state.uris, state.material.magnets.length)
    if (fieldError) { patch({ fieldError, confirmed: false }); return }
    const original = state.material, uris = [...state.uris], version = generation, identity = user()!.id
    task = new AbortController(); patch({ sending: true, confirmed: false, fieldError: '', error: '' })
    try {
      const result = await service.add(original, uris, identity, task.signal)
      if (!current(version)) return
      if (result.id !== currentId) throw new ApiError('protocol')
      state = { ...empty(), savedId: result.id }; emit()
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { deny('Adição indisponível para esta conta. Reabra a consulta para conferir o acesso.'); return }
      if (error instanceof ApiError && error.kind === 'http' && error.status === 400) {
        patch({ sending: false, error: 'Confira as URIs antes de confirmar uma nova tentativa.' })
      } else {
        state = { ...empty(), mustReload: true, error: error instanceof ApiError && error.status === 409
          ? 'O estado, limite ou hashes do Material conflitam com este lote. Descarte e consulte os dados atuais antes de preparar outro envio.'
          : 'Não foi possível confirmar o resultado. O lote pode ter sido adicionado. Consulte os mecanismos atuais antes de preparar outro envio.' }; emit()
      }
    } finally { if (version === generation) task = null }
  }
  return {
    load, submit, getState: () => state,
    async reload() { if (authorized() && !state.sending) await load(currentId) },
    changeUri(index: number, value: string) {
      if (!eligible() || !Number.isSafeInteger(index) || index < 0 || index >= state.uris.length) return
      patch({ uris: state.uris.map((uri, i) => i === index ? value : uri), confirmed: false, fieldError: '', error: '' })
    },
    addField() { if (eligible() && state.uris.length < 10 - state.material!.magnets.length) patch({ uris: [...state.uris, ''], confirmed: false, fieldError: '', error: '' }) },
    removeField(index: number) { if (eligible() && state.uris.length > 1 && Number.isSafeInteger(index) && index >= 0 && index < state.uris.length) patch({ uris: state.uris.filter((_, i) => i !== index), confirmed: false, fieldError: '', error: '' }) },
    setConfirmed(value: boolean) { if (eligible()) patch({ confirmed: value === true }) },
    subscribe(listener: (value: MaterialMagnetAdicaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; currentId = ''; listeners.clear() },
  }
}
