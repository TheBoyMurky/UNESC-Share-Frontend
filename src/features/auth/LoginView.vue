<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/shared/http/client'
import { auth, authState } from './auth'

const router = useRouter()
const route = useRoute()
const email = ref('')
const senha = ref('')
const sending = ref(false)
const failure = ref('')
const fieldErrors = ref<ReadonlyArray<{ field: string; message: string }>>([])
const message = computed(() => failure.value || authState.value.message)
const routeMessage = computed(() => route.query.senha === 'alterada' ? 'Senha alterada. Entre novamente com a nova senha.' : '')
let mounted = true
onBeforeUnmount(() => { mounted = false; senha.value = '' })

async function submit() {
  if (sending.value) return
  failure.value = ''
  fieldErrors.value = []
  if (new TextEncoder().encode(senha.value).length > 72) {
    failure.value = 'A senha deve ter no máximo 72 bytes em UTF-8.'
    return
  }
  sending.value = true
  try {
    await auth.login({ email: email.value.trim(), senha: senha.value })
    if (mounted && authState.value.status === 'authenticated') await router.replace({ name: 'conta' })
  } catch (error) {
    if (!mounted) return
    failure.value = error instanceof ApiError ? error.message
      : 'Não foi possível salvar o acesso nesta aba. Verifique as permissões de armazenamento e tente novamente.'
    if (error instanceof ApiError) fieldErrors.value = error.problem?.errors.filter(item => ['email', 'senha', 'senhaCompativelComBCrypt'].includes(item.field)) ?? []
  } finally {
    senha.value = ''
    sending.value = false
  }
}

async function retry() {
  sending.value = true
  try {
    await auth.restore()
    if (mounted && authState.value.status === 'authenticated') await router.replace({ name: 'conta' })
  } finally { sending.value = false }
}
</script>

<template>
  <section class="auth-layout container" aria-labelledby="login-title">
    <div class="auth-intro">
      <p class="eyebrow">Seu ponto de partida</p><h1 id="login-title">Conhecimento<br>com <em>conexão.</em></h1>
      <p class="hero-description">Entre com sua conta para explorar os materiais publicados e filtrar o catálogo por instituição, curso, disciplina e categoria.</p>
      <p class="responsibility">O acesso fica salvo nesta aba até expirar. Não use contas pessoais em dispositivos compartilhados sem encerrar o acesso.</p>
    </div>
    <form class="auth-card" @submit.prevent="submit" :aria-busy="sending">
      <p class="eyebrow">UnescShare</p><h2>Entrar na plataforma</h2>
      <p class="form-description">Use o e-mail e a senha cadastrados.</p>
      <div v-if="message || routeMessage" class="form-alert" role="alert"><p>{{ message || routeMessage }}</p></div>
      <ul v-if="fieldErrors.length" class="form-errors" aria-label="Campos inválidos"><li v-for="(item, index) in fieldErrors" :key="index">{{ item.message }}</li></ul>
      <fieldset :disabled="sending">
        <label for="login-email">E-mail</label>
        <input id="login-email" v-model="email" type="email" name="email" autocomplete="username" inputmode="email" maxlength="254" required>
        <label for="login-password">Senha</label>
        <input id="login-password" v-model="senha" type="password" name="senha" autocomplete="current-password" maxlength="64" required>
        <button class="button-primary auth-submit" type="submit">{{ sending ? 'Validando acesso…' : 'Entrar' }} <span aria-hidden="true">→</span></button>
      </fieldset>
      <button v-if="authState.status === 'unavailable'" class="button-secondary" type="button" :disabled="sending" @click="retry">Tentar validar acesso salvo</button>
      <button v-if="authState.status === 'unavailable'" class="button-link" type="button" :disabled="sending" @click="auth.logout()">Descartar acesso salvo</button>
      <p class="form-footnote">Ainda não tem conta? <RouterLink to="/cadastro">Criar uma conta</RouterLink>. Recuperação de senha ainda não disponível. Não há renovação automática de token.</p>
    </form>
  </section>
</template>
