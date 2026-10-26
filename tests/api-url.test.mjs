import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveApiBaseUrl } from '../src/config/api-url.ts'

test('usa a API local quando a variavel esta ausente ou em branco', () => {
  for (const value of [undefined, '', '   ']) {
    assert.equal(resolveApiBaseUrl(value), 'http://localhost:8080/api/v1')
  }
})

test('normaliza espacos e barras finais sem duplicar o prefixo', () => {
  assert.equal(resolveApiBaseUrl(' https://api.example.com/api/v1/// '), 'https://api.example.com/api/v1')
})

test('preserva prefixo adicional de proxy configurado explicitamente', () => {
  assert.equal(resolveApiBaseUrl('https://example.com/unesc/api/v1'), 'https://example.com/unesc/api/v1')
})

for (const [label, value] of [
  ['URL relativa', '/api/v1'],
  ['URL invalida', 'nao-e-url'],
  ['protocolo de arquivo', 'file:///api/v1'],
  ['protocolo executavel', 'javascript:alert(1)'],
  ['credenciais', 'https://usuario:segredo-sintetico@example.com/api/v1'],
  ['query string', 'https://example.com/api/v1?token=segredo-sintetico'],
  ['fragmento', 'https://example.com/api/v1#fragmento'],
  ['prefixo ausente', 'http://localhost:8080'],
  ['versao diferente', 'https://example.com/api/v2'],
]) {
  test(`rejeita ${label} sem ecoar configuracao privada`, () => {
    assert.throws(() => resolveApiBaseUrl(value), (error) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, 'VITE_API_BASE_URL deve ser uma URL HTTP(S) sem credenciais, query ou fragmento e terminar em /api/v1.')
      assert.ok(!error.message.includes('segredo-sintetico'))
      return true
    })
  })
}
