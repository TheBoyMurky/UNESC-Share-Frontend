<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedDelete, authenticatedJson, authState } from '@/features/auth/auth'
import { createMaterialRemocaoService } from './material-remocao-service'
import { createMaterialRemocaoModel } from './material-remocao-model'
import { materialStateLabels } from './meus-materiais-service'

const route = useRoute()
const model = createMaterialRemocaoModel(createMaterialRemocaoService(authenticatedJson, authenticatedDelete), () => authState.value.user?.id ?? null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
let mounted = true
async function submit() { await model.submit(); if (mounted) { await nextTick(); feedback.value?.focus() } }
watch([() => route.params.id, () => authState.value.user?.id], ([id]) => { void model.load(typeof id === 'string' ? id : '') }, { immediate: true })
onBeforeUnmount(() => { mounted = false; unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="remove-title">
    <RouterLink class="material-back" to="/meus-materiais">← Meus materiais</RouterLink>
    <div class="catalog-heading"><div><p class="eyebrow">Ação sobre seu registro</p><h1 id="remove-title">Remover <em>material.</em></h1></div></div>
    <div v-if="state.loading" class="catalog-empty" role="status">Consultando o material antes da confirmação…</div>
    <div v-else-if="state.loadError" class="form-alert" role="alert"><p>{{ state.loadError }}</p><button class="button-link" type="button" @click="model.reload()">Consultar novamente</button></div>
    <div v-else-if="state.result && state.material" class="material-created catalog-filters">
      <h2 ref="feedback" tabindex="-1">{{ state.result === 'alreadyRemoved' ? 'Material já removido' : 'Remoção lógica confirmada' }}</h2>
      <p role="status">{{ state.result === 'alreadyRemoved' ? 'A consulta atual indica REMOVIDO. Nenhum novo DELETE foi enviado.' : 'A API confirmou a remoção lógica. O registro não aparece no catálogo comum.' }} Não há restauração disponível.</p>
      <p>{{ state.material.titulo }}</p>
      <div class="account-actions"><RouterLink class="button-primary" to="/meus-materiais">Voltar a Meus materiais ↗</RouterLink><RouterLink class="button-secondary" :to="{ name: 'material', params: { id: state.material.id } }">Consultar registro preservado</RouterLink></div>
    </div>
    <form v-else-if="state.material" class="catalog-filters material-remove-form" @submit.prevent="submit" :aria-busy="state.sending">
      <h2>Confira o material</h2>
      <p class="remove-target">{{ state.material.titulo }}</p>
      <p class="form-description">UUID: <code>{{ state.material.id }}</code><br>Estado consultado: {{ materialStateLabels[state.material.status] }}. Contagens nessa consulta: {{ state.material.torrentCount }} Torrent(s) e {{ state.material.magnetCount }} Magnet(s).</p>
      <p class="catalog-notice">O registro ficará REMOVIDO e não aparecerá no catálogo comum. Os metadados, Torrents e Magnets serão preservados; autor e equipe ainda poderão consultá-los conforme a API. Os Info Hashes continuam associados ao registro e não são liberados para outro material. Esta ação não apaga cópias distribuídas pela rede BitTorrent.</p>
      <p class="form-alert">Não há restauração disponível no sistema. A equipe não remove materiais de terceiros por esta rota; a API confere a autoria em cada DELETE.</p>
      <div v-if="state.error" ref="feedback" class="form-alert" role="alert" tabindex="-1"><p>{{ state.error }}</p></div>
      <fieldset :disabled="state.sending || state.uncertain">
        <legend>Confirmação obrigatória</legend>
        <label class="removal-confirmation" for="remove-confirm"><input id="remove-confirm" type="checkbox" :checked="state.confirmed" required @change="model.setConfirmed(($event.target as HTMLInputElement).checked)"><span>Entendo que este material ficará REMOVIDO e que não há restauração disponível.</span></label>
        <button class="button-primary button-danger" type="submit" :disabled="!state.confirmed || state.sending || state.uncertain">{{ state.sending ? 'Solicitando remoção…' : 'Confirmar remoção lógica' }}</button>
      </fieldset>
      <div class="account-actions"><RouterLink class="button-secondary" :to="{ name: 'material', params: { id: state.material.id } }">{{ state.sending ? 'Sair da tela (a operação pode continuar)' : state.uncertain ? 'Sair e conferir o registro' : 'Cancelar e voltar aos detalhes' }}</RouterLink><button class="button-link" type="button" :disabled="state.sending" @click="model.reload()">Consultar estado atual (limpa a confirmação)</button></div>
      <p class="form-footnote">A confirmação vale apenas para este UUID e tentativa, não para uma versão específica: título e estado podem mudar depois da consulta. Nenhum DELETE é enviado ao abrir esta página. Se o resultado for incerto, consulte novamente antes de confirmar outra tentativa. Sair ou cancelar a espera durante o envio não garante interromper a operação no servidor.</p>
    </form>
  </section>
</template>
