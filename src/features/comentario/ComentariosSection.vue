<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { authenticatedDelete, authenticatedJson, authState } from '@/features/auth/auth'
import { canManageComentario, createComentarioService } from './comentario-service'
import { createComentarioModel } from './comentario-model'

const props = defineProps<{ materialId: string }>()
const model = createComentarioModel(createComentarioService(authenticatedJson, authenticatedDelete), () => authState.value.user?.id ?? null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
const commentsHeading = ref<HTMLElement | null>(null), actionHeading = ref<HTMLElement | null>(null)
watch(() => [props.materialId, authState.value.user?.id], () => { void model.load(props.materialId, true) }, { immediate: true })
watch(() => state.value.action ? state.value.action.kind + state.value.action.target.id : null, async () => {
  await nextTick()
  ;(state.value.action ? actionHeading.value : commentsHeading.value)?.focus()
})
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC' })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="comments-section" aria-labelledby="comments-title">
    <p class="eyebrow">Conversa sobre o material</p><h2 id="comments-title" ref="commentsHeading" tabindex="-1">Comentários</h2>
    <p class="catalog-description">Comentários são publicados imediatamente. Escreva em texto simples e evite incluir dados pessoais. Apenas comentários ativos de materiais publicados aparecem aqui.</p>
    <div v-if="state.unavailable" class="form-alert" role="alert"><p>{{ state.loadError }}</p><RouterLink class="button-link" to="/materiais">Voltar ao catálogo</RouterLink><p>Para conferir o estado atual, reabra o material pelo catálogo ou por Meus materiais.</p></div>
    <template v-else>
      <p v-if="state.message" class="catalog-notice" role="status">{{ state.message }}</p>
      <div class="comments-toolbar"><label for="comments-size">Comentários por página <select id="comments-size" :value="state.size" :disabled="state.loading || state.sending || !!state.action" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label><button class="button-secondary" type="button" :disabled="state.loading || state.sending || !!state.action" @click="model.reload()">Atualizar lista</button></div>
      <div :aria-busy="state.loading">
        <p v-if="state.loading" class="form-footnote" role="status">Carregando comentários…</p>
        <div v-else-if="state.loadError" class="form-alert" role="alert"><p>{{ state.loadError }}</p><button class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button></div>
        <template v-else-if="state.data">
          <p class="form-footnote">{{ state.data.page.totalElements }} comentários · Mais antigos primeiro</p>
          <p v-if="!state.data.content.length" class="catalog-empty">Nenhum comentário nesta página.</p>
          <ol v-else class="comment-list"><li v-for="comment in state.data.content" :key="comment.id" class="comment-card">
            <p class="comment-meta">{{ comment.usuarioId === authState.user?.id?.toLowerCase() ? 'Seu comentário' : 'Comentário de outro usuário' }} · <time :datetime="comment.dataCadastro">{{ dateLabel(comment.dataCadastro) }} (UTC)</time></p>
            <p class="comment-text">{{ comment.conteudo }}</p>
            <div v-if="canManageComentario(comment, authState.user?.id)" class="comment-actions">
              <button class="button-link" type="button" :disabled="state.sending || state.uncertain || !!state.action" aria-controls="comment-action" @click="model.startEdit(comment.id)">Editar meu comentário</button>
              <button class="button-link removal-link" type="button" :disabled="state.sending || state.uncertain || !!state.action" aria-controls="comment-action" @click="model.startRemoval(comment.id)">Revisar remoção</button>
            </div>
          </li></ol>
          <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas de comentários">
            <button class="button-secondary" type="button" :disabled="state.sending || !!state.action || state.data.page.number === 0" @click="model.goToPage(state.data.page.number - 1)">Anterior</button>
            <span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span>
            <button class="button-secondary" type="button" :disabled="state.sending || !!state.action || state.data.page.number + 1 >= state.data.page.totalPages" @click="model.goToPage(state.data.page.number + 1)">Próxima</button>
          </nav>
          <button v-if="state.data.page.totalPages > 1 && state.data.page.number + 1 < state.data.page.totalPages" class="button-link" type="button" :disabled="state.sending || !!state.action" @click="model.goToPage(state.data.page.totalPages - 1)">Última página</button>
        </template>
      </div>
      <form v-if="state.action" id="comment-action" class="comment-form comment-action-panel" :aria-busy="state.action.sending" aria-labelledby="comment-action-title" @submit.prevent="model.submitAction()">
        <h3 id="comment-action-title" ref="actionHeading" tabindex="-1">{{ state.action.kind === 'edit' ? 'Editar meu comentário' : 'Remover meu comentário' }}</h3>
        <p class="form-footnote">Comentário de {{ dateLabel(state.action.target.dataCadastro) }} (UTC) · <code>{{ state.action.target.id }}</code></p>
        <template v-if="state.action.kind === 'edit'">
          <p class="catalog-notice">A alteração aparece imediatamente. Salvar pode substituir uma edição feita em outra aba.</p>
          <label for="comment-edit">Texto do comentário</label>
          <textarea id="comment-edit" :value="state.action.draft" required maxlength="4000" rows="5" :disabled="state.action.sending || state.action.uncertain || state.action.blocked" :aria-invalid="!!state.action.error" aria-describedby="comment-edit-hint comment-action-error" @input="model.changeActionDraft(($event.target as HTMLTextAreaElement).value)" />
          <p id="comment-edit-hint" class="form-footnote">{{ state.action.draft.length }}/4000 caracteres. Cancelar descarta esta edição.</p>
        </template>
        <template v-else>
          <p class="catalog-notice">A remoção retira o comentário da lista. O registro e o texto permanecem armazenados. Não há opção de restaurar.</p>
          <blockquote class="comment-text">{{ state.action.target.conteudo }}</blockquote>
          <label class="removal-confirmation comment-confirmation"><input type="checkbox" required :checked="state.action.confirmed" :disabled="state.action.sending || state.action.uncertain || state.action.blocked" @change="model.confirmRemoval(($event.target as HTMLInputElement).checked)" />Confirmo a remoção deste comentário.</label>
        </template>
        <p v-if="state.action.error" id="comment-action-error" class="form-alert" role="alert">{{ state.action.error }}</p>
        <div class="comment-actions">
          <button class="button-primary" :class="{ 'button-danger': state.action.kind === 'remove' }" type="submit" :disabled="state.action.sending || state.action.uncertain || state.action.blocked || (state.action.kind === 'remove' && !state.action.confirmed)">{{ state.action.sending ? 'Enviando…' : state.action.kind === 'edit' ? 'Salvar alteração' : 'Confirmar remoção lógica' }}</button>
          <button class="button-secondary" type="button" :disabled="state.action.sending" @click="model.closeAction()">{{ state.action.uncertain || state.action.blocked ? 'Fechar, descartar edição e atualizar lista' : 'Cancelar' }}</button>
        </div>
        <p class="form-footnote">Uma ação por vez. O rascunho de novo comentário fica preservado até sair da tela. Sair durante o envio não garante cancelamento da operação.</p>
      </form>
      <form v-else class="comment-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
        <label for="comment-content">Adicionar comentário</label>
        <textarea id="comment-content" :value="state.draft" required maxlength="4000" rows="5" :disabled="state.sending" :aria-invalid="!!state.error" aria-describedby="comment-hint comment-feedback" @input="model.changeDraft(($event.target as HTMLTextAreaElement).value)" />
        <p id="comment-hint" class="form-footnote">{{ state.draft.length }}/4000 caracteres. Sair desta tela descarta o rascunho. Cancelar a espera não garante cancelar o envio.</p>
        <div id="comment-feedback"><p v-if="state.error" class="form-alert" role="alert">{{ state.error }}</p></div>
        <button v-if="state.uncertain" class="button-secondary" type="button" :disabled="!state.reviewed || state.loading || state.sending" @click="model.prepareRetry()">Conferi a lista; preparar nova tentativa (pode duplicar)</button>
        <button class="button-primary" type="submit" :disabled="state.sending || state.loading || !state.data || state.uncertain">{{ state.sending ? 'Enviando…' : 'Publicar comentário' }}</button>
      </form>
    </template>
  </section>
</template>
