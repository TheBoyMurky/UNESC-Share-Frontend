import { ApiError } from '../../shared/http/client.ts'
import type { MaterialWriteRequest } from './material-cadastro-service.ts'
import { canEditMaterial } from './material-edicao-service.ts'
import { safeMagnetUri, validId } from './material-service.ts'
import { parseMaterialCompartilhamento, type MaterialCompartilhamento } from './material-compartilhamento.ts'

export type MagnetMaterial = MaterialCompartilhamento
export const canAddMaterialMagnets = (material: Pick<MagnetMaterial, 'usuarioId' | 'status' | 'magnets'>, userId: string | null | undefined) => canEditMaterial(material, userId) && material.magnets.length < 10
export function validateMagnetAddition(uris: readonly string[], existing: number): string {
  if (!Number.isSafeInteger(existing) || existing < 0 || existing > 10 || !Array.isArray(uris) || !uris.length || uris.length > 10 - existing) return 'Informe ao menos um Magnet, respeitando o limite acumulado de 10 por Material.'
  if (uris.some(uri => typeof uri !== 'string' || uri.length > 4000 || !safeMagnetUri(uri.trim()))) return 'Confira as URIs: até 4000 caracteres por campo e um único xt v1 ou v2 SHA-256.'
  if (new Set(uris.map(uri => uri.trim())).size !== uris.length) return 'Não repita a mesma URI no lote.'
  return ''
}
function preserved<T extends { id: string }>(before: readonly T[], after: readonly T[], fields: readonly (keyof T)[]) {
  const byId = new Map(after.map(item => [item.id, item]))
  return before.every(item => { const current = byId.get(item.id); return current && fields.every(field => current[field] === item[field]) })
}
export function createMaterialMagnetAdicaoService(request: MaterialWriteRequest) {
  return {
    async load(id: string, signal?: AbortSignal) {
      if (!validId(id)) throw new TypeError('Material inválido.')
      id = id.toLowerCase()
      return parseMaterialCompartilhamento(await request(`/materiais/${id}`, { signal }), id)
    },
    async add(original: MagnetMaterial, uris: readonly string[], userId: string, signal?: AbortSignal) {
      if (!validId(original.id) || !canAddMaterialMagnets(original, userId) || validateMagnetAddition(uris, original.magnets.length)) throw new TypeError('Confira o Material, a autoria e o lote de Magnets.')
      const id = original.id.toLowerCase()
      const dto = parseMaterialCompartilhamento(await request(`/materiais/${id}/magnets`, { method: 'POST', json: { magnetUris: uris.map(uri => uri.trim()) }, signal }), id)
      if (dto.usuarioId.toLowerCase() !== userId.toLowerCase() || dto.dataCadastro !== original.dataCadastro || dto.status !== 'PENDENTE'
        || dto.magnets.length < original.magnets.length + uris.length
        || !preserved(original.magnets, dto.magnets, ['magnetUri', 'infoHash', 'dataCadastro'])
        || !preserved(original.torrents, dto.torrents, ['nomeArquivo', 'infoHash', 'tamanho', 'dataCadastro'])) throw new ApiError('protocol')
      // Outras abas podem acrescentar mecanismos/editar metadados entre GET e POST; nao impor snapshot.
      return { id: dto.id }
    },
  }
}
export type MaterialMagnetAdicaoService = ReturnType<typeof createMaterialMagnetAdicaoService>
