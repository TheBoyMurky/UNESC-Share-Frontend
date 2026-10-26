import { ApiError } from '../../shared/http/client.ts'
import type { CatalogService, SelectorKind } from '../catalogo/catalog-service.ts'
import type { SelectorState } from '../catalogo/catalog-model.ts'
import { validId, type MaterialDetail } from './material-service.ts'
import { validateMaterialMetadados, type MaterialMetadados, type MaterialCadastroErrors } from './material-cadastro-service.ts'
import { canEditMaterial, type AcademicValues, type MaterialEdicaoService } from './material-edicao-service.ts'

type Draft = AcademicValues & Pick<MaterialMetadados, 'titulo' | 'descricao'>
export interface MaterialEdicaoState { material: MaterialDetail | null; draft: Draft; selectors: Record<SelectorKind, SelectorState>; loading: boolean; loadError: string; sending: boolean; savedId: string; error: string; uncertain: boolean; fields: MaterialCadastroErrors }
const kinds = { instituicaoId: 'instituicoes', cursoId: 'cursos', disciplinaId: 'disciplinas', categoriaId: 'categorias' } as const
const emptySelector = (): SelectorState => ({ options: [], page: null, loading: false, error: '' })
const empty = (): MaterialEdicaoState => ({ material: null, draft: { titulo: '', descricao: '', instituicaoId: '', cursoId: '', disciplinaId: '', categoriaId: '' }, selectors: { instituicoes: emptySelector(), cursos: emptySelector(), disciplinas: emptySelector(), categorias: emptySelector() }, loading: false, loadError: '', sending: false, savedId: '', error: '', uncertain: false, fields: {} })
export function editHasChanges(state: MaterialEdicaoState) {
  const original = state.material, draft = state.draft
  return !!original && (draft.titulo.trim() !== original.titulo.trim() || draft.descricao.trim() !== original.descricao.trim() || draft.disciplinaId !== original.disciplinaId || draft.categoriaId !== original.categoriaId)
}

