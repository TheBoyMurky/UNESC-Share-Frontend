import { ApiError } from '../../shared/http/client.ts'
import type { User } from '../auth/auth-service.ts'
import { canAdminister } from '../auth/permissions.ts'
import { validId } from '../material/material-service.ts'
import { normalizeInstituicao, validateInstituicao, type InstituicaoEdicaoService, type InstituicaoFields, type InstituicaoInput } from './instituicao-cadastro-service.ts'

export interface InstituicaoEdicaoState { id: string; draft: InstituicaoInput; fields: InstituicaoFields; loading: boolean; sending: boolean; denied: boolean; uncertain: boolean; conflict: boolean; error: string; saved: boolean }
const empty = (id = ''): InstituicaoEdicaoState => ({ id, draft: { nome: '', sigla: '' }, fields: {}, loading: false, sending: false, denied: false, uncertain: false, conflict: false, error: '', saved: false })
export function createInstituicaoEdicaoModel(service: InstituicaoEdicaoService, user: () => Pick<User, 'id' | 'perfil'> | null) {
  let state = empty(), disposed = false, generation = 0, context = '', task: AbortController | null = null, original: InstituicaoInput | null = null, rejected: InstituicaoInput | null = null
  const listeners = new Set<(value: InstituicaoEdicaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<InstituicaoEdicaoState>) => { state = { ...state, ...value }; emit() }
  const signature = () => { const actor = user(); return actor && validId(actor.id) && canAdminister(actor) ? actor.id.toLowerCase() + ':' + actor.perfil : '' }
  const cancel = () => { generation++; task?.abort(); task = null }
  function deny() { cancel(); state = { ...empty(state.id), denied: true, error: 'Edição indisponível nesta consulta. Reabra a área com uma conta administradora.' }; original = null; rejected = null; emit() }
  function access() { if (disposed) return false; if (!context || signature() !== context) { deny(); return false } return !state.denied }
  const current = (version: number) => !disposed && generation === version && access()
  async function load(id: string, fresh = false) {
    if (disposed) return
    const actor = signature()
    cancel(); const version = generation; context = actor
    if (!actor || !validId(id)) { state = { ...empty(), denied: true, error: 'Instituição ou acesso inválido.' }; original = null; emit(); return }
    id = id.toLowerCase(); state = { ...empty(id), loading: true }; original = null; rejected = null; emit()
    task = new AbortController()
    try {
      const dto = await service.detail(id, task.signal)
      if (!current(version)) return
      if (dto.id !== id) throw new ApiError('protocol')
      original = { nome: dto.nome, sigla: dto.sigla }
      state = { ...empty(id), draft: { ...original }, saved: fresh }; emit()
    } catch (error) {
      if (!current(version)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { deny(); return }
      patch({ loading: false, error: 'Não foi possível consultar a instituição. Tente atualizar.' })
    } finally { if (version === generation) task = null }
  }
  return {
    initialize(id: string) { void load(id) },
    async reload() { if (!access() || !state.id || state.loading || state.sending) return; await load(state.id) },
    async submit() {
      if (!access() || !original || state.loading || state.sending || state.uncertain || state.denied || state.conflict || state.saved) return
      const fields = validateInstituicao(state.draft)
      if (Object.keys(fields).length) { patch({ fields, error: 'Confira nome e sigla antes de salvar.' }); return }
      const body = normalizeInstituicao(state.draft), baseline = normalizeInstituicao(original)
      if (body.nome === baseline.nome && body.sigla === baseline.sigla) { patch({ fields: {}, error: 'Altere ao menos um campo antes de salvar.' }); return }
      const version = generation; task = new AbortController(); patch({ sending: true, fields: {}, error: '' })
      try {
        const result = await service.update(state.id, body, task.signal)
        if (!current(version)) return
        if (result.id !== state.id) throw new ApiError('protocol')
        rejected = null; state = { ...state, sending: false, saved: true, error: 'Alterações salvas. Atualize os dados para consultar a versão atual.' }; emit()
      } catch (error) {
        if (!current(version)) return
        if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { deny(); return }
        if (error instanceof ApiError && error.kind === 'http' && error.status === 400) patch({ sending: false, fields: { nome: 'Confira o nome informado.', sigla: 'Confira a sigla e seu limite após converter para maiúsculas.' }, error: 'Confira nome e sigla antes de tentar novamente.' })
        else if (error instanceof ApiError && error.kind === 'http' && error.status === 409) { rejected = body; patch({ sending: false, conflict: true, error: 'A API informou conflito. Atualize os dados atuais antes de preparar outra alteração.' }) }
        else patch({ sending: false, uncertain: true, error: 'Não foi possível confirmar o resultado. Atualize a instituição antes de preparar outra alteração.' })
      } finally { if (version === generation) task = null }
    },
    change(key: keyof InstituicaoInput, value: string) {
      if (!access() || !original || state.loading || state.sending || state.uncertain || state.denied || state.saved || (key !== 'nome' && key !== 'sigla')) return
      const draft = { ...state.draft, [key]: value }, normalized = normalizeInstituicao(draft)
      const conflict = !!rejected && rejected.nome === normalized.nome && rejected.sigla === normalized.sigla
      patch({ draft, fields: {}, conflict, error: conflict ? 'A API informou conflito. Atualize os dados atuais antes de preparar outra alteração.' : '' })
    },
    getState: () => state,
    subscribe(listener: (value: InstituicaoEdicaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); context = ''; original = null; rejected = null; listeners.clear() },
  }
}
