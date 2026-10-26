import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canModerate } from '../auth/permissions.ts'
import type { ComentarioModeracao } from '../comentario/comentario-service.ts'
import { validId, type MaterialStatus } from '../material/material-service.ts'
import { createComentarioConsultaEquipeModel, type ComentarioEquipeState } from './comentario-consulta-equipe-model.ts'
import { emptyModeracaoFilaState } from './moderacao-fila-model.ts'
import { comentarioDecisionInfo, validateMotivoComentario, type ComentarioDecision, type ModeracaoComentarioService } from './moderacao-comentario-service.ts'

export interface ComentarioDecisaoState {
  read: ComentarioEquipeState
  panel: boolean
  kind: ComentarioDecision | null
  target: ComentarioModeracao | null
  motivo: string
  confirmed: boolean
  sending: boolean
  mustReload: boolean
  error: string
  notice: string
}
const emptyRead = (): ComentarioEquipeState => ({ ...emptyModeracaoFilaState<ComentarioModeracao>(), mode: 'list', selectedId: null })
const empty = (): ComentarioDecisaoState => ({ read: emptyRead(), panel: false, kind: null, target: null, motivo: '', confirmed: false, sending: false, mustReload: false, error: '', notice: '' })

// Compoe a consulta existente; a selecao para escrita nunca e inferida do historico.
export function createComentarioDecisaoModel(service: ModeracaoComentarioService, user: () => Pick<User, 'id' | 'perfil'> | null, materialStatus: () => MaterialStatus | undefined = () => undefined) {
  let state = empty(), disposed = false, generation = 0, materialId = '', context = ''
  let reader: ReturnType<typeof createComentarioConsultaEquipeModel> | null = null
  let unsubscribe: (() => void) | null = null, controller: AbortController | null = null
  const listeners = new Set<(value: ComentarioDecisaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const signature = () => { const value = user(); return value && validId(value.id) && canModerate(value) ? value.id.toLowerCase() + ':' + value.perfil + ':' + (materialStatus() ?? '') : '' }
  function cancel() { generation++; controller?.abort(); controller = null; unsubscribe?.(); unsubscribe = null; reader?.dispose(); reader = null }
  function deny(message: string) { cancel(); state = { ...empty(), read: { ...emptyRead(), denied: true, error: message } }; emit() }
  function authorized() {
    if (disposed) return false
    if (!context || context !== signature()) { deny('O contexto da revisão mudou. Reabra o Material com uma conta autorizada.'); return false }
    return !state.read.denied
  }
  function current(version: number) { return !disposed && generation === version && authorized() }
  async function readList(notice = '') {
    cancel(); state = { ...empty(), notice }; emit()
    if (!authorized()) return
    const version = generation
    reader = createComentarioConsultaEquipeModel(service, user)
    unsubscribe = reader.subscribe(read => {
      if (!current(version)) return
      if (read.denied) { cancel(); state = { ...empty(), read }; emit(); return }
      state = { ...state, read }; emit()
    })
    await reader.load(materialId)
  }
  async function load(id: string) {
    if (disposed) return
    materialId = id.toLowerCase(); context = signature()
    await readList()
  }
  function open(id: string, kind: ComentarioDecision) {
    if (!authorized() || state.panel || state.read.mode !== 'list' || state.read.loading || !validId(id)) return
    if (kind === 'reexibicao' && materialStatus() !== 'PUBLICADO') return
    const target = state.read.data?.content.find(comment => comment.id === id.toLowerCase() && comment.status === comentarioDecisionInfo[kind].source)
    if (!target) return
    // Descartar a pagina; somente o comentario selecionado e exibido na confirmacao.
    cancel(); state = { ...empty(), panel: true, kind, target: { ...target } }; emit()
  }
  async function submit() {
    if (!authorized() || !state.panel || !state.kind || !state.target || state.sending || state.mustReload || !state.confirmed) return
    if (state.kind === 'reexibicao' && materialStatus() !== 'PUBLICADO') return
    const validation = validateMotivoComentario(state.motivo)
    if (validation) { state = { ...state, error: validation, confirmed: false }; emit(); return }
    const target = state.target, motivo = state.motivo.trim(), version = generation, kind = state.kind, info = comentarioDecisionInfo[kind]
    controller = new AbortController()
    state = { ...state, sending: true, confirmed: false, error: '' }; emit()
    try {
      const response = await (kind === 'ocultacao' ? service.hide : service.reveal)(materialId, target.id, motivo, controller.signal)
      if (!current(version)) return
      if (response.id !== target.id || response.materialId !== target.materialId || response.usuarioId !== target.usuarioId || response.dataCadastro !== target.dataCadastro || response.status !== info.target) throw new ApiError('protocol')
      await readList(`${info.result} confirmada pela API. A lista abaixo é uma nova consulta; o histórico pode ser aberto pelo comentário.`)
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { deny('Comentário ou operação indisponível para esta consulta. Reabra a revisão para conferir o acesso.'); return }
      if (error instanceof ApiError && error.kind === 'http' && error.status === 400) {
        state = { ...state, sending: false, error: 'Confira o motivo antes de confirmar uma nova tentativa.' }
      } else {
        state = { ...state, target: null, motivo: '', sending: false, mustReload: true,
          error: error instanceof ApiError && error.status === 409 ? 'O estado do comentário ou do Material mudou. Volte à lista e confira a revisão antes de escolher uma ação.' : `Não foi possível confirmar o resultado. A ${info.noun} pode ter ocorrido. Volte à lista e consulte o histórico antes de preparar outra ação.` }
      }
      emit()
    } finally { if (version === generation) controller = null }
  }
  return {
    load, submit, getState: () => state,
    openHide: (id: string) => open(id, 'ocultacao'),
    openReveal: (id: string) => open(id, 'reexibicao'),
    setMotivo(motivo: string) { if (authorized() && state.panel && state.target && !state.sending && !state.mustReload) { state = { ...state, motivo, confirmed: false, error: '' }; emit() } },
    setConfirmed(confirmed: boolean) { if (authorized() && state.panel && state.target && !state.sending && !state.mustReload) { state = { ...state, confirmed: confirmed === true }; emit() } },
    async closeHide() { if (authorized() && state.panel && !state.sending) await readList() },
    async closeDecision() { if (authorized() && state.panel && !state.sending) await readList() },
    async openHistory(id: string) { if (authorized() && !state.panel) await reader?.openHistory(id) },
    async closeHistory() {
      if (disposed || state.panel) return
      if (!context || context !== signature()) { authorized(); return }
      if (state.read.mode === 'history') await readList()
    },
    async reload() { if (authorized() && !state.panel) await reader?.reload() },
    async setSize(size: number) { if (authorized() && !state.panel) await reader?.setSize(size) },
    async goToPage(number: number) { if (authorized() && !state.panel) await reader?.goToPage(number) },
    subscribe(listener: (value: ComentarioDecisaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; materialId = ''; listeners.clear() },
  }
}
