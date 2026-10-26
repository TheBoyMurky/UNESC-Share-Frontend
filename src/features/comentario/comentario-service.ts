import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { pagination, parsePage } from '../../shared/http/page.ts'
import { validId } from '../material/material-service.ts'

export interface Comentario { id: string; conteudo: string; dataCadastro: string; status: 'ATIVO'; usuarioId: string; materialId: string }
export interface ComentarioModeracao extends Omit<Comentario, 'status'> { status: 'ATIVO' | 'OCULTO' }
type Request = (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>
type DeleteRequest = (path: string, options?: { signal?: AbortSignal }) => Promise<void>

export function canManageComentario(comment: Pick<Comentario, 'id' | 'usuarioId' | 'status'>, usuarioId: string | null | undefined): boolean {
  return validId(comment.id) && validId(comment.usuarioId) && validId(usuarioId)
    && comment.usuarioId.toLowerCase() === usuarioId.toLowerCase() && comment.status === 'ATIVO'
}

export function validateComentario(value: string): string {
  return !value.trim() || value.trim().length > 4000 || value.includes('\u0000')
    ? 'Escreva um comentário com até 4000 caracteres, sem caracteres nulos.' : ''
}

function parseComentarioDto<S extends ComentarioModeracao['status']>(value: unknown, materialId: string, allowed: readonly S[]): Omit<Comentario, 'status'> & { status: S } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  const dto = value as Record<string, unknown>
  if (!validId(dto.id) || !validId(dto.usuarioId) || !validId(dto.materialId)
    || dto.materialId.toLowerCase() !== materialId || !allowed.some(status => status === dto.status)
    || typeof dto.conteudo !== 'string' || validateComentario(dto.conteudo)
    || dto.conteudo.length > 4000 || typeof dto.dataCadastro !== 'string'
    || !Number.isFinite(Date.parse(dto.dataCadastro))) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), conteudo: dto.conteudo, dataCadastro: dto.dataCadastro,
    status: dto.status as S, usuarioId: dto.usuarioId.toLowerCase(), materialId }
}

const parseComentario = (value: unknown, materialId: string): Comentario => parseComentarioDto(value, materialId, ['ATIVO'])
export const parseComentarioModeracao = (value: unknown, materialId: string): ComentarioModeracao => parseComentarioDto(value, materialId, ['ATIVO', 'OCULTO'])

const path = (id: string) => {
  if (!validId(id)) throw new TypeError('Material inválido.')
  return '/materiais/' + id.toLowerCase() + '/comentarios'
}

export function createComentarioService(request: Request, deleteRequest?: DeleteRequest) {
  function targetPath(materialId: string, original: Comentario, usuarioId: string) {
    const url = path(materialId)
    if (!canManageComentario(original, usuarioId) || original.materialId.toLowerCase() !== materialId.toLowerCase()) {
      throw new TypeError('Comentário indisponível para esta operação.')
    }
    return url + '/' + original.id.toLowerCase()
  }
  return {
    async list(id: string, number = 0, size = 20, signal?: AbortSignal) {
      const url = path(id) + '?' + pagination(number, size).toString()
      const data = parsePage(await request(url, { signal }), value => parseComentario(value, id.toLowerCase()), number, size)
      if (new Set(data.content.map(item => item.id)).size !== data.content.length) throw new ApiError('protocol')
      return data
    },
    async create(id: string, conteudo: string, usuarioId: string, signal?: AbortSignal) {
      const url = path(id)
      if (!validId(usuarioId) || validateComentario(conteudo)) throw new TypeError('Confira o comentário e seu acesso.')
      const text = conteudo.trim()
      const dto = parseComentario(await request(url, { method: 'POST', json: { conteudo: text }, signal }), id.toLowerCase())
      if (dto.usuarioId !== usuarioId.toLowerCase() || dto.conteudo !== text) throw new ApiError('protocol')
      return dto
    },
    async update(materialId: string, original: Comentario, conteudo: string, usuarioId: string, signal?: AbortSignal) {
      const url = targetPath(materialId, original, usuarioId)
      if (validateComentario(conteudo)) throw new TypeError('Confira o texto do comentário.')
      const text = conteudo.trim()
      const dto = parseComentario(await request(url, { method: 'PUT', json: { conteudo: text }, signal }), materialId.toLowerCase())
      if (dto.id !== original.id.toLowerCase() || dto.usuarioId !== usuarioId.toLowerCase()
        || dto.dataCadastro !== original.dataCadastro || dto.conteudo !== text) throw new ApiError('protocol')
      return dto
    },
    async remove(materialId: string, original: Comentario, usuarioId: string, signal?: AbortSignal) {
      const url = targetPath(materialId, original, usuarioId)
      if (!deleteRequest) throw new TypeError('Remoção indisponível.')
      await deleteRequest(url, { signal })
    },
  }
}

export type ComentarioService = ReturnType<typeof createComentarioService>
