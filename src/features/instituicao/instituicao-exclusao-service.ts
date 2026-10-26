import { ApiError } from '../../shared/http/client.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { validId } from '../material/material-service.ts'
import { parseInstituicao, type Instituicao } from './instituicao-service.ts'

export type InstitutionDeleteRequest = (path: string, options?: { signal?: AbortSignal }) => Promise<void>

export function createInstituicaoExclusaoService(request: CatalogRequest, deleteRequest: InstitutionDeleteRequest) {
  return {
    async load(id: string, signal?: AbortSignal): Promise<Instituicao> {
      if (!validId(id)) throw new TypeError('Instituição inválida.')
      id = id.toLowerCase()
      const institution = parseInstituicao(await request(`/instituicoes/${id}`, { signal }))
      if (institution.id !== id) throw new ApiError('protocol')
      return institution
    },
    async remove(id: string, signal?: AbortSignal): Promise<void> {
      if (!validId(id)) throw new TypeError('Instituição inválida.')
      await deleteRequest(`/instituicoes/${id.toLowerCase()}`, { signal })
    },
  }
}
export type InstituicaoExclusaoService = ReturnType<typeof createInstituicaoExclusaoService>
