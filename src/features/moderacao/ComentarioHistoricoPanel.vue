<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import type { ComentarioEquipeState } from './comentario-consulta-equipe-model'
defineProps<{ state: Extract<ComentarioEquipeState, { mode: 'history' }> }>()
const emit = defineEmits<{ close: []; reload: []; size: [value: number]; page: [value: number] }>()
const heading = ref<HTMLElement | null>(null)
onMounted(async () => { await nextTick(); heading.value?.focus() })
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC' })
const labels = { ATIVO: 'Ativo', OCULTO: 'Oculto' }
</script>

<template>
  <section class="report-target" aria-labelledby="comment-history-title" :aria-busy="state.loading">
    <h3 id="comment-history-title" ref="heading" tabindex="-1">Histórico de moderação do comentário</h3>
    <p v-if="state.selectedId">Comentário <code>{{ state.selectedId }}</code></p>
    <p class="form-footnote">O histórico registra ocultações e reexibições. Não recupera texto de comentário removido nem representa todas as edições ou remoções. Página vazia não comprova ausência de moderação anterior.</p>
    <button class="button-secondary" type="button" @click="emit('close')">Voltar e consultar a lista da equipe</button>
    <p v-if="state.denied" class="form-alert" role="alert">{{ state.error }}</p>
    <template v-else>
      <div class="comments-toolbar"><label for="comment-history-size">Eventos por página <select id="comment-history-size" :value="state.size" :disabled="state.loading" @change="emit('size', Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label><button class="button-secondary" type="button" :disabled="state.loading" @click="emit('reload')">Atualizar histórico</button></div>
      <p v-if="state.loading" class="form-footnote" role="status">Consultando histórico do comentário…</p>
      <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="emit('reload')">Tentar carregar histórico novamente</button></div>
      <template v-else-if="state.data">
        <p class="form-footnote">{{ state.data.page.totalElements }} eventos na consulta atual · Mais antigos primeiro</p>
        <p v-if="!state.data.content.length" class="catalog-empty">Nenhum evento nesta página.</p>
        <ol v-else class="material-list"><li v-for="event in state.data.content" :key="event.id" class="material-summary report-card">
          <h4>{{ labels[event.estadoAnterior] }} → {{ labels[event.estadoNovo] }}</h4>
          <p><time :datetime="event.dataCadastro">{{ dateLabel(event.dataCadastro) }} (UTC)</time></p><p>Evento <code>{{ event.id }}</code></p><p>Responsável <code>{{ event.responsavelId }}</code></p>
          <div class="material-description"><h4>Motivo registrado</h4><p>{{ event.motivo }}</p></div>
        </li></ol>
        <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas do histórico do comentário"><button class="button-secondary" type="button" :disabled="state.data.page.number === 0" @click="emit('page', state.data.page.number - 1)">Anterior</button><span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span><button class="button-secondary" type="button" :disabled="state.data.page.number + 1 >= state.data.page.totalPages" @click="emit('page', state.data.page.number + 1)">Próxima</button></nav>
      </template>
    </template>
  </section>
</template>
