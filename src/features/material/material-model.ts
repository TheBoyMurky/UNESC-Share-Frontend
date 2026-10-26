import { ApiError } from '../../shared/http/client.ts'
import { safeMagnetUri, validId, type AcademicContext, type MaterialDetail, type MaterialService, type TorrentDownload } from './material-service.ts'

export interface MaterialState {
  material: MaterialDetail | null; loading: boolean; error: string
  academic: AcademicContext | null; academicLoading: boolean; academicError: string
  downloads: Record<string, { loading: boolean; error: string; message: string }>
  copies: Record<string, { loading: boolean; manual: boolean; message: string }>
}
interface Actions { save(download: TorrentDownload): void | Promise<void>; copy(value: string): Promise<void> }
export const emptyMaterialState = (): MaterialState => ({ material: null, loading: false, error: '', academic: null, academicLoading: false, academicError: '', downloads: {}, copies: {} })

export function createMaterialModel(service: MaterialService, actions: Actions) {
  let state = emptyMaterialState(), disposed = false
  let currentId = ''
  const tasks = new Map<string, AbortController>()
  const listeners = new Set<(state: MaterialState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<MaterialState>) => { state = { ...state, ...value }; emit() }
  const cancelAll = () => { for (const task of tasks.values()) task.abort(); tasks.clear() }
  const start = (key: string) => { tasks.get(key)?.abort(); const task = new AbortController(); tasks.set(key, task); return task }
  const current = (key: string, task: AbortController) => !disposed && !task.signal.aborted && tasks.get(key) === task
  const message = (error: unknown) => error instanceof ApiError ? error.message : 'Não foi possível concluir a operação. Tente novamente.'

  async function loadAcademic() {
    const material = state.material
    if (!material || disposed || state.academicLoading) return
    const task = start('academic')
    patch({ academicLoading: true, academicError: '' })
    try {
      const academic = await service.academic(material, task.signal)
      if (current('academic', task)) patch({ academic, academicLoading: false })
    } catch (error) {
      if (current('academic', task)) patch({ academicLoading: false, academicError: message(error) })
    }
  }

  async function load(id: string) {
    if (disposed) return
    cancelAll(); currentId = id.toLowerCase(); state = emptyMaterialState(); emit()
    if (!validId(currentId)) { patch({ error: 'Endereço de material inválido.' }); return }
    const task = start('detail')
    patch({ loading: true })
    try {
      const material = await service.detail(currentId, task.signal)
      if (!current('detail', task)) return
      patch({ material, loading: false })
      await loadAcademic()
    } catch (error) {
      if (current('detail', task)) patch({ loading: false, error: message(error) })
    }
  }

  async function download(id: string) {
    const material = state.material
    if (disposed || !material?.torrents.some(item => item.id === id) || state.downloads[id]?.loading) return
    const key = 'torrent:' + id, task = start(key)
    patch({ downloads: { ...state.downloads, [id]: { loading: true, error: '', message: '' } } })
    try {
      const result = await service.download(material.id, id, task.signal)
      if (!current(key, task)) return
      await actions.save(result)
      if (current(key, task)) patch({ downloads: { ...state.downloads, [id]: { loading: false, error: '', message: 'Solicitação enviada ao navegador.' } } })
    } catch (error) {
      if (current(key, task)) patch({ downloads: { ...state.downloads, [id]: { loading: false, error: message(error), message: '' } } })
    }
  }

  async function copy(id: string) {
    const magnet = state.material?.magnets.find(item => item.id === id)
    if (disposed || !magnet || !safeMagnetUri(magnet.magnetUri) || state.copies[id]?.loading) return
    const key = 'copy:' + id, task = start(key)
    patch({ copies: { ...state.copies, [id]: { loading: true, manual: false, message: '' } } })
    try {
      await actions.copy(magnet.magnetUri)
      if (current(key, task)) patch({ copies: { ...state.copies, [id]: { loading: false, manual: false, message: 'Magnet copiado.' } } })
    } catch {
      if (current(key, task)) patch({ copies: { ...state.copies, [id]: { loading: false, manual: true, message: 'Cópia automática indisponível. Selecione o texto e copie manualmente.' } } })
    }
  }

  return {
    load, loadAcademic, download, copy, getState: () => state, retry: () => load(currentId),
    subscribe(listener: (value: MaterialState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancelAll(); listeners.clear() },
  }
}
