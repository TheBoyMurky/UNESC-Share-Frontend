import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'
import { parseCurso } from './curso-service.ts'

export interface CursoInput { nome: string; descricao: string }
export interface CursoPayload { nome: string; descricao: string | null }
export type CursoFields = Partial<Record<keyof CursoInput, string>>
export function normalizeCurso(input: CursoInput): CursoPayload {
  const nome = input.nome.trim(), descricao = input.descricao.trim()
  return { nome, descricao: descricao || null }
}
export function validateCurso(input: CursoInput): CursoFields {
  const normalized = normalizeCurso(input), fields: CursoFields = {}
  if (!normalized.nome || normalized.nome.length > 150 || input.nome.includes('\u0000')) fields.nome = 'Informe um nome com até 150 caracteres.'
  if ((normalized.descricao?.length ?? 0) > 1000 || input.descricao.includes('\u0000')) fields.descricao = 'A descrição deve ter até 1000 caracteres.'
  return fields
}
export function createCursoCadastroService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  return {
    async create(instituicaoId: string, input: CursoInput, signal?: AbortSignal) {
      if (!validId(instituicaoId)) throw new TypeError('Instituição inválida.')
      if (Object.keys(validateCurso(input)).length) throw new TypeError('Confira o nome e a descrição do curso.')
      instituicaoId = instituicaoId.toLowerCase()
      const payload = normalizeCurso(input), body = { ...payload, instituicaoId }
      const dto = parseCurso(await request('/cursos', { method: 'POST', json: body, signal }), instituicaoId)
      if (dto.nome !== payload.nome || dto.descricao !== payload.descricao) throw new ApiError('protocol')
      return { id: dto.id }
    },
  }
}
export type CursoCadastroService = ReturnType<typeof createCursoCadastroService>
