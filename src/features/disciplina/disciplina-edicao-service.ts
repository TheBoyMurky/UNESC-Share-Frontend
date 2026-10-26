import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'
import { normalizeDisciplina, validateDisciplina, type DisciplinaInput } from './disciplina-cadastro-service.ts'
import { parseDisciplina } from './disciplina-service.ts'

export function createDisciplinaEdicaoService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  return {
    async detail(id: string, cursoId: string, signal?: AbortSignal) {
      if (!validId(id) || !validId(cursoId)) throw new TypeError('Disciplina ou curso inválidos.')
      id = id.toLowerCase(); cursoId = cursoId.toLowerCase()
      const dto = parseDisciplina(await request(`/disciplinas/${id}`, { signal }), cursoId)
      if (dto.id !== id) throw new ApiError('protocol')
      return dto
    },
    async update(id: string, cursoId: string, input: DisciplinaInput, signal?: AbortSignal) {
      if (!validId(id) || !validId(cursoId)) throw new TypeError('Disciplina ou curso inválidos.')
      if (Object.keys(validateDisciplina(input)).length) throw new TypeError('Confira os dados da disciplina.')
      id = id.toLowerCase(); cursoId = cursoId.toLowerCase()
      const payload = normalizeDisciplina(input)
      const dto = parseDisciplina(await request(`/disciplinas/${id}`, { method: 'PUT', json: { ...payload, cursoId }, signal }), cursoId)
      if (dto.id !== id || dto.nome !== payload.nome || dto.descricao !== payload.descricao || dto.codigo !== payload.codigo) throw new ApiError('protocol')
      return { id }
    },
  }
}
export type DisciplinaEdicaoService = ReturnType<typeof createDisciplinaEdicaoService>
