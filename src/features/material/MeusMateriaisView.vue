<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { canEditMaterial } from './material-edicao-service'
import { canRemoveMaterial } from './material-remocao-service'
import { createOwnMaterialsService, materialStates, materialStateLabels } from './meus-materiais-service'
import { createOwnMaterialsModel, ownFiltersChanged } from './meus-materiais-model'

const model = createOwnMaterialsModel(createOwnMaterialsService(authenticatedJson))
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
const changed = computed(() => ownFiltersChanged(state.value))
const page = computed(() => state.value.data?.page)
const valueOf = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value
const dateLabel = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
onMounted(() => { void model.initialize() })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="own-title">
    <div class="catalog-heading"><div><p class="eyebrow">Sua contribuição</p><h1 id="own-title">Meus <em>materiais.</em></h1></div><RouterLink class="button-primary" to="/materiais/novo">Cadastrar material ↗</RouterLink></div>
    <p class="catalog-description">Acompanhe os materiais cadastrados pela sua conta, incluindo pendentes, publicados, bloqueados e removidos. A autoria e as permissões são verificadas pela API.</p>
    <form class="catalog-filters" @submit.prevent="model.search()" aria-label="Filtros dos meus materiais">
      <div class="own-filter-grid">
        <div><label for="own-q">Buscar nos meus materiais</label><input id="own-q" type="search" maxlength="200" :value="state.filters.q" placeholder="Palavras no título ou na descrição" @input="model.changeFilter('q', valueOf($event))"></div>
        <div><label for="own-status">Estado</label><select id="own-status" :value="state.filters.status" @change="model.changeFilter('status', valueOf($event))"><option value="">Todos os estados</option><option v-for="status in materialStates" :key="status" :value="status">{{ materialStateLabels[status] }}</option></select></div>
      </div>
      <div class="catalog-actions">
        <div class="catalog-size"><label for="own-size">Por página</label><select id="own-size" :value="state.pageSize" @change="model.setPageSize(Number(valueOf($event)))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></div>
        <button class="button-secondary" type="button" @click="model.clearFilters()">Limpar filtros e buscar</button>
        <button class="button-primary" type="submit">Buscar meus materiais <span aria-hidden="true">↗</span></button>
      </div>
    </form>
    <section class="catalog-results" aria-labelledby="own-results-title" :aria-busy="state.loading">
      <div class="catalog-results-heading"><h2 id="own-results-title">Seus registros</h2><p v-if="page" aria-live="polite">{{ page.totalElements }} {{ page.totalElements === 1 ? 'registro encontrado' : 'registros encontrados' }}</p></div>
      <p v-if="changed && state.applied" class="catalog-notice" role="status">Filtros alterados. Os resultados correspondem à última busca aplicada; clique em Buscar meus materiais para atualizar.</p>
      <div v-if="state.loading" class="catalog-empty" role="status">Buscando seus materiais…</div>
      <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.search()">Tentar buscar novamente</button></div>
      <div v-else-if="state.data && !state.data.content.length" class="catalog-empty">
        <template v-if="page && page.totalElements > 0"><h3>A página consultada não tem registros.</h3><p>A lista pode ter mudado entre consultas. Atualize a busca para retornar à primeira página.</p><button class="button-secondary" type="button" @click="model.search()">Atualizar busca</button></template>
        <template v-else><h3>Nenhum material seu encontrado nesta busca.</h3><p>Experimente outros termos, selecione todos os estados ou cadastre um material com Magnets ou um .torrent.</p></template>
      </div>
      <ul v-else-if="state.data" class="material-list">
        <li v-for="material in state.data.content" :key="material.id"><article class="material-summary">
          <div class="material-summary-heading"><span class="material-kind">Material acadêmico</span><span class="own-status" :data-status="material.status">{{ materialStateLabels[material.status] }}</span></div>
          <h3><RouterLink :to="{ name: 'material', params: { id: material.id } }">{{ material.titulo }}</RouterLink></h3>
          <RouterLink v-if="canEditMaterial(material, authState.user?.id)" class="button-link" :to="{ name: 'material-edicao', params: { id: material.id } }">Editar metadados ↗</RouterLink>
          <RouterLink v-if="canEditMaterial(material, authState.user?.id)" class="button-link" :to="{ name: 'material-magnet-adicao', params: { id: material.id } }">Adicionar Magnets ↗</RouterLink>
          <RouterLink v-if="canEditMaterial(material, authState.user?.id)" class="button-link" :to="{ name: 'material-torrent-adicao', params: { id: material.id } }">Adicionar .torrent ↗</RouterLink>
          <RouterLink v-if="canRemoveMaterial(material, authState.user?.id)" class="button-link removal-link" :to="{ name: 'material-remocao', params: { id: material.id } }">Revisar remoção ↗</RouterLink>
          <p>Cadastrado em {{ dateLabel(material.dataCadastro) }} (UTC) · {{ material.visualizacoes }} {{ material.visualizacoes === 1 ? 'visualização' : 'visualizações' }}</p>
          <p v-if="material.status === 'REMOVIDO'" class="own-status-note">Remoção lógica: o registro foi preservado. Não há restauração nesta entrega.</p>
        </article></li>
      </ul>
      <nav v-if="page && page.totalPages > 0 && page.number < page.totalPages && !state.loading" class="catalog-pagination" aria-label="Paginação dos meus materiais">
        <button class="button-secondary" type="button" :disabled="changed || page.number <= 0" @click="model.goToPage(page!.number - 1)">← Anterior</button><span aria-live="polite">Página {{ page.number + 1 }} de {{ page.totalPages }}</span><button class="button-secondary" type="button" :disabled="changed || page.number + 1 >= page.totalPages" @click="model.goToPage(page!.number + 1)">Próxima →</button>
      </nav>
      <p class="form-footnote">Ordenação da API: cadastro mais recente primeiro, com desempate por UUID. Os detalhes e downloads continuam sujeitos à autorização do servidor. Nenhuma ação de edição, exclusão ou publicação é feita por esta tela. <RouterLink to="/materiais">Explorar o catálogo publicado ↗</RouterLink></p>
    </section>
  </section>
</template>
