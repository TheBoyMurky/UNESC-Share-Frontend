import { ApiError } from '../../shared/http/client.ts'
import type { CadastroRequest, CadastroService } from './cadastro-service.ts'

export interface CadastroDraft extends CadastroRequest { confirmacao: string }
export type CadastroField = keyof CadastroDraft
export type CadastroErrors = Partial<Record<CadastroField, string>>
export interface CadastroState { sending: boolean; succeeded: boolean; error: string; fields: CadastroErrors }
const empty = (): CadastroState => ({ sending: false, succeeded: false, error: '', fields: {} })
const invalid: Record<CadastroField, string> = {
  nome: 'Informe um nome com até 120 caracteres.',
  email: 'Informe um e-mail válido com até 254 caracteres.',
  senha: 'Use de 8 a 64 caracteres e no máximo 72 bytes em UTF-8 na senha.',
  confirmacao: 'Repita exatamente a senha informada.',
}

export function validateCadastro(input: CadastroDraft): CadastroErrors {
  const errors: CadastroErrors = {}
  if (!input.nome.trim() || input.nome.trim().length > 120) errors.nome = invalid.nome
  // Checagem de usabilidade, complementada por type=email; Bean Validation e a autoridade.
  if (input.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+$/.test(input.email.trim())) errors.email = invalid.email
  if (!input.senha.trim() || input.senha.length < 8 || input.senha.length > 64 || new TextEncoder().encode(input.senha).length > 72) errors.senha = invalid.senha
  if (!input.confirmacao || input.confirmacao !== input.senha) errors.confirmacao = invalid.confirmacao
  return errors
}

export function createCadastroModel(service: CadastroService) {
  let state = empty(), disposed = false
  let task: AbortController | null = null
  const listeners = new Set<(state: CadastroState) => void>()
  const patch = (next: Partial<CadastroState>) => { state = { ...state, ...next }; if (!disposed) listeners.forEach(listener => listener(state)) }

  async function submit(input: CadastroDraft) {
    if (disposed || state.sending || state.succeeded) return
    const fields = validateCadastro(input)
    if (Object.keys(fields).length) { patch({ fields, error: 'Confira os campos informados.' }); return }
    const current = new AbortController()
    task = current
    patch({ sending: true, succeeded: false, error: '', fields: {} })
    try {
      // Confirmacao nunca e enviada; dados do formulario nao entram no estado do modelo.
      await service.cadastrar({ nome: input.nome, email: input.email, senha: input.senha }, current.signal)
      if (!disposed && task === current) patch({ sending: false, succeeded: true })
    } catch (error) {
      if (disposed || task !== current) return
      const fields: CadastroErrors = {}
      if (error instanceof ApiError && error.status === 400) {
        for (const entry of error.problem?.errors ?? []) {
          const field = entry.field === 'senhaCompativelComBCrypt' ? 'senha' : entry.field
          if (field === 'nome' || field === 'email' || field === 'senha') fields[field] = invalid[field]
        }
      }
      const uncertain = !(error instanceof ApiError) || error.kind !== 'http' || (error.status ?? 500) >= 500 || error.status === 408
      patch({ sending: false, fields, error: uncertain
        ? 'Não foi possível confirmar o cadastro. Antes de reenviar, tente entrar com os dados informados: a conta pode ter sido criada.'
        : error.status === 409 ? 'Este e-mail já está cadastrado. Tente entrar com sua conta.' : error.message })
    } finally { if (task === current) task = null }
  }

  return {
    submit, getState: () => state,
    subscribe(listener: (value: CadastroState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; task?.abort(); task = null; state = empty(); listeners.clear() },
  }
}
