import { resolveApiBaseUrl } from './api-url'

export const environment = Object.freeze({
  apiBaseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
})
