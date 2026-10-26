<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { auth, authState, authenticatedJson } from './auth'
import { createPerfilService } from './perfil-service'
import { createPerfilModel } from './perfil-model'

const router = useRouter()
const model = createPerfilModel(createPerfilService(authenticatedJson), auth.updateUser)
const state = shallowRef(model.getState()), profileFeedback = ref<HTMLElement | null>(null), passwordFeedback = ref<HTMLElement | null>(null)
const nome = ref(''), email = ref(''), senhaAtualEmail = ref('')
const senhaAtual = ref(''), novaSenha = ref(''), confirmacao = ref('')
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [authState.value.status, authState.value.user?.id], () => {
  const user = authState.value.status === 'authenticated' ? authState.value.user : null
  model.initialize(user); nome.value = user?.nome ?? ''; email.value = user?.email ?? ''
}, { immediate: true })
watch(() => state.value.user, user => { if (user) { nome.value = user.nome; email.value = user.email } })
watch(() => [state.value.profileSuccess, state.value.profileError, state.value.passwordError], async (values, previous) => {
  if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); (state.value.passwordError ? passwordFeedback : profileFeedback).value?.focus() }
})
watch(() => state.value.passwordChanged, async changed => {
  if (!changed) return
  senhaAtual.value = ''; novaSenha.value = ''; confirmacao.value = ''; senhaAtualEmail.value = ''
  auth.logout('Senha alterada. Entre novamente com a nova senha.')
  await router.replace({ name: 'login', query: { senha: 'alterada' } })
})
async function saveProfile() {
  const pending = model.saveProfile({ nome: nome.value, email: email.value, ...(email.value.trim().toLowerCase() !== (state.value.user?.email.toLowerCase() ?? '') ? { senhaAtual: senhaAtualEmail.value } : {}) })
  if (state.value.profileSaving) senhaAtualEmail.value = ''
  await pending
  if (state.value.profileSuccess && state.value.user) { nome.value = state.value.user.nome; email.value = state.value.user.email }
}
function changePassword() {
  const pending = model.changePassword({ senhaAtual: senhaAtual.value, novaSenha: novaSenha.value, confirmacao: confirmacao.value })
  if (state.value.passwordSaving) { senhaAtual.value = ''; novaSenha.value = ''; confirmacao.value = '' }
  return pending
}
onBeforeUnmount(() => { senhaAtualEmail.value = ''; senhaAtual.value = ''; novaSenha.value = ''; confirmacao.value = ''; unsubscribe(); model.dispose() })
</script>

