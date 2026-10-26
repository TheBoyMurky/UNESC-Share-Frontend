<script setup lang="ts">
import type { ComentarioOcultacaoState } from './comentario-ocultacao-model'
import ComentarioDecisaoPanel from './ComentarioDecisaoPanel.vue'
defineProps<{ state: ComentarioOcultacaoState }>()
defineEmits<{ close: []; motivo: [value: string]; confirmed: [value: boolean]; submit: [] }>()
</script>
<template>
  <ComentarioDecisaoPanel :state="state" @close="$emit('close')" @motivo="$emit('motivo', $event)" @confirmed="$emit('confirmed', $event)" @submit="$emit('submit')" />
</template>
