<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { canAdminister } from '@/features/auth/permissions'
import { createInstituicaoService } from './instituicao-service'
import { createInstituicaoConsultaModel } from './instituicao-consulta-model'
const model = createInstituicaoConsultaModel(createInstituicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [authState.value.status, authState.value.user?.id, authState.value.user?.perfil], () => { void model.loadList() }, { immediate: true })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="institutions-title">
    <p class="eyebrow">Estrutura acadêmica</p><h1 id="institutions-title">Instituições</h1>
    <p class="catalog-description">Consulte as instituições cadastradas, em ordem de nome.</p>
    <RouterLink v-if="canAdminister(authState.user)" class="button-primary" to="/instituicoes/nova">Cadastrar instituição ↗</RouterLink>
    <div class="reports-toolbar"><label for="institutions-size">Instituições por página <select id="institutions-size" :value="state.size" :disabled="state.loading || state.unavailable" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label><button class="button-secondary" type="button" :disabled="state.loading || state.unavailable" @click="model.reload()">Atualizar lista</button></div>
    <div :aria-busy="state.loading">
      <p v-if="state.loading" class="catalog-empty" role="status">Consultando instituições…</p>
      <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button><RouterLink v-else class="button-link" to="/conta">Voltar à minha conta</RouterLink></div>
      <template v-else-if="state.data">
        <p class="form-footnote">{{ state.data.page.totalElements }} instituições na consulta atual</p>
        <p v-if="!state.data.content.length" class="catalog-empty">Nenhuma instituição nesta página.</p>
        <ul v-else class="material-list"><li v-for="institution in state.data.content" :key="institution.id" class="material-summary"><p class="eyebrow institution-text">{{ institution.sigla }}</p><h2 class="institution-text"><RouterLink :to="{ name: 'instituicao', params: { id: institution.id } }">{{ institution.nome }}</RouterLink></h2><RouterLink class="button-link" :to="{ name: 'instituicao', params: { id: institution.id } }">Consultar instituição ↗</RouterLink></li></ul>
        <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas das instituições"><button class="button-secondary" type="button" :disabled="state.data.page.number === 0" @click="model.goToPage(state.data.page.number - 1)">Anterior</button><span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span><button class="button-secondary" type="button" :disabled="state.data.page.number + 1 >= state.data.page.totalPages" @click="model.goToPage(state.data.page.number + 1)">Próxima</button></nav>
      </template>
    </div>
  </section>
</template>
