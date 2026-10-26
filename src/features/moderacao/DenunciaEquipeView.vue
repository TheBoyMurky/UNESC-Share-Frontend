<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { motivoLabel, statusLabel } from '@/features/denuncia/denuncia-service'
import { createModeracaoDenunciaService } from './moderacao-denuncia-service'
import { createDenunciaDecisaoModel } from './denuncia-decisao-model'
import { createDenunciaDecisaoService } from './denuncia-decisao-service'
import DenunciaDecisaoPanel from './DenunciaDecisaoPanel.vue'

const route = useRoute()
const model = createDenunciaDecisaoModel(createModeracaoDenunciaService(authenticatedJson), createDenunciaDecisaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
const action = shallowRef(model.getActionState())
const unsubscribeAction = model.subscribeAction(value => { action.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], () => { void model.load(typeof route.params.id === 'string' ? route.params.id : '') }, { immediate: true })
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC' })
onBeforeUnmount(() => { unsubscribe(); unsubscribeAction(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="team-report-title">
    <RouterLink class="material-back" to="/moderacao/denuncias">← Denúncias da equipe</RouterLink>
    <p class="eyebrow">Área da equipe</p><h1 id="team-report-title">Denúncia e histórico</h1>
    <p v-if="action.message" class="catalog-notice" role="status">{{ action.message }}</p>
    <button class="button-secondary rating-refresh" type="button" :disabled="state.loading || state.historyLoading || state.denied || action.sending" @click="model.reload()">{{ action.open ? 'Descartar justificativa e atualizar tudo' : 'Atualizar relato e histórico' }}</button>
    <div :aria-busy="state.loading">
      <p v-if="state.loading" class="catalog-empty" role="status">Consultando denúncia…</p>
      <p v-else-if="state.error" class="form-alert" role="alert">{{ state.error }}</p>
      <template v-else-if="state.report">
        <span class="report-status" :data-state="state.report.status">{{ statusLabel[state.report.status] }}</span>
        <dl class="account-details report-details"><div><dt>Motivo</dt><dd>{{ motivoLabel[state.report.motivo] }}</dd></div><div><dt>Cadastro (UTC)</dt><dd>{{ dateLabel(state.report.dataCadastro) }}</dd></div><div><dt>Identificador da denúncia</dt><dd><code>{{ state.report.id }}</code></dd></div><div><dt>Material relacionado</dt><dd><code>{{ state.report.materialId }}</code></dd></div></dl>
        <div class="material-description"><h2>Descrição enviada</h2><p>{{ state.report.descricao }}</p></div>
        <RouterLink class="button-link" :to="{ name: 'material-revisao', params: { id: state.report.materialId } }">Consultar material na área da equipe ↗</RouterLink>
        <p class="catalog-notice">Denunciante e autor do Material podem consultar como equipe, mas não podem decidir sobre esta denúncia, inclusive administradores. O responsável por um evento anterior não informa quem está impedido.</p>
        <p class="form-footnote">O estado da denúncia não bloqueia ou remove o Material automaticamente. A consulta do Material tem sua própria verificação de acesso.</p>
        <DenunciaDecisaoPanel :state="action" :status="state.report.status" :can-start="model.canOpen('analise')" :can-proceed="model.canOpen('procedencia')" :can-dismiss="model.canOpen('improcedencia')" @open="model.open" @close="model.close" @change="model.change" @confirm="model.setConfirmed" @submit="model.submit" @reload="model.reload" />
        <section aria-labelledby="report-history-title" :aria-busy="state.historyLoading">
          <h2 id="report-history-title">Histórico de moderação</h2>
          <p class="form-footnote">Relato e histórico são consultas separadas e podem refletir momentos diferentes. Mais antigos primeiro; a ausência de eventos não comprova que a denúncia nunca foi analisada.</p>
          <div class="moderation-toolbar"><label for="report-history-size">Eventos por página <select id="report-history-size" :value="state.size" :disabled="state.historyLoading || action.open || action.sending" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label><button class="button-secondary" type="button" :disabled="state.historyLoading || action.open || action.sending" @click="model.reloadHistory()">Atualizar histórico</button></div>
          <p v-if="state.historyLoading" class="catalog-empty" role="status">Consultando histórico…</p>
          <div v-else-if="state.historyError" class="form-alert" role="alert"><p>{{ state.historyError }}</p><button class="button-link" type="button" :disabled="action.open || action.sending" @click="model.reloadHistory()">Tentar carregar histórico novamente</button></div>
          <template v-else-if="state.history">
            <p class="form-footnote">{{ state.history.page.totalElements }} eventos na consulta atual</p>
            <p v-if="!state.history.content.length" class="catalog-empty">Nenhum evento de moderação nesta página.</p>
            <ol v-else class="material-list"><li v-for="event in state.history.content" :key="event.id" class="material-summary report-card">
              <h3>{{ statusLabel[event.estadoAnterior] }} → {{ statusLabel[event.estadoNovo] }}</h3>
              <p>{{ dateLabel(event.dataCadastro) }} (UTC)</p><p>Evento <code>{{ event.id }}</code></p><p>Responsável pela decisão <code>{{ event.responsavelId }}</code></p>
              <div class="material-description"><h4>Justificativa</h4><p>{{ event.justificativa }}</p></div>
            </li></ol>
            <nav v-if="state.history.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas do histórico da denúncia"><button class="button-secondary" type="button" :disabled="state.history.page.number === 0 || action.open || action.sending" @click="model.goToPage(state.history.page.number - 1)">Anterior</button><span>Página {{ state.history.page.number + 1 }} de {{ state.history.page.totalPages }}</span><button class="button-secondary" type="button" :disabled="state.history.page.number + 1 >= state.history.page.totalPages || action.open || action.sending" @click="model.goToPage(state.history.page.number + 1)">Próxima</button></nav>
          </template>
        </section>
      </template>
    </div>
  </section>
</template>
