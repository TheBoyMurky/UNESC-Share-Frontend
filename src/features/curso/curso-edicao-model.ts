import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import type { Instituicao, InstituicaoService } from '../instituicao/instituicao-service.ts'
import type { CursoEdicaoService } from './curso-edicao-service.ts'
import { normalizeCurso, validateCurso, type CursoInput } from './curso-cadastro-service.ts'
import type { Curso } from './curso-service.ts'

export interface CursoEdicaoState { id: string; instituicaoId: string; curso: Curso | null; instituicao: Instituicao | null; draft: CursoInput; fields: Partial<Record<keyof CursoInput, string>>; loading: boolean; sending: boolean; denied: boolean; unavailable: boolean; uncertain: boolean; conflict: boolean; error: string; saved: boolean }
const empty = (instituicaoId = '', id = ''): CursoEdicaoState => ({ id, instituicaoId, curso: null, instituicao: null, draft: { nome: '', descricao: '' }, fields: {}, loading: false, sending: false, denied: false, unavailable: false, uncertain: false, conflict: false, error: '', saved: false })
export function createCursoEdicaoModel(service: CursoEdicaoService, institutions: InstituicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null
  const listeners = new Set<(value: CursoEdicaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<CursoEdicaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny(message = 'Edição indisponível nesta consulta. Reabra a área com uma conta administradora.') {
    cancel(); state = { ...empty(state.instituicaoId, state.id), denied: true, error: message }; emit()
  }
  function access() {
    if (disposed) return false
    if (!context || signature() !== context) { deny('O acesso mudou. Reabra a edição com uma conta administradora.'); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && access()
  async function load(instituicaoId: string, id: string, fresh = false) {
    if (disposed) return
    const actor = signature(); cancel(); const version = generation; context = actor
    if (!actor || !validId(instituicaoId) || !validId(id)) {
      state = { ...empty(), denied: !actor, unavailable: !!actor, error: actor ? 'Endereço de curso ou instituição inválido.' : 'Edição disponível somente para administradores.' }; emit(); return
    }
    instituicaoId = instituicaoId.toLowerCase(); id = id.toLowerCase()
    state = { ...empty(instituicaoId, id), loading: true }; emit(); task = new AbortController()
    try {
      const course = await service.detail(id, task.signal)
      if (!current(version)) return
      if (course.id !== id || course.instituicaoId !== instituicaoId) throw new ApiError('protocol')
      const institution = await institutions.detail(instituicaoId, task.signal)
      if (!current(version)) return
      if (institution.id !== instituicaoId) throw new ApiError('protocol')
      state = { ...empty(instituicaoId, id), curso: course, instituicao: institution, draft: { nome: course.nome, descricao: course.descricao ?? '' }, saved: fresh }; emit()
    } catch (error) {
      if (!current(version)) return
      const code = error instanceof ApiError ? error.status : null
      if (code === 401 || code === 403) deny('A API não autorizou esta edição. Reabra a área para conferir o acesso.')
      else if (code === 404) deny('Curso ou instituição inexistente ou indisponível. Volte à lista e abra o registro atual.')
      else patch({ loading: false, unavailable: false, error: 'Não foi possível consultar o curso e sua instituição. Tente atualizar.' })
    } finally { if (version === generation) task = null }
  }
  return {
    initialize(instituicaoId: string, id: string) { void load(instituicaoId, id) },
    async reload() { if (!access() || !state.id || !state.instituicaoId || state.loading || state.sending) return; await load(state.instituicaoId, state.id) },
    async submit() {
      if (!access() || !state.curso || !state.instituicao || state.loading || state.sending || state.uncertain || state.conflict || state.denied || state.saved) return
      const fields = validateCurso(state.draft)
      if (Object.keys(fields).length) { patch({ fields, error: 'Confira o nome e a descrição antes de salvar.' }); return }
      const body = normalizeCurso(state.draft), baseline = normalizeCurso({ nome: state.curso.nome, descricao: state.curso.descricao ?? '' })
      if (body.nome === baseline.nome && body.descricao === baseline.descricao) { patch({ fields: {}, error: 'Altere ao menos um campo antes de salvar.' }); return }
      const version = generation; task = new AbortController(); patch({ sending: true, fields: {}, error: '' })
      try {
        const result = await service.update(state.id, state.instituicaoId, state.draft, task.signal)
        if (!current(version)) return
        if (result.id !== state.id) throw new ApiError('protocol')
        state = { ...state, sending: false, saved: true, error: 'Alterações salvas. Atualize para consultar os dados atuais.' }; emit()
      } catch (error) {
        if (!current(version)) return
        if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) {
          if (error.status === 401 || error.status === 403) deny('A API não autorizou a edição. Reabra a área para conferir o acesso.')
          else deny('O curso não está mais disponível. Volte à lista para consultar os registros atuais.')
          return
        }
        if (error instanceof ApiError && error.kind === 'http' && error.status === 400) patch({ sending: false, fields: { nome: 'Confira o nome e seu limite de caracteres.', descricao: 'Confira a descrição e seu limite de caracteres.' }, error: 'Confira os dados do curso antes de tentar novamente.' })
        else if (error instanceof ApiError && error.kind === 'http' && error.status === 409) patch({ sending: false, conflict: true, error: 'A API informou conflito. Consulte o curso atual antes de preparar outra alteração.' })
        else patch({ sending: false, uncertain: true, error: 'Não foi possível confirmar o resultado. Consulte o curso atual antes de preparar outra alteração.' })
      } finally { if (version === generation) task = null }
    },
    change(key: keyof CursoInput, value: string) {
      if (!access() || !state.curso || state.loading || state.sending || state.uncertain || state.conflict || state.denied || state.saved || (key !== 'nome' && key !== 'descricao')) return
      patch({ draft: { ...state.draft, [key]: value }, fields: {}, error: '' })
    },
    getState: () => state,
    subscribe(listener: (value: CursoEdicaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
