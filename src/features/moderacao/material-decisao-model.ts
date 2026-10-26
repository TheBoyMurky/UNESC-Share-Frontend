import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canModerate } from '../auth/permissions.ts'
import { emptyMaterialState, type MaterialState } from '../material/material-model.ts'
import { validId, type MaterialService } from '../material/material-service.ts'
import { createMaterialRevisaoModel } from './material-revisao-model.ts'
import { canDecideMaterial, type MaterialDecision, type MaterialDecisaoService } from './material-decisao-service.ts'

export interface DecisionState { action: MaterialDecision | ''; confirmed: boolean; sending: boolean; error: string; message: string; requiresReload: boolean }
const emptyDecision = (): DecisionState => ({ action: '', confirmed: false, sending: false, error: '', message: '', requiresReload: false })
type Reader = ReturnType<typeof createMaterialRevisaoModel>
type Actions = Parameters<typeof createMaterialRevisaoModel>[1]

// Composicao: leitura continua no modelo existente; confirmacao vale para conta/alvo/tentativa.
export function createMaterialDecisaoModel(service: MaterialService, actions: Actions, decisions: MaterialDecisaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = emptyMaterialState(), decision = emptyDecision(), reader: Reader | null = null
  let disposed = false, generation = 0, context = '', currentId = '', task: AbortController | null = null, unsubscribe: (() => void) | null = null
  const listeners = new Set<(value: MaterialState) => void>(), decisionListeners = new Set<(value: DecisionState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<DecisionState>) => { decision = { ...decision, ...value }; if (!disposed) decisionListeners.forEach(listener => listener(decision)) }
  const signature = () => { const value = user(); return value && validId(value.id) && canModerate(value) ? value.id.toLowerCase() + ':' + value.perfil : '' }
  function clear(error = '') {
    generation++; task?.abort(); task = null; unsubscribe?.(); unsubscribe = null; reader?.dispose(); reader = null; context = ''
    state = { ...emptyMaterialState(), error }; decision = emptyDecision(); patch({}); emit()
  }
  function authorized() {
    if (disposed) return false
    if (!context || context !== signature()) { clear('O acesso à equipe mudou. Reabra a revisão com uma conta autorizada.'); return false }
    return true
  }
  async function read(id: string, message = '') {
    if (disposed) return
    clear(); currentId = id.toLowerCase(); context = signature(); patch({ message })
    const version = generation
    reader = createMaterialRevisaoModel(service, actions, user)
    unsubscribe = reader.subscribe(value => {
      if (disposed || version !== generation) return
      state = value
      // Uma falha de acesso no leitor tambem invalida qualquer confirmacao aberta.
      if (!value.material) patch({ action: '', confirmed: false })
      emit()
    })
    await reader.load(currentId)
  }
  const idle = () => !disposed && !state.loading && !state.academicLoading && !Object.values(state.downloads).some(item => item.loading) && !Object.values(state.copies).some(item => item.loading)
  function choose(action: MaterialDecision) {
    if (!authorized() || !idle() || decision.sending || decision.requiresReload || !canDecideMaterial(state.material, user(), action)) return
    patch({ ...emptyDecision(), action })
  }
  function active(version: number, key: string) {
    if (disposed || version !== generation) return false
    if (key !== signature()) { clear('O acesso à equipe mudou. Reabra a revisão com uma conta autorizada.'); return false }
    return true
  }
  async function submit() {
    if (!authorized() || !idle() || !decision.confirmed || !decision.action || decision.sending || decision.requiresReload
      || !canDecideMaterial(state.material, user(), decision.action)) return
    const material = state.material!, action = decision.action, version = generation, key = context
    task = new AbortController()
    patch({ sending: true, confirmed: false, error: '', message: '' })
    try {
      await decisions.decide(material.id, action, task.signal)
      if (!active(version, key)) return
      // Resposta confirmada nao eh aplicada como snapshot: reconsulta estado atual sem repetir POST.
      await read(currentId, action === 'publicar' ? 'A API confirmou a publicação. Consultando o estado atual.' : 'A API confirmou o bloqueio. Consultando o estado atual.')
    } catch (error) {
      if (!active(version, key)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { clear(error.message); return }
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
      patch({ sending: false, requiresReload: true, error: uncertain
        ? 'Não foi possível confirmar o resultado. A decisão pode ter sido gravada. Consulte o estado atual antes de escolher e confirmar outra ação.'
        : error instanceof ApiError ? error.message + ' Consulte o estado atual antes de outra decisão.' : 'Consulte o estado atual.' })
    }
  }
  const locked = () => decision.sending || !!decision.action
  return {
    load: (id: string) => read(id), retry: async () => { if (!decision.sending) await read(currentId) },
    async loadAcademic() { if (authorized() && !locked()) await reader?.loadAcademic() },
    async download(id: string) { if (authorized() && !locked()) await reader?.download(id) },
    async copy(id: string) { if (authorized() && !locked()) await reader?.copy(id) },
    choose, submit, getState: () => state, getDecisionState: () => decision,
    setConfirmed(value: boolean) { if (authorized() && decision.action && !decision.sending && !decision.requiresReload) patch({ confirmed: value === true }) },
    cancel() { if (authorized() && !decision.sending && !decision.requiresReload) patch(emptyDecision()) },
    canChoose: (action: MaterialDecision) => idle() && !decision.sending && !decision.requiresReload && canDecideMaterial(state.material, user(), action),
    subscribe(listener: (value: MaterialState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    subscribeDecision(listener: (value: DecisionState) => void) { decisionListeners.add(listener); return () => { decisionListeners.delete(listener) } },
    dispose() { disposed = true; clear(); listeners.clear(); decisionListeners.clear() },
  }
}
