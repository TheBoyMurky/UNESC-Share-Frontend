import type { User } from '../auth/auth-service.ts'
import { canModerate } from '../auth/permissions.ts'
import type { ComentarioModeracao } from '../comentario/comentario-service.ts'
import { validId } from '../material/material-service.ts'
import { createModeracaoFilaModel, emptyModeracaoFilaState, type ModeracaoFilaState } from './moderacao-fila-model.ts'
import { createModeracaoComentarioModel } from './moderacao-comentario-model.ts'
import type { ComentarioEvento, ModeracaoComentarioService } from './moderacao-comentario-service.ts'

export type ComentarioEquipeState = ({ mode: 'list'; selectedId: null } & ModeracaoFilaState<ComentarioModeracao>)
  | ({ mode: 'history'; selectedId: string | null } & ModeracaoFilaState<ComentarioEvento>)
const empty = (mode: ComentarioEquipeState['mode'] = 'list', selectedId: string | null = null): ComentarioEquipeState => mode === 'list'
  ? { ...emptyModeracaoFilaState<ComentarioModeracao>(), mode, selectedId: null }
  : { ...emptyModeracaoFilaState<ComentarioEvento>(), mode, selectedId }

export function createComentarioConsultaEquipeModel(service: ModeracaoComentarioService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, materialId = '', context = ''
  let list: ReturnType<typeof createModeracaoComentarioModel> | null = null
  let history: ReturnType<typeof createModeracaoFilaModel<ComentarioEvento>> | null = null
  let unsubscribe: (() => void) | null = null
  const listeners = new Set<(value: ComentarioEquipeState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const signature = () => { const value = user(); return value && validId(value.id) && canModerate(value) ? value.id.toLowerCase() + ':' + value.perfil : '' }
  function reset(mode: ComentarioEquipeState['mode'] = 'list', selectedId: string | null = null) {
    generation++; unsubscribe?.(); unsubscribe = null; list?.dispose(); list = null; history?.dispose(); history = null
    state = empty(mode, selectedId); emit()
  }
  function deny(message: string) { const mode = state.mode; reset(mode); state = { ...state, error: message, denied: true }; emit() }
  function authorized() {
    if (disposed) return false
    if (!context || context !== signature()) { deny('O acesso à equipe mudou. Reabra a revisão com uma conta autorizada.'); return false }
    return !state.denied
  }
  function receive(version: number, update: () => ComentarioEquipeState) {
    if (disposed || version !== generation || !authorized()) return
    const value = update()
    if (value.denied) { deny(value.error); return }
    state = value; emit()
  }
  async function load(id: string) {
    if (disposed) return
    reset(); materialId = id.toLowerCase(); context = signature()
    if (!authorized()) return
    if (!validId(materialId)) { state = { ...state, error: 'Endereço de Material inválido.' }; emit(); return }
    const version = generation
    list = createModeracaoComentarioModel(service, user)
    unsubscribe = list.subscribe(value => receive(version, () => ({ ...value, mode: 'list', selectedId: null })))
    await list.load(materialId)
  }
  async function openHistory(id: string) {
    if (!authorized() || state.mode !== 'list' || state.loading || !validId(id)) return
    id = id.toLowerCase()
    if (!state.data?.content.some(comment => comment.id === id)) return
    // Guardar so o UUID; o painel nao carrega consigo texto/autor/estado antigos.
    const targetMaterial = materialId, targetComment = id
    reset('history', targetComment)
    const version = generation
    history = createModeracaoFilaModel({ list: (number, size, signal) => service.history(targetMaterial, targetComment, number, size, signal) }, user, [401, 403, 404])
    unsubscribe = history.subscribe(value => receive(version, () => ({ ...value, mode: 'history', selectedId: targetComment })))
    await history.initialize()
  }
  const active = () => state.mode === 'list' ? list : history
  return {
    load, openHistory, getState: () => state,
    async closeHistory() {
      if (disposed || state.mode !== 'history') return
      if (!context || signature() !== context) { authorized(); return }
      await load(materialId)
    },
    async reload() { if (authorized()) await active()?.reload() },
    async setSize(size: number) { if (authorized()) await active()?.setSize(size) },
    async goToPage(number: number) { if (authorized()) await active()?.goToPage(number) },
    subscribe(listener: (value: ComentarioEquipeState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; reset(); materialId = ''; context = ''; listeners.clear() },
  }
}
