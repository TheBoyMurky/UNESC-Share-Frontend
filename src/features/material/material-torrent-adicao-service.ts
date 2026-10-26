import { ApiError } from '../../shared/http/client.ts'
import { validateTorrentFile, type MaterialMultipartRequest, type MaterialWriteRequest } from './material-cadastro-service.ts'
import { parseMaterialCompartilhamento, type MaterialCompartilhamento } from './material-compartilhamento.ts'
import { canEditMaterial } from './material-edicao-service.ts'
import { parseTorrentInfo, validId } from './material-service.ts'

export const canAddMaterialTorrent = (material: Pick<MaterialCompartilhamento, 'usuarioId' | 'status' | 'torrents'>, userId: string | null | undefined) => canEditMaterial(material, userId) && material.torrents.length < 10
export function createMaterialTorrentAdicaoService(request: MaterialWriteRequest, multipart: MaterialMultipartRequest) {
  return {
    async load(id: string, signal?: AbortSignal) {
      if (!validId(id)) throw new TypeError('Material inválido.')
      id = id.toLowerCase()
      return parseMaterialCompartilhamento(await request(`/materiais/${id}`, { signal }), id)
    },
    async add(original: MaterialCompartilhamento, file: File, userId: string, signal?: AbortSignal) {
      if (!validId(original.id) || !canAddMaterialTorrent(original, userId) || validateTorrentFile(file)) throw new TypeError('Confira o Material, a autoria e o arquivo .torrent.')
      const form = new FormData()
      form.append('arquivo', file, file.name)
      const dto = parseTorrentInfo(await multipart(`/materiais/${original.id.toLowerCase()}/torrents`, { form, signal }))
      if (dto.nomeArquivo !== file.name || dto.tamanho !== file.size || original.torrents.some(item => item.id === dto.id)) throw new ApiError('protocol')
      // A resposta e TorrentResponse: nao possui estado/autor/Material nem exige seguir Location.
      return { id: original.id.toLowerCase(), torrentId: dto.id }
    },
  }
}
export type MaterialTorrentAdicaoService = ReturnType<typeof createMaterialTorrentAdicaoService>
