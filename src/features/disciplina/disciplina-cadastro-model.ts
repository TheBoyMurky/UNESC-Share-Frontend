import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import type { Curso, CursoService } from '../curso/curso-service.ts'
import type { Instituicao, InstituicaoService } from '../instituicao/instituicao-service.ts'
import { normalizeDisciplina, validateDisciplina, type DisciplinaCadastroService, type DisciplinaFields, type DisciplinaInput, type DisciplinaPayload } from './disciplina-cadastro-service.ts'

export interface DisciplinaCadastroState {
  instituicaoId: string; cursoId: string; instituicao: Instituicao | null; curso: Curso | null; draft: DisciplinaInput
  fields: DisciplinaFields; loading: boolean; sending: boolean; denied: boolean; unavailable: boolean
  uncertain: boolean; conflict: boolean; error: string; savedId: string
}
const blank = (): DisciplinaInput => ({ nome: '', descricao: '', codigo: '' })
const empty = (instituicaoId = '', cursoId = ''): DisciplinaCadastroState => ({ instituicaoId, cursoId, instituicao: null, curso: null, draft: blank(), fields: {}, loading: false, sending: false, denied: false, unavailable: false, uncertain: false, conflict: false, error: '', savedId: '' })
const conflictMessage = 'A API informou conflito. O código pode já estar cadastrado neste curso. Altere os dados antes de tentar novamente.'

export function createDisciplinaCadastroModel(service: DisciplinaCadastroService, courses: CursoService, institutions: InstituicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null, rejected: DisciplinaPayload | null = null
  const listeners = new Set<(value: DisciplinaCadastroState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<DisciplinaCadastroState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  const cancel = () => { generation++; task?.abort(); task = null; rejected = null }
  function deny(error = 'Cadastro disponível somente para administradores. Reabra a área com uma conta administradora.') {
    cancel(); state = { ...empty(state.instituicaoId, state.cursoId), denied: true, error }; emit()
  }
  function access() {
    if (disposed) return false
    if (!context || signature() !== context) { deny('O acesso mudou. Reabra o cadastro com uma conta administradora.'); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && access()
  const editable = () => access() && !!state.curso && !!state.instituicao && !state.loading && !state.sending && !state.uncertain && !state.savedId

  async function initialize(instituicaoId: string, cursoId: string) {
    if (disposed) return
    cancel(); context = signature()
    if (!context || !validId(instituicaoId) || !validId(cursoId)) {
      state = { ...empty(), denied: !context, unavailable: !!context, error: context ? 'Endereço de instituição ou curso inválido.' : 'Cadastro disponível somente para administradores.' }; emit(); return
    }
    instituicaoId = instituicaoId.toLowerCase(); cursoId = cursoId.toLowerCase(); const version = generation
    state = { ...empty(instituicaoId, cursoId), loading: true }; emit(); task = new AbortController()
    try {
      const [institution, course] = await Promise.all([
        institutions.detail(instituicaoId, task.signal), courses.detail(cursoId, task.signal),
      ])
      if (!current(version)) return
      if (institution.id !== instituicaoId || course.id !== cursoId || course.instituicaoId !== instituicaoId) throw new ApiError('protocol')
      state = { ...empty(instituicaoId, cursoId), instituicao: institution, curso: course }; emit()
    } catch (error) {
      if (!current(version)) return
      const code = error instanceof ApiError ? error.status : null
      if (code === 401 || code === 403) deny('A API não autorizou este cadastro. Reabra a área para conferir seu acesso.')
      else patch({ loading: false, unavailable: code === 404, error: code === 404 ? 'Instituição ou curso inexistente ou indisponível para cadastro.' : 'Não foi possível consultar o curso. Tente novamente.' })
    } finally { if (version === generation) task = null }
  }

  return {
    initialize,
    async submit() {
      if (!editable() || state.conflict) return
      const fields = validateDisciplina(state.draft)
      if (Object.keys(fields).length) { patch({ fields, error: 'Confira o nome, a descrição e o código antes de cadastrar.' }); return }
      const body = normalizeDisciplina(state.draft), version = generation
      task = new AbortController(); patch({ sending: true, fields: {}, error: '' })
      try {
        const result = await service.create(state.cursoId, state.draft, task.signal)
        if (!current(version)) return
        if (!validId(result.id)) throw new ApiError('protocol')
        rejected = null; state = { ...state, draft: blank(), sending: false, savedId: result.id, error: '' }; emit()
      } catch (error) {
        if (!current(version)) return
        if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) {
          if (error.status === 401 || error.status === 403) deny('A API não autorizou o cadastro. Reabra a área para conferir seu acesso.')
          else deny('O curso não está disponível. Reabra o cadastro a partir de um curso atual.')
          return
        }
        if (error instanceof ApiError && error.kind === 'http' && error.status === 400) patch({ sending: false, fields: { nome: 'Confira o nome e seu limite de caracteres.', descricao: 'Confira a descrição e seu limite de caracteres.', codigo: 'Confira o código e seu limite de caracteres.' }, error: 'Confira os dados da disciplina antes de tentar novamente.' })
        else if (error instanceof ApiError && error.kind === 'http' && error.status === 409) { rejected = body; patch({ sending: false, conflict: true, error: conflictMessage }) }
        else patch({ sending: false, uncertain: true, error: 'Não foi possível confirmar o resultado. O cadastro pode ter ocorrido. Descarte este rascunho antes de preparar outro; não reenvie automaticamente.' })
      } finally { if (version === generation) task = null }
    },
    change(key: keyof DisciplinaInput, value: string) {
      if (!editable() || !['nome', 'descricao', 'codigo'].includes(key)) return
      const draft = { ...state.draft, [key]: value }, normalized = normalizeDisciplina(draft)
      const conflict = !!rejected && rejected.nome === normalized.nome && rejected.descricao === normalized.descricao && rejected.codigo === normalized.codigo
      patch({ draft, fields: {}, conflict, error: conflict ? conflictMessage : '' })
    },
    prepareNew() { if (access() && state.uncertain && !state.sending) { rejected = null; patch({ draft: blank(), fields: {}, uncertain: false, conflict: false, error: '' }) } },
    getState: () => state,
    subscribe(listener: (value: DisciplinaCadastroState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
