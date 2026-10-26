<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ComentarioDecisaoState } from './comentario-decisao-model'
import { comentarioDecisionInfo } from './moderacao-comentario-service'
const props = defineProps<{ state: ComentarioDecisaoState }>()
const info = computed(() => props.state.kind ? comentarioDecisionInfo[props.state.kind] : null)
defineEmits<{ close: []; motivo: [value: string]; confirmed: [value: boolean]; submit: [] }>()
const heading = ref<HTMLElement | null>(null)
onMounted(async () => { await nextTick(); heading.value?.focus() })
watch(() => props.state.error, async (error, previous) => { if (error && error !== previous) { await nextTick(); heading.value?.focus() } })
</script>

<template>
  <div v-if="info" class="report-target" :aria-busy="state.sending">
    <h3 ref="heading" tabindex="-1">{{ info.label }}</h3>
    <p v-if="state.kind === 'ocultacao'">Esta ação retira o comentário da consulta comum e registra o motivo no histórico da equipe. O Material não será alterado.</p>
    <p v-else>Esta ação torna o comentário ativo novamente na consulta comum enquanto o Material estiver publicado, e registra o motivo no histórico da equipe. O Material não será alterado.</p>
    <template v-if="state.target">
      <p>Comentário <code>{{ state.target.id }}</code></p>
      <p class="comment-text">{{ state.target.conteudo }}</p>
      <p class="form-footnote">A confirmação não fixa uma versão do comentário. A API confere os estados atuais do comentário e do Material antes de decidir. Sair durante o envio não garante cancelar a operação.</p>
      <form class="comment-form" @submit.prevent="$emit('submit')">
        <label for="team-comment-decision-reason">Motivo da {{ info.noun }}</label>
        <textarea id="team-comment-decision-reason" :value="state.motivo" :disabled="state.sending" maxlength="1000" rows="4" required aria-describedby="team-comment-decision-help" @input="$emit('motivo', ($event.target as HTMLTextAreaElement).value)" />
        <p id="team-comment-decision-help" class="form-footnote">Até 1000 caracteres. O motivo será registrado para consulta da equipe.</p>
        <label class="removal-confirmation"><input type="checkbox" :checked="state.confirmed" :disabled="state.sending" required @change="$emit('confirmed', ($event.target as HTMLInputElement).checked)"><span>Confirmo a {{ info.noun }} deste comentário com o motivo informado.</span></label>
        <p v-if="state.error" class="form-alert" role="alert">{{ state.error }}</p>
        <button class="button-primary" type="submit" :disabled="state.sending || !state.confirmed">{{ state.sending ? `Enviando ${info.noun}…` : `Confirmar ${info.noun}` }}</button>
      </form>
    </template>
    <p v-else-if="state.error" class="form-alert" role="alert">{{ state.error }}</p>
    <p v-if="state.sending" class="form-footnote" role="status">Aguarde a resposta antes de preparar outra ação.</p>
    <button class="button-secondary" type="button" :disabled="state.sending" @click="$emit('close')">{{ state.mustReload ? 'Descartar e consultar a lista novamente' : 'Cancelar e voltar à lista' }}</button>
  </div>
</template>
