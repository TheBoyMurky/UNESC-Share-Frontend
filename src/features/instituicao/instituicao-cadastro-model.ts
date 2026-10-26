import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import { normalizeInstituicao, validateInstituicao, type InstituicaoCadastroService, type InstituicaoFields, type InstituicaoInput } from './instituicao-cadastro-service.ts'

export interface InstituicaoCadastroState { draft: InstituicaoInput; fields: InstituicaoFields; sending: boolean; denied: boolean; uncertain: boolean; conflict: boolean; error: string; savedId: string }
const empty = (): InstituicaoCadastroState => ({ draft: { nome: '', sigla: '' }, fields: {}, sending: false, denied: false, uncertain: false, conflict: false, error: '', savedId: '' })
const conflictMessage = 'Já existe instituição com esse nome ou sigla. Confira a lista e altere os dados antes de outro envio.'
export function createInstituicaoCadastroModel(service: InstituicaoCadastroService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null, rejected: InstituicaoInput | null = null
  const listeners = new Set<(value: InstituicaoCadastroState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<InstituicaoCadastroState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? actor.id.toLowerCase() + ':' + actor.perfil : '' }
  const cancel = () => { generation++; task?.abort(); task = null; rejected = null }
  function deny() { cancel(); state = { ...empty(), denied: true, error: 'Cadastro indisponível nesta consulta. Reabra a área com uma conta administradora.' }; emit() }
  function access() {
    if (disposed) return false
    if (!context || signature() !== context) { deny(); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && access()
  const editable = () => access() && !state.sending && !state.uncertain && !state.savedId
  function initialize() {
    if (disposed) return
    cancel(); state = empty(); context = signature(); emit(); access()
  }
  async function submit() {
    if (!editable() || state.conflict) return
    const fields = validateInstituicao(state.draft)
    if (Object.keys(fields).length) { patch({ fields, error: 'Confira nome e sigla antes de cadastrar.' }); return }
    const body = normalizeInstituicao(state.draft), version = generation
    task = new AbortController(); patch({ sending: true, fields: {}, error: '' })
    try {
      const result = await service.create(body, task.signal)
      if (!current(version)) return
      if (!validId(result.id)) throw new ApiError('protocol')
      rejected = null; state = { ...empty(), savedId: result.id }; emit()
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { deny(); return }
      if (error instanceof ApiError && error.kind === 'http' && error.status === 400) {
        patch({ sending: false, error: 'Confira nome e sigla antes de tentar novamente.', fields: { nome: 'Confira o nome informado.', sigla: 'Confira a sigla e seu limite após converter para maiúsculas.' } })
      } else if (error instanceof ApiError && error.kind === 'http' && error.status === 409) {
        rejected = body; patch({ sending: false, conflict: true, error: conflictMessage })
      } else {
        patch({ sending: false, uncertain: true, error: 'Não foi possível confirmar o resultado. O cadastro pode ter ocorrido. Confira Instituições antes de descartar este formulário e preparar outro.' })
      }
    } finally { if (version === generation) task = null }
  }
  return {
    initialize, submit, getState: () => state,
    change(key: keyof InstituicaoInput, value: string) {
      if (!editable() || (key !== 'nome' && key !== 'sigla')) return
      const draft = { ...state.draft, [key]: value }, normalized = normalizeInstituicao(draft)
      const conflict = !!rejected && rejected.nome === normalized.nome && rejected.sigla === normalized.sigla
      patch({ draft, fields: {}, conflict, error: conflict ? conflictMessage : '' })
    },
    prepareNew() { if (access() && !state.sending && state.uncertain) initialize() },
    subscribe(listener: (value: InstituicaoCadastroState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
