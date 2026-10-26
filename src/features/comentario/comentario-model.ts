import { ApiError } from '../../shared/http/client.ts'
import type { Page } from '../../shared/http/page.ts'
import { validId } from '../material/material-service.ts'
import { canManageComentario, validateComentario, type Comentario, type ComentarioService } from './comentario-service.ts'

export interface ComentarioAction {
  kind: 'edit' | 'remove'; target: Comentario; draft: string; confirmed: boolean
  sending: boolean; error: string; uncertain: boolean; blocked: boolean
}

export interface ComentarioState {
  data: Page<Comentario> | null; size: number; loading: boolean; loadError: string; unavailable: boolean
  draft: string; sending: boolean; error: string; message: string; uncertain: boolean; reviewed: boolean
  action: ComentarioAction | null
}
const empty = (): ComentarioState => ({ data: null, size: 20, loading: false, loadError: '', unavailable: false,
  draft: '', sending: false, error: '', message: '', uncertain: false, reviewed: false, action: null })
const message = (error: unknown) => error instanceof ApiError ? error.message : 'Não foi possível concluir a operação. Tente novamente.'

export function createComentarioModel(service: ComentarioService, userId: () => string | null) {
  let state = empty(), disposed = false, materialId = '', identity: string | null = null, published = false
  const tasks = new Map<string, AbortController>(), listeners = new Set<(value: ComentarioState) => void>()
  const patch = (value: Partial<ComentarioState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const cancel = () => { tasks.forEach(task => task.abort()); tasks.clear() }
  const access = () => {
    if (disposed) return false
    if (identity !== userId() || !validId(identity)) {
      cancel(); state = empty(); patch({ unavailable: true, loadError: 'O acesso mudou. Reabra o material com a conta atual.' }); return false
    }
    return published && !state.unavailable
  }
  const current = (key: string, task: AbortController) => !disposed && tasks.get(key) === task && !task.signal.aborted && access()
  const fail = (error: unknown, sending = false) => {
    // Nao conservar uma lista antiga quando a API retirar sua visibilidade.
    if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) {
      cancel(); patch({ data: null, loading: false, sending: false, unavailable: true, draft: '',
        loadError: error.status === 404 ? 'Comentários indisponíveis. O material ou comentário pode ter deixado de estar disponível. Reabra os detalhes para conferir.' : message(error), error: '', message: '', action: null })
      return
    }
    if (!sending) { patch({ loading: false, loadError: message(error) }); return }
    const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
    patch({ sending: false, uncertain, reviewed: false, error: uncertain
      ? 'Não foi possível confirmar o envio. O comentário pode ter sido publicado. Atualize e confira a lista antes de preparar outra tentativa; reenviar pode duplicá-lo.'
      : error instanceof ApiError && error.status === 400 ? 'Confira o texto: ele é obrigatório, tem limite de 4000 caracteres e não aceita caracteres nulos.' : message(error) })
  }

  async function list(number: number, size = state.size) {
    if (!access() || state.sending || state.action) return
    tasks.get('list')?.abort()
    const task = new AbortController(); tasks.set('list', task)
    patch({ data: null, size, loading: true, loadError: '', reviewed: false })
    try {
      let data = await service.list(materialId, number, size, task.signal)
      if (!current('list', task)) return
      if (!data.content.length && number > 0 && number >= data.page.totalPages) {
        // Correcao unica; as paginas nao formam um snapshot sob moderacao concorrente.
        data = await service.list(materialId, Math.max(0, data.page.totalPages - 1), size, task.signal)
      }
      if (current('list', task)) patch({ data, loading: false, reviewed: state.uncertain })
    } catch (error) { if (current('list', task)) fail(error) }
    finally { if (tasks.get('list') === task) tasks.delete('list') }
  }

  async function load(id: string, isPublished: boolean) {
    if (disposed) return
    cancel(); state = empty(); materialId = id.toLowerCase(); identity = userId(); published = isPublished === true
    patch({})
    if (!validId(materialId) || !published) { patch({ unavailable: true, loadError: 'Comentários disponíveis somente em materiais publicados.' }); return }
    await list(0)
  }

  async function submit() {
    if (!access() || state.sending || state.loading || !state.data || state.uncertain || state.action) return
    const error = validateComentario(state.draft)
    if (error) { patch({ error, message: '' }); return }
    const task = new AbortController(); tasks.set('send', task)
    patch({ sending: true, error: '', message: '', reviewed: false })
    try {
      await service.create(materialId, state.draft, identity!, task.signal)
      if (!current('send', task)) return
      patch({ sending: false, draft: '', message: 'Comentário publicado. A lista começa pelos mais antigos; use Última página para ver os mais recentes.' })
      // Nao inserir artificialmente o novo comentario no inicio da ordenacao ASC.
      await list(0)
    } catch (error) { if (current('send', task)) fail(error, true) }
    finally { if (tasks.get('send') === task) tasks.delete('send') }
  }

  function openAction(id: string, kind: ComentarioAction['kind']) {
    if (!access() || state.loading || state.sending || state.uncertain || state.action || !validId(id)) return
    const target = state.data?.content.find(item => item.id.toLowerCase() === id.toLowerCase())
    if (!target || !canManageComentario(target, identity) || target.materialId.toLowerCase() !== materialId) return
    patch({ message: '', action: { kind, target: { ...target }, draft: kind === 'edit' ? target.conteudo : '',
      confirmed: false, sending: false, error: '', uncertain: false, blocked: false } })
  }

  const actionEligible = () => access() && !!state.action && !state.action.sending && !state.action.uncertain
    && !state.action.blocked && canManageComentario(state.action.target, identity)

  async function submitAction() {
    if (!actionEligible() || !state.action) return
    const action = state.action
    if (action.kind === 'edit') {
      const error = validateComentario(action.draft) || (action.draft.trim() === action.target.conteudo ? 'Altere o texto antes de salvar.' : '')
      if (error) { patch({ action: { ...action, error } }); return }
    } else if (!action.confirmed) return
    const number = state.data?.page.number ?? 0
    const task = new AbortController(); tasks.set('action', task)
    // Consentimento vale somente para este UUID/tentativa, nunca para um reenvio.
    patch({ action: { ...action, sending: true, confirmed: false, error: '' } })
    try {
      if (action.kind === 'edit') await service.update(materialId, action.target, action.draft, identity!, task.signal)
      else await service.remove(materialId, action.target, identity!, task.signal)
      if (!current('action', task)) return
      patch({ action: null, message: action.kind === 'edit' ? 'Comentário atualizado.' : 'Comentário removido da lista. O registro continua preservado no banco, sem restauração pela API.' })
      await list(number)
    } catch (error) {
      if (!current('action', task)) return
      if (error instanceof ApiError && [401, 403, 404].includes(error.status ?? 0)) { fail(error); return }
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
      patch({ action: { ...action, sending: false, confirmed: false, uncertain, blocked: error instanceof ApiError && error.status === 409,
        error: uncertain ? 'Não foi possível confirmar o resultado. A operação pode ter sido concluída. Feche e atualize a lista antes de iniciar outra tentativa.'
          : error instanceof ApiError && error.status === 400 ? 'Confira o texto e os dados do comentário.'
          : error instanceof ApiError && error.status === 409 ? 'O estado do comentário mudou ou há um conflito. Feche e atualize a lista antes de tentar novamente.' : message(error) } })
    } finally { if (tasks.get('action') === task) tasks.delete('action') }
  }

  async function closeAction() {
    if (!access() || !state.action || state.action.sending) return
    const refresh = state.action.uncertain || state.action.blocked, number = state.data?.page.number ?? 0
    patch({ action: null, message: refresh ? 'Confira o resultado na lista atualizada antes de iniciar outra ação. Se o comentário não aparecer, isso não confirma por si só uma remoção.' : '' })
    if (refresh) await list(number)
  }

  return {
    load, submit, submitAction, closeAction, getState: () => state,
    startEdit: (id: string) => openAction(id, 'edit'),
    startRemoval: (id: string) => openAction(id, 'remove'),
    changeActionDraft(draft: string) {
      if (actionEligible() && state.action?.kind === 'edit') patch({ action: { ...state.action, draft, error: '' } })
    },
    confirmRemoval(value: boolean) {
      if (actionEligible() && state.action?.kind === 'remove') patch({ action: { ...state.action, confirmed: value === true } })
    },
    reload: () => list(state.data?.page.number ?? 0),
    async goToPage(number: number) {
      const page = state.data?.page
      if (!access() || state.loading || state.sending || state.action || !page || !Number.isSafeInteger(number) || number < 0 || number >= page.totalPages) return
      await list(number)
    },
    async setSize(size: number) { if (access() && !state.sending && !state.action && [20, 50, 100].includes(size)) await list(0, size) },
    changeDraft(draft: string) { if (access() && !state.sending && !state.action) patch({ draft, error: state.uncertain ? state.error : '', message: '' }) },
    prepareRetry() {
      if (access() && state.uncertain && state.reviewed && !state.loading && !state.sending && state.data) {
        patch({ uncertain: false, reviewed: false, error: '', message: 'Nova tentativa preparada. Se o envio anterior foi concluído, enviar novamente criará outro comentário.' })
      }
    },
    subscribe(listener: (value: ComentarioState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); state = empty(); listeners.clear() },
  }
}
