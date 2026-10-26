import { id, material } from './catalog-fixtures.mjs'
export { id }
export const hash = 'a'.repeat(40)
export const magnetUri = 'magnet:?xt=urn:btih:' + hash + '&dn=Exemplo%20sintetico'
export const torrentBytes = new TextEncoder().encode('d4:infod4:name4:testee')
export const detail = (number = 10) => ({ ...material(number), descricao: 'Descricao sintetica\nSem HTML.',
  torrents: [{ id: id(20), nomeArquivo: 'exemplo.torrent', infoHash: hash, tamanho: torrentBytes.length, dataCadastro: material().dataCadastro }],
  magnets: [{ id: id(21), magnetUri, infoHash: hash, dataCadastro: material().dataCadastro }] })
export const academic = { instituicao: 'Instituicao sintetica', curso: 'Curso', disciplina: 'Disciplina', codigo: '123', categoria: 'Resumo' }
export const payload = () => ({ blob: new Blob([torrentBytes], { type: 'application/x-bittorrent' }), filename: id(20) + '.torrent' })
