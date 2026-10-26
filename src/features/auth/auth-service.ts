import { ApiError, type HttpClient } from '../../shared/http/client.ts'

export interface Credentials { email: string; senha: string }
export interface Access { accessToken: string; expiresAt: number }
export interface User {
  id: string
  nome: string
  email: string
  perfil: 'USUARIO' | 'MODERADOR' | 'ADMINISTRADOR'
  dataCadastro: string
}

export function parseUser(result: unknown): User {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ApiError('protocol')
  const dto = result as Record<string, unknown>
  if (typeof dto.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(dto.id)
    || typeof dto.nome !== 'string' || !dto.nome.trim() || dto.nome.length > 120
    || typeof dto.email !== 'string' || !dto.email.trim() || dto.email.length > 254
    || !['USUARIO', 'MODERADOR', 'ADMINISTRADOR'].includes(String(dto.perfil))
    || typeof dto.dataCadastro !== 'string' || !Number.isFinite(Date.parse(dto.dataCadastro))) throw new ApiError('protocol')
  return { id: dto.id.toLowerCase(), nome: dto.nome, email: dto.email, perfil: dto.perfil as User['perfil'], dataCadastro: dto.dataCadastro }
}

export function isAccess(value: unknown): value is Access {
  if (!value || typeof value !== 'object') return false
  const data = value as Access
  return typeof data.accessToken === 'string' && data.accessToken.length <= 8192
    && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.accessToken)
    && typeof data.expiresAt === 'number' && Number.isFinite(data.expiresAt) && data.expiresAt > 0
}

export function createAuthService(client: HttpClient) {
  async function login(credentials: Credentials): Promise<Access> {
    const result = await client.json('/auth/login', { method: 'POST', json: credentials })
    if (!result || typeof result !== 'object') throw new ApiError('protocol')
    const dto = result as Record<string, unknown>
    const expiresAt = typeof dto.expiresAt === 'string' ? Date.parse(dto.expiresAt) : NaN
    const access = { accessToken: dto.accessToken, expiresAt }
    if (dto.tokenType !== 'Bearer' || typeof dto.expiresIn !== 'number' || dto.expiresIn <= 0 || !isAccess(access)) {
      throw new ApiError('protocol')
    }
    return access
  }

  async function me(token: string): Promise<User> {
    return parseUser(await client.json('/usuarios/me', { token }))
  }

  return { login, me }
}

export type AuthService = ReturnType<typeof createAuthService>
