import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'
import { normalizeCurso, validateCurso, type CursoInput } from './curso-cadastro-service.ts'
import { parseCurso } from './curso-service.ts'

export function createCursoEdicaoService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  return {
    async detail(id: string, signal?: AbortSignal) {
      if (!validId(id)) throw new TypeError('Curso inválido.')
      id = id.toLowerCase()
      const raw = await request(`/cursos/${id}`, { signal })
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError('protocol')
      const parent = (raw as Record<string, unknown>).instituicaoId
      if (!validId(parent)) throw new ApiError('protocol')
      const dto = parseCurso(raw, parent.toLowerCase())
      if (dto.id !== id) throw new ApiError('protocol')
      return dto
    },
    async update(id: string, instituicaoId: string, input: CursoInput, signal?: AbortSignal) {
      if (!validId(id) || !validId(instituicaoId)) throw new TypeError('Curso ou instituição inválidos.')
      if (Object.keys(validateCurso(input)).length) throw new TypeError('Confira o nome e a descrição do curso.')
      id = id.toLowerCase()
      instituicaoId = instituicaoId.toLowerCase()
      const payload = normalizeCurso(input)
      const dto = parseCurso(await request(`/cursos/${id}`, { method: 'PUT', json: { ...payload, instituicaoId }, signal }), instituicaoId)
      if (dto.id !== id || dto.nome !== payload.nome || dto.descricao !== payload.descricao) throw new ApiError('protocol')
      return { id }
    },
  }
}
export type CursoEdicaoService = ReturnType<typeof createCursoEdicaoService>
