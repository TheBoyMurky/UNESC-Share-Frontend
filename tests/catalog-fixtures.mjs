export const id = number => `${String(number).padStart(8, '0')}-0000-4000-8000-000000000001`
export const filters = () => ({ q: '', instituicaoId: '', cursoId: '', disciplinaId: '', categoriaId: '' })
export const page = (content, number = 0, size = 100, total = content.length) => ({ content, page: { number, size, totalElements: total, totalPages: Math.ceil(total / size) } })
export const material = (number = 10) => ({ id: id(number), titulo: 'Material sintético', status: 'PUBLICADO', dataCadastro: '2026-10-22T12:00:00Z', visualizacoes: 0, usuarioId: id(8), disciplinaId: id(5), categoriaId: id(7) })
export const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

export function mockService(overrides = {}) {
  const calls = []
  return {
    calls,
    options: async (kind, parent, number, signal) => {
      calls.push({ type: 'options', kind, parent, number, signal })
      if (overrides.options) return overrides.options(kind, parent, number, signal)
      const options = { instituicoes: [1, 2], cursos: [3, 4], disciplinas: [5, 6], categorias: [7] }
      return page(options[kind].map(number => ({ id: id(number), nome: 'Opção ' + number })), number)
    },
    search: async (query, number, size, signal) => {
      calls.push({ type: 'search', filters: { ...query }, number, size, signal })
      return overrides.search ? overrides.search(query, number, size, signal) : page([material()], number, size, 40)
    },
  }
}
