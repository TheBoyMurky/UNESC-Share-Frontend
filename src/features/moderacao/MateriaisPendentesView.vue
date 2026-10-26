<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createModeracaoMaterialService } from './moderacao-material-service'
import { createModeracaoMaterialModel } from './moderacao-material-model'

const model = createModeracaoMaterialModel(createModeracaoMaterialService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [authState.value.status, authState.value.user?.id, authState.value.user?.perfil], () => { void model.initialize() }, { immediate: true })
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC' })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="pending-title">
    <p class="eyebrow">Área da equipe</p><h1 id="pending-title">Materiais pendentes</h1>
    <RouterLink class="button-link" to="/moderacao/denuncias">Consultar denúncias da equipe ↗</RouterLink>
    <p class="catalog-description">Consulte os materiais aguardando análise e abra seus detalhes. Mais recentes primeiro, conforme a ordenação da API.</p>
    <p class="catalog-notice">Esta fila é somente de consulta. Abrir um material não o publica, bloqueia ou remove.</p>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/conta">Voltar à minha conta</RouterLink></div>
    <template v-else>
      <div class="moderation-toolbar"><label for="pending-size">Materiais por página <select id="pending-size" :value="state.size" :disabled="state.loading" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label><button class="button-secondary" type="button" :disabled="state.loading" @click="model.reload()">Atualizar fila</button></div>
      <div :aria-busy="state.loading">
        <p v-if="state.loading" class="catalog-empty" role="status">Consultando materiais pendentes…</p>
        <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.reload()">Tentar novamente</button></div>
        <template v-else-if="state.data">
          <p class="form-footnote">{{ state.data.page.totalElements }} materiais pendentes na consulta atual</p>
          <p v-if="!state.data.content.length" class="catalog-empty">Nenhum material pendente nesta página. A fila pode mudar enquanto outros usuários enviam ou analisam materiais.</p>
          <ul v-else class="material-list"><li v-for="material in state.data.content" :key="material.id" class="material-summary"><span class="own-status" data-status="PENDENTE">Pendente</span><h3><RouterLink :to="{ name: 'material-revisao', params: { id: material.id } }">{{ material.titulo }} ↗</RouterLink></h3><p>Cadastrado em {{ dateLabel(material.dataCadastro) }} (UTC) · {{ material.visualizacoes }} visualizações</p><RouterLink class="button-link" :to="{ name: 'material-revisao', params: { id: material.id } }">Revisar material</RouterLink></li></ul>
          <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas dos materiais pendentes"><button class="button-secondary" type="button" :disabled="state.data.page.number === 0" @click="model.goToPage(state.data.page.number - 1)">Anterior</button><span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span><button class="button-secondary" type="button" :disabled="state.data.page.number + 1 >= state.data.page.totalPages" @click="model.goToPage(state.data.page.number + 1)">Próxima</button></nav>
        </template>
      </div>
    </template>
  </section>
</template>
