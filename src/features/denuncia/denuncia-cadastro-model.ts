import { ApiError } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'
import { validateDenuncia, type DenunciaErrors, type DenunciaInput, type DenunciaMaterial, type DenunciaService } from './denuncia-service.ts'

export interface DenunciaCadastroState {
  material: DenunciaMaterial | null; loading: boolean; loadError: string; unavailable: boolean
  draft: DenunciaInput; errors: DenunciaErrors; sending: boolean; error: string; createdId: string; blocked: '' | 'conflict' | 'uncertain'
}
const empty = (): DenunciaCadastroState => ({ material: null, loading: false, loadError: '', unavailable: false,
  draft: { motivo: '', descricao: '' }, errors: {}, sending: false, error: '', createdId: '', blocked: '' })
export function createDenunciaCadastroModel(service: DenunciaService, userId: () => string | null) {
  let state = empty(), disposed = false, materialId = '', identity: string | null = null, task: AbortController | null = null
  const listeners = new Set<(value: DenunciaCadastroState) => void>()
  const patch = (value: Partial<DenunciaCadastroState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const access = () => {
    if (disposed) return false
    if (!validId(identity) || identity !== userId()) { task?.abort(); task = null; state = empty(); patch({ unavailable: true, loadError: 'O acesso mudou. Reabra o material com a conta atual.' }); return false }
    return !state.unavailable
  }
  const current = (controller: AbortController) => !disposed && task === controller && !controller.signal.aborted && access()
  async function load(id: string) {
    if (disposed) return
    task?.abort(); task = null; state = empty(); materialId = id.toLowerCase(); identity = userId(); patch({})
    if (!validId(materialId)) { patch({ unavailable: true, loadError: 'Endereço de material inválido.' }); return }
    if (!access()) return
    const controller = new AbortController(); task = controller; patch({ loading: true })
    try {
      const material = await service.material(materialId, controller.signal)
      if (!current(controller)) return
      if (material.status !== 'PUBLICADO') { patch({ loading: false, unavailable: true, loadError: 'Denúncias podem ser cadastradas somente em materiais publicados, inclusive para autor e equipe.' }); return }
      patch({ material, loading: false })
    } catch (error) {
      if (current(controller)) patch({ loading: false, unavailable: error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0), loadError: error instanceof ApiError ? error.message : 'Não foi possível consultar o material. Tente novamente.' })
    } finally { if (task === controller) task = null }
  }
  async function submit() {
    if (!access() || state.loading || state.sending || state.createdId || state.blocked || state.material?.status !== 'PUBLICADO') return
    const errors = validateDenuncia(state.draft)
    if (Object.keys(errors).length) { patch({ errors, error: '' }); return }
    const controller = new AbortController(); task = controller; patch({ sending: true, errors: {}, error: '' })
    try {
      const result = await service.create(materialId, { ...state.draft }, controller.signal)
      if (current(controller)) patch({ sending: false, draft: { motivo: '', descricao: '' }, createdId: result.id })
    } catch (error) {
      if (!current(controller)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) {
        patch({ material: null, draft: { motivo: '', descricao: '' }, sending: false, unavailable: true, loadError: error.status === 404 ? 'O material não está disponível para receber denúncias. Reabra os detalhes para conferir.' : error.message }); return
      }
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
      const conflict = error instanceof ApiError && error.status === 409
      patch({ sending: false, blocked: uncertain ? 'uncertain' : conflict ? 'conflict' : '', error: uncertain
        ? 'Não foi possível confirmar o cadastro. A denúncia pode ter sido registrada. Confira Minhas denúncias antes de abrir outra tentativa.'
        : conflict ? 'Pode existir uma denúncia aberta sua para este material ou outro conflito. Confira Minhas denúncias antes de abrir outra tentativa.'
        : error instanceof ApiError && error.status === 400 ? 'Confira o motivo e a descrição: texto obrigatório com até 2000 caracteres, sem caracteres nulos.'
        : error instanceof ApiError ? error.message : 'Não foi possível cadastrar a denúncia.' })
    } finally { if (task === controller) task = null }
  }
  return {
    load, submit, getState: () => state,
    retry() { if (access() && !state.material && !state.loading && !state.sending && !state.blocked && !state.createdId) return load(materialId) },
    changeField(key: keyof DenunciaInput, value: string) {
      if (access() && state.material && !state.sending && !state.createdId && !state.blocked && (key === 'motivo' || key === 'descricao')) {
        patch({ draft: { ...state.draft, [key]: value }, errors: { ...state.errors, [key]: undefined }, error: '' })
      }
    },
    subscribe(listener: (value: DenunciaCadastroState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; task?.abort(); task = null; state = empty(); listeners.clear() },
  }
}
