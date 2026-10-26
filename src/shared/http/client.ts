export interface ApiProblem {
  title?: string
  detail?: string
  errors: ReadonlyArray<{ field: string; message: string }>
}

export class ApiError extends Error {
  readonly status: number | null
  readonly kind: 'http' | 'network' | 'protocol'
  readonly problem: ApiProblem | null

  constructor(kind: ApiError['kind'], status: number | null = null, problem: ApiProblem | null = null) {
    const messages: Record<number, string> = {
      400: 'Confira os dados informados.',
      401: 'Acesso não autorizado. Verifique suas credenciais ou entre novamente.',
      403: 'Você não tem permissão para esta operação.',
      404: 'Registro não encontrado ou indisponível.',
      409: 'A operação conflita com o estado atual dos dados.',
      413: 'A requisição excede o tamanho permitido.',
      415: 'Formato de requisição não suportado.',
      503: 'Serviço temporariamente indisponível.',
    }
    super(kind === 'network' ? 'Não foi possível contatar a API. Verifique a conexão e tente novamente.'
      : kind === 'protocol' ? 'A API retornou uma resposta inesperada.'
      : messages[status ?? 0] ?? 'Não foi possível concluir a operação.')
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.problem = problem
  }
}

export interface JsonRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  json?: unknown
  token?: string
  signal?: AbortSignal
}
export interface MultipartRequest { form: FormData; token?: string; signal?: AbortSignal }

export const MAX_TORRENT_BYTES = 2 * 1024 * 1024
export interface TorrentPayload { blob: Blob; contentDisposition: string | null }

function jsonContent(response: Response): boolean {
  const type = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()
  return type === 'application/json' || type === 'application/problem+json'
}

function problemFrom(value: unknown): ApiProblem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  const errors: Array<{ field: string; message: string }> = []
  if (Array.isArray(data.errors)) {
    for (const item of data.errors) {
      if (item && typeof item === 'object' && typeof item.field === 'string' && typeof item.message === 'string') {
        errors.push({ field: item.field, message: item.message })
      }
    }
  }
  return {
    title: typeof data.title === 'string' ? data.title : undefined,
    detail: typeof data.detail === 'string' ? data.detail : undefined,
    errors,
  }
}

export function createHttpClient(baseUrl: string, fetcher: typeof fetch = globalThis.fetch) {
  const base = new URL(baseUrl)
  const prefix = base.pathname.replace(/\/+$/, '')

  async function send(path: string, options: JsonRequest & { form?: FormData }, accept: string): Promise<Response> {
    // Impede encaminhar o Bearer para outra origem ou escapar do prefixo configurado.
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new TypeError('Rota da API inválida.')
    const target = new URL(baseUrl.replace(/\/+$/, '') + path)
    if (target.origin !== base.origin || !target.pathname.startsWith(prefix + '/')) throw new TypeError('Rota da API inválida.')
    if (options.form !== undefined && options.json !== undefined) throw new TypeError('Corpo de requisição ambíguo.')
    const headers = new Headers({ Accept: accept })
    if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
    if (options.json !== undefined) headers.set('Content-Type', 'application/json')
    let response: Response
    try {
      response = await fetcher(target, {
        method: options.method ?? 'GET', headers,
        body: options.form ?? (options.json === undefined ? undefined : JSON.stringify(options.json)),
        signal: options.signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
      })
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new DOMException('Requisição cancelada.', 'AbortError')
      }
      // Nao conservar cause/URL/corpo/headers de uma falha potencialmente sensivel.
      throw new ApiError('network')
    }
    if (!response.ok) {
      let problem: ApiProblem | null = null
      if (jsonContent(response)) {
        try { problem = problemFrom(await response.json()) } catch { /* Corpo vazio/malformado e valido como erro HTTP. */ }
      }
      throw new ApiError('http', response.status, problem)
    }
    return response
  }

  async function readJson(response: Response): Promise<unknown> {
    if (response.status === 204 || response.status === 205) return undefined
    if (!jsonContent(response)) throw new ApiError('protocol', response.status)
    try { return await response.json() } catch { throw new ApiError('protocol', response.status) }
  }

  async function json(path: string, options: JsonRequest = {}): Promise<unknown> { return readJson(await send(path, options, 'application/json')) }
  async function multipart(path: string, options: MultipartRequest): Promise<unknown> {
    return readJson(await send(path, { method: 'POST', form: options.form, token: options.token, signal: options.signal }, 'application/json'))
  }
  async function deleteRequest(path: string, options: Pick<JsonRequest, 'token' | 'signal'> = {}): Promise<void> {
    const response = await send(path, { method: 'DELETE', token: options.token, signal: options.signal }, 'application/json, application/problem+json')
    if (response.status !== 204) {
      await response.body?.cancel().catch(() => {})
      throw new ApiError('protocol', response.status)
    }
    // 204 nao possui corpo: nao tentar ler JSON nem dados privados de uma resposta inesperada.
  }

  async function torrent(path: string, options: Pick<JsonRequest, 'token' | 'signal'> = {}): Promise<TorrentPayload> {
    const response = await send(path, options, 'application/x-bittorrent, application/problem+json, application/json')
    const type = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()
    const declared = response.headers.get('Content-Length')
    if (response.status !== 200 || type !== 'application/x-bittorrent' || !response.body
      || (declared !== null && (!/^\d+$/.test(declared) || Number(declared) < 1 || Number(declared) > MAX_TORRENT_BYTES))) {
      await response.body?.cancel().catch(() => {})
      throw new ApiError('protocol', response.status)
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    try {
      while (true) {
        options.signal?.throwIfAborted()
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > MAX_TORRENT_BYTES) {
          await reader.cancel().catch(() => {})
          throw new ApiError('protocol', response.status)
        }
        chunks.push(Uint8Array.from(chunk.value))
      }
      options.signal?.throwIfAborted()
    } catch (error) {
      await reader.cancel().catch(() => {})
      if (error instanceof ApiError) throw error
      if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw new DOMException('Requisição cancelada.', 'AbortError')
      throw new ApiError('network')
    } finally { reader.releaseLock() }
    if (!size || (declared !== null && size !== Number(declared))) throw new ApiError('protocol', response.status)
    return { blob: new Blob(chunks, { type: 'application/x-bittorrent' }), contentDisposition: response.headers.get('Content-Disposition') }
  }

  return { json, torrent, multipart, delete: deleteRequest }
}

export type HttpClient = ReturnType<typeof createHttpClient>
