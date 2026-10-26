<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createModeracaoComentarioService } from './moderacao-comentario-service'
import { createComentarioDecisaoModel } from './comentario-decisao-model'
import type { MaterialStatus } from '../material/material-service'
import ComentarioHistoricoPanel from './ComentarioHistoricoPanel.vue'
import ComentarioDecisaoPanel from './ComentarioDecisaoPanel.vue'

const props = defineProps<{ materialId: string; materialStatus: MaterialStatus }>()
const model = createComentarioDecisaoModel(createModeracaoComentarioService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null, () => props.materialStatus)
const action = shallowRef(model.getState())
const state = computed(() => action.value.read)
const unsubscribe = model.subscribe(value => { action.value = value })
const heading = ref<HTMLElement | null>(null)
watch(() => [props.materialId, props.materialStatus, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], () => { void model.load(props.materialId) }, { immediate: true })
watch(() => state.value.mode, async (mode, previous) => { if (mode === 'list' && previous === 'history') { await nextTick(); heading.value?.focus() } })
watch(() => action.value.panel, async (panel, previous) => { if (!panel && previous) { await nextTick(); heading.value?.focus() } })
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC' })
const labels = { ATIVO: 'Ativo', OCULTO: 'Oculto' }
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="comments-section" aria-labelledby="team-comments-title">
    <p class="eyebrow">Consulta da equipe</p><h2 id="team-comments-title" ref="heading" tabindex="-1">Comentários para moderação</h2>
    <p class="catalog-description">Comentários ativos e ocultos deste Material, dos mais antigos para os mais recentes. A consulta da equipe está disponível também quando o Material não está publicado.</p>
    <p class="catalog-notice">O texto de comentários removidos não é exibido. Ocultar ou reexibir exige motivo e confirmação. A reexibição depende de Material publicado. A consulta e o histórico não alteram dados.</p>
    <p v-if="action.notice" class="catalog-notice" role="status">{{ action.notice }}</p>
    <ComentarioDecisaoPanel v-if="action.panel" :state="action" @close="model.closeDecision" @motivo="model.setMotivo" @confirmed="model.setConfirmed" @submit="model.submit" />
    <ComentarioHistoricoPanel v-else-if="state.mode === 'history'" :state="state" @close="model.closeHistory" @reload="model.reload" @size="model.setSize" @page="model.goToPage" />
    <div v-else-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><p>Reabra a revisão do Material para conferir o acesso atual.</p></div>
    <template v-else-if="state.mode === 'list'">
      <div class="comments-toolbar"><label for="team-comments-size">Comentários por página <select id="team-comments-size" :value="state.size" :disabled="state.loading" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label><button class="button-secondary" type="button" :disabled="state.loading" @click="model.reload()">Atualizar comentários da equipe</button></div>
      <div :aria-busy="state.loading">
        <p v-if="state.loading" class="form-footnote" role="status">Consultando comentários para moderação…</p>
        <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button></div>
        <template v-else-if="state.data">
          <p class="form-footnote">{{ state.data.page.totalElements }} comentários ativos ou ocultos na consulta atual</p>
          <p v-if="!state.data.content.length" class="catalog-empty">Nenhum comentário ativo ou oculto nesta página.</p>
          <ol v-else class="comment-list"><li v-for="comment in state.data.content" :key="comment.id" class="comment-card">
            <span class="report-status">{{ labels[comment.status] }}</span>
            <p class="comment-meta"><time :datetime="comment.dataCadastro">{{ dateLabel(comment.dataCadastro) }} (UTC)</time></p>
            <p class="comment-meta">Comentário <code>{{ comment.id }}</code></p><p class="comment-meta">Autor <code>{{ comment.usuarioId }}</code></p>
            <p class="comment-text">{{ comment.conteudo }}</p>
            <div class="comment-actions"><button class="button-link" type="button" @click="model.openHistory(comment.id)">Consultar histórico de moderação</button>
            <button v-if="comment.status === 'ATIVO'" class="button-secondary" type="button" @click="model.openHide(comment.id)">Ocultar comentário</button>
            <button v-else-if="materialStatus === 'PUBLICADO'" class="button-secondary" type="button" @click="model.openReveal(comment.id)">Reexibir comentário</button></div>
            <p v-if="comment.status === 'OCULTO' && materialStatus !== 'PUBLICADO'" class="form-footnote">Reexibição disponível somente em Material publicado. Recarregue a revisão para conferir o estado atual.</p>
          </li></ol>
          <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas dos comentários para moderação"><button class="button-secondary" type="button" :disabled="state.data.page.number === 0" @click="model.goToPage(state.data.page.number - 1)">Anterior</button><span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span><button class="button-secondary" type="button" :disabled="state.data.page.number + 1 >= state.data.page.totalPages" @click="model.goToPage(state.data.page.number + 1)">Próxima</button></nav>
        </template>
      </div>
    </template>
  </section>
</template>
