<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { authState } from '@/features/auth/auth'
import { canModerate } from '@/features/auth/permissions'
</script>

<template>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
  <header class="site-header container">
    <RouterLink class="brand" to="/" aria-label="UnescShare, início">
      <svg class="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="currentColor" />
        <path d="M10 12h7a4 4 0 0 1 4 4v14a6 6 0 0 0-5-3h-6V12Zm20 0h-5a4 4 0 0 0-4 4v14a6 6 0 0 1 5-3h4V12Z" stroke="#fffdf7" stroke-width="1.8" stroke-linejoin="round" />
      </svg>
      <span>unesc<span class="brand-light">share</span><span class="brand-dot">.</span></span>
    </RouterLink>
    <nav aria-label="Navegação principal">
      <RouterLink to="/#como-funciona">A proposta</RouterLink>
      <RouterLink v-if="authState.status === 'authenticated'" to="/materiais">Catálogo</RouterLink>
      <RouterLink v-if="authState.status === 'authenticated'" to="/meus-materiais">Meus materiais</RouterLink>
      <RouterLink v-if="authState.status === 'authenticated'" to="/instituicoes">Instituições</RouterLink>
      <RouterLink v-if="authState.status === 'authenticated'" to="/categorias">Categorias</RouterLink>
      <RouterLink v-if="authState.status === 'authenticated'" to="/minhas-denuncias">Minhas denúncias</RouterLink>
      <RouterLink v-if="authState.status === 'authenticated' && canModerate(authState.user)" to="/moderacao/materiais">Moderação</RouterLink>
      <RouterLink :to="authState.status === 'authenticated' ? '/conta' : '/login'">{{ authState.status === 'authenticated' ? 'Minha conta' : 'Entrar' }} <span aria-hidden="true">↗</span></RouterLink>
    </nav>
  </header>
  <main id="conteudo" tabindex="-1"><RouterView /></main>
  <footer class="site-footer container">
    <span>UnescShare · Projeto acadêmico</span>
    <span>Conhecimento compartilhado com responsabilidade.</span>
  </footer>
</template>
