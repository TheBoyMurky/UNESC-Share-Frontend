import { ApiError, type HttpClient } from '../../shared/http/client.ts'

export interface CadastroRequest { nome: string; email: string; senha: string }

export function createCadastroService(client: Pick<HttpClient, 'json'>) {
  async function cadastrar(input: CadastroRequest, signal?: AbortSignal): Promise<void> {
    // Rota publica: nao usar o helper autenticado nem repassar campos extras do formulario.
    const result = await client.json('/auth/cadastro', {
      method: 'POST', signal,
      json: { nome: input.nome.trim(), email: input.email.trim(), senha: input.senha },
    })
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ApiError('protocol')
    const dto = result as Record<string, unknown>
    if (typeof dto.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(dto.id)
      || typeof dto.nome !== 'string' || !dto.nome.trim() || typeof dto.email !== 'string' || !dto.email.trim()
      || dto.perfil !== 'USUARIO' || typeof dto.dataCadastro !== 'string' || !Number.isFinite(Date.parse(dto.dataCadastro))) {
      throw new ApiError('protocol')
    }
    // Confirmacao apenas; nao conservar DTO/dados pessoais nem criar sessao com esta resposta.
  }
  return { cadastrar }
}

export type CadastroService = ReturnType<typeof createCadastroService>
