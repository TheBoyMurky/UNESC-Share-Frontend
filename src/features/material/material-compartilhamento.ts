import { ApiError } from '../../shared/http/client.ts'
import { parseMaterialDetail, type MaterialDetail } from './material-service.ts'

export type MaterialCompartilhamento = Pick<MaterialDetail, 'id' | 'titulo' | 'status' | 'usuarioId' | 'dataCadastro' | 'magnets' | 'torrents'>
export function parseMaterialCompartilhamento(value: unknown, id: string): MaterialCompartilhamento {
  const dto = parseMaterialDetail(value, id)
  if (dto.magnets.length > 10 || dto.torrents.length > 10) throw new ApiError('protocol')
  return { id: dto.id, titulo: dto.titulo, status: dto.status, usuarioId: dto.usuarioId, dataCadastro: dto.dataCadastro, magnets: dto.magnets, torrents: dto.torrents }
}
