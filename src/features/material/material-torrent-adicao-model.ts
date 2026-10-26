import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { validateTorrentFile } from './material-cadastro-service.ts'
import type { MaterialCompartilhamento } from './material-compartilhamento.ts'
import { canEditMaterial } from './material-edicao-service.ts'
import { validId } from './material-service.ts'
import { canAddMaterialTorrent, type MaterialTorrentAdicaoService } from './material-torrent-adicao-service.ts'

export interface MaterialTorrentAdicaoState {
  material: MaterialCompartilhamento | null; file: File | null; confirmed: boolean; loading: boolean; sending: boolean
  loadError: string; error: string; fieldError: string; denied: boolean; mustReload: boolean; savedId: string; torrentId: string
}
const empty = (): MaterialTorrentAdicaoState => ({ material: null, file: null, confirmed: false, loading: false, sending: false, loadError: '', error: '', fieldError: '', denied: false, mustReload: false, savedId: '', torrentId: '' })
export function createMaterialTorrentAdicaoModel(service: MaterialTorrentAdicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, currentId = '', context = '', task: AbortController | null = null
  const listeners = new Set<(value: MaterialTorrentAdicaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<MaterialTorrentAdicaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) ? actor.id.toLowerCase() + ':' + actor.perfil : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny(message: string) { cancel(); state = { ...empty(), denied: true, loadError: message }; emit() }
  function authorized() {
    if (disposed) return false
    if (!context || context !== signature()) { deny('O acesso mudou. Reabra o Material com a conta atual.'); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && authorized()
  const eligible = () => authorized() && !state.loading && !state.sending && !state.mustReload && !state.savedId && !!state.material && canAddMaterialTorrent(state.material, user()?.id)
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
      if (!canEditMaterial(material, user()?.id)) { deny('Este Material não aceita novos Torrents nesta conta ou estado.'); return }
      patch({ material, loading: false })
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { deny('Material indisponível para esta conta. Reabra a consulta para conferir o acesso.'); return }
      patch({ loading: false, loadError: 'Não foi possível consultar o Material. Tente carregar novamente.' })
    } finally { if (version === generation) task = null }
  }
  async function submit() {
    if (!eligible() || !state.material || !state.confirmed) return
    const fieldError = validateTorrentFile(state.file)
    if (fieldError) { patch({ file: null, fieldError, confirmed: false }); return }
    const original = state.material, file = state.file!, version = generation, identity = user()!.id
    task = new AbortController(); patch({ sending: true, confirmed: false, fieldError: '', error: '' })
    try {
      const result = await service.add(original, file, identity, task.signal)
      if (!current(version)) return
      if (result.id !== currentId || !validId(result.torrentId)) throw new ApiError('protocol')
      state = { ...empty(), savedId: result.id, torrentId: result.torrentId }; emit()
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { deny('Adição indisponível para esta conta. Reabra a consulta para conferir o acesso.'); return }
      if (error instanceof ApiError && error.kind === 'http' && [400, 413, 415].includes(error.status ?? 0)) {
        patch({ sending: false, file: null, error: error.status === 413 ? 'Confira o limite de 2 MiB do .torrent e selecione o arquivo novamente.' : 'Confira o metainfo .torrent v1 e selecione um arquivo válido novamente.' })
      } else {
        state = { ...empty(), mustReload: true, error: error instanceof ApiError && error.status === 409
          ? 'O estado, limite ou Info Hash conflita com esta adição. Consulte os dados atuais antes de selecionar outro arquivo.'
          : 'Não foi possível confirmar o resultado. O Torrent pode ter sido cadastrado. Consulte os mecanismos atuais antes de preparar outro envio.' }; emit()
      }
    } finally { if (version === generation) task = null }
  }
  return {
    load, submit, getState: () => state,
    async reload() { if (authorized() && !state.sending) await load(currentId) },
    selectFiles(files: readonly File[]) {
      if (!eligible()) return
      const fieldError = files.length === 1 ? validateTorrentFile(files[0]!) : 'Selecione somente um arquivo .torrent v1.'
      patch({ file: fieldError ? null : files[0]!, confirmed: false, fieldError, error: '' })
    },
    clearFile() { if (eligible()) patch({ file: null, confirmed: false, fieldError: '', error: '' }) },
    setConfirmed(value: boolean) { if (eligible()) patch({ confirmed: value === true }) },
    subscribe(listener: (value: MaterialTorrentAdicaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; currentId = ''; listeners.clear() },
  }
}
