<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { StatusDenuncia } from '@/features/denuncia/denuncia-service'
import { statusLabel } from '@/features/denuncia/denuncia-service'
import type { DenunciaDecisaoState } from './denuncia-decisao-model'
import { denunciaActionInfo, type DenunciaAction } from './denuncia-decisao-service'
const props = defineProps<{ state: DenunciaDecisaoState; status: StatusDenuncia; canStart: boolean; canProceed: boolean; canDismiss: boolean }>()
const emit = defineEmits<{ open: [kind: DenunciaAction]; close: []; change: [value: string]; confirm: [value: boolean]; submit: []; reload: [] }>()
const info = computed(() => props.state.kind ? denunciaActionInfo[props.state.kind] : null)
const heading = ref<HTMLElement | null>(null)
watch([() => props.state.open, () => props.state.kind, () => props.state.error, () => props.state.fieldError], async ([open, kind, error, fieldError], [oldOpen, oldKind, oldError, oldFieldError]) => {
  if ((open && (!oldOpen || kind !== oldKind)) || (error && error !== oldError) || (fieldError && fieldError !== oldFieldError)) { await nextTick(); heading.value?.focus() }
})
</script>

<template>
  <section class="material-decision" aria-labelledby="report-decision-title" :aria-busy="state.sending">
    <h2 id="report-decision-title" ref="heading" tabindex="-1">Decisão sobre a denúncia</h2>
    <p>A API verifica impedimentos; denunciante e autor do Material não podem decidir, inclusive administradores. Outro membro elegível pode concluir uma análise iniciada por colega.</p>
    <p v-if="state.error" class="form-alert" role="alert">{{ state.error }}</p>
    <div v-if="!state.open" class="account-actions">
      <button v-if="status === 'PENDENTE'" class="button-primary" type="button" :disabled="!canStart" @click="emit('open', 'analise')">Preparar início da análise</button>
      <template v-else-if="status === 'EM_ANALISE'">
        <button class="button-primary" type="button" :disabled="!canProceed" @click="emit('open', 'procedencia')">Preparar conclusão procedente</button>
        <button class="button-secondary" type="button" :disabled="!canDismiss" @click="emit('open', 'improcedencia')">Preparar conclusão improcedente</button>
      </template>
      <p v-else class="form-footnote">Esta denúncia está concluída. Não há nova decisão ou reabertura disponível.</p>
    </div>
    <form v-else-if="info" class="report-form" @submit.prevent="emit('submit')">
      <p>Decisão selecionada: <strong>{{ info.label }}</strong>. Estado solicitado: {{ statusLabel[info.target] }}.</p>
      <p v-if="state.kind !== 'analise'">A conclusão encerra esta denúncia e não pode ser trocada por outra decisão nesta tela. Ela não bloqueia, remove ou publica o Material.</p>
      <fieldset :disabled="state.sending || state.requiresReload || state.forbidden">
        <legend>Justificativa da decisão</legend>
        <label for="report-decision-reason">Justificativa<textarea id="report-decision-reason" :value="state.draft" rows="5" required maxlength="1000" :aria-invalid="!!state.fieldError" :aria-describedby="state.fieldError ? 'report-decision-error' : 'report-decision-help'" @input="emit('change', ($event.target as HTMLTextAreaElement).value)" /></label>
        <p id="report-decision-help" class="form-footnote">Até 1000 caracteres. O texto será registrado no histórico interno; evite dados pessoais desnecessários.</p>
        <p v-if="state.fieldError" id="report-decision-error" class="form-alert" role="alert">{{ state.fieldError }}</p>
        <label class="removal-confirmation" for="report-decision-confirm"><input id="report-decision-confirm" type="checkbox" :checked="state.confirmed" required @change="emit('confirm', ($event.target as HTMLInputElement).checked)"><span>Confirmo a decisão: {{ info.label }} com a justificativa informada.</span></label>
        <button class="button-primary" type="submit" :disabled="!state.confirmed || state.sending || state.requiresReload || state.forbidden">{{ state.sending ? 'Enviando decisão…' : state.kind === 'analise' ? 'Confirmar início da análise' : state.kind === 'procedencia' ? 'Confirmar conclusão procedente' : 'Confirmar conclusão improcedente' }}</button>
      </fieldset>
      <div class="account-actions"><button class="button-secondary" type="button" :disabled="state.sending || state.requiresReload" @click="emit('close')">Cancelar e descartar justificativa</button><button class="button-link" type="button" :disabled="state.sending" @click="emit('reload')">Descartar justificativa e consultar estado atual</button></div>
    </form>
    <p class="form-footnote">Para trocar a decisão escolhida, cancele e prepare outro formulário. Justificativa e confirmação anteriores serão descartadas.</p>
    <p class="form-footnote">O estado pode mudar após a consulta. Não há garantia de revisão da mesma versão; sair durante o envio não garante cancelar a operação.</p>
  </section>
</template>
