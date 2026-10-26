import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { pagination, parsePage } from '../../shared/http/page.ts'
import { parseMaterialDetail, validId, type MaterialStatus } from '../material/material-service.ts'

export const motivos = ['DIREITOS_AUTORAIS', 'CONTEUDO_INADEQUADO', 'LINK_INVALIDO', 'SPAM', 'OUTRO'] as const
export const estados = ['PENDENTE', 'EM_ANALISE', 'PROCEDENTE', 'IMPROCEDENTE'] as const
export type MotivoDenuncia = typeof motivos[number]
export type StatusDenuncia = typeof estados[number]
export const motivoLabel: Record<MotivoDenuncia, string> = { DIREITOS_AUTORAIS: 'Direitos autorais', CONTEUDO_INADEQUADO: 'Conteúdo inadequado', LINK_INVALIDO: 'Link inválido', SPAM: 'Spam', OUTRO: 'Outro' }
export const statusLabel: Record<StatusDenuncia, string> = { PENDENTE: 'Pendente', EM_ANALISE: 'Em análise', PROCEDENTE: 'Procedente', IMPROCEDENTE: 'Improcedente' }
export interface Denuncia { id: string; motivo: MotivoDenuncia; descricao: string; status: StatusDenuncia; dataCadastro: string; materialId: string }
export type DenunciaResumo = Omit<Denuncia, 'descricao'>
export interface DenunciaInput { motivo: string; descricao: string }
export type DenunciaErrors = Partial<Record<keyof DenunciaInput, string>>
export interface DenunciaMaterial { id: string; titulo: string; status: MaterialStatus }
type Request = (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>

export function validateDenuncia(input: DenunciaInput): DenunciaErrors {
  const errors: DenunciaErrors = {}
  if (!motivos.some(value => value === input.motivo)) errors.motivo = 'Selecione um motivo válido.'
  if (!input.descricao.trim() || input.descricao.trim().length > 2000 || input.descricao.includes('\u0000')) errors.descricao = 'Descreva o problema com até 2000 caracteres, sem caracteres nulos.'
  return errors
}
export function parseDenuncia(value: unknown): Denuncia {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  const dto = value as Record<string, unknown>
  if (!validId(dto.id) || !validId(dto.materialId) || !motivos.some(value => value === dto.motivo)
    || !estados.some(value => value === dto.status) || typeof dto.descricao !== 'string' || dto.descricao.length > 2000
    || validateDenuncia({ motivo: dto.motivo as string, descricao: dto.descricao }).descricao
    || typeof dto.dataCadastro !== 'string' || !Number.isFinite(Date.parse(dto.dataCadastro))) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), motivo: dto.motivo as MotivoDenuncia, descricao: dto.descricao,
    status: dto.status as StatusDenuncia, dataCadastro: dto.dataCadastro, materialId: dto.materialId.toLowerCase() }
}
function uuid(id: string) {
  if (!validId(id)) throw new TypeError('Identificador inválido.')
  return id.toLowerCase()
}
export function createDenunciaService(request: Request) {
  return {
    async material(id: string, signal?: AbortSignal): Promise<DenunciaMaterial> {
      const expected = uuid(id), dto = parseMaterialDetail(await request('/materiais/' + expected, { signal }), expected)
      return { id: dto.id, titulo: dto.titulo, status: dto.status }
    },
    async create(materialId: string, input: DenunciaInput, signal?: AbortSignal): Promise<{ id: string }> {
      const material = uuid(materialId)
      if (Object.keys(validateDenuncia(input)).length) throw new TypeError('Confira o motivo e a descrição.')
      const body = { motivo: input.motivo, descricao: input.descricao.trim() }
      const dto = parseDenuncia(await request('/materiais/' + material + '/denuncias', { method: 'POST', json: body, signal }))
      if (dto.status !== 'PENDENTE' || dto.materialId !== material || dto.motivo !== body.motivo || dto.descricao !== body.descricao) throw new ApiError('protocol')
      return { id: dto.id }
    },
    async list(number = 0, size = 20, signal?: AbortSignal) {
      const data = parsePage(await request('/denuncias/minhas?' + pagination(number, size).toString(), { signal }), value => {
        const { descricao: _descricao, ...summary } = parseDenuncia(value)
        return summary
      }, number, size)
      if (new Set(data.content.map(item => item.id)).size !== data.content.length) throw new ApiError('protocol')
      return data
    },
    async detail(id: string, signal?: AbortSignal) {
      const expected = uuid(id), dto = parseDenuncia(await request('/denuncias/' + expected, { signal }))
      if (dto.id !== expected) throw new ApiError('protocol')
      return dto
    },
  }
}
export type DenunciaService = ReturnType<typeof createDenunciaService>
