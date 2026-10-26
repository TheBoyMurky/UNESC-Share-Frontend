<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { authenticatedJson } from '@/features/auth/auth'
import { createCatalogService } from './catalog-service'
import { createCatalogModel, filtersChanged } from './catalog-model'
import AcademicSelectors from './AcademicSelectors.vue'

const model = createCatalogModel(createCatalogService(authenticatedJson))
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
const changed = computed(() => filtersChanged(state.value))
const page = computed(() => state.value.results.data?.page)
const valueOf = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value
const dateLabel = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
onMounted(() => { void model.initialize() })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="catalog-title">
    <div class="catalog-heading"><div><p class="eyebrow">Conhecimento em rede</p><h1 id="catalog-title">Explore o <em>catálogo.</em></h1></div><span class="stage-label">Somente materiais publicados</span></div>
    <p class="catalog-description">Encontre referências de estudo organizadas por instituição, curso e disciplina. O conteúdo é distribuído por BitTorrent, não hospedado aqui.</p>

    <form class="catalog-filters" @submit.prevent="model.search()" aria-label="Filtros da busca">
      <div class="catalog-search-field"><label for="catalog-q">O que você quer estudar?</label><input id="catalog-q" type="search" maxlength="200" :value="state.filters.q" placeholder="Pesquise por palavras no título ou na descrição" @input="model.changeFilter('q', valueOf($event))"></div>
      <AcademicSelectors prefix="catalog" :values="state.filters" :selectors="state.selectors" @change="model.changeFilter" @load="model.loadOptions" />
      <div class="catalog-actions">
        <div class="catalog-size"><label for="catalog-size">Por página</label><select id="catalog-size" :value="state.pageSize" @change="model.setPageSize(Number(valueOf($event)))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></div>
        <button class="button-secondary" type="button" @click="model.clearFilters()">Limpar filtros e buscar</button>
        <button class="button-primary" type="submit">Buscar materiais <span aria-hidden="true">↗</span></button>
      </div>
    </form>

    <section class="catalog-results" aria-labelledby="results-title" :aria-busy="state.results.loading">
      <div class="catalog-results-heading"><h2 id="results-title">Materiais publicados</h2><p v-if="page" aria-live="polite">{{ page.totalElements }} {{ page.totalElements === 1 ? 'registro encontrado' : 'registros encontrados' }}</p></div>
      <p v-if="changed && state.applied" class="catalog-notice" role="status">Filtros alterados. Os resultados correspondem à última busca aplicada; clique em Buscar materiais para atualizar.</p>
      <div v-if="state.results.loading" class="catalog-empty" role="status">Buscando materiais…</div>
      <div v-else-if="state.results.error" class="form-alert" role="alert"><p>{{ state.results.error }}</p><button class="button-link" type="button" @click="model.search()">Tentar buscar novamente</button></div>
      <div v-else-if="state.results.data && !state.results.data.content.length" class="catalog-empty">
        <template v-if="page && page.totalElements > 0"><h3>A página consultada não tem registros.</h3><p>O catálogo pode ter mudado entre as consultas. Atualize a busca para retornar à primeira página.</p><button class="button-secondary" type="button" @click="model.search()">Atualizar busca</button></template>
        <template v-else><h3>Nenhum material publicado encontrado.</h3><p>Experimente outros termos ou remova alguns filtros. Registros pendentes, bloqueados ou removidos não aparecem nesta busca.</p></template>
      </div>
      <ul v-else-if="state.results.data" class="material-list">
        <li v-for="material in state.results.data.content" :key="material.id"><article class="material-summary">
          <div class="material-summary-heading"><span class="material-kind">Material acadêmico</span><span class="published-label">Publicado</span></div>
          <h3><RouterLink :to="{ name: 'material', params: { id: material.id } }">{{ material.titulo }}</RouterLink></h3>
          <p>Cadastrado em {{ dateLabel(material.dataCadastro) }} <span aria-hidden="true">·</span> {{ material.visualizacoes }} {{ material.visualizacoes === 1 ? 'visualização' : 'visualizações' }}</p>
        </article></li>
      </ul>
      <nav v-if="page && page.totalPages > 0 && page.number < page.totalPages && !state.results.loading" class="catalog-pagination" aria-label="Paginação dos materiais">
        <button class="button-secondary" type="button" :disabled="changed || page.number <= 0" @click="model.goToPage(page!.number - 1)">← Anterior</button>
        <span aria-live="polite">Página {{ page.number + 1 }} de {{ page.totalPages }}</span>
        <button class="button-secondary" type="button" :disabled="changed || page.number + 1 >= page.totalPages" @click="model.goToPage(page!.number + 1)">Próxima →</button>
      </nav>
      <p class="form-footnote">A ordenação é definida pela API. Selecione o título para consultar os detalhes e os mecanismos de compartilhamento.</p>
    </section>
  </section>
</template>
