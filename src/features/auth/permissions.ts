import type { User } from './auth-service.ts'

// Conveniencia da interface com perfil de /usuarios/me; a API autoriza pelo Bearer.
export function canModerate(user: Pick<User, 'perfil'> | null | undefined): boolean {
  return user?.perfil === 'MODERADOR' || user?.perfil === 'ADMINISTRADOR'
}

export function canAdminister(user: Pick<User, 'perfil'> | null | undefined): boolean {
  return user?.perfil === 'ADMINISTRADOR'
}
