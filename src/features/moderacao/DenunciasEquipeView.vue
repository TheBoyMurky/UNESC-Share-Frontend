<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { estados, motivoLabel, statusLabel } from '@/features/denuncia/denuncia-service'
import { createModeracaoDenunciaService } from './moderacao-denuncia-service'
import { createModeracaoDenunciaModel } from './moderacao-denuncia-model'

const model = createModeracaoDenunciaModel(createModeracaoDenunciaService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [authState.value.status, authState.value.user?.id, authState.value.user?.perfil], () => { void model.initialize() }, { immediate: true })
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC' })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="reports-team-title">
    <p class="eyebrow">Área da equipe</p><h1 id="reports-team-title">Denúncias da equipe</h1>
    <RouterLink class="button-link" to="/moderacao/materiais">Consultar materiais pendentes ↗</RouterLink>
    <p class="catalog-description">Consulte denúncias por estado, das mais antigas para as mais recentes, conforme a ordenação da API.</p>
    <p class="catalog-notice">Esta fila é somente de consulta. A equipe pode ler denúncias mesmo quando não pode decidir sobre elas. Denunciante e autor do Material são impedidos de moderar a denúncia, inclusive administradores.</p>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/conta">Voltar à minha conta</RouterLink></div>
    <template v-else>
      <div class="moderation-toolbar">
        <label for="team-report-status">Estado <select id="team-report-status" :value="state.status" :disabled="state.loading" @change="model.setStatus(($event.target as HTMLSelectElement).value)"><option v-for="status in estados" :key="status" :value="status">{{ statusLabel[status] }}</option></select></label>
        <label for="team-report-size">Denúncias por página <select id="team-report-size" :value="state.size" :disabled="state.loading" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label>
        <button class="button-secondary" type="button" :disabled="state.loading" @click="model.reload()">Atualizar fila</button>
      </div>
      <div :aria-busy="state.loading">
        <p v-if="state.loading" class="catalog-empty" role="status">Consultando denúncias da equipe…</p>
        <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.reload()">Tentar novamente</button></div>
        <template v-else-if="state.data">
          <p class="form-footnote">{{ state.data.page.totalElements }} denúncias em {{ statusLabel[state.status] }} na consulta atual</p>
          <p v-if="!state.data.content.length" class="catalog-empty">Nenhuma denúncia neste estado e página. A fila pode mudar enquanto outros usuários enviam ou analisam relatos.</p>
          <ul v-else class="material-list"><li v-for="report in state.data.content" :key="report.id" class="material-summary report-card">
            <span class="report-status" :data-state="report.status">{{ statusLabel[report.status] }}</span><h2><RouterLink :to="{ name: 'denuncia-revisao', params: { id: report.id } }">{{ motivoLabel[report.motivo] }} ↗</RouterLink></h2>
            <p>Denúncia <code>{{ report.id }}</code></p><p>Material <code>{{ report.materialId }}</code></p>
            <p>Cadastrada em {{ dateLabel(report.dataCadastro) }} (UTC)</p>
            <RouterLink class="button-link" :to="{ name: 'denuncia-revisao', params: { id: report.id } }">Consultar denúncia e histórico ↗</RouterLink>
            <RouterLink class="button-link" :to="{ name: 'material-revisao', params: { id: report.materialId } }">Consultar material na área da equipe ↗</RouterLink>
          </li></ul>
          <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas das denúncias da equipe"><button class="button-secondary" type="button" :disabled="state.data.page.number === 0" @click="model.goToPage(state.data.page.number - 1)">Anterior</button><span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span><button class="button-secondary" type="button" :disabled="state.data.page.number + 1 >= state.data.page.totalPages" @click="model.goToPage(state.data.page.number + 1)">Próxima</button></nav>
        </template>
      </div>
    </template>
  </section>
</template>
