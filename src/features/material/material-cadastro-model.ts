import { ApiError } from '../../shared/http/client.ts'
import type { CatalogService, Filters, SelectorKind } from '../catalogo/catalog-service.ts'
import type { SelectorState } from '../catalogo/catalog-model.ts'
import { validateMaterialCadastro, validateMaterialMetadados, validateTorrentFile, type MaterialCadastroErrors, type MaterialCadastroService } from './material-cadastro-service.ts'

type AcademicKey = Exclude<keyof Filters, 'q'>
interface Draft { titulo: string; descricao: string; instituicaoId: string; cursoId: string; disciplinaId: string; categoriaId: string; magnetUris: string[] }
export type SharingMode = 'MAGNET' | 'TORRENT'
export interface MaterialCadastroState { draft: Draft; mode: SharingMode; file: File | null; selectors: Record<SelectorKind, SelectorState>; sending: boolean; createdId: string; error: string; fields: MaterialCadastroErrors; uncertain: boolean }
const emptySelector = (): SelectorState => ({ options: [], page: null, loading: false, error: '' })
const emptyDraft = (): Draft => ({ titulo: '', descricao: '', instituicaoId: '', cursoId: '', disciplinaId: '', categoriaId: '', magnetUris: [''] })
const empty = (): MaterialCadastroState => ({ draft: emptyDraft(), mode: 'MAGNET', file: null, selectors: { instituicoes: emptySelector(), cursos: emptySelector(), disciplinas: emptySelector(), categorias: emptySelector() }, sending: false, createdId: '', error: '', fields: {}, uncertain: false })
const kinds = { instituicaoId: 'instituicoes', cursoId: 'cursos', disciplinaId: 'disciplinas', categoriaId: 'categorias' } as const