export function createMaterialEdicaoModel(service: MaterialEdicaoService, options: Pick<CatalogService, 'options'>, userId: () => string | null) {
  let state = empty(), disposed = false, currentId = ''
  const tasks = new Map<string, AbortController>(), listeners = new Set<(value: MaterialEdicaoState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<MaterialEdicaoState>) => { state = { ...state, ...value }; emit() }
  const cancel = (key: string) => { tasks.get(key)?.abort(); tasks.delete(key) }
  const cancelAll = () => { for (const task of tasks.values()) task.abort(); tasks.clear() }
  const current = (key: string, task: AbortController, identity: string | null) => {
    if (disposed || tasks.get(key) !== task || task.signal.aborted) return false
    if (identity !== userId()) { cancelAll(); state = empty(); patch({ loadError: 'O acesso mudou. Reabra o material com a conta atual.' }); return false }
    return true
  }
  const editable = () => !disposed && !state.loading && !state.sending && !state.savedId && !!state.material && canEditMaterial(state.material, userId())
  const selector = (kind: SelectorKind, value: Partial<SelectorState>) => patch({ selectors: { ...state.selectors, [kind]: { ...state.selectors[kind], ...value } } })
  const reset = (kind: SelectorKind) => { cancel(kind); selector(kind, emptySelector()) }
  const message = (error: unknown) => error instanceof ApiError ? error.message : 'Não foi possível carregar a edição. Tente novamente.'

  async function loadOptions(kind: SelectorKind, append = false) {
    if (!editable() || state.selectors[kind].loading) return
    const old = state.selectors[kind], identity = userId(), parent = kind === 'cursos' ? state.draft.instituicaoId : kind === 'disciplinas' ? state.draft.cursoId : ''
    if ((kind === 'cursos' || kind === 'disciplinas') && !parent) return
    if (append && (!old.page || old.page.number + 1 >= old.page.totalPages)) return
    const task = new AbortController(), number = append && old.page ? old.page.number + 1 : 0
    cancel(kind); tasks.set(kind, task); selector(kind, { loading: true, error: '' })
    try {
      const result = await options.options(kind, parent, number, task.signal)
      if (!current(kind, task, identity)) return
      // Preserva a selecao consultada por UUID mesmo quando ela nao esta na primeira pagina.
      const key = (Object.keys(kinds) as (keyof AcademicValues)[]).find(key => kinds[key] === kind)!
      const selected = state.selectors[kind].options.filter(item => item.id === state.draft[key])
      selector(kind, { options: [...new Map([...(append ? old.options : selected), ...result.content].map(item => [item.id, item])).values()], page: result.page, loading: false })
    } catch (error) { if (current(kind, task, identity)) selector(kind, { loading: false, error: message(error) }) }
    finally { if (tasks.get(kind) === task) tasks.delete(kind) }
  }

  async function load(id: string) {
    if (disposed) return
    cancelAll(); state = empty(); currentId = id.toLowerCase(); emit()
    if (!validId(currentId)) { patch({ loadError: 'Endereço de material inválido.' }); return }
    const identity = userId()
    if (!validId(identity)) { patch({ loadError: 'Entre novamente para editar seus materiais.' }); return }
    const task = new AbortController(); tasks.set('load', task); patch({ loading: true })
    try {
      const material = await service.load(currentId, task.signal)
      if (!current('load', task, identity)) return
      if (!canEditMaterial(material, identity)) { patch({ loading: false, loadError: 'Este material não está disponível para edição nesta conta ou estado.' }); return }
      const references = await service.references(material, task.signal)
      if (!current('load', task, identity)) return
      const selectors = empty().selectors
      for (const kind of Object.values(kinds)) selectors[kind].options = [references.options[kind]]
      patch({ material, draft: { titulo: material.titulo, descricao: material.descricao, ...references.values }, selectors, loading: false })
      await Promise.all(Object.values(kinds).map(kind => loadOptions(kind)))
    } catch (error) { if (current('load', task, identity)) patch({ loading: false, loadError: message(error) }) }
    finally { if (tasks.get('load') === task) tasks.delete('load') }
  }

  async function changeAcademic(key: keyof AcademicValues, value: string) {
    if (!editable() || !Object.hasOwn(kinds, key) || (value && !state.selectors[kinds[key]].options.some(item => item.id === value))) return
    const draft = { ...state.draft, [key]: value }
    if (key === 'instituicaoId') { draft.cursoId = ''; draft.disciplinaId = ''; reset('cursos'); reset('disciplinas') }
    if (key === 'cursoId') { draft.disciplinaId = ''; reset('disciplinas') }
    patch({ draft })
    if (key === 'instituicaoId' && value) await loadOptions('cursos')
    if (key === 'cursoId' && value) await loadOptions('disciplinas')
  }

  async function submit() {
    if (!editable() || !state.material) return
    const fields = validateMaterialMetadados(state.draft)
    if ((Object.keys(kinds) as (keyof AcademicValues)[]).some(key => !state.draft[key] || !state.selectors[kinds[key]].options.some(item => item.id === state.draft[key]))) fields.academico = 'Selecione as referências entre as opções carregadas.'
    if (Object.keys(fields).length) { patch({ fields, error: 'Confira os campos informados.' }); return }
    if (!editHasChanges(state)) return
    const identity = userId(), id = state.material.id, draft = state.draft
    for (const kind of Object.values(kinds)) { cancel(kind); selector(kind, { loading: false }) }
    const task = new AbortController(); tasks.set('save', task); patch({ sending: true, fields: {}, error: '', uncertain: false })
    try {
      const result = await service.save(id, { titulo: draft.titulo, descricao: draft.descricao, disciplinaId: draft.disciplinaId, categoriaId: draft.categoriaId }, task.signal)
      if (!current('save', task, identity)) return
      if (result.usuarioId.toLowerCase() !== identity?.toLowerCase()) throw new ApiError('protocol')
      state = { ...empty(), savedId: result.id }; emit()
    } catch (error) {
      if (!current('save', task, identity)) return
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || (error.status ?? 500) >= 500 || error.status === 408
      const fields: MaterialCadastroErrors = {}
      if (error instanceof ApiError && error.status === 400) for (const entry of error.problem?.errors ?? []) {
        if (entry.field === 'titulo') fields.titulo = 'Confira o título (obrigatório, até 200 caracteres).'
        if (entry.field === 'descricao') fields.descricao = 'Confira a descrição (obrigatória, até 4000 caracteres).'
        if (entry.field === 'disciplinaId' || entry.field === 'categoriaId') fields.academico = 'Confira as referências acadêmicas.'
      }
      patch({ sending: false, fields, uncertain, error: uncertain ? 'Não foi possível confirmar a edição. Confira o material antes de reenviar: a alteração pode ter sido salva.'
        : error.status === 409 ? 'O estado ou as referências do material mudaram. Confira os dados atuais antes de tentar novamente.' : error.message })
    } finally { if (tasks.get('save') === task) tasks.delete('save') }
  }
  return {
    getState: () => state, load, loadOptions, changeAcademic, submit,
    reload: () => load(currentId),
    changeText(key: 'titulo' | 'descricao', value: string) { if (editable() && (key === 'titulo' || key === 'descricao')) patch({ draft: { ...state.draft, [key]: value } }) },
    subscribe(listener: (value: MaterialEdicaoState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancelAll(); state = empty(); listeners.clear() },
  }
}
