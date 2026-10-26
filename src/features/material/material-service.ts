import { ApiError, MAX_TORRENT_BYTES, type TorrentPayload } from '../../shared/http/client.ts'
import type { CatalogRequest } from '../catalogo/catalog-service.ts'

export type MaterialStatus = 'PENDENTE' | 'PUBLICADO' | 'BLOQUEADO' | 'REMOVIDO'
export interface TorrentInfo { id: string; nomeArquivo: string; infoHash: string; tamanho: number; dataCadastro: string }
export interface MagnetInfo { id: string; magnetUri: string; infoHash: string; dataCadastro: string }
export interface MaterialDetail {
  id: string; titulo: string; descricao: string; status: MaterialStatus; dataCadastro: string; visualizacoes: number
  usuarioId: string; disciplinaId: string; categoriaId: string; torrents: TorrentInfo[]; magnets: MagnetInfo[]
}
export interface AcademicContext { instituicao: string; curso: string; disciplina: string; codigo: string; categoria: string }
export interface TorrentDownload { blob: Blob; filename: string }
export type TorrentRequest = (path: string, options?: { signal?: AbortSignal }) => Promise<TorrentPayload>
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  return value as Record<string, unknown>
}
function assertId(value: unknown): asserts value is string { if (!validId(value)) throw new TypeError('Identificador de material ou mecanismo inválido.') }

// Defesa de navegacao: nao substitui o parser/normalizador BitTorrent do backend.
export function safeMagnetUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4000 || /[\s\u0000-\u001f\u007f]/u.test(value) || !/^magnet:\?/i.test(value)) return false
  try {
    const uri = new URL(value), xt = uri.searchParams.getAll('xt')
    return uri.protocol === 'magnet:' && !uri.hash && xt.length === 1
      && (/^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(xt[0] ?? '') || /^urn:btmh:1220[a-f0-9]{64}$/i.test(xt[0] ?? ''))
  } catch { return false }
}

export function parseTorrentInfo(value: unknown): TorrentInfo {
  const item = record(value)
  if (!validId(item.id) || !text(item.nomeArquivo) || typeof item.infoHash !== 'string' || !/^[a-f0-9]{40}$/i.test(item.infoHash)
    || !count(item.tamanho) || item.tamanho < 1 || item.tamanho > MAX_TORRENT_BYTES || !date(item.dataCadastro)) throw new ApiError('protocol')
  return { id: item.id, nomeArquivo: item.nomeArquivo, infoHash: item.infoHash, tamanho: item.tamanho, dataCadastro: item.dataCadastro }
}
export function parseMaterialDetail(value: unknown, expectedId?: string): MaterialDetail {
    const data = record(value)
    if (!validId(data.id) || (expectedId !== undefined && data.id !== expectedId) || !text(data.titulo) || !text(data.descricao)
      || !['PENDENTE', 'PUBLICADO', 'BLOQUEADO', 'REMOVIDO'].includes(String(data.status))
      || !date(data.dataCadastro) || !count(data.visualizacoes) || !validId(data.usuarioId)
      || !validId(data.disciplinaId) || !validId(data.categoriaId) || !Array.isArray(data.torrents) || !Array.isArray(data.magnets)) throw new ApiError('protocol')
    const torrents = data.torrents.map(parseTorrentInfo)
    const magnets = data.magnets.map(value => {
      const item = record(value)
      if (!validId(item.id) || !safeMagnetUri(item.magnetUri) || typeof item.infoHash !== 'string'
        || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(item.infoHash) || !date(item.dataCadastro)) throw new ApiError('protocol')
      return { id: item.id, magnetUri: item.magnetUri, infoHash: item.infoHash, dataCadastro: item.dataCadastro }
    })
    if (new Set(torrents.map(item => item.id)).size !== torrents.length || new Set(magnets.map(item => item.id)).size !== magnets.length) throw new ApiError('protocol')
    return { id: data.id, titulo: data.titulo, descricao: data.descricao, status: data.status as MaterialStatus, dataCadastro: data.dataCadastro,
      visualizacoes: data.visualizacoes, usuarioId: data.usuarioId, disciplinaId: data.disciplinaId, categoriaId: data.categoriaId, torrents, magnets }
}

export function createMaterialService(request: CatalogRequest, torrentRequest: TorrentRequest) {
  async function detail(id: string, signal?: AbortSignal): Promise<MaterialDetail> {
    assertId(id)
    id = id.toLowerCase()
    return parseMaterialDetail(await request('/materiais/' + id, { signal }), id)
  }

  async function named(path: string, id: string, signal?: AbortSignal) {
    assertId(id)
    id = id.toLowerCase()
    const dto = record(await request(path + '/' + id, { signal }))
    if (dto.id !== id || !text(dto.nome)) throw new ApiError('protocol')
    return dto as Record<string, unknown> & { nome: string }
  }
  async function academic(material: MaterialDetail, signal?: AbortSignal): Promise<AcademicContext> {
    const [disciplina, categoria] = await Promise.all([named('/disciplinas', material.disciplinaId, signal), named('/categorias', material.categoriaId, signal)])
    if (!validId(disciplina.cursoId) || !text(disciplina.codigo)) throw new ApiError('protocol')
    const curso = await named('/cursos', disciplina.cursoId, signal)
    if (!validId(curso.instituicaoId)) throw new ApiError('protocol')
    const instituicao = await named('/instituicoes', curso.instituicaoId, signal)
    return { instituicao: instituicao.nome, curso: curso.nome, disciplina: disciplina.nome, codigo: disciplina.codigo, categoria: categoria.nome }
  }

  async function download(materialId: string, torrentId: string, signal?: AbortSignal): Promise<TorrentDownload> {
    assertId(materialId); assertId(torrentId)
    materialId = materialId.toLowerCase(); torrentId = torrentId.toLowerCase()
    const payload = await torrentRequest(`/materiais/${materialId}/torrents/${torrentId}`, { signal })
    // O nome exibido no DTO/Content-Disposition nunca vira caminho local ou nome executavel.
    return { blob: payload.blob, filename: torrentId + '.torrent' }
  }
  return { detail, academic, download }
}

export type MaterialService = ReturnType<typeof createMaterialService>
