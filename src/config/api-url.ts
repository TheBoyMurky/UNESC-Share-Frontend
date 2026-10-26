const DEFAULT_API_BASE_URL = 'http://localhost:8080/api/v1'
const INVALID_API_BASE_URL = 'VITE_API_BASE_URL deve ser uma URL HTTP(S) sem credenciais, query ou fragmento e terminar em /api/v1.'

export function resolveApiBaseUrl(value?: string): string {
  const configured = value?.trim() || DEFAULT_API_BASE_URL
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error(INVALID_API_BASE_URL)
  }
  const pathname = url.pathname.replace(/\/+$/, '')
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash ||
    !pathname.endsWith('/api/v1')
  ) {
    // Nao ecoar um valor que pode conter credenciais inseridas por engano.
    throw new Error(INVALID_API_BASE_URL)
  }
  url.pathname = pathname
  return url.toString().replace(/\/+$/, '')
}
