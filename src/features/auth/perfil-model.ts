import { ApiError } from '../../shared/http/client.ts'
import type { User } from './auth-service.ts'
import type { PerfilInput, PerfilService, SenhaInput } from './perfil-service.ts'

type ProfileField = 'nome' | 'email' | 'senhaAtual'
type PasswordField = 'senhaAtual' | 'novaSenha' | 'confirmacao'
export interface PerfilState {
  user: User | null; profileSaving: boolean; profileRefreshing: boolean; profileUncertain: boolean
  profileError: string; profileSuccess: string; profileFields: Partial<Record<ProfileField, string>>
  passwordSaving: boolean; passwordUncertain: boolean; passwordChanged: boolean; passwordError: string
  passwordFields: Partial<Record<PasswordField, string>>
}
const empty = (): PerfilState => ({ user: null, profileSaving: false, profileRefreshing: false, profileUncertain: false, profileError: '', profileSuccess: '', profileFields: {}, passwordSaving: false, passwordUncertain: false, passwordChanged: false, passwordError: '', passwordFields: {} })
const nameError = 'Informe um nome com até 120 caracteres.'
const emailError = 'Informe um e-mail válido com até 254 caracteres.'
const passwordError = 'Use de 8 a 64 caracteres e no máximo 72 bytes em UTF-8.'