<template>
  <section v-if="state.user" class="account-profile" aria-labelledby="account-profile-title">
    <h2 id="account-profile-title">Dados da conta</h2>
    <div class="account-profile-grid">
      <form class="auth-card" :aria-busy="state.profileSaving || state.profileRefreshing" @submit.prevent="saveProfile">
        <h3>Nome e e-mail</h3>
        <p class="form-description">Uma alteração de e-mail entra em vigor imediatamente e será usada no próximo login. Ainda não há confirmação por e-mail.</p>
        <div v-if="state.profileError" ref="profileFeedback" class="form-alert" role="alert" tabindex="-1">
          <p>{{ state.profileError }}</p>
          <button v-if="state.profileUncertain" class="button-link" type="button" :disabled="state.profileRefreshing" @click="model.refreshProfile()">Consultar dados atuais</button>
        </div>
        <p v-if="state.profileSuccess" class="catalog-notice" role="status">{{ state.profileSuccess }}</p>
        <fieldset :disabled="state.profileSaving || state.profileRefreshing || state.profileUncertain || state.passwordSaving || state.passwordUncertain || state.passwordChanged">
          <label for="profile-name">Nome</label>
          <input id="profile-name" v-model="nome" autocomplete="name" maxlength="120" required :aria-invalid="!!state.profileFields.nome" :aria-describedby="state.profileFields.nome ? 'profile-name-error' : undefined">
          <p v-if="state.profileFields.nome" id="profile-name-error" class="field-error">{{ state.profileFields.nome }}</p>
          <label for="profile-email">E-mail</label>
          <input id="profile-email" v-model="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required :aria-invalid="!!state.profileFields.email" :aria-describedby="state.profileFields.email ? 'profile-email-error' : undefined">
          <p v-if="state.profileFields.email" id="profile-email-error" class="field-error">{{ state.profileFields.email }}</p>
          <template v-if="email.trim().toLowerCase() !== state.user.email.toLowerCase()">
            <label for="profile-current-password">Senha atual para confirmar o novo e-mail</label>
            <input id="profile-current-password" v-model="senhaAtualEmail" type="password" autocomplete="current-password" maxlength="64" required :aria-invalid="!!state.profileFields.senhaAtual" :aria-describedby="state.profileFields.senhaAtual ? 'profile-current-password-error' : undefined">
            <p v-if="state.profileFields.senhaAtual" id="profile-current-password-error" class="field-error">{{ state.profileFields.senhaAtual }}</p>
          </template>
          <button class="button-primary auth-submit" type="submit" :disabled="state.profileSaving || state.profileRefreshing">{{ state.profileSaving ? 'Salvando…' : 'Salvar dados da conta' }}</button>
        </fieldset>
      </form>

      <form class="auth-card" :aria-busy="state.passwordSaving" @submit.prevent="changePassword">
        <h3>Trocar senha</h3>
        <p class="form-description">Informe a senha atual e escolha outra. Após salvar, você precisará entrar novamente.</p>
        <div v-if="state.passwordError" ref="passwordFeedback" class="form-alert" role="alert" tabindex="-1">
          <p>{{ state.passwordError }}</p>
          <RouterLink v-if="state.passwordUncertain" class="button-link" :to="{ name: 'login' }" @click="auth.logout()">Ir ao login</RouterLink>
        </div>
        <fieldset :disabled="state.passwordSaving || state.passwordUncertain || state.passwordChanged || state.profileSaving || state.profileRefreshing || state.profileUncertain">
          <label for="password-current">Senha atual</label>
          <input id="password-current" v-model="senhaAtual" type="password" autocomplete="current-password" maxlength="64" required :aria-invalid="!!state.passwordFields.senhaAtual" :aria-describedby="state.passwordFields.senhaAtual ? 'password-current-error' : undefined">
          <p v-if="state.passwordFields.senhaAtual" id="password-current-error" class="field-error">{{ state.passwordFields.senhaAtual }}</p>
          <label for="password-new">Nova senha</label>
          <input id="password-new" v-model="novaSenha" type="password" autocomplete="new-password" minlength="8" maxlength="64" required :aria-invalid="!!state.passwordFields.novaSenha" :aria-describedby="state.passwordFields.novaSenha ? 'password-help password-new-error' : 'password-help'">
          <p id="password-help" class="form-footnote">8 a 64 caracteres e até 72 bytes em UTF-8. A senha atual será substituída; JWTs já emitidos continuam válidos até expirar.</p>
          <p v-if="state.passwordFields.novaSenha" id="password-new-error" class="field-error">{{ state.passwordFields.novaSenha }}</p>
          <label for="password-confirm">Confirmar nova senha</label>
          <input id="password-confirm" v-model="confirmacao" type="password" autocomplete="new-password" minlength="8" maxlength="64" required :aria-invalid="!!state.passwordFields.confirmacao" :aria-describedby="state.passwordFields.confirmacao ? 'password-confirm-error' : undefined">
          <p v-if="state.passwordFields.confirmacao" id="password-confirm-error" class="field-error">{{ state.passwordFields.confirmacao }}</p>
          <button class="button-primary auth-submit" type="submit" :disabled="state.passwordSaving">{{ state.passwordSaving ? 'Alterando senha…' : 'Alterar senha' }}</button>
        </fieldset>
      </form>
    </div>
  </section>
</template>
