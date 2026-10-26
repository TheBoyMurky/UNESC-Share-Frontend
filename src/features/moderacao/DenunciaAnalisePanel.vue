<script setup lang="ts">
import type { DenunciaAnaliseState } from './denuncia-analise-model'
import DenunciaDecisaoPanel from './DenunciaDecisaoPanel.vue'
defineProps<{ state: DenunciaAnaliseState; canOpen: boolean }>()
const emit = defineEmits<{ open: []; close: []; change: [value: string]; confirm: [value: boolean]; submit: []; reload: [] }>()
</script>

<template>
  <DenunciaDecisaoPanel :state="state" status="PENDENTE" :can-start="canOpen" :can-proceed="false" :can-dismiss="false" @open="emit('open')" @close="emit('close')" @change="emit('change', $event)" @confirm="emit('confirm', $event)" @submit="emit('submit')" @reload="emit('reload')" />
</template>
