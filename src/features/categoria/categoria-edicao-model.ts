import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import { normalizeCategoria, validateCategoria, type CategoriaFields, type CategoriaInput } from './categoria-cadastro-service.ts'
import type { CategoriaEdicaoService } from './categoria-edicao-service.ts'
import type { Categoria } from './categoria-service.ts'

export interface CategoriaEdicaoState {
  id: string; categoria: Categoria | null; draft: CategoriaInput; fields: CategoriaFields
  loading: boolean; sending: boolean; denied: boolean; uncertain: boolean; conflict: boolean; saved: boolean; error: string
}
const empty = (id = ''): CategoriaEdicaoState => ({ id, categoria: null, draft: { nome: '', descricao: '' }, fields: {}, loading: false, sending: false, denied: false, uncertain: false, conflict: false, saved: false, error: '' })
const conflictMessage = 'A API informou conflito, possivelmente por nome já utilizado. Consulte os dados atuais antes de decidir novamente.'

export function createCategoriaEdicaoModel(service: CategoriaEdicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null, rejected: ReturnType<typeof normalizeCategoria> | null = null
  const listeners = new Set<(value: CategoriaEdicaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<CategoriaEdicaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? actor.id.toLowerCase() + ':' + actor.perfil : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny(message = 'Edição disponível somente para administradores. Reabra a área com uma conta administradora.') {
    cancel(); state = { ...empty(state.id), denied: true, error: message }; rejected = null; emit()
  }
  function access() {
    if (disposed) return false
    if (!context || signature() !== context) { deny('O acesso mudou. Reabra a edição com uma conta administradora.'); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && access()
  async function load(id: string, fresh = false) {
    if (disposed) return
    const actor = signature(); cancel(); const version = generation; context = actor
    if (!actor || !validId(id)) { state = { ...empty(), denied: true, error: 'Categoria ou acesso inválido.' }; rejected = null; emit(); return }
    id = id.toLowerCase()
    if (!fresh) { state = { ...empty(id), loading: true }; rejected = null; emit() }
    else patch({ loading: true, error: '' })
    task = new AbortController()
    try {
      const categoria = await service.detail(id, task.signal)
      if (!current(version)) return
      if (categoria.id !== id) throw new ApiError('protocol')
      rejected = null
      state = { ...empty(id), categoria, draft: { nome: categoria.nome, descricao: categoria.descricao ?? '' } }; emit()
    } catch (error) {
      if (!current(version)) return
      const status = error instanceof ApiError ? error.status : null
      if ([401, 403, 404].includes(status ?? 0)) { deny(status === 404 ? 'A categoria não está mais disponível para edição.' : 'A API não autorizou a edição. Reabra a área para conferir o acesso.'); return }
      patch({ loading: false, error: 'Não foi possível consultar a categoria. Tente atualizar os dados atuais.' })
    } finally { if (version === generation) task = null }
  }
  return {
    initialize(id: string) { void load(id) },
    async reload() { if (!access() || !state.id || state.loading || state.sending) return; await load(state.id, true) },
    async submit() {
      if (!access() || !state.categoria || state.loading || state.sending || state.uncertain || state.conflict || state.saved) return
      const fields = validateCategoria(state.draft)
      if (Object.keys(fields).length) { patch({ fields, error: 'Confira nome e descrição antes de salvar.' }); return }
      const body = normalizeCategoria(state.draft), baseline = normalizeCategoria({ nome: state.categoria.nome, descricao: state.categoria.descricao ?? '' })
      if (body.nome === baseline.nome && body.descricao === baseline.descricao) { patch({ fields: {}, error: 'Altere ao menos um campo antes de salvar.' }); return }
      const version = generation; task = new AbortController(); patch({ sending: true, fields: {}, error: '' })
      try {
        const result = await service.update(state.id, state.draft, task.signal)
        if (!current(version)) return
        if (result.id !== state.id) throw new ApiError('protocol')
        state = { ...state, sending: false, saved: true, error: 'Alterações salvas. Consulte os dados atuais antes de continuar.' }; rejected = null; emit()
      } catch (error) {
        if (!current(version)) return
        const status = error instanceof ApiError ? error.status : null
        if ([401, 403, 404].includes(status ?? 0)) { deny(status === 404 ? 'A categoria não está mais disponível para edição.' : 'A API não autorizou a edição. Reabra a área para conferir o acesso.'); return }
        if (error instanceof ApiError && error.kind === 'http' && status === 400) patch({ sending: false, fields: { nome: 'Confira o nome e o limite de 80 caracteres.', descricao: 'Confira a descrição e o limite de 500 caracteres.' }, error: 'Confira nome e descrição antes de tentar novamente.' })
        else if (error instanceof ApiError && error.kind === 'http' && status === 409) { rejected = body; patch({ sending: false, conflict: true, error: conflictMessage }) }
        else patch({ sending: false, uncertain: true, error: 'Não foi possível confirmar o resultado. Consulte a categoria antes de preparar outra alteração.' })
      } finally { if (version === generation) task = null }
    },
    change(key: keyof CategoriaInput, value: string) {
      if (!access() || !state.categoria || state.loading || state.sending || state.uncertain || state.conflict || state.saved || (key !== 'nome' && key !== 'descricao')) return
      const draft = { ...state.draft, [key]: value }, normalized = normalizeCategoria(draft)
      const conflict = !!rejected && rejected.nome.toLowerCase() === normalized.nome.toLowerCase()
      patch({ draft, fields: {}, conflict, error: conflict ? conflictMessage : '' })
    },
    getState: () => state,
    subscribe(listener: (value: CategoriaEdicaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; rejected = null; listeners.clear() },
  }
}
