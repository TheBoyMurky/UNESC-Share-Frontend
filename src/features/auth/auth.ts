import { shallowRef } from 'vue'
import { environment } from '@/config/env'
import { createHttpClient } from '@/shared/http/client'
import { createAuthService } from './auth-service'
import { createSession } from './session'
import { createAuthenticatedClient } from './authenticated-client'
import { createCadastroService } from './cadastro-service'

const client = createHttpClient(environment.apiBaseUrl)
export const cadastroService = createCadastroService(client)
// Acesso tardio: SecurityError do navegador e tratado pelo modulo de sessao.
export const auth = createSession(createAuthService(client), {
  getItem: key => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
  removeItem: key => window.sessionStorage.removeItem(key),
})
export const authState = shallowRef(auth.getState())
let expirationTimer: ReturnType<typeof setTimeout> | undefined
auth.subscribe(state => {
  authState.value = state
  clearTimeout(expirationTimer)
  if (state.expiresAt !== null && state.status !== 'checking') {
    expirationTimer = setTimeout(() => auth.expireIfNeeded(), Math.min(2147483647, Math.max(0, state.expiresAt - Date.now())))
  }
})
// Timers podem ser suspensos em abas de fundo; conferir tambem ao retornar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') auth.expireIfNeeded()
})

const authenticated = createAuthenticatedClient(client, auth)
export const authenticatedJson = authenticated.json
export const authenticatedMultipart = authenticated.multipart
export const authenticatedTorrent = authenticated.torrent
export const authenticatedDelete = authenticated.delete
