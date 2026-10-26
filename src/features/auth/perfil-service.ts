import { ApiError, type JsonRequest } from '../../shared/http/client.ts'
import { parseUser, type User } from './auth-service.ts'

export interface PerfilInput { nome: string; email: string; senhaAtual?: string }
export interface SenhaInput { senhaAtual: string; novaSenha: string }
type Request = (path: string, options?: Omit<JsonRequest, 'token'>) => Promise<unknown>

export function createPerfilService(request: Request) {
  return {
    async current(signal?: AbortSignal): Promise<User> {
      return parseUser(await request('/usuarios/me', { signal }))
    },
    async update(id: string, input: PerfilInput, current: User, signal?: AbortSignal): Promise<User> {
      const nome = input.nome.trim(), email = input.email.trim().toLowerCase()
      const emailChanged = email !== current.email.toLowerCase()
      const body = { nome, email, ...(emailChanged && input.senhaAtual ? { senhaAtual: input.senhaAtual } : {}) }
      const updated = parseUser(await request('/usuarios/me', { method: 'PUT', json: body, signal }))
      if (updated.id !== id || updated.perfil !== current.perfil || updated.dataCadastro !== current.dataCadastro || updated.nome !== nome || updated.email !== email) {
        throw new ApiError('protocol')
      }
      return updated
    },
    async changePassword(input: SenhaInput, signal?: AbortSignal): Promise<void> {
      const result = await request('/usuarios/me/senha', { method: 'PUT', json: { senhaAtual: input.senhaAtual, novaSenha: input.novaSenha }, signal })
      if (result !== undefined) throw new ApiError('protocol')
    },
  }
}

export type PerfilService = ReturnType<typeof createPerfilService>
