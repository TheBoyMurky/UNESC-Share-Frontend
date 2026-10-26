<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createDenunciaService, motivoLabel, statusLabel } from './denuncia-service'
import { createDenunciaConsultaModel } from './denuncia-consulta-model'

const route = useRoute()
const model = createDenunciaConsultaModel(createDenunciaService(authenticatedJson), () => authState.value.user?.id ?? null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.user?.id], () => { void model.loadDetail(typeof route.params.id === 'string' ? route.params.id : '') }, { immediate: true })
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC' })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="report-title">
    <RouterLink class="material-back" to="/minhas-denuncias">← Minhas denúncias</RouterLink>
    <p class="eyebrow">Meu relato</p><h1 id="report-title">Detalhes da denúncia</h1>
    <button class="button-secondary rating-refresh" type="button" :disabled="state.loading" @click="model.reload()">Atualizar estado</button>
    <div :aria-busy="state.loading">
      <p v-if="state.loading" class="catalog-empty" role="status">Consultando denúncia…</p>
      <p v-else-if="state.error" class="form-alert" role="alert">{{ state.error }}</p>
      <template v-else-if="state.report">
        <span class="report-status" :data-state="state.report.status">{{ statusLabel[state.report.status] }}</span>
        <dl class="account-details report-details"><div><dt>Motivo</dt><dd>{{ motivoLabel[state.report.motivo] }}</dd></div><div><dt>Cadastro (UTC)</dt><dd>{{ dateLabel(state.report.dataCadastro) }}</dd></div><div><dt>Identificador do relato</dt><dd><code>{{ state.report.id }}</code></dd></div><div><dt>Material relacionado</dt><dd><code>{{ state.report.materialId }}</code></dd></div></dl>
        <div class="material-description"><h2>Descrição enviada</h2><p>{{ state.report.descricao }}</p></div>
        <p class="catalog-notice">O estado acima pertence ao seu relato. A denúncia não bloqueia nem remove automaticamente o Material.</p>
        <RouterLink class="button-link" :to="{ name: 'material', params: { id: state.report.materialId } }">Tentar consultar o Material relacionado ↗</RouterLink>
        <p class="form-footnote">A consulta do Material depende da permissão e do estado atuais. Seu relato não concede acesso a conteúdo privado. Não há edição, exclusão ou cancelamento por esta tela.</p>
      </template>
    </div>
  </section>
</template>
