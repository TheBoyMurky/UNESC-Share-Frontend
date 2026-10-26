import { ApiError, MAX_TORRENT_BYTES, type JsonRequest, type MultipartRequest } from '../../shared/http/client.ts'
import { parseMaterialDetail, safeMagnetUri, validId } from './material-service.ts'

export interface MaterialCadastroRequest { titulo: string; descricao: string; disciplinaId: string; categoriaId: string; magnetUris: string[] }
export type MaterialMetadados = Omit<MaterialCadastroRequest, 'magnetUris'>
export type MaterialMultipartRequest = (path: string, options: Omit<MultipartRequest, 'token'>) => Promise<unknown>
export type MaterialWriteRequest = (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>
export type MaterialCadastroErrors = Partial<Record<keyof MaterialCadastroRequest | 'academico' | 'arquivo', string>>

export function validateMaterialMetadados(input: MaterialMetadados): MaterialCadastroErrors {
  const errors: MaterialCadastroErrors = {}
  if (!input.titulo.trim() || input.titulo.trim().length > 200 || input.titulo.includes('\u0000')) errors.titulo = 'Informe um título com até 200 caracteres.'
  if (!input.descricao.trim() || input.descricao.trim().length > 4000 || input.descricao.includes('\u0000')) errors.descricao = 'Informe uma descrição com até 4000 caracteres.'
  if (!validId(input.disciplinaId)) errors.disciplinaId = 'Selecione uma disciplina válida.'
  if (!validId(input.categoriaId)) errors.categoriaId = 'Selecione uma categoria válida.'
  return errors
}

export function validateTorrentFile(file: File | null): string {
  if (!file || !(file instanceof File)) return 'Selecione um arquivo .torrent v1.'
  if (file.size < 1 || file.size > MAX_TORRENT_BYTES) return 'O .torrent deve ter de 1 byte a 2 MiB.'
  if (file.name.length > 255 || file.name.startsWith('.') || file.name !== file.name.trim() || !/\.torrent$/i.test(file.name)
    || /[\u0000-\u001f\u007f-\u009f/\\:%\ud800-\udfff]/u.test(file.name)) return 'Selecione um arquivo com nome .torrent simples, sem caminhos e com até 255 caracteres.'
  return ''
}

export function validateMaterialCadastro(input: MaterialCadastroRequest): MaterialCadastroErrors {
  const errors = validateMaterialMetadados(input)
  if (input.magnetUris.length < 1 || input.magnetUris.length > 10 || input.magnetUris.some(uri => uri.length > 4000 || !safeMagnetUri(uri.trim()))) {
    errors.magnetUris = 'Informe de 1 a 10 Magnets válidos, cada um com até 4000 caracteres e um único xt v1 ou v2 SHA-256.'
  } else if (new Set(input.magnetUris.map(uri => uri.trim())).size !== input.magnetUris.length) errors.magnetUris = 'Não repita o mesmo Magnet no lote.'
  return errors
}

export function createMaterialCadastroService(request: MaterialWriteRequest, multipart?: MaterialMultipartRequest) {
  async function cadastrar(input: MaterialCadastroRequest, signal?: AbortSignal): Promise<{ id: string }> {
    if (Object.keys(validateMaterialCadastro(input)).length) throw new TypeError('Confira os metadados e os Magnets informados.')
    const body: MaterialCadastroRequest = { titulo: input.titulo.trim(), descricao: input.descricao.trim(), disciplinaId: input.disciplinaId.toLowerCase(), categoriaId: input.categoriaId.toLowerCase(), magnetUris: input.magnetUris.map(uri => uri.trim()) }
    const dto = parseMaterialDetail(await request('/materiais', { method: 'POST', json: body, signal }))
    if (dto.status !== 'PENDENTE' || dto.visualizacoes !== 0 || dto.torrents.length !== 0 || dto.magnets.length !== body.magnetUris.length
      || dto.disciplinaId !== body.disciplinaId || dto.categoriaId !== body.categoriaId) throw new ApiError('protocol')
    return { id: dto.id }
  }
  async function cadastrarComTorrent(input: MaterialMetadados, file: File, signal?: AbortSignal): Promise<{ id: string }> {
    if (!multipart || Object.keys(validateMaterialMetadados(input)).length || validateTorrentFile(file)) throw new TypeError('Confira os metadados e o arquivo .torrent informado.')
    const body: MaterialMetadados = { titulo: input.titulo.trim(), descricao: input.descricao.trim(), disciplinaId: input.disciplinaId.toLowerCase(), categoriaId: input.categoriaId.toLowerCase() }
    const form = new FormData()
    form.append('material', new Blob([JSON.stringify(body)], { type: 'application/json' }), 'material.json')
    form.append('arquivo', file, file.name)
    const dto = parseMaterialDetail(await multipart('/materiais', { form, signal }))
    if (dto.status !== 'PENDENTE' || dto.visualizacoes !== 0 || dto.magnets.length !== 0 || dto.torrents.length !== 1
      || dto.torrents[0]?.tamanho !== file.size || dto.disciplinaId !== body.disciplinaId || dto.categoriaId !== body.categoriaId) throw new ApiError('protocol')
    return { id: dto.id }
  }
  return { cadastrar, cadastrarComTorrent }
}
export type MaterialCadastroService = ReturnType<typeof createMaterialCadastroService>
