import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'
import { parseDisciplina } from './disciplina-service.ts'

export interface DisciplinaInput { nome: string; descricao: string; codigo: string }
export interface DisciplinaPayload { nome: string; descricao: string | null; codigo: string }
export type DisciplinaFields = Partial<Record<keyof DisciplinaInput, string>>

export function normalizeDisciplina(input: DisciplinaInput): DisciplinaPayload {
  const nome = input.nome.trim(), descricao = input.descricao.trim(), codigo = input.codigo.trim().toUpperCase()
  return { nome, descricao: descricao || null, codigo }
}

export function validateDisciplina(input: DisciplinaInput): DisciplinaFields {
  const normalized = normalizeDisciplina(input), fields: DisciplinaFields = {}
  if (!normalized.nome || normalized.nome.length > 150 || input.nome.includes('\u0000')) fields.nome = 'Informe um nome com até 150 caracteres.'
  if ((normalized.descricao?.length ?? 0) > 1000 || input.descricao.includes('\u0000')) fields.descricao = 'A descrição deve ter até 1000 caracteres.'
  if (!normalized.codigo || normalized.codigo.length > 30 || input.codigo.includes('\u0000')) fields.codigo = 'Informe um código com até 30 caracteres.'
  return fields
}

export function createDisciplinaCadastroService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  return {
    async create(cursoId: string, input: DisciplinaInput, signal?: AbortSignal) {
      if (!validId(cursoId)) throw new TypeError('Curso inválido.')
      if (Object.keys(validateDisciplina(input)).length) throw new TypeError('Confira o nome, a descrição e o código da disciplina.')
      cursoId = cursoId.toLowerCase()
      const payload = normalizeDisciplina(input), body = { ...payload, cursoId }
      const dto = parseDisciplina(await request('/disciplinas', { method: 'POST', json: body, signal }), cursoId)
      if (dto.nome !== payload.nome || dto.descricao !== payload.descricao || dto.codigo !== payload.codigo) throw new ApiError('protocol')
      return { id: dto.id }
    },
  }
}
export type DisciplinaCadastroService = ReturnType<typeof createDisciplinaCadastroService>
