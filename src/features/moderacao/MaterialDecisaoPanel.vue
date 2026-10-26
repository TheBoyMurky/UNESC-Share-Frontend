<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { DecisionState } from './material-decisao-model'
import type { MaterialDecision } from './material-decisao-service'
const props = defineProps<{ state: DecisionState; canPublish: boolean; canBlock: boolean }>()
const emit = defineEmits<{ choose: [action: MaterialDecision]; confirm: [value: boolean]; submit: []; cancel: []; reload: [] }>()
const heading = ref<HTMLElement | null>(null)
watch(() => [props.state.action, props.state.error], async () => { await nextTick(); heading.value?.focus() })
</script>

<template>
  <section class="material-decision" aria-labelledby="decision-title" :aria-busy="state.sending">
    <h2 id="decision-title" ref="heading" tabindex="-1">Decisão da equipe</h2>
    <p>Moderadores e administradores podem publicar os próprios materiais. Publicação disponibiliza o registro no catálogo; bloqueio retira sua disponibilidade comum e preserva os metadados e mecanismos.</p>
    <div v-if="!state.action" class="account-actions">
      <button class="button-primary" type="button" :disabled="!canPublish" @click="emit('choose', 'publicar')">Revisar publicação</button>
      <button class="button-secondary" type="button" :disabled="!canBlock" @click="emit('choose', 'bloquear')">Revisar bloqueio</button>
    </div>
    <form v-else @submit.prevent="emit('submit')">
      <p>{{ state.action === 'publicar' ? 'Publicar este material?' : 'Bloquear este material?' }}</p>
      <p v-if="state.action === 'bloquear'">Não há desbloqueio disponível nesta interface. O bloqueio não exclui o Material, Torrents ou Magnets.</p>
      <fieldset :disabled="state.sending || state.requiresReload">
        <legend>Confirmação da decisão</legend>
        <label class="removal-confirmation" for="decision-confirm"><input id="decision-confirm" type="checkbox" :checked="state.confirmed" required @change="emit('confirm', ($event.target as HTMLInputElement).checked)"><span>Confirmo que desejo {{ state.action === 'publicar' ? 'publicar' : 'bloquear' }} este material.</span></label>
        <button class="button-primary" type="submit" :disabled="!state.confirmed || state.sending || state.requiresReload">{{ state.sending ? 'Enviando decisão…' : state.action === 'publicar' ? 'Confirmar publicação' : 'Confirmar bloqueio' }}</button>
      </fieldset>
      <div class="account-actions"><button class="button-secondary" type="button" :disabled="state.sending || state.requiresReload" @click="emit('cancel')">Cancelar decisão</button><button class="button-link" type="button" :disabled="state.sending" @click="emit('reload')">Consultar estado atual e descartar confirmação</button></div>
    </form>
    <p v-if="state.error" class="form-alert" role="alert">{{ state.error }}</p>
    <p class="form-footnote">Publicação exige estado Pendente e ao menos um mecanismo. Material Removido não aceita essas decisões. Bloquear novamente um material Bloqueado mantém o estado.</p>
    <p class="form-footnote">O registro pode mudar depois desta consulta: a decisão atua sobre a versão atual no servidor. Não há histórico ou justificativa nesta etapa. Sair durante o envio não garante cancelar a operação.</p>
  </section>
</template>
