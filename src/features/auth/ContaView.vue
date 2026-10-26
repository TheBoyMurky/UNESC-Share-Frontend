<script setup lang="ts">
import { auth, authState } from './auth'
import { canAdminister, canModerate } from './permissions'
import { useRoute } from 'vue-router'
import PerfilSection from './PerfilSection.vue'
const route = useRoute()
</script>

<template>
  <section class="account-page container" aria-labelledby="account-title">
    <p class="eyebrow">Acesso autenticado</p>
    <h1 id="account-title">Olá, <em>{{ authState.user?.nome }}.</em></h1>
    <p v-if="route.query.acesso === 'moderacao' && !canModerate(authState.user)" class="catalog-notice" role="status">A área de moderação é restrita a moderadores e administradores.</p>
    <p v-if="route.query.acesso === 'administracao' && !canAdminister(authState.user)" class="catalog-notice" role="status">O cadastro da estrutura acadêmica é restrito a administradores.</p>
    <p class="hero-description">Sua conta foi consultada na API. Explore os materiais publicados usando os filtros acadêmicos do catálogo.</p>
    <div class="account-actions"><RouterLink class="button-primary" to="/materiais">Explorar o catálogo <span aria-hidden="true">↗</span></RouterLink><RouterLink class="button-secondary" to="/meus-materiais">Meus materiais ↗</RouterLink></div>
    <RouterLink class="button-link" to="/minhas-denuncias">Acompanhar minhas denúncias ↗</RouterLink>
    <RouterLink class="button-link" to="/instituicoes">Consultar instituições ↗</RouterLink>
    <RouterLink class="button-link" to="/categorias">Consultar categorias ↗</RouterLink>
    <RouterLink v-if="canAdminister(authState.user)" class="button-link" to="/instituicoes/nova">Cadastrar instituição ↗</RouterLink>
    <RouterLink v-if="canModerate(authState.user)" class="button-link" to="/moderacao/materiais">Consultar materiais pendentes ↗</RouterLink>
    <RouterLink v-if="canModerate(authState.user)" class="button-link" to="/moderacao/denuncias">Consultar denúncias da equipe ↗</RouterLink>
    <dl v-if="authState.user" class="account-details">
      <div><dt>E-mail</dt><dd>{{ authState.user.email }}</dd></div>
      <div><dt>Perfil</dt><dd>{{ authState.user.perfil }}</dd></div>
      <div><dt>Conta criada em</dt><dd>{{ new Date(authState.user.dataCadastro).toLocaleDateString('pt-BR') }}</dd></div>
    </dl>
    <PerfilSection />
    <p class="prototype-note">Autorizações continuam sendo verificadas pelo backend. O perfil exibido não concede acesso por si só.</p>
    <button class="button-primary" type="button" @click="auth.logout()">Encerrar acesso nesta aba <span aria-hidden="true">↗</span></button>
    <p class="form-footnote">O logout remove a cópia local; não revoga uma cópia do token já emitido.</p>
  </section>
</template>
