<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authenticatedMultipart, authState } from '@/features/auth/auth'
import { createMaterialTorrentAdicaoService } from './material-torrent-adicao-service'
import { createMaterialTorrentAdicaoModel } from './material-torrent-adicao-model'
const route = useRoute()
const model = createMaterialTorrentAdicaoModel(createMaterialTorrentAdicaoService(authenticatedJson, authenticatedMultipart), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id]) => { void model.load(typeof id === 'string' ? id : '') }, { immediate: true })
watch(() => [state.value.savedId, state.value.error, state.value.fieldError, state.value.loadError], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
function select(event: Event) { const input = event.target as HTMLInputElement; model.selectFiles(Array.from(input.files ?? [])); input.value = '' }
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="add-torrent-title">
    <RouterLink class="material-back" to="/meus-materiais">← Meus materiais</RouterLink>
    <div class="catalog-heading"><div><p class="eyebrow">Compartilhamento do seu Material</p><h1 id="add-torrent-title" ref="feedback" tabindex="-1">Adicionar <em>.torrent.</em></h1></div></div>
    <p class="catalog-description">Envie somente metainfo BitTorrent. PDF, vídeo, ZIP e outros conteúdos acadêmicos não são recebidos por esta plataforma.</p>
    <p v-if="state.loading" class="catalog-empty" role="status">Consultando Material e mecanismos atuais…</p>
    <div v-else-if="state.loadError" class="form-alert" role="alert"><p>{{ state.loadError }}</p><button v-if="!state.denied" class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button><RouterLink v-else class="button-link" to="/meus-materiais">Voltar aos meus materiais</RouterLink></div>
    <div v-else-if="state.savedId" class="material-created catalog-filters">
      <h2>Torrent cadastrado</h2><p role="status">A API confirmou o cadastro do .torrent. Adições retornam o Material para PENDENTE e exigem nova publicação. Consulte o detalhe para conferir o estado e os mecanismos atuais.</p>
      <div class="account-actions"><RouterLink class="button-primary" :to="{ name: 'material', params: { id: state.savedId } }">Consultar Material atual ↗</RouterLink><RouterLink class="button-secondary" to="/meus-materiais">Meus materiais</RouterLink></div>
    </div>
    <div v-else-if="state.mustReload" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-secondary" type="button" @click="model.reload()">Consultar novamente antes de selecionar arquivo</button></div>
    <template v-else-if="state.material">
      <div class="catalog-notice"><p>Material: <strong>{{ state.material.titulo }}</strong></p><p>{{ state.material.torrents.length }} de 10 Torrents cadastrados. {{ state.material.magnets.length }} Magnet(s) preservado(s).</p></div>
      <RouterLink class="button-link" :to="{ name: 'material', params: { id: state.material.id } }">Conferir mecanismos no detalhe atual ↗</RouterLink>
      <p v-if="state.material.torrents.length >= 10" class="catalog-notice" role="status">O limite de 10 Torrents já foi atingido. Nenhuma adição está disponível nesta consulta.</p>
      <form v-else class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
        <p class="catalog-notice">Adicionar um .torrent coloca o Material em PENDENTE, inclusive se estiver publicado. Ele deixará o catálogo comum até nova publicação.</p>
        <p v-if="state.error" class="form-alert" role="alert">{{ state.error }}</p>
        <fieldset :disabled="state.sending">
          <legend>Um arquivo .torrent v1</legend>
          <p id="add-torrent-help" class="form-description">Arquivo não vazio, de até2 MiB. Extensão, nome e tamanho não comprovam metainfo válido: o servidor valida a estrutura v1 e o Info Hash. Torrents v2/híbridos não são aceitos.</p>
          <label for="add-torrent-file">Selecionar .torrent</label><input id="add-torrent-file" type="file" accept=".torrent" aria-required="true" :aria-invalid="!!state.fieldError" aria-describedby="add-torrent-help add-torrent-error" @change="select">
          <p v-if="state.file" class="selected-torrent" role="status">Selecionado: {{ state.file.name }} · {{ state.file.size.toLocaleString('pt-BR') }} bytes de metainfo</p><p v-else class="form-footnote">Nenhum arquivo selecionado.</p>
          <p id="add-torrent-error" class="field-error" role="status">{{ state.fieldError }}</p>
          <button v-if="state.file" class="button-link" type="button" @click="model.clearFile()">Remover seleção</button>
          <label class="removal-confirmation"><input type="checkbox" :checked="state.confirmed" required @change="model.setConfirmed(($event.target as HTMLInputElement).checked)"><span>Confirmo a adição deste .torrent e o retorno do Material para PENDENTE.</span></label>
          <button class="button-primary" type="submit" :disabled="state.sending || !state.file || !state.confirmed">{{ state.sending ? 'Enviando .torrent…' : 'Adicionar .torrent e retornar a pendente' }}</button>
        </fieldset>
      </form>
      <button class="button-link" type="button" :disabled="state.sending" @click="model.reload()">Descartar seleção e consultar dados atuais</button>
      <p class="form-footnote">Outras abas podem alterar o registro após a consulta. A seleção não é salva no navegador e será descartada ao sair; interromper a espera não garante cancelar a gravação.</p>
    </template>
  </section>
</template>
