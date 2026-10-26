import { ApiError } from './client.ts'

export interface PageInfo { number: number; size: number; totalElements: number; totalPages: number }
export interface Page<T> { content: T[]; page: PageInfo }
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

export function parsePage<T>(value: unknown, parse: (value: unknown) => T, number: number, size: number): Page<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('protocol')
  const data = value as Record<string, unknown>
  if (!data.page || typeof data.page !== 'object' || Array.isArray(data.page)) throw new ApiError('protocol')
  const meta = data.page as Record<string, unknown>
  if (!Array.isArray(data.content) || data.content.length > size || meta.number !== number || meta.size !== size
    || !integer(meta.totalElements) || meta.totalElements < data.content.length
    || !integer(meta.totalPages) || meta.totalPages !== Math.ceil(meta.totalElements / size)) throw new ApiError('protocol')
  return { content: data.content.map(parse), page: { number, size, totalElements: meta.totalElements, totalPages: meta.totalPages } }
}

export function pagination(number: number, size: number) {
  if (!integer(number) || !Number.isSafeInteger(size) || size < 1 || size > 100) throw new TypeError('Paginação inválida.')
  return new URLSearchParams({ page: String(number), size: String(size) })
}
