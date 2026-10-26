<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { authenticatedJson, authenticatedMultipart } from '@/features/auth/auth'
import { createCatalogService } from '@/features/catalogo/catalog-service'
import AcademicSelectors from '@/features/catalogo/AcademicSelectors.vue'
import { createMaterialCadastroService } from './material-cadastro-service'
import { createMaterialCadastroModel, type SharingMode } from './material-cadastro-model'

const model = createMaterialCadastroModel(createCatalogService(authenticatedJson), createMaterialCadastroService(authenticatedJson, authenticatedMultipart))
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
const valueOf = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement).value
let mounted = true
function selectTorrent(event: Event) {
  const input = event.target as HTMLInputElement
  model.selectTorrent(Array.from(input.files ?? []))
  input.value = '' // Permite escolher o mesmo arquivo novamente; a referencia fica somente no modelo.
}
async function submit() { await model.submit(); if (mounted) { await nextTick(); feedback.value?.focus() } }
onMounted(() => { void model.initialize() })
onBeforeUnmount(() => { mounted = false; unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="new-material-title">
    <RouterLink class="material-back" to="/meus-materiais">← Meus materiais</RouterLink>
    <div class="catalog-heading"><div><p class="eyebrow">Compartilhe uma referência</p><h1 id="new-material-title">Cadastrar <em>material.</em></h1></div><span class="stage-label">Magnets ou .torrent</span></div>
    <p class="catalog-description">Cadastre os metadados com 1 a 10 Magnets ou um arquivo .torrent v1. O conteúdo acadêmico não é enviado ao servidor; sua distribuição acontece por BitTorrent. Compartilhe apenas conteúdos próprios ou autorizados.</p>
    <div v-if="state.createdId" class="material-created catalog-filters">
      <h2 ref="feedback" tabindex="-1">Material cadastrado</h2>
      <p role="status">O registro foi criado como PENDENTE. Ele ainda não aparece no catálogo de materiais publicados.</p>
      <div class="account-actions"><RouterLink class="button-primary" :to="{ name: 'material', params: { id: state.createdId } }">Consultar detalhes ↗</RouterLink><RouterLink class="button-secondary" to="/meus-materiais">Ver Meus materiais</RouterLink></div>
    </div>
    <form v-else class="catalog-filters material-create-form" @submit.prevent="submit" :aria-busy="state.sending">
      <div v-if="state.error" ref="feedback" class="form-alert" role="alert" tabindex="-1"><p>{{ state.error }}</p><RouterLink v-if="state.uncertain" class="button-link" to="/meus-materiais">Conferir Meus materiais antes de reenviar</RouterLink></div>
      <fieldset :disabled="state.sending">
        <legend>Metadados e organização</legend>
        <label for="new-material-titulo">Título</label><input id="new-material-titulo" :value="state.draft.titulo" maxlength="200" required :aria-invalid="!!state.fields.titulo" :aria-describedby="state.fields.titulo ? 'new-titulo-error' : undefined" @input="model.changeText('titulo', valueOf($event))">
        <p v-if="state.fields.titulo" id="new-titulo-error" class="field-error">{{ state.fields.titulo }}</p>
        <label for="new-material-descricao">Descrição</label><textarea id="new-material-descricao" :value="state.draft.descricao" maxlength="4000" rows="5" required :aria-invalid="!!state.fields.descricao" :aria-describedby="state.fields.descricao ? 'new-descricao-error' : undefined" @input="model.changeText('descricao', valueOf($event))" />
        <p v-if="state.fields.descricao" id="new-descricao-error" class="field-error">{{ state.fields.descricao }}</p>
        <AcademicSelectors prefix="new-material" :values="state.draft" :selectors="state.selectors" required :disabled="state.sending" @change="model.changeAcademic" @load="model.loadOptions" />
        <p v-if="state.fields.academico || state.fields.disciplinaId || state.fields.categoriaId" class="field-error" role="alert">{{ state.fields.academico || state.fields.disciplinaId || state.fields.categoriaId }}</p>
        <button class="button-link" type="button" @click="model.refreshAcademic()">Atualizar opções acadêmicas (limpa as quatro seleções)</button>
      </fieldset>
      <fieldset :disabled="state.sending">
        <legend>Mecanismo inicial de compartilhamento</legend>
        <label for="new-sharing-mode">Como você deseja compartilhar?</label><select id="new-sharing-mode" :value="state.mode" aria-describedby="new-mode-help" @change="model.setMode(($event.target as HTMLSelectElement).value as SharingMode)"><option value="MAGNET">Magnets (1 a 10 URIs)</option><option value="TORRENT">Um arquivo .torrent v1</option></select>
        <p id="new-mode-help" class="form-footnote">Ao trocar a opção, os Magnets e o arquivo selecionado são descartados; metadados e seleções acadêmicas são preservados. Cadastro misto não é suportado.</p>
      </fieldset>
      <fieldset v-if="state.mode === 'MAGNET'" :disabled="state.sending" aria-describedby="new-magnets-help new-magnets-error">
        <legend>Magnets associados</legend>
        <p id="new-magnets-help" class="form-description">Informe uma URI por campo, com um único xt v1 btih ou v2 btmh SHA-256. A validação definitiva e a identificação de hashes repetidos são feitas no servidor, sem consultar a disponibilidade do conteúdo.</p>
        <div v-for="(uri, index) in state.draft.magnetUris" :key="index" class="new-magnet-row">
          <label :for="'new-magnet-' + index">Magnet {{ index + 1 }}</label><textarea :id="'new-magnet-' + index" :value="uri" maxlength="4000" rows="3" spellcheck="false" autocomplete="off" required :aria-invalid="!!state.fields.magnetUris" aria-describedby="new-magnets-help new-magnets-error" @input="model.changeMagnet(index, valueOf($event))" />
          <button class="button-link" type="button" :disabled="state.draft.magnetUris.length <= 1" @click="model.removeMagnet(index)">Remover campo {{ index + 1 }}</button>
        </div>
        <p id="new-magnets-error" class="field-error" role="status">{{ state.fields.magnetUris }}</p>
        <button class="button-secondary" type="button" :disabled="state.draft.magnetUris.length >= 10" @click="model.addMagnet()">Adicionar campo de Magnet ({{ state.draft.magnetUris.length }}/10)</button>
      </fieldset>
      <fieldset v-else :disabled="state.sending" aria-describedby="new-torrent-help new-torrent-error">
        <legend>Arquivo .torrent</legend>
        <p id="new-torrent-help" class="form-description">Selecione somente um arquivo .torrent v1, não vazio e de até 2 MiB. Ele contém metadados, não o PDF, vídeo ou outro conteúdo acadêmico. A extensão e o tamanho não substituem a validação de metainfo e Info Hash no servidor; Torrents v2/híbridos não são aceitos.</p>
        <label for="new-torrent-file">Selecionar .torrent (obrigatório)</label><input id="new-torrent-file" type="file" accept=".torrent" aria-required="true" :aria-invalid="!!state.fields.arquivo" aria-describedby="new-torrent-help new-torrent-error" @change="selectTorrent">
        <p v-if="state.file" class="selected-torrent" role="status">Selecionado: {{ state.file.name }} · {{ state.file.size.toLocaleString('pt-BR') }} bytes de metainfo</p>
        <p v-else class="form-footnote">Nenhum arquivo selecionado.</p>
        <p id="new-torrent-error" class="field-error" role="status">{{ state.fields.arquivo }}</p>
        <button v-if="state.file" class="button-link" type="button" @click="model.clearTorrent()">Remover seleção do arquivo</button>
      </fieldset>
      <p class="form-footnote">Autor e estado são definidos pelo servidor. Não há publicação automática nem upload de conteúdo acadêmico. O formulário e a seleção do arquivo não são salvos no navegador e serão descartados ao sair; sair durante o envio não garante cancelar o cadastro no servidor.</p>
      <button class="button-primary" type="submit" :disabled="state.sending">{{ state.sending ? 'Enviando cadastro…' : state.uncertain ? 'Reenviar cadastro' : 'Cadastrar como pendente' }} <span aria-hidden="true">↗</span></button>
    </form>
  </section>
</template>
