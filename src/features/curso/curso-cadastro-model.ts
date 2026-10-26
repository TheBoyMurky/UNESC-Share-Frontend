import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import type { Instituicao, InstituicaoService } from '../instituicao/instituicao-service.ts'
import { normalizeCurso, validateCurso, type CursoCadastroService, type CursoFields, type CursoInput, type CursoPayload } from './curso-cadastro-service.ts'

export interface CursoCadastroState { instituicaoId: string; instituicao: Instituicao | null; draft: CursoInput; fields: CursoFields; loading: boolean; sending: boolean; denied: boolean; unavailable: boolean; uncertain: boolean; conflict: boolean; error: string; savedId: string }
const empty = (instituicaoId = ''): CursoCadastroState => ({ instituicaoId, instituicao: null, draft: { nome: '', descricao: '' }, fields: {}, loading: false, sending: false, denied: false, unavailable: false, uncertain: false, conflict: false, error: '', savedId: '' })
const conflictMessage = 'A API informou conflito. O nome pode já estar cadastrado nesta instituição. Altere os dados antes de tentar novamente.'
export function createCursoCadastroModel(service: CursoCadastroService, institutions: InstituicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null, rejected: CursoPayload | null = null
  const listeners = new Set<(value: CursoCadastroState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<CursoCadastroState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  const cancel = () => { generation++; task?.abort(); task = null; rejected = null }
  function deny(error = 'Cadastro indisponível nesta consulta. Reabra a área com uma conta administradora.') {
    cancel(); state = { ...empty(state.instituicaoId), denied: true, error }; emit()
  }
  function access() {
    if (disposed) return false
    if (!context || signature() !== context) { deny('O acesso mudou. Reabra o cadastro com uma conta administradora.'); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && access()
  const editable = () => access() && !!state.instituicao && !state.loading && !state.sending && !state.uncertain && !state.savedId
  async function initialize(instituicaoId: string) {
    if (disposed) return
    cancel(); context = signature()
    if (!context || !validId(instituicaoId)) {
      state = { ...empty(), denied: !context, unavailable: !!context, error: context ? 'Endereço de instituição inválido.' : 'Cadastro disponível somente para administradores.' }; emit(); return
    }
    instituicaoId = instituicaoId.toLowerCase(); const version = generation
    state = { ...empty(instituicaoId), loading: true }; emit(); task = new AbortController()
    try {
      const institution = await institutions.detail(instituicaoId, task.signal)
      if (!current(version)) return
      if (institution.id !== instituicaoId) throw new ApiError('protocol')
      state = { ...empty(instituicaoId), instituicao: institution }; emit()
    } catch (error) {
      if (!current(version)) return
      const code = error instanceof ApiError ? error.status : null
      if (code === 401 || code === 403) deny('A API não autorizou este cadastro. Reabra a área para conferir o acesso.')
      else patch({ loading: false, unavailable: code === 404, error: code === 404 ? 'Instituição inexistente ou indisponível para cadastro.' : 'Não foi possível consultar a instituição. Tente novamente.' })
    } finally { if (version === generation) task = null }
  }
  return {
    initialize,
    async submit() {
      if (!editable() || state.conflict) return
      const fields = validateCurso(state.draft)
      if (Object.keys(fields).length) { patch({ fields, error: 'Confira o nome e a descrição antes de cadastrar.' }); return }
      const body = normalizeCurso(state.draft), version = generation
      task = new AbortController(); patch({ sending: true, fields: {}, error: '' })
      try {
        const result = await service.create(state.instituicaoId, state.draft, task.signal)
        if (!current(version)) return
        if (!validId(result.id)) throw new ApiError('protocol')
        rejected = null; state = { ...state, draft: { nome: '', descricao: '' }, sending: false, savedId: result.id, error: '' }; emit()
      } catch (error) {
        if (!current(version)) return
        if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) {
          if (error.status === 401 || error.status === 403) deny('A API não autorizou o cadastro. Reabra a área para conferir seu acesso.')
          else deny('A instituição não está disponível. Reabra o cadastro a partir de uma instituição atual.')
          return
        }
        if (error instanceof ApiError && error.kind === 'http' && error.status === 400) patch({ sending: false, fields: { nome: 'Confira o nome informado e seu limite de caracteres.', descricao: 'Confira a descrição e seu limite de caracteres.' }, error: 'Confira os dados do curso antes de tentar novamente.' })
        else if (error instanceof ApiError && error.kind === 'http' && error.status === 409) { rejected = body; patch({ sending: false, conflict: true, error: conflictMessage }) }
        else patch({ sending: false, uncertain: true, error: 'Não foi possível confirmar o resultado. O cadastro pode ter ocorrido. Descarte este rascunho antes de preparar outro; não reenvie automaticamente.' })
      } finally { if (version === generation) task = null }
    },
    change(key: keyof CursoInput, value: string) {
      if (!editable() || (key !== 'nome' && key !== 'descricao')) return
      const draft = { ...state.draft, [key]: value }, normalized = normalizeCurso(draft)
      const conflict = !!rejected && rejected.nome === normalized.nome && rejected.descricao === normalized.descricao
      patch({ draft, fields: {}, conflict, error: conflict ? conflictMessage : '' })
    },
    prepareNew() { if (access() && state.uncertain && !state.sending) { rejected = null; patch({ draft: { nome: '', descricao: '' }, fields: {}, uncertain: false, conflict: false, error: '' }) } },
    getState: () => state,
    subscribe(listener: (value: CursoCadastroState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
