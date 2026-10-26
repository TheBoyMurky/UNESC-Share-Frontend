import { ApiError } from '../../shared/http/client.ts'
import type { Option, SelectorKind } from '../catalogo/catalog-service.ts'
import { parseMaterialDetail, validId, type MaterialDetail } from './material-service.ts'
import { validateMaterialMetadados, type MaterialMetadados, type MaterialWriteRequest } from './material-cadastro-service.ts'

export interface AcademicValues { instituicaoId: string; cursoId: string; disciplinaId: string; categoriaId: string }
export interface EditReferences { values: AcademicValues; options: Record<SelectorKind, Option> }
export function canEditMaterial(material: Pick<MaterialDetail, 'usuarioId' | 'status'>, userId: string | null | undefined): boolean {
  return validId(userId) && material.usuarioId.toLowerCase() === userId.toLowerCase() && ['PENDENTE', 'PUBLICADO'].includes(material.status)
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  return value as Record<string, unknown>
}
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()

export function createMaterialEdicaoService(request: MaterialWriteRequest) {
  async function load(id: string, signal?: AbortSignal): Promise<MaterialDetail> {
    if (!validId(id)) throw new TypeError('Identificador de material inválido.')
    id = id.toLowerCase()
    return parseMaterialDetail(await request('/materiais/' + id, { signal }), id)
  }
  async function references(material: MaterialDetail, signal?: AbortSignal): Promise<EditReferences> {
    async function named(path: string, id: string) {
      if (!validId(id)) throw new ApiError('protocol')
      const dto = record(await request(path + '/' + id, { signal }))
      if (dto.id !== id || !text(dto.nome)) throw new ApiError('protocol')
      return dto as Record<string, unknown> & { id: string; nome: string }
    }
    const [disciplina, categoria] = await Promise.all([named('/disciplinas', material.disciplinaId), named('/categorias', material.categoriaId)])
    if (!validId(disciplina.cursoId) || !text(disciplina.codigo)) throw new ApiError('protocol')
    const curso = await named('/cursos', disciplina.cursoId)
    if (!validId(curso.instituicaoId)) throw new ApiError('protocol')
    const instituicao = await named('/instituicoes', curso.instituicaoId)
    if (!text(instituicao.sigla)) throw new ApiError('protocol')
    return { values: { instituicaoId: instituicao.id, cursoId: curso.id, disciplinaId: disciplina.id, categoriaId: categoria.id }, options: {
      instituicoes: { id: instituicao.id, nome: instituicao.nome, complemento: instituicao.sigla }, cursos: { id: curso.id, nome: curso.nome },
      disciplinas: { id: disciplina.id, nome: disciplina.nome, complemento: disciplina.codigo }, categorias: { id: categoria.id, nome: categoria.nome },
    } }
  }
  async function save(id: string, input: MaterialMetadados, signal?: AbortSignal): Promise<MaterialDetail> {
    if (!validId(id) || Object.keys(validateMaterialMetadados(input)).length) throw new TypeError('Confira o identificador e os metadados do material.')
    id = id.toLowerCase()
    const body: MaterialMetadados = { titulo: input.titulo.trim(), descricao: input.descricao.trim(), disciplinaId: input.disciplinaId.toLowerCase(), categoriaId: input.categoriaId.toLowerCase() }
    const dto = parseMaterialDetail(await request('/materiais/' + id, { method: 'PUT', json: body, signal }), id)
    if (dto.status !== 'PENDENTE' || dto.disciplinaId !== body.disciplinaId || dto.categoriaId !== body.categoriaId) throw new ApiError('protocol')
    // O PUT nao envia mecanismos; o retorno pode incluir adicoes concorrentes legitimas do autor.
    return dto
  }
  return { load, references, save }
}
export type MaterialEdicaoService = ReturnType<typeof createMaterialEdicaoService>
