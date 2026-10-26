<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createDenunciaService, motivoLabel, statusLabel } from './denuncia-service'
import { createDenunciaConsultaModel } from './denuncia-consulta-model'

const model = createDenunciaConsultaModel(createDenunciaService(authenticatedJson), () => authState.value.user?.id ?? null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => authState.value.user?.id, () => { void model.loadList() }, { immediate: true })
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC' })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="reports-title">
    <p class="eyebrow">Acompanhamento pessoal</p><h1 id="reports-title">Minhas denúncias</h1>
    <p class="catalog-description">Somente os relatos desta conta, em todos os estados, dos mais antigos aos mais recentes. Você pode acompanhá-los mesmo se o Material deixar de estar publicado.</p>
    <div class="reports-toolbar"><label for="reports-size">Relatos por página <select id="reports-size" :value="state.size" :disabled="state.loading" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label><button class="button-secondary" type="button" :disabled="state.loading" @click="model.reload()">Atualizar lista</button></div>
    <div :aria-busy="state.loading">
      <p v-if="state.loading" class="catalog-empty" role="status">Carregando suas denúncias…</p>
      <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.reload()">Tentar novamente</button></div>
      <template v-else-if="state.data">
        <p class="form-footnote">{{ state.data.page.totalElements }} relatos desta conta</p>
        <p v-if="!state.data.content.length" class="catalog-empty">Nenhuma denúncia nesta página. Para relatar um problema, abra um Material publicado no catálogo.</p>
        <ul v-else class="material-list"><li v-for="report in state.data.content" :key="report.id" class="material-summary report-card">
          <span class="report-status" :data-state="report.status">{{ statusLabel[report.status] }}</span>
          <h2><RouterLink :to="{ name: 'denuncia', params: { id: report.id } }">{{ motivoLabel[report.motivo] }} ↗</RouterLink></h2>
          <p>Cadastrada em {{ dateLabel(report.dataCadastro) }} (UTC)</p><p>Material: <code>{{ report.materialId }}</code></p>
          <RouterLink class="button-link" :to="{ name: 'denuncia', params: { id: report.id } }">Consultar meu relato</RouterLink>
        </li></ul>
        <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas das minhas denúncias"><button class="button-secondary" type="button" :disabled="state.data.page.number === 0" @click="model.goToPage(state.data.page.number - 1)">Anterior</button><span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span><button class="button-secondary" type="button" :disabled="state.data.page.number + 1 >= state.data.page.totalPages" @click="model.goToPage(state.data.page.number + 1)">Próxima</button></nav>
      </template>
    </div>
  </section>
</template>
