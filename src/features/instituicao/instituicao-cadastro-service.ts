import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'
import { parseInstituicao } from './instituicao-service.ts'

export interface InstituicaoInput { nome: string; sigla: string }
export type InstituicaoFields = Partial<Record<keyof InstituicaoInput, string>>
export const normalizeInstituicao = (input: InstituicaoInput): InstituicaoInput => ({ nome: input.nome.trim(), sigla: input.sigla.trim().toUpperCase() })
export function validateInstituicao(input: InstituicaoInput): InstituicaoFields {
  const normalized = normalizeInstituicao(input), fields: InstituicaoFields = {}
  if (!normalized.nome || normalized.nome.length > 180 || input.nome.includes('\u0000')) fields.nome = 'Informe um nome com até 180 caracteres.'
  if (!normalized.sigla || normalized.sigla.length > 30 || input.sigla.includes('\u0000')) fields.sigla = 'Informe uma sigla com até 30 caracteres após converter para maiúsculas.'
  return fields
}
export function createInstituicaoCadastroService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  return {
    async create(input: InstituicaoInput, signal?: AbortSignal) {
      if (Object.keys(validateInstituicao(input)).length) throw new TypeError('Confira nome e sigla da instituição.')
      const body = normalizeInstituicao(input)
      const dto = parseInstituicao(await request('/instituicoes', { method: 'POST', json: body, signal }))
      if (dto.nome !== body.nome || dto.sigla !== body.sigla) throw new ApiError('protocol')
      return { id: dto.id }
    },
  }
}
export function createInstituicaoEdicaoService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  return {
    async detail(id: string, signal?: AbortSignal) {
      if (!validId(id)) throw new TypeError('Instituição inválida.')
      id = id.toLowerCase()
      const dto = parseInstituicao(await request(`/instituicoes/${id}`, { signal }))
      if (dto.id !== id) throw new ApiError('protocol')
      return dto
    },
    async update(id: string, input: InstituicaoInput, signal?: AbortSignal) {
      if (!validId(id)) throw new TypeError('Instituição inválida.')
      if (Object.keys(validateInstituicao(input)).length) throw new TypeError('Confira nome e sigla da instituição.')
      id = id.toLowerCase()
      const body = normalizeInstituicao(input)
      const dto = parseInstituicao(await request(`/instituicoes/${id}`, { method: 'PUT', json: body, signal }))
      if (dto.id !== id || dto.nome !== body.nome || dto.sigla !== body.sigla) throw new ApiError('protocol')
      return { id }
    },
  }
}
export type InstituicaoEdicaoService = ReturnType<typeof createInstituicaoEdicaoService>
export type InstituicaoCadastroService = ReturnType<typeof createInstituicaoCadastroService>
