import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { validId } from '../material/material-service.ts'

export interface Avaliacao { id: string; nota: number; dataCadastro: string; usuarioId: string; materialId: string }
export interface AvaliacaoResumo { media: number | null; quantidade: number }
type Request = (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>
type DeleteRequest = (path: string, options?: { signal?: AbortSignal }) => Promise<void>

// Trabalha com centesimos inteiros; nunca arredonda uma entrada com tres casas.
export function notaEmCentavos(input: string): number | null {
  const text = input.trim()
  if (!/^\d(?:[.,]\d{1,2})?$/.test(text)) return null
  const [whole = '', fraction = ''] = text.replace(',', '.').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return cents <= 500 ? cents : null
}

const validNota = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  && notaEmCentavos(String(value)) !== null
export const formatNota = (value: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
export const podeAvaliar = (autorId: string, usuarioId: string | null | undefined) => validId(autorId)
  && validId(usuarioId) && autorId.toLowerCase() !== usuarioId.toLowerCase()

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  return value as Record<string, unknown>
}
function parseResumo(value: unknown): AvaliacaoResumo {
  const dto = record(value)
  if (!Number.isSafeInteger(dto.quantidade) || (dto.quantidade as number) < 0
    || (dto.quantidade === 0 ? dto.media !== null : !validNota(dto.media))) throw new ApiError('protocol')
  return { quantidade: dto.quantidade as number, media: dto.media as number | null }
}
function parseAvaliacao(value: unknown, materialId: string, usuarioId: string): Avaliacao {
  const dto = record(value)
  if (!validId(dto.id) || !validId(dto.usuarioId) || !validId(dto.materialId) || !validNota(dto.nota)
    || dto.materialId.toLowerCase() !== materialId.toLowerCase() || dto.usuarioId.toLowerCase() !== usuarioId.toLowerCase()
    || typeof dto.dataCadastro !== 'string' || !Number.isFinite(Date.parse(dto.dataCadastro))) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), nota: dto.nota, dataCadastro: dto.dataCadastro,
    usuarioId: dto.usuarioId.toLowerCase(), materialId: dto.materialId.toLowerCase() }
}
function path(id: string) {
  if (!validId(id)) throw new TypeError('Material inválido.')
  return '/materiais/' + id.toLowerCase() + '/avaliacoes'
}

export function createAvaliacaoService(request: Request, deleteRequest?: DeleteRequest) {
  async function resumo(id: string, signal?: AbortSignal) {
    return parseResumo(await request(path(id) + '/resumo', { signal }))
  }
  return {
    resumo,
    async read(id: string, usuarioId: string, signal?: AbortSignal) {
      const url = path(id)
      if (!validId(usuarioId)) throw new TypeError('Acesso inválido.')
      let minha: Avaliacao | null = null
      try { minha = parseAvaliacao(await request(url + '/minha', { signal }), id, usuarioId) }
      catch (error) {
        if (!(error instanceof ApiError) || error.kind !== 'http' || error.status !== 404) throw error
      }
      signal?.throwIfAborted()
      // 404 de /minha e ambiguo: so oferecer cadastro apos resumo PUBLICADO valido.
      return { minha, resumo: await resumo(id, signal) }
    },
    async create(id: string, input: string, usuarioId: string, autorId: string, signal?: AbortSignal) {
      const url = path(id), cents = notaEmCentavos(input)
      if (cents === null || !podeAvaliar(autorId, usuarioId)) throw new TypeError('Confira a nota e a autoria do material.')
      const nota = cents / 100
      const dto = parseAvaliacao(await request(url, { method: 'POST', json: { nota }, signal }), id, usuarioId)
      if (dto.nota !== nota) throw new ApiError('protocol')
      return dto
    },
    async update(id: string, original: Avaliacao, input: string, usuarioId: string, autorId: string, signal?: AbortSignal) {
      const url = path(id), cents = notaEmCentavos(input)
      if (cents === null || !podeAvaliar(autorId, usuarioId) || !validId(original.id)
        || original.usuarioId.toLowerCase() !== usuarioId.toLowerCase() || original.materialId.toLowerCase() !== id.toLowerCase()) {
        throw new TypeError('Confira a nota e seu acesso à avaliação.')
      }
      const nota = cents / 100
      const dto = parseAvaliacao(await request(url + '/minha', { method: 'PUT', json: { nota }, signal }), id, usuarioId)
      // /minha atua sobre a linha atual. Mudanca de geracao nao pode ser impedida por esta checagem posterior.
      if (dto.id !== original.id.toLowerCase() || dto.dataCadastro !== original.dataCadastro || dto.nota !== nota) throw new ApiError('protocol')
      return dto
    },
    async remove(id: string, usuarioId: string, signal?: AbortSignal) {
      const url = path(id)
      if (!validId(usuarioId) || !deleteRequest) throw new TypeError('Remoção indisponível.')
      // Identidade e nota atual sao resolvidas pelo JWT no servidor, nunca por parametro do cliente.
      await deleteRequest(url + '/minha', { signal })
    },
  }
}
export type AvaliacaoService = ReturnType<typeof createAvaliacaoService>
