import type { CatalogRequest } from '../catalogo/catalog-service.ts'
import { parseMaterialDetail, validId, type MaterialDetail, type MaterialStatus } from './material-service.ts'

export interface RemovalSummary { id: string; titulo: string; usuarioId: string; status: MaterialStatus; torrentCount: number; magnetCount: number }
export type MaterialDeleteRequest = (path: string, options?: { signal?: AbortSignal }) => Promise<void>
export function canRemoveMaterial(material: Pick<MaterialDetail, 'usuarioId' | 'status'>, userId: string | null | undefined): boolean {
  return validId(userId) && material.usuarioId.toLowerCase() === userId.toLowerCase() && ['PENDENTE', 'PUBLICADO', 'BLOQUEADO'].includes(material.status)
}

export function createMaterialRemocaoService(request: CatalogRequest, removeRequest: MaterialDeleteRequest) {
  async function load(id: string, signal?: AbortSignal): Promise<RemovalSummary> {
    if (!validId(id)) throw new TypeError('Identificador de material inválido.')
    id = id.toLowerCase()
    const dto = parseMaterialDetail(await request('/materiais/' + id, { signal }), id)
    // A confirmacao precisa somente do alvo e contagens, nao de descricoes/URIs/caminhos pessoais.
    return { id: dto.id, titulo: dto.titulo, usuarioId: dto.usuarioId, status: dto.status, torrentCount: dto.torrents.length, magnetCount: dto.magnets.length }
  }
  async function remove(id: string, signal?: AbortSignal): Promise<void> {
    if (!validId(id)) throw new TypeError('Identificador de material inválido.')
    await removeRequest('/materiais/' + id.toLowerCase(), { signal })
  }
  return { load, remove }
}
export type MaterialRemocaoService = ReturnType<typeof createMaterialRemocaoService>
