import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import type { Curso, CursoService } from '../curso/curso-service.ts'
import type { Instituicao, InstituicaoService } from '../instituicao/instituicao-service.ts'
import type { Disciplina } from './disciplina-service.ts'
import { normalizeDisciplina, validateDisciplina, type DisciplinaFields, type DisciplinaInput } from './disciplina-cadastro-service.ts'
import type { DisciplinaEdicaoService } from './disciplina-edicao-service.ts'

export interface DisciplinaEdicaoState {
  instituicaoId: string; cursoId: string; id: string; instituicao: Instituicao | null; curso: Curso | null; disciplina: Disciplina | null
  draft: DisciplinaInput; fields: DisciplinaFields; loading: boolean; sending: boolean; denied: boolean; unavailable: boolean
  uncertain: boolean; conflict: boolean; error: string; saved: boolean
}
const blank = (): DisciplinaInput => ({ nome: '', descricao: '', codigo: '' })
const empty = (instituicaoId = '', cursoId = '', id = ''): DisciplinaEdicaoState => ({ instituicaoId, cursoId, id, instituicao: null, curso: null, disciplina: null, draft: blank(), fields: {}, loading: false, sending: false, denied: false, unavailable: false, uncertain: false, conflict: false, error: '', saved: false })

export function createDisciplinaEdicaoModel(service: DisciplinaEdicaoService, courses: CursoService, institutions: InstituicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null
  const listeners = new Set<(value: DisciplinaEdicaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<DisciplinaEdicaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? `${actor.id.toLowerCase()}:${actor.perfil}` : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny(message = 'Edição disponível somente para administradores. Reabra a área com uma conta administradora.') {
    cancel(); state = { ...empty(state.instituicaoId, state.cursoId, state.id), denied: true, error: message }; emit()
  }
  function access() {
    if (disposed) return false
    if (!context || signature() !== context) { deny('O acesso mudou. Reabra a edição com uma conta administradora.'); return false }
    return !state.denied
  }
  const current = (version: number) => !disposed && generation === version && access()
  async function load(instituicaoId: string, cursoId: string, id: string, fresh = false) {
    if (disposed) return
    const actor = signature(); cancel(); const version = generation; context = actor
    if (!actor || !validId(instituicaoId) || !validId(cursoId) || !validId(id)) {
      state = { ...empty(), denied: !actor, unavailable: !!actor, error: actor ? 'Endereço de instituição, curso ou disciplina inválido.' : 'Edição disponível somente para administradores.' }; emit(); return
    }
    instituicaoId = instituicaoId.toLowerCase(); cursoId = cursoId.toLowerCase(); id = id.toLowerCase()
    state = { ...empty(instituicaoId, cursoId, id), loading: true }; emit(); task = new AbortController()
    try {
      const [institution, course, discipline] = await Promise.all([
        institutions.detail(instituicaoId, task.signal), courses.detail(cursoId, task.signal), service.detail(id, cursoId, task.signal),
      ])
      if (!current(version)) return
      if (institution.id !== instituicaoId || course.id !== cursoId || course.instituicaoId !== instituicaoId || discipline.id !== id || discipline.cursoId !== cursoId) throw new ApiError('protocol')
      state = { ...empty(instituicaoId, cursoId, id), instituicao: institution, curso: course, disciplina: discipline,
        draft: { nome: discipline.nome, descricao: discipline.descricao ?? '', codigo: discipline.codigo }, saved: fresh }; emit()
    } catch (error) {
      if (!current(version)) return
      const code = error instanceof ApiError ? error.status : null
      if (code === 401 || code === 403) deny('A API não autorizou esta edição. Reabra a área para conferir o acesso.')
      else if (code === 404) deny('Instituição, curso ou disciplina inexistente ou indisponível. Volte à lista e abra o registro atual.')
      else patch({ loading: false, error: 'Não foi possível consultar a disciplina e seus vínculos. Tente atualizar.' })
    } finally { if (version === generation) task = null }
  }
  return {
    initialize(instituicaoId: string, cursoId: string, id: string) { void load(instituicaoId, cursoId, id) },
    async reload() { if (!access() || !state.id || !state.instituicaoId || !state.cursoId || state.loading || state.sending) return; await load(state.instituicaoId, state.cursoId, state.id) },
    async submit() {
      if (!access() || !state.disciplina || !state.curso || !state.instituicao || state.loading || state.sending || state.uncertain || state.conflict || state.denied || state.saved) return
      const fields = validateDisciplina(state.draft)
      if (Object.keys(fields).length) { patch({ fields, error: 'Confira o nome, a descrição e o código antes de salvar.' }); return }
      const payload = normalizeDisciplina(state.draft), baseline = normalizeDisciplina({ nome: state.disciplina.nome, descricao: state.disciplina.descricao ?? '', codigo: state.disciplina.codigo })
      if (payload.nome === baseline.nome && payload.descricao === baseline.descricao && payload.codigo === baseline.codigo) { patch({ fields: {}, error: 'Altere ao menos um campo antes de salvar.' }); return }
      const version = generation; task = new AbortController(); patch({ sending: true, fields: {}, error: '' })
      try {
        const result = await service.update(state.id, state.cursoId, state.draft, task.signal)
        if (!current(version)) return
        if (result.id !== state.id) throw new ApiError('protocol')
        state = { ...state, sending: false, saved: true, error: 'Alterações salvas. Atualize para consultar os dados atuais.' }; emit()
      } catch (error) {
        if (!current(version)) return
        if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) {
          if (error.status === 401 || error.status === 403) deny('A API não autorizou a edição. Reabra a área para conferir o acesso.')
          else deny('A disciplina não está mais disponível. Volte à lista para consultar os registros atuais.')
          return
        }
        if (error instanceof ApiError && error.kind === 'http' && error.status === 400) patch({ sending: false, fields: { nome: 'Confira o nome e seu limite de caracteres.', descricao: 'Confira a descrição e seu limite de caracteres.', codigo: 'Confira o código e seu limite de caracteres.' }, error: 'Confira os dados da disciplina antes de tentar novamente.' })
        else if (error instanceof ApiError && error.kind === 'http' && error.status === 409) patch({ sending: false, conflict: true, error: 'A API informou conflito. Consulte a disciplina atual antes de preparar outra alteração.' })
        else patch({ sending: false, uncertain: true, error: 'Não foi possível confirmar o resultado. Consulte a disciplina atual antes de preparar outra alteração.' })
      } finally { if (version === generation) task = null }
    },
    change(key: keyof DisciplinaInput, value: string) {
      if (!access() || !state.disciplina || state.loading || state.sending || state.uncertain || state.conflict || state.denied || state.saved || !['nome', 'descricao', 'codigo'].includes(key)) return
      patch({ draft: { ...state.draft, [key]: value }, fields: {}, error: '' })
    },
    getState: () => state,
    subscribe(listener: (value: DisciplinaEdicaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; listeners.clear() },
  }
}
