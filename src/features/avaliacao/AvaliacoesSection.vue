<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { authenticatedDelete, authenticatedJson, authState } from '@/features/auth/auth'
import { createAvaliacaoService, formatNota, podeAvaliar } from './avaliacao-service'
import { createAvaliacaoModel } from './avaliacao-model'

const props = defineProps<{ materialId: string; autorId: string }>()
const model = createAvaliacaoModel(createAvaliacaoService(authenticatedJson, authenticatedDelete), () => authState.value.user?.id ?? null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
const sectionHeading = ref<HTMLElement | null>(null), actionHeading = ref<HTMLElement | null>(null)
watch(() => [props.materialId, props.autorId, authState.value.user?.id], () => { void model.load(props.materialId, props.autorId, true) }, { immediate: true })
watch(() => state.value.action?.kind ?? null, async () => {
  await nextTick()
  const target = state.value.action ? actionHeading.value : sectionHeading.value
  target?.focus()
})
const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC' })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="ratings-section" aria-labelledby="ratings-title">
    <p class="eyebrow">Avaliação da comunidade</p><h2 id="ratings-title" ref="sectionHeading" tabindex="-1">Notas do material</h2>
    <p class="catalog-description">Notas de 0,00 a 5,00, com até duas casas decimais. Cada pessoa pode manter uma avaliação; o autor não pode avaliar o próprio material.</p>
    <p v-if="state.message" class="catalog-notice" role="status">{{ state.message }}</p>
    <div v-if="state.unavailable" class="form-alert" role="alert"><p>{{ state.readError }}</p><p>Reabra os detalhes pelo catálogo ou por Meus materiais para conferir o estado atual.</p></div>
    <template v-else>
      <div :aria-busy="state.loading">
        <p v-if="state.loading" class="form-footnote" role="status">Consultando avaliações…</p>
        <p v-if="state.readError" class="form-alert" role="alert">{{ state.readError }} Não foi possível atualizar todos os dados de avaliação.</p>
        <dl v-if="state.resumo" class="ratings-summary">
          <div><dt>Média</dt><dd>{{ state.resumo.media === null ? 'Sem avaliações' : formatNota(state.resumo.media) + ' / 5,00' }}</dd></div>
          <div><dt>Quantidade de avaliações</dt><dd>{{ state.resumo.quantidade }}</dd></div>
        </dl>
        <div v-if="state.minha" class="rating-own">
          <h3>Sua avaliação</h3><p class="rating-score">{{ formatNota(state.minha.nota) }} / 5,00</p><p class="form-footnote">Cadastrada em {{ dateLabel(state.minha.dataCadastro) }} (UTC).</p>
          <div class="rating-actions">
            <button v-if="podeAvaliar(autorId, authState.user?.id) && !state.forbidden" class="button-link" type="button" :disabled="state.loading || state.sending || !!state.action" aria-controls="rating-action" @click="model.startEdit()">Editar minha nota</button>
            <button class="button-link removal-link" type="button" :disabled="state.loading || state.sending || !!state.action" aria-controls="rating-action" @click="model.startRemoval()">Revisar remoção</button>
          </div>
        </div>
      </div>
      <button class="button-secondary rating-refresh" type="button" :disabled="state.loading || state.sending || !!state.action" @click="model.reload()">{{ state.uncertain || state.conflict ? 'Conferir minha avaliação e resumo' : 'Atualizar avaliações' }}</button>
      <form v-if="state.action" id="rating-action" class="rating-form rating-action-panel" :aria-busy="state.action.sending" aria-labelledby="rating-action-title" @submit.prevent="model.submitAction()">
        <h3 id="rating-action-title" ref="actionHeading" tabindex="-1">{{ state.action.kind === 'edit' ? 'Editar minha nota' : 'Remover minha avaliação' }}</h3>
        <p class="form-footnote">Nota consultada: {{ formatNota(state.action.original.nota) }} · {{ dateLabel(state.action.original.dataCadastro) }} (UTC)<br />Registro consultado: <code>{{ state.action.original.id }}</code></p>
        <template v-if="state.action.kind === 'edit'">
          <p class="catalog-notice">A alteração aparece imediatamente. Salvar pode substituir uma alteração feita em outra aba. Se a avaliação for recriada durante a operação, a nota atual poderá ser alterada.</p>
          <label for="rating-edit">Nova nota</label>
          <input id="rating-edit" type="text" inputmode="decimal" autocomplete="off" required :value="state.action.nota" :disabled="state.action.sending || state.action.uncertain || state.action.blocked" :aria-invalid="!!state.action.error" aria-describedby="rating-edit-hint rating-action-error" @input="model.changeActionNota(($event.target as HTMLInputElement).value)" />
          <p id="rating-edit-hint" class="form-footnote">De 0,00 a 5,00, até duas casas, com vírgula ou ponto e sem arredondamento. Cancelar descarta a edição.</p>
        </template>
        <template v-else>
          <p class="catalog-notice">A remoção apaga definitivamente sua avaliação, sem histórico ou restauração. O Material e seus mecanismos são preservados.</p>
          <p class="form-description">Esta ação remove sua nota atual. Se ela for recriada em outra aba durante a operação, a nova nota poderá ser removida. Depois, você poderá cadastrar outra avaliação quando o Material estiver publicado e pertencer a outro usuário.</p>
          <label class="removal-confirmation rating-confirmation"><input type="checkbox" required :checked="state.action.confirmed" :disabled="state.action.sending || state.action.uncertain || state.action.blocked" @change="model.confirmRemoval(($event.target as HTMLInputElement).checked)" />Confirmo a exclusão definitiva da minha avaliação atual.</label>
        </template>
        <p v-if="state.action.error" id="rating-action-error" class="form-alert" role="alert">{{ state.action.error }}</p>
        <div class="rating-actions">
          <button class="button-primary" :class="{ 'button-danger': state.action.kind === 'remove' }" type="submit" :disabled="state.action.sending || state.action.uncertain || state.action.blocked || (state.action.kind === 'remove' && !state.action.confirmed)">{{ state.action.sending ? 'Enviando…' : state.action.kind === 'edit' ? 'Salvar nota' : 'Confirmar exclusão definitiva' }}</button>
          <button class="button-secondary" type="button" :disabled="state.action.sending" @click="model.closeAction()">{{ state.action.uncertain || state.action.blocked ? 'Fechar e consultar nota atual' : 'Cancelar' }}</button>
        </div>
        <p class="form-footnote">Sair durante o envio não garante cancelar a operação. Em caso de dúvida, consulte o estado atual antes de iniciar outra tentativa.</p>
      </form>
      <p v-else-if="!podeAvaliar(autorId, authState.user?.id)" class="catalog-notice">Você é o autor deste material. Pode consultar as avaliações, mas não atribuir uma nota.</p>
      <form v-else-if="!state.minha && state.checked" class="rating-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
        <label for="rating-score">Sua nota</label>
        <input id="rating-score" type="text" inputmode="decimal" autocomplete="off" required :value="state.nota" :disabled="state.sending || state.loading || state.uncertain || state.conflict || state.forbidden" :aria-invalid="!!state.formError" aria-describedby="rating-hint rating-error" @input="model.changeNota(($event.target as HTMLInputElement).value)" />
        <p id="rating-hint" class="form-footnote">Use vírgula ou ponto: 4,25 ou 4.25. Zero é uma nota válida. Entradas com três casas não são arredondadas. O rascunho é descartado ao sair.</p>
        <p v-if="state.formError" id="rating-error" class="form-alert" role="alert">{{ state.formError }}</p>
        <button v-if="state.uncertain || state.conflict" class="button-secondary" type="button" :disabled="!state.reviewed || state.loading || state.sending" @click="model.prepareRetry()">Conferi a ausência de nota; preparar nova tentativa</button>
        <button class="button-primary" type="submit" :disabled="state.sending || state.loading || !state.resumo || state.uncertain || state.conflict || state.forbidden">{{ state.sending ? 'Enviando nota…' : 'Cadastrar avaliação' }}</button>
        <p class="form-footnote">Sair durante o envio não garante cancelar a gravação. Em caso de dúvida, confira sua avaliação antes de enviar novamente.</p>
      </form>
    </template>
  </section>
</template>
