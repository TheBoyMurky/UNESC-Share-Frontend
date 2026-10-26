import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import { normalizeCategoria, validateCategoria, type CategoriaCadastroService, type CategoriaFields, type CategoriaInput } from './categoria-cadastro-service.ts'

export interface CategoriaCadastroState {
  draft: CategoriaInput; fields: CategoriaFields; sending: boolean; denied: boolean; uncertain: boolean; conflict: boolean; error: string; savedId: string
}
const empty = (): CategoriaCadastroState => ({ draft: { nome: '', descricao: '' }, fields: {}, sending: false, denied: false, uncertain: false, conflict: false, error: '', savedId: '' })
const conflictMessage = 'Já existe uma categoria com esse nome. Altere o nome antes de tentar outro cadastro.'

export function createCategoriaCadastroModel(service: CategoriaCadastroService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null, rejected: ReturnType<typeof normalizeCategoria> | null = null
  const listeners = new Set<(value: CategoriaCadastroState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<CategoriaCadastroState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? actor.id.toLowerCase() + ':' + actor.perfil : '' }
  const cancel = () => { generation++; task?.abort(); task = null; rejected = null }
  function deny() { cancel(); state = { ...empty(), denied: true, error: 'Cadastro disponível somente para administradores. Reabra a área com uma conta administradora.' }; emit() }
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
    const fields = validateCategoria(state.draft)
    if (Object.keys(fields).length) { patch({ fields, error: 'Confira os campos antes de cadastrar a categoria.' }); return }
    const body = normalizeCategoria(state.draft), version = generation
    task = new AbortController(); patch({ sending: true, fields: {}, error: '' })
    try {
      const result = await service.create(state.draft, task.signal)
      if (!current(version)) return
      if (!validId(result.id)) throw new ApiError('protocol')
      rejected = null; state = { ...empty(), savedId: result.id }; emit()
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { deny(); return }
      if (error instanceof ApiError && error.kind === 'http' && error.status === 400) {
        patch({ sending: false, error: 'Confira nome e descrição antes de tentar novamente.', fields: { nome: 'Confira o nome informado e o limite de 80 caracteres.', descricao: 'Confira a descrição e o limite de 500 caracteres.' } })
      } else if (error instanceof ApiError && error.kind === 'http' && error.status === 409) {
        rejected = body; patch({ sending: false, conflict: true, error: conflictMessage })
      } else {
        patch({ sending: false, uncertain: true, error: 'Não foi possível confirmar o resultado. O cadastro pode ter ocorrido. Descarte este formulário antes de preparar outra tentativa.' })
      }
    } finally { if (version === generation) task = null }
  }
  return {
    initialize, submit, getState: () => state,
    change(key: keyof CategoriaInput, value: string) {
      if (!editable() || (key !== 'nome' && key !== 'descricao')) return
      const draft = { ...state.draft, [key]: value }, normalized = normalizeCategoria(draft)
      const conflict = !!rejected && rejected.nome.toLowerCase() === normalized.nome.toLowerCase()
      patch({ draft, fields: {}, conflict, error: conflict ? conflictMessage : '' })
    },
    prepareNew() { if (access() && !state.sending && state.uncertain) initialize() },
    subscribe(listener: (value: CategoriaCadastroState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
