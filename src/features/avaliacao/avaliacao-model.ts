import { ApiError } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'
import { formatNota, notaEmCentavos, podeAvaliar, type Avaliacao, type AvaliacaoResumo, type AvaliacaoService } from './avaliacao-service.ts'

export interface AvaliacaoAction {
  kind: 'edit' | 'remove'; original: Avaliacao; nota: string; confirmed: boolean
  sending: boolean; error: string; uncertain: boolean; blocked: boolean
}

export interface AvaliacaoState {
  resumo: AvaliacaoResumo | null; minha: Avaliacao | null; checked: boolean
  loading: boolean; readError: string; unavailable: boolean; nota: string; sending: boolean
  formError: string; message: string; uncertain: boolean; conflict: boolean; reviewed: boolean; forbidden: boolean
  action: AvaliacaoAction | null
}
const empty = (): AvaliacaoState => ({ resumo: null, minha: null, checked: false, loading: false, readError: '', unavailable: false,
  nota: '', sending: false, formError: '', message: '', uncertain: false, conflict: false, reviewed: false, forbidden: false, action: null })
const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Não foi possível concluir a operação. Tente novamente.'

export function createAvaliacaoModel(service: AvaliacaoService, userId: () => string | null) {
  let state = empty(), disposed = false, materialId = '', autorId = '', published = false, identity: string | null = null
  const tasks = new Map<string, AbortController>(), listeners = new Set<(value: AvaliacaoState) => void>()
  const patch = (value: Partial<AvaliacaoState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const cancelAll = () => { tasks.forEach(task => task.abort()); tasks.clear() }
  const access = () => {
    if (disposed) return false
    if (identity !== userId() || !validId(identity)) {
      cancelAll(); state = empty(); patch({ unavailable: true, readError: 'O acesso mudou. Reabra o material com a conta atual.' }); return false
    }
    return published && !state.unavailable
  }
  const current = (key: string, task: AbortController) => !disposed && tasks.get(key) === task && !task.signal.aborted && access()
  function accessFailure(error: unknown, confirmation = '') {
    if (!(error instanceof ApiError) || ![401, 403, 404].includes(error.status ?? 0)) return false
    cancelAll(); state = empty()
    patch({ unavailable: true, message: error.status === 404 ? confirmation : '', readError: error.status === 404
      ? 'Avaliações indisponíveis. O material pode ter deixado de ser publicado. Reabra os detalhes para conferir.' : errorMessage(error) })
    return true
  }

  async function read(confirmation = '') {
    if (!access() || state.sending || state.action) return
    for (const key of ['read', 'summary']) { tasks.get(key)?.abort(); tasks.delete(key) }
    const task = new AbortController(); tasks.set('read', task)
    patch({ resumo: null, minha: null, checked: false, loading: true, readError: '', reviewed: false })
    try {
      const data = await service.read(materialId, identity!, task.signal)
      if (!current('read', task)) return
      const recovering = state.uncertain || state.conflict
      patch({ resumo: data.resumo, minha: data.minha, checked: true, loading: false,
        ...(data.minha ? { nota: '', formError: '', uncertain: false, conflict: false, reviewed: false,
          message: recovering ? 'Sua avaliação atual foi encontrada. Confira a nota abaixo.' : state.message }
          : { reviewed: recovering }) })
    } catch (error) {
      if (current('read', task) && !accessFailure(error, confirmation)) patch({ loading: false, readError: errorMessage(error) })
    } finally { if (tasks.get('read') === task) tasks.delete('read') }
  }

  async function refreshResumo(confirmation = '') {
    if (!access() || state.sending || state.action) return
    tasks.get('summary')?.abort()
    const task = new AbortController(); tasks.set('summary', task)
    patch({ resumo: null, loading: true, readError: '' })
    try {
      const resumo = await service.resumo(materialId, task.signal)
      if (current('summary', task)) patch({ resumo, loading: false })
    } catch (error) {
      if (current('summary', task) && !accessFailure(error, confirmation)) patch({ loading: false, readError: errorMessage(error) })
    } finally { if (tasks.get('summary') === task) tasks.delete('summary') }
  }

  async function load(id: string, author: string, isPublished: boolean) {
    if (disposed) return
    cancelAll(); state = empty(); materialId = id.toLowerCase(); autorId = author.toLowerCase(); identity = userId(); published = isPublished === true
    patch({})
    if (!validId(materialId) || !validId(autorId) || !published) { patch({ unavailable: true, readError: 'Avaliações disponíveis somente em materiais publicados.' }); return }
    await read()
  }

  async function submit() {
    if (!access() || state.sending || state.loading || state.action || !state.checked || !state.resumo || state.minha
      || state.uncertain || state.conflict || state.forbidden || !podeAvaliar(autorId, identity)) return
    if (notaEmCentavos(state.nota) === null) { patch({ formError: 'Informe uma nota de 0,00 a 5,00 com até duas casas decimais, sem arredondar.' }); return }
    const task = new AbortController(); tasks.set('send', task)
    patch({ sending: true, formError: '', message: '', reviewed: false })
    try {
      const minha = await service.create(materialId, state.nota, identity!, autorId, task.signal)
      if (!current('send', task)) return
      patch({ minha, nota: '', sending: false, message: 'Avaliação cadastrada.' })
      // O DTO confirma a propria nota; somente o servidor calcula media/quantidade.
      await refreshResumo()
    } catch (error) {
      if (!current('send', task)) return
      if (error instanceof ApiError && [401, 404].includes(error.status ?? 0)) { accessFailure(error); return }
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
      const status = error instanceof ApiError ? error.status : null
      patch({ sending: false, uncertain, conflict: status === 409, forbidden: status === 403, reviewed: false,
        formError: uncertain ? 'Não foi possível confirmar o cadastro. A nota pode ter sido gravada. Confira sua avaliação antes de outra tentativa.'
          : status === 409 ? 'Pode já existir uma avaliação ou um conflito com os dados atuais. Confira sua avaliação antes de outra tentativa.'
          : status === 400 ? 'Confira a nota: de 0,00 a 5,00, com até duas casas decimais.' : errorMessage(error) })
    } finally { if (tasks.get('send') === task) tasks.delete('send') }
  }

  function openAction(kind: AvaliacaoAction['kind']) {
    if (!access() || state.loading || state.sending || state.action || !state.checked || !state.minha || state.uncertain || state.conflict) return
    const original = state.minha
    if (original.usuarioId.toLowerCase() !== identity!.toLowerCase() || original.materialId.toLowerCase() !== materialId) return
    if (kind === 'edit' && (state.forbidden || !podeAvaliar(autorId, identity))) return
    patch({ message: '', action: { kind, original: { ...original }, nota: kind === 'edit' ? formatNota(original.nota) : '',
      confirmed: false, sending: false, error: '', uncertain: false, blocked: false } })
  }
  const actionEligible = () => access() && !!state.action && !state.action.sending && !state.action.uncertain && !state.action.blocked
    && state.action.original.usuarioId.toLowerCase() === identity!.toLowerCase()
    && state.action.original.materialId.toLowerCase() === materialId

  async function submitAction() {
    if (!actionEligible() || !state.action) return
    const action = state.action
    if (action.kind === 'edit') {
      if (!podeAvaliar(autorId, identity) || state.forbidden) return
      const cents = notaEmCentavos(action.nota)
      const error = cents === null ? 'Informe uma nota de 0,00 a 5,00 com até duas casas decimais, sem arredondar.'
        : cents === notaEmCentavos(String(action.original.nota)) ? 'Altere a nota antes de salvar.' : ''
      if (error) { patch({ action: { ...action, error } }); return }
    } else if (!action.confirmed) return
    const task = new AbortController(); tasks.set('action', task)
    patch({ action: { ...action, sending: true, confirmed: false, error: '' } })
    try {
      if (action.kind === 'edit') {
        const minha = await service.update(materialId, action.original, action.nota, identity!, autorId, task.signal)
        if (!current('action', task)) return
        const message = 'Avaliação atualizada.'
        patch({ action: null, minha, message })
        await refreshResumo(message)
      } else {
        await service.remove(materialId, identity!, task.signal)
        if (!current('action', task)) return
        const message = 'Remoção da sua avaliação confirmada. Não há restauração.'
        patch({ action: null, minha: null, resumo: null, checked: false, nota: '', message })
        await read(message)
      }
    } catch (error) {
      if (!current('action', task)) return
      if (error instanceof ApiError && ([401, 404].includes(error.status ?? 0) || (action.kind === 'remove' && error.status === 403))) { accessFailure(error); return }
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 500) >= 500
      const status = error instanceof ApiError ? error.status : null
      patch({ forbidden: state.forbidden || status === 403, action: { ...action, sending: false, confirmed: false, uncertain, blocked: status === 409 || status === 403,
        error: uncertain ? 'Não foi possível confirmar o resultado. A operação pode ter sido concluída. Feche e consulte a nota atual antes de iniciar outra tentativa.'
          : status === 409 ? 'Há um conflito com os dados atuais. Feche e consulte a avaliação antes de tentar novamente.'
          : status === 400 ? 'Confira a nota: de 0,00 a 5,00, com até duas casas decimais.' : errorMessage(error) } })
    } finally { if (tasks.get('action') === task) tasks.delete('action') }
  }

  async function closeAction() {
    if (!access() || !state.action || state.action.sending) return
    const refresh = state.action.uncertain || state.action.blocked
    patch({ action: null, message: refresh ? 'Confira a avaliação atual antes de outra ação. Uma nova nota em outra aba pode ter UUID e data diferentes.' : '' })
    if (refresh) await read()
  }

  return {
    load, submit, submitAction, closeAction, reload: () => read(), getState: () => state,
    startEdit: () => openAction('edit'), startRemoval: () => openAction('remove'),
    changeActionNota(nota: string) { if (actionEligible() && state.action?.kind === 'edit') patch({ action: { ...state.action, nota, error: '' } }) },
    confirmRemoval(value: boolean) { if (actionEligible() && state.action?.kind === 'remove') patch({ action: { ...state.action, confirmed: value === true } }) },
    changeNota(nota: string) { if (access() && !state.sending && !state.minha && !state.action) patch({ nota, formError: state.uncertain || state.conflict ? state.formError : '', message: '' }) },
    prepareRetry() {
      if (access() && !state.loading && !state.sending && !state.action && state.checked && state.resumo && !state.minha && !state.forbidden
        && state.reviewed && (state.uncertain || state.conflict)) {
        patch({ uncertain: false, conflict: false, reviewed: false, formError: '', message: 'Nova tentativa preparada. Envie a nota novamente somente se desejar cadastrá-la.' })
      }
    },
    subscribe(listener: (value: AvaliacaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancelAll(); state = empty(); listeners.clear() },
  }
}
