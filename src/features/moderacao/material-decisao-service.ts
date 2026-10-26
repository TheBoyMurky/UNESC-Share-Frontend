import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { parseMaterialDetail, validId, type MaterialDetail } from '../material/material-service.ts'
import { canModerate } from '../auth/permissions.ts'
import type { User } from '../auth/auth-service.ts'

export type MaterialDecision = 'publicar' | 'bloquear'
type Staff = Pick<User, 'id' | 'perfil'> | null
export function canDecideMaterial(material: MaterialDetail | null, user: Staff, decision: MaterialDecision): boolean {
  if (!material || !validId(user?.id) || !canModerate(user)) return false
  // Autoaprovacao explicitamente mantida para ambos os perfis, inclusive autor.
  return decision === 'publicar' ? material.status === 'PENDENTE' && material.torrents.length + material.magnets.length > 0
    : decision === 'bloquear' && ['PENDENTE', 'PUBLICADO', 'BLOQUEADO'].includes(material.status)
}
export function createMaterialDecisaoService(request: (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>) {
  async function decide(id: string, decision: MaterialDecision, signal?: AbortSignal): Promise<MaterialDetail> {
    if (!validId(id) || !['publicar', 'bloquear'].includes(decision)) throw new TypeError('Decisão de material inválida.')
    id = id.toLowerCase()
    const material = parseMaterialDetail(await request(`/materiais/${id}/${decision === 'publicar' ? 'publicacao' : 'bloqueio'}`, { method: 'POST', signal }), id)
    if (material.status !== (decision === 'publicar' ? 'PUBLICADO' : 'BLOQUEADO')
      || (decision === 'publicar' && material.torrents.length + material.magnets.length === 0)) throw new ApiError('protocol')
    return material
  }
  return { decide }
}
export type MaterialDecisaoService = ReturnType<typeof createMaterialDecisaoService>
