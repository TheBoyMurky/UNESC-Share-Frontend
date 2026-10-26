import { validId, type TorrentDownload } from './material-service.ts'
import { MAX_TORRENT_BYTES } from '../../shared/http/client.ts'

export function createBrowserActions() {
  const urls = new Map<string, ReturnType<typeof setTimeout>>()
  function revoke(url: string) { clearTimeout(urls.get(url)); urls.delete(url); URL.revokeObjectURL(url) }
  return {
    save(download: TorrentDownload) {
      if (!download.filename.endsWith('.torrent') || !validId(download.filename.slice(0, -8))
        || download.blob.type !== 'application/x-bittorrent' || download.blob.size < 1 || download.blob.size > MAX_TORRENT_BYTES) {
        throw new Error('Arquivo de metadados inválido para download.')
      }
      const url = URL.createObjectURL(download.blob)
      let link: HTMLAnchorElement | undefined
      try {
        link = document.createElement('a')
        link.href = url
        link.download = download.filename
        link.hidden = true
        document.body.append(link)
        link.click()
        urls.set(url, setTimeout(() => revoke(url), 1000))
      } catch {
        revoke(url)
        throw new Error('Não foi possível solicitar o download ao navegador.')
      } finally { link?.remove() }
    },
    async copy(value: string) {
      if (!navigator.clipboard?.writeText) throw new Error('Cópia automática indisponível.')
      await navigator.clipboard.writeText(value)
    },
    dispose() { for (const url of [...urls.keys()]) revoke(url) },
  }
}
