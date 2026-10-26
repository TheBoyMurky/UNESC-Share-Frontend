import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canModerate } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import { createModeracaoDenunciaDetalheModel, emptyDenunciaDetalheState, type ModeracaoDenunciaDetalheState } from './moderacao-denuncia-detalhe-model.ts'
import type { ModeracaoDenunciaService } from './moderacao-denuncia-service.ts'
import { denunciaActions, denunciaActionInfo, isDenunciaAction, validateJustificativa, type DenunciaAction, type DenunciaDecisaoService } from './denuncia-decisao-service.ts'

export interface DenunciaDecisaoState { open: boolean; kind: DenunciaAction | ''; draft: string; confirmed: boolean; sending: boolean; error: string; fieldError: string; message: string; requiresReload: boolean; forbidden: boolean }
const empty = (): DenunciaDecisaoState => ({ open: false, kind: '', draft: '', confirmed: false, sending: false, error: '', fieldError: '', message: '', requiresReload: false, forbidden: false })
const forbiddenMessage = 'A API não permitiu esta decisão. A ação está bloqueada nesta consulta; denunciante e autor do Material não podem decidir, inclusive administradores. A leitura continua conforme a autorização da API.'
type Reader = ReturnType<typeof createModeracaoDenunciaDetalheModel>
export function createDenunciaDecisaoModel(service: Pick<ModeracaoDenunciaService, 'detail' | 'history'>, decisions: DenunciaDecisaoService, user: () => Pick<User, 'id' | 'perfil'> | null, allowed: readonly DenunciaAction[] = denunciaActions) {
  let state = emptyDenunciaDetalheState(), action = empty(), reader: Reader | null = null, unsubscribe: (() => void) | null = null
  let disposed = false, generation = 0, context = '', reportId = '', task: AbortController | null = null
  const listeners = new Set<(value: ModeracaoDenunciaDetalheState) => void>(), actionListeners = new Set<(value: DenunciaDecisaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<DenunciaDecisaoState>) => { action = { ...action, ...value }; if (!disposed) actionListeners.forEach(listener => listener(action)) }
  const signature = () => { const value = user(); return value && validId(value.id) && canModerate(value) ? value.id.toLowerCase() + ':' + value.perfil : '' }
  function clear(error = '', denied = false) {
    generation++; task?.abort(); task = null; unsubscribe?.(); unsubscribe = null; reader?.dispose(); reader = null; context = ''
    state = { ...emptyDenunciaDetalheState(), error, denied }; action = empty(); patch({}); emit()
  }
  function authorized() {
    if (disposed) return false
    if (!context || context !== signature()) { clear('O acesso à equipe mudou. Reabra a consulta com uma conta autorizada.', true); return false }
    return !state.denied
  }
  async function read(id: string, message = '', forbidden = false) {
    if (disposed) return
    clear(); reportId = id.toLowerCase(); context = signature(); patch({ message, forbidden, error: forbidden ? forbiddenMessage : '' })
    const version = generation
    reader = createModeracaoDenunciaDetalheModel(service, user)
    unsubscribe = reader.subscribe(value => {
      if (disposed || version !== generation) return
      if (context && context !== signature()) { clear('O acesso à equipe mudou. Reabra a consulta com uma conta autorizada.', true); return }
      if (value.denied) { clear(value.error, true); return }
      state = value
      if (!value.report) patch({ open: false, draft: '', confirmed: false, fieldError: '' })
      emit()
    })
    await reader.load(reportId)
  }
  const ready = (kind: DenunciaAction) => isDenunciaAction(kind) && allowed.includes(kind) && !disposed && !state.denied && !state.loading && !state.historyLoading && !!state.history && state.report?.status === denunciaActionInfo[kind].source
    && !action.sending && !action.requiresReload && !action.forbidden
  function active(version: number, key: string) {
    if (disposed || generation !== version) return false
    if (signature() !== key) { clear('O acesso à equipe mudou. Reabra a consulta com uma conta autorizada.', true); return false }
    return true
  }
  async function submit() {
    if (!authorized() || !action.kind || !ready(action.kind) || !action.open || !action.confirmed) return
    const fieldError = validateJustificativa(action.draft)
    patch({ confirmed: false, fieldError, error: '', message: '' })
    if (fieldError) return
    const before = state.report!, kind = action.kind, version = generation, key = context
    task = new AbortController(); patch({ sending: true })
    try {
      const report = await decisions.decide(before.id, kind, action.draft, task.signal)
      if (!active(version, key)) return
      // Invariantes detectam resposta inesperada; nao impedem gravacao sem ETag.
      if (report.id !== before.id || report.status !== denunciaActionInfo[kind].target || report.materialId !== before.materialId || report.motivo !== before.motivo
        || report.descricao !== before.descricao || report.dataCadastro !== before.dataCadastro) throw new ApiError('protocol')
      await read(reportId, kind === 'analise' ? 'A API confirmou o início da análise. Consulte abaixo o relato e o histórico atuais.' : `A API confirmou a conclusão como ${kind === 'procedencia' ? 'procedente' : 'improcedente'}. Consulte abaixo o relato e o histórico atuais.`)
    } catch (error) {
      if (!active(version, key)) return
      if (error instanceof ApiError && [401, 404].includes(error.status ?? 0)) { clear(error.message, true); return }
      if (error instanceof ApiError && error.status === 403) {
        patch({ ...empty(), forbidden: true, error: forbiddenMessage }); return
      }
      if (error instanceof ApiError && error.kind === 'http' && error.status === 400) { patch({ sending: false, fieldError: 'Confira a justificativa antes de confirmar outra tentativa.' }); return }
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
      patch({ sending: false, requiresReload: true, error: uncertain
        ? 'Não foi possível confirmar o resultado. A decisão pode ter sido gravada. Descarte a justificativa e consulte o estado atual antes de outra tentativa.'
        : 'A solicitação conflita com o estado atual ou não pôde ser aceita. Descarte a justificativa e consulte novamente antes de outra tentativa.' })
    }
  }
  const locked = () => action.open || action.sending
  return {
    load: (id: string) => read(id), getState: () => state, getActionState: () => action,
    async reload() { if (!disposed && !action.sending && !state.denied) await read(reportId, '', action.forbidden) },
    async reloadHistory() { if (authorized() && !locked()) await reader?.reloadHistory() },
    async setSize(size: number) { if (authorized() && !locked()) await reader?.setSize(size) },
    async goToPage(number: number) { if (authorized() && !locked()) await reader?.goToPage(number) },
    canOpen: (kind: DenunciaAction) => !action.open && ready(kind),
    open(kind: DenunciaAction) { if (authorized() && !action.open && ready(kind)) patch({ ...empty(), open: true, kind }) },
    close() { if (authorized() && action.open && !action.sending && !action.requiresReload) patch({ ...empty(), forbidden: action.forbidden }) },
    change(value: string) { if (authorized() && action.open && !action.sending && !action.requiresReload && !action.forbidden) patch({ draft: value, confirmed: false, fieldError: '', error: '' }) },
    setConfirmed(value: boolean) { if (authorized() && action.open && !action.sending && !action.requiresReload && !action.forbidden) patch({ confirmed: value === true }) },
    submit,
    subscribe(listener: (value: ModeracaoDenunciaDetalheState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    subscribeAction(listener: (value: DenunciaDecisaoState) => void) { actionListeners.add(listener); return () => { actionListeners.delete(listener) } },
    dispose() { disposed = true; clear(); listeners.clear(); actionListeners.clear() },
  }
}
