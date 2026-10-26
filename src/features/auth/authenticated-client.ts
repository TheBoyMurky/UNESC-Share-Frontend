import { ApiError, type HttpClient, type JsonRequest, type MultipartRequest } from '../../shared/http/client.ts'

export function createAuthenticatedClient(client: HttpClient, session: { getToken(): string | null; rejectToken(token: string): void }) {
  async function withToken<T>(send: (token: string) => Promise<T>): Promise<T> {
    const token = session.getToken()
    if (!token) throw new ApiError('http', 401)
    try { return await send(token) }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) session.rejectToken(token)
      throw error
    }
  }
  return {
    json: (path: string, options: Omit<JsonRequest, 'token'> = {}) => withToken(token => client.json(path, { ...options, token })),
    multipart: (path: string, options: Omit<MultipartRequest, 'token'>) => withToken(token => client.multipart(path, { ...options, token })),
    torrent: (path: string, options: { signal?: AbortSignal } = {}) => withToken(token => client.torrent(path, { ...options, token })),
    delete: (path: string, options: { signal?: AbortSignal } = {}) => withToken(token => client.delete(path, { ...options, token })),
  }
}
