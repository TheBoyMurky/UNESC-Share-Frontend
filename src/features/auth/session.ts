import { ApiError } from '../../shared/http/client.ts'
import { isAccess, type Access, type AuthService, type Credentials, type User } from './auth-service.ts'

export const SESSION_KEY = 'unescshare.auth.v1'
export type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export interface SessionState {
  status: 'anonymous' | 'checking' | 'authenticated' | 'unavailable'
  user: User | null
  expiresAt: number | null
  message: string
}

export function createSession(service: AuthService, storage: SessionStorage, now: () => number = Date.now) {
  let access: Access | null = null
  let state: SessionState = { status: 'anonymous', user: null, expiresAt: null, message: '' }
  let generation = 0
  let restoreTask: Promise<void> | null = null
  const listeners = new Set<(state: SessionState) => void>()
  const emit = (next: SessionState) => { state = next; listeners.forEach(listener => listener(state)) }

  function logout(message = '') {
    generation++
    access = null
    try { storage.removeItem(SESSION_KEY) }
    catch { message = 'Não foi possível limpar o armazenamento. Feche esta aba para encerrar o acesso salvo.' }
    emit({ status: 'anonymous', user: null, expiresAt: null, message })
  }

  function expireIfNeeded() {
    if (access && access.expiresAt <= now()) logout('Seu acesso expirou. Entre novamente.')
  }

  async function validate(candidate: Access, persist: boolean, version: number) {
    if (candidate.expiresAt <= now()) { logout('Seu acesso expirou. Entre novamente.'); return }
    try {
      const user = await service.me(candidate.accessToken)
      if (version !== generation) return
      if (candidate.expiresAt <= now()) { logout('Seu acesso expirou. Entre novamente.'); return }
      if (persist) {
        try { storage.setItem(SESSION_KEY, JSON.stringify(candidate)) }
        catch { throw new Error('Não foi possível salvar o acesso nesta aba. Verifique as permissões de armazenamento.') }
      }
      access = candidate
      emit({ status: 'authenticated', user, expiresAt: access.expiresAt, message: '' })
    } catch (error) {
      if (version !== generation) return
      if (error instanceof ApiError && error.status === 401) logout('Seu acesso não é mais válido. Entre novamente.')
      else if (!persist) {
        access = candidate
        emit({ status: 'unavailable', user: null, expiresAt: candidate.expiresAt, message: 'Não foi possível validar o acesso salvo. Tente novamente.' })
      } else {
        throw error
      }
    }
  }

  async function login(credentials: Credentials) {
    logout()
    const version = generation
    emit({ status: 'checking', user: null, expiresAt: null, message: '' })
    try {
      const candidate = await service.login(credentials)
      if (version !== generation) return
      await validate(candidate, true, version)
    } catch (error) {
      if (version !== generation) return
      logout()
      throw error
    }
  }

  async function restore() {
    expireIfNeeded()
    if (state.status === 'authenticated') return
    if (restoreTask) return restoreTask
    let candidate: unknown
    try {
      const saved = storage.getItem(SESSION_KEY)
      if (!saved) return
      if (saved.length > 10000) { logout(); return }
      candidate = JSON.parse(saved)
    } catch { logout('Não foi possível ler o acesso salvo nesta aba. Entre novamente.'); return }
    if (!isAccess(candidate)) { logout(); return }
    const version = generation
    emit({ status: 'checking', user: null, expiresAt: candidate.expiresAt, message: '' })
    restoreTask = validate(candidate, false, version)
    try { await restoreTask } finally { restoreTask = null }
  }

  return {
    login, restore, logout, expireIfNeeded,
    updateUser(user: User) {
      expireIfNeeded()
      if (state.status !== 'authenticated' || !access || state.user?.id !== user.id) return false
      emit({ ...state, user })
      return true
    },
    getState: () => state,
    getToken: () => { expireIfNeeded(); return state.status === 'authenticated' ? access?.accessToken ?? null : null },
    rejectToken: (token: string) => { if (access?.accessToken === token) logout('Seu acesso não é mais válido. Entre novamente.') },
    subscribe(listener: (state: SessionState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}