export function createPerfilModel(service: PerfilService, updateSession: (user: User) => boolean) {
  let state = empty(), disposed = false, generation = 0, task: AbortController | null = null, userId = ''
  const listeners = new Set<(value: PerfilState) => void>()
  const emit = () => { if (!disposed) listeners.forEach(listener => listener(state)) }
  const patch = (value: Partial<PerfilState>) => { state = { ...state, ...value }; emit() }
  const cancel = () => { generation++; task?.abort(); task = null }
  const current = (version: number) => !disposed && generation === version
  function setUser(user: User | null) {
    if (disposed) return
    if (!user) { cancel(); userId = ''; state = empty(); emit(); return }
    if (userId && user.id.toLowerCase() !== userId) cancel()
    userId = user.id.toLowerCase()
    state = { ...empty(), user }; emit()
  }
  const uncertain = (error: unknown) => !(error instanceof ApiError) || error.kind !== 'http' || error.status === 408 || (error.status ?? 0) >= 500
  const validName = (value: string) => !!value.trim() && value.trim().length <= 120
  const validEmail = (value: string) => value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  const validPassword = (value: string) => value.length >= 8 && value.length <= 64 && new TextEncoder().encode(value).length <= 72

  return {
    initialize: setUser,
    async saveProfile(input: PerfilInput) {
      if (disposed || !state.user || state.profileSaving || state.profileRefreshing || state.profileUncertain || state.passwordSaving || state.passwordChanged || state.passwordUncertain) return
      const fields: PerfilState['profileFields'] = {}
      const nome = input.nome.trim(), email = input.email.trim().toLowerCase()
      if (!validName(input.nome)) fields.nome = nameError
      if (!validEmail(input.email)) fields.email = emailError
      const emailChanged = email !== state.user.email.toLowerCase()
      if (emailChanged && !input.senhaAtual) fields.senhaAtual = 'Informe sua senha atual para confirmar a troca do e-mail.'
      if (Object.keys(fields).length) { patch({ profileFields: fields, profileError: 'Confira os campos informados.', profileSuccess: '' }); return }
      if (nome === state.user.nome && email === state.user.email.toLowerCase()) { patch({ profileFields: {}, profileError: 'Altere ao menos um dado antes de salvar.', profileSuccess: '' }); return }

      const version = generation, controller = new AbortController(); task = controller
      patch({ profileSaving: true, profileFields: {}, profileError: '', profileSuccess: '' })
      try {
        const updated = await service.update(state.user.id, { nome, email, ...(emailChanged ? { senhaAtual: input.senhaAtual } : {}) }, state.user, controller.signal)
        if (!current(version)) return
        if (!updateSession(updated)) { setUser(null); return }
        patch({ user: updated, profileSaving: false, profileSuccess: 'Dados da conta atualizados.', profileUncertain: false })
      } catch (error) {
        if (!current(version)) return
        const isUncertain = uncertain(error)
        patch({ profileSaving: false, profileUncertain: isUncertain, profileError: error instanceof ApiError && error.status === 409
          ? 'Este e-mail já está associado a outra conta.'
          : isUncertain ? 'Não foi possível confirmar a alteração. Consulte os dados atuais antes de tentar novamente.'
            : error instanceof ApiError && error.status === 400 ? 'A API recusou os dados ou a senha atual não confere.'
              : error instanceof ApiError && error.status === 401 ? 'Seu acesso expirou. Entre novamente.'
                : 'Não foi possível atualizar os dados da conta.' })
      } finally { if (version === generation) task = null }
    },
    async refreshProfile() {
      if (disposed || !state.user || state.profileSaving || state.profileRefreshing || state.passwordSaving) return
      const baseline = state.user, version = generation, controller = new AbortController(); task = controller
      patch({ profileRefreshing: true, profileError: '', profileSuccess: '' })
      try {
        const fresh = await service.current(controller.signal)
        if (!current(version)) return
        if (fresh.id !== baseline.id || fresh.perfil !== baseline.perfil || fresh.dataCadastro !== baseline.dataCadastro || !updateSession(fresh)) throw new ApiError('protocol')
        patch({ user: fresh, profileRefreshing: false, profileUncertain: false, profileFields: {}, profileSuccess: 'Dados atuais consultados.' })
      } catch (error) {
        if (!current(version)) return
        patch({ profileRefreshing: false, profileUncertain: true, profileError: error instanceof ApiError && error.status === 401
          ? 'Seu acesso expirou. Entre novamente.' : 'Não foi possível confirmar os dados atuais. Tente consultar novamente.' })
      } finally { if (version === generation) task = null }
    },
    async changePassword(input: SenhaInput & { confirmacao: string }) {
      if (disposed || !state.user || state.passwordSaving || state.profileSaving || state.profileRefreshing || state.passwordUncertain || state.passwordChanged || state.profileUncertain) return
      const fields: PerfilState['passwordFields'] = {}
      if (!input.senhaAtual) fields.senhaAtual = 'Informe a senha atual.'
      if (!validPassword(input.novaSenha)) fields.novaSenha = passwordError
      if (!input.confirmacao || input.confirmacao !== input.novaSenha) fields.confirmacao = 'Repita exatamente a nova senha.'
      if (input.novaSenha && input.novaSenha === input.senhaAtual) fields.novaSenha = 'A nova senha deve ser diferente da atual.'
      if (Object.keys(fields).length) { patch({ passwordFields: fields, passwordError: 'Confira os campos da nova senha.' }); return }
      const version = generation, controller = new AbortController(); task = controller
      patch({ passwordSaving: true, passwordFields: {}, passwordError: '' })
      try {
        await service.changePassword(input, controller.signal)
        if (!current(version)) return
        patch({ passwordSaving: false, passwordChanged: true, passwordError: '' })
      } catch (error) {
        if (!current(version)) return
        const isUncertain = uncertain(error)
        patch({ passwordSaving: false, passwordUncertain: isUncertain, passwordError: isUncertain
          ? 'Não foi possível confirmar a troca. Não reenvie as senhas; encerre o acesso e tente entrar com a nova senha.'
          : error instanceof ApiError && error.status === 400 ? 'A senha atual não confere ou a nova senha foi recusada.'
            : error instanceof ApiError && error.status === 401 ? 'Seu acesso expirou. Entre novamente.'
              : 'Não foi possível trocar a senha.' })
      } finally { if (version === generation) task = null }
    },
    getState: () => state,
    subscribe(listener: (value: PerfilState) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { disposed = true; cancel(); userId = ''; state = empty(); listeners.clear() },
  }
}