export function createMaterialCadastroModel(options: Pick<CatalogService, 'options'>, service: MaterialCadastroService) {
  let state = empty(), disposed = false
  const tasks = new Map<string, AbortController>(), listeners = new Set<(value: MaterialCadastroState) => void>()
  const patch = (value: Partial<MaterialCadastroState>) => { state = { ...state, ...value }; if (!disposed) listeners.forEach(listener => listener(state)) }
  const editable = () => !disposed && !state.sending && !state.createdId
  const selector = (kind: SelectorKind, value: Partial<SelectorState>) => patch({ selectors: { ...state.selectors, [kind]: { ...state.selectors[kind], ...value } } })
  const cancel = (key: string) => { tasks.get(key)?.abort(); tasks.delete(key) }
  const reset = (kind: SelectorKind) => { cancel(kind); selector(kind, emptySelector()) }
  const current = (key: string, task: AbortController) => !disposed && tasks.get(key) === task && !task.signal.aborted

  async function loadOptions(kind: SelectorKind, append = false) {
    if (!editable() || state.selectors[kind].loading) return
    const old = state.selectors[kind], parent = kind === 'cursos' ? state.draft.instituicaoId : kind === 'disciplinas' ? state.draft.cursoId : ''
    if ((kind === 'cursos' || kind === 'disciplinas') && !parent) return
    if (append && (!old.page || old.page.number + 1 >= old.page.totalPages)) return
    const number = append && old.page ? old.page.number + 1 : 0, task = new AbortController()
    cancel(kind); tasks.set(kind, task); selector(kind, { loading: true, error: '' })
    try {
      const result = await options.options(kind, parent, number, task.signal)
      if (current(kind, task)) selector(kind, { options: [...new Map([...(append ? old.options : []), ...result.content].map(item => [item.id, item])).values()], page: result.page, loading: false })
    } catch (error) {
      if (current(kind, task)) selector(kind, { loading: false, error: error instanceof ApiError ? error.message : 'Não foi possível carregar as opções. Tente novamente.' })
    } finally { if (tasks.get(kind) === task) tasks.delete(kind) }
  }

  async function changeAcademic(key: AcademicKey, value: string) {
    if (!editable() || !Object.hasOwn(kinds, key) || (value && !state.selectors[kinds[key]].options.some(item => item.id === value))) return
    const draft = { ...state.draft, [key]: value }
    if (key === 'instituicaoId') { draft.cursoId = ''; draft.disciplinaId = ''; reset('cursos'); reset('disciplinas') }
    if (key === 'cursoId') { draft.disciplinaId = ''; reset('disciplinas') }
    patch({ draft })
    if (key === 'instituicaoId' && value) await loadOptions('cursos')
    if (key === 'cursoId' && value) await loadOptions('disciplinas')
  }

  async function refreshAcademic() {
    if (!editable()) return
    for (const kind of Object.values(kinds)) reset(kind)
    patch({ draft: { ...state.draft, instituicaoId: '', cursoId: '', disciplinaId: '', categoriaId: '' } })
    await Promise.all([loadOptions('instituicoes'), loadOptions('categorias')])
  }

  async function submit() {
    if (!editable()) return
    const draft = state.draft, mode = state.mode, file = state.file
    const fields = mode === 'MAGNET' ? validateMaterialCadastro(draft) : validateMaterialMetadados(draft)
    if (mode === 'TORRENT') { const invalid = validateTorrentFile(file); if (invalid) fields.arquivo = invalid }
    if ((Object.keys(kinds) as AcademicKey[]).some(key => !draft[key] || !state.selectors[kinds[key]].options.some(item => item.id === draft[key]))) fields.academico = 'Selecione instituição, curso, disciplina e categoria entre as opções carregadas.'
    if (Object.keys(fields).length) { patch({ fields, error: 'Confira os campos informados.', uncertain: false }); return }
    for (const kind of Object.values(kinds)) { cancel(kind); selector(kind, { loading: false }) }
    const task = new AbortController()
    tasks.set('submit', task); patch({ sending: true, error: '', fields: {}, uncertain: false })
    try {
      const metadata = { titulo: draft.titulo, descricao: draft.descricao, disciplinaId: draft.disciplinaId, categoriaId: draft.categoriaId }
      const result = mode === 'TORRENT' && file
        ? await service.cadastrarComTorrent(metadata, file, task.signal)
        : await service.cadastrar({ ...metadata, magnetUris: [...draft.magnetUris] }, task.signal)
      if (current('submit', task)) patch({ sending: false, createdId: result.id, draft: emptyDraft(), file: null })
    } catch (error) {
      if (!current('submit', task)) return
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || (error.status ?? 500) >= 500 || error.status === 408
      const fields: MaterialCadastroErrors = {}
      if (error instanceof ApiError && error.status === 400) for (const entry of error.problem?.errors ?? []) {
        if (entry.field === 'titulo') fields.titulo = 'Confira o título (obrigatório, até 200 caracteres).'
        if (entry.field === 'descricao') fields.descricao = 'Confira a descrição (obrigatória, até 4000 caracteres).'
        if (entry.field === 'disciplinaId' || entry.field === 'categoriaId') fields.academico = 'Confira as referências acadêmicas.'
        if (/^magnetUris(?:\[\d+\])?$/.test(entry.field)) fields.magnetUris = 'Confira os Magnets e seus limites.'
        if (entry.field === 'arquivo') fields.arquivo = 'Confira o arquivo .torrent v1 e seus limites.'
      }
      patch({ sending: false, uncertain, fields, error: uncertain
        ? 'Não foi possível confirmar o cadastro. Confira Meus materiais antes de reenviar: o registro pode ter sido criado.'
        : error.status === 409 ? 'O cadastro conflita com dados existentes. Confira os mecanismos e as referências antes de reenviar.' : error.message })
    } finally { if (tasks.get('submit') === task) tasks.delete('submit') }
  }

  return {
    getState: () => state, loadOptions, changeAcademic, refreshAcademic, submit,
    setMode(mode: SharingMode) {
      if (editable() && mode !== state.mode && (mode === 'MAGNET' || mode === 'TORRENT')) patch({ mode, file: null, draft: { ...state.draft, magnetUris: [''] }, fields: {}, error: state.uncertain ? state.error : '' })
    },
    selectTorrent(files: File[]) {
      if (!editable() || state.mode !== 'TORRENT') return
      const invalid = files.length !== 1 ? 'Selecione exatamente um arquivo .torrent v1.' : validateTorrentFile(files[0] ?? null)
      patch({ file: invalid ? null : files[0]!, fields: { ...state.fields, arquivo: invalid || undefined } })
    },
    clearTorrent() { if (editable()) patch({ file: null, fields: { ...state.fields, arquivo: undefined } }) },
    initialize: () => Promise.all([loadOptions('instituicoes'), loadOptions('categorias')]),
    changeText(key: 'titulo' | 'descricao', value: string) { if (editable() && (key === 'titulo' || key === 'descricao')) patch({ draft: { ...state.draft, [key]: value } }) },
    changeMagnet(index: number, value: string) { if (editable() && state.mode === 'MAGNET' && Number.isInteger(index) && index >= 0 && index < state.draft.magnetUris.length) patch({ draft: { ...state.draft, magnetUris: state.draft.magnetUris.map((uri, i) => i === index ? value : uri) } }) },
    addMagnet() { if (editable() && state.mode === 'MAGNET' && state.draft.magnetUris.length < 10) patch({ draft: { ...state.draft, magnetUris: [...state.draft.magnetUris, ''] } }) },
    removeMagnet(index: number) { if (editable() && state.mode === 'MAGNET' && state.draft.magnetUris.length > 1 && Number.isInteger(index) && index >= 0 && index < state.draft.magnetUris.length) patch({ draft: { ...state.draft, magnetUris: state.draft.magnetUris.filter((_, i) => i !== index) } }) },
    subscribe(listener: (value: MaterialCadastroState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; for (const task of tasks.values()) task.abort(); tasks.clear(); state = empty(); listeners.clear() },
  }
}
