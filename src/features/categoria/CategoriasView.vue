<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { canAdminister } from '@/features/auth/permissions'
import { createCategoriaService } from './categoria-service'
import { createCategoriaConsultaModel } from './categoria-consulta-model'

const model = createCategoriaConsultaModel(createCategoriaService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [authState.value.status, authState.value.user?.id, authState.value.user?.perfil], () => { void model.loadList() }, { immediate: true })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="categories-title">
    <p class="eyebrow">Classificação dos materiais</p><h1 id="categories-title">Categorias</h1>
    <p class="catalog-description">Consulte as categorias disponíveis para organizar e encontrar materiais acadêmicos.</p>
    <RouterLink v-if="canAdminister(authState.user)" class="button-primary" to="/categorias/nova">Cadastrar categoria ↗</RouterLink>
    <div class="reports-toolbar">
      <label for="categories-size">Categorias por página <select id="categories-size" :value="state.size" :disabled="state.loading || state.unavailable" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label>
      <button class="button-secondary" type="button" :disabled="state.loading || state.unavailable" @click="model.reload()">Atualizar lista</button>
    </div>
    <div :aria-busy="state.loading">
      <p v-if="state.loading" class="catalog-empty" role="status">Consultando categorias…</p>
      <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button><RouterLink v-else class="button-link" to="/conta">Voltar à minha conta</RouterLink></div>
      <template v-else-if="state.data">
        <p class="form-footnote">{{ state.data.page.totalElements }} categorias na consulta atual</p>
        <p v-if="!state.data.content.length" class="catalog-empty">Nenhuma categoria nesta página.</p>
        <ul v-else class="material-list">
          <li v-for="categoria in state.data.content" :key="categoria.id" class="material-summary">
            <h2 class="institution-text"><RouterLink :to="{ name: 'categoria', params: { id: categoria.id } }">{{ categoria.nome }}</RouterLink></h2>
            <p v-if="categoria.descricao" class="institution-text">{{ categoria.descricao }}</p>
            <RouterLink class="button-link" :to="{ name: 'categoria', params: { id: categoria.id } }">Consultar categoria ↗</RouterLink>
          </li>
        </ul>
        <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas das categorias">
          <button class="button-secondary" type="button" :disabled="state.data.page.number === 0" @click="model.goToPage(state.data.page.number - 1)">Anterior</button>
          <span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span>
          <button class="button-secondary" type="button" :disabled="state.data.page.number + 1 >= state.data.page.totalPages" @click="model.goToPage(state.data.page.number + 1)">Próxima</button>
        </nav>
      </template>
    </div>
  </section>
</template>
