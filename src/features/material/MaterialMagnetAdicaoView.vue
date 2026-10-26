<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createMaterialMagnetAdicaoService } from './material-magnet-adicao-service'
import { createMaterialMagnetAdicaoModel } from './material-magnet-adicao-model'

const route = useRoute()
const model = createMaterialMagnetAdicaoModel(createMaterialMagnetAdicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const remaining = computed(() => 10 - (state.value.material?.magnets.length ?? 10))
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id]) => { void model.load(typeof id === 'string' ? id : '') }, { immediate: true })
watch(() => [state.value.savedId, state.value.error, state.value.fieldError, state.value.loadError], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="add-magnets-title">
    <RouterLink class="material-back" to="/meus-materiais">← Meus materiais</RouterLink>
    <div class="catalog-heading"><div><p class="eyebrow">Compartilhamento do seu Material</p><h1 id="add-magnets-title" ref="feedback" tabindex="-1">Adicionar <em>Magnets.</em></h1></div></div>
    <p class="catalog-description">Adicione referências BitTorrent ao seu Material. O conteúdo acadêmico não é enviado ao servidor.</p>
    <p v-if="state.loading" class="catalog-empty" role="status">Consultando Material e mecanismos atuais…</p>
    <div v-else-if="state.loadError" class="form-alert" role="alert"><p>{{ state.loadError }}</p><button v-if="!state.denied" class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button><RouterLink v-else class="button-link" to="/meus-materiais">Voltar aos meus materiais</RouterLink></div>
    <div v-else-if="state.savedId" class="material-created catalog-filters">
      <h2>Lote de Magnets adicionado</h2><p role="status">A API confirmou a adição e o retorno do Material para PENDENTE. Ele depende de nova publicação para aparecer no catálogo comum. Consulte os dados atuais antes de preparar outro lote.</p>
      <div class="account-actions"><RouterLink class="button-primary" :to="{ name: 'material', params: { id: state.savedId } }">Consultar Material atual ↗</RouterLink><RouterLink class="button-secondary" to="/meus-materiais">Meus materiais</RouterLink></div>
    </div>
    <div v-else-if="state.mustReload" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-secondary" type="button" @click="model.reload()">Consultar novamente e preparar um novo lote</button></div>
    <template v-else-if="state.material">
      <div class="catalog-notice"><p>Material: <strong>{{ state.material.titulo }}</strong></p><p>{{ state.material.magnets.length }} de 10 Magnets cadastrados. {{ state.material.torrents.length }} Torrent(s) preservado(s).</p></div>
      <RouterLink class="button-link" :to="{ name: 'material', params: { id: state.material.id } }">Conferir mecanismos no detalhe atual ↗</RouterLink>
      <p v-if="!remaining" class="catalog-notice" role="status">O limite de 10 Magnets já foi atingido. Nenhuma adição está disponível nesta consulta.</p>
      <form v-else class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
        <p class="catalog-notice">Adicionar Magnets coloca o Material em PENDENTE, inclusive se estiver publicado. Ele deixará o catálogo comum até nova publicação. O lote é enviado por inteiro; URIs inválidas ou repetidas impedem a adição.</p>
        <p v-if="state.error" class="form-alert" role="alert">{{ state.error }}</p>
        <fieldset :disabled="state.sending">
          <legend>Novo lote — até {{ remaining }} Magnet(s) nesta consulta</legend>
          <p id="add-magnets-help" class="form-description">Uma URI por campo, até4000 caracteres, um único xt v1 btih ou v2 btmh SHA-256. O servidor normaliza os hashes e verifica duplicidade e limite atuais, sem consultar trackers ou disponibilidade do conteúdo.</p>
          <div v-for="(uri, index) in state.uris" :key="index" class="new-magnet-row">
            <label :for="'add-magnet-' + index">Novo Magnet {{ index + 1 }}</label><textarea :id="'add-magnet-' + index" :value="uri" maxlength="4000" rows="3" spellcheck="false" autocomplete="off" required :aria-invalid="!!state.fieldError" aria-describedby="add-magnets-help add-magnets-error" @input="model.changeUri(index, ($event.target as HTMLTextAreaElement).value)" />
            <button class="button-link" type="button" :disabled="state.uris.length <= 1" @click="model.removeField(index)">Remover campo {{ index + 1 }}</button>
          </div>
          <p id="add-magnets-error" class="field-error" role="status">{{ state.fieldError }}</p>
          <button class="button-secondary" type="button" :disabled="state.uris.length >= remaining" @click="model.addField()">Adicionar campo ({{ state.uris.length }}/{{ remaining }})</button>
          <label class="removal-confirmation"><input type="checkbox" :checked="state.confirmed" required @change="model.setConfirmed(($event.target as HTMLInputElement).checked)"><span>Confirmo a adição deste lote e o retorno do Material para PENDENTE.</span></label>
          <button class="button-primary" type="submit" :disabled="state.sending || !state.confirmed">{{ state.sending ? 'Adicionando Magnets…' : 'Adicionar lote e retornar a pendente' }}</button>
        </fieldset>
      </form>
      <button class="button-link" type="button" :disabled="state.sending" @click="model.reload()">Descartar rascunho e consultar dados atuais</button>
      <p class="form-footnote">Outra aba pode alterar o Material e os mecanismos após a consulta. Não há controle de versão. O rascunho fica somente nesta tela e será descartado ao sair; interromper a espera não garante cancelar a gravação.</p>
    </template>
  </section>
</template>
