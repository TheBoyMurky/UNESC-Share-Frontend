<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createCatalogService } from '@/features/catalogo/catalog-service'
import AcademicSelectors from '@/features/catalogo/AcademicSelectors.vue'
import { createMaterialEdicaoService } from './material-edicao-service'
import { createMaterialEdicaoModel, editHasChanges } from './material-edicao-model'

const route = useRoute()
const model = createMaterialEdicaoModel(createMaterialEdicaoService(authenticatedJson), createCatalogService(authenticatedJson), () => authState.value.user?.id ?? null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
const changed = computed(() => editHasChanges(state.value))
const valueOf = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement).value
let mounted = true
async function submit() { await model.submit(); if (mounted) { await nextTick(); feedback.value?.focus() } }
watch([() => route.params.id, () => authState.value.user?.id], ([id]) => { void model.load(typeof id === 'string' ? id : '') }, { immediate: true })
onBeforeUnmount(() => { mounted = false; unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="edit-material-title">
    <RouterLink class="material-back" to="/meus-materiais">← Meus materiais</RouterLink>
    <div class="catalog-heading"><div><p class="eyebrow">Revisar seus metadados</p><h1 id="edit-material-title">Editar <em>material.</em></h1></div></div>
    <div v-if="state.loading" class="catalog-empty" role="status">Carregando material e referências atuais…</div>
    <div v-else-if="state.loadError" class="form-alert" role="alert"><p>{{ state.loadError }}</p><button class="button-link" type="button" @click="model.reload()">Recarregar material</button></div>
    <div v-else-if="state.savedId" class="material-created catalog-filters">
      <h2 ref="feedback" tabindex="-1">Metadados atualizados</h2><p role="status">O material está PENDENTE. Ele só voltará ao catálogo comum após publicação pela equipe. Os mecanismos de compartilhamento não são alterados por esta edição.</p>
      <div class="account-actions"><RouterLink class="button-primary" :to="{ name: 'material', params: { id: state.savedId } }">Consultar dados atuais ↗</RouterLink><RouterLink class="button-secondary" to="/meus-materiais">Meus materiais</RouterLink></div>
    </div>
    <form v-else-if="state.material" class="catalog-filters material-create-form" @submit.prevent="submit" :aria-busy="state.sending">
      <p class="catalog-notice">Ao salvar, o material voltará a PENDENTE, inclusive se estiver publicado, e deixará de aparecer no catálogo comum até nova publicação. Torrents e Magnets serão preservados.</p>
      <p class="form-description">Sem controle de versão: uma edição concorrente pode ser sobrescrita. Confira os dados antes de salvar. Esta tela altera somente metadados; não recebe arquivos nem URIs de compartilhamento.</p>
      <div v-if="state.error" ref="feedback" class="form-alert" role="alert" tabindex="-1"><p>{{ state.error }}</p><RouterLink v-if="state.uncertain" class="button-link" :to="{ name: 'material', params: { id: state.material.id } }">Conferir o material antes de reenviar</RouterLink></div>
      <fieldset :disabled="state.sending">
        <legend>Título, descrição e organização</legend>
        <label for="edit-titulo">Título</label><input id="edit-titulo" :value="state.draft.titulo" maxlength="200" required :aria-invalid="!!state.fields.titulo" :aria-describedby="state.fields.titulo ? 'edit-titulo-error' : undefined" @input="model.changeText('titulo', valueOf($event))">
        <p v-if="state.fields.titulo" id="edit-titulo-error" class="field-error">{{ state.fields.titulo }}</p>
        <label for="edit-descricao">Descrição</label><textarea id="edit-descricao" :value="state.draft.descricao" maxlength="4000" rows="5" required :aria-invalid="!!state.fields.descricao" :aria-describedby="state.fields.descricao ? 'edit-descricao-error' : undefined" @input="model.changeText('descricao', valueOf($event))" />
        <p v-if="state.fields.descricao" id="edit-descricao-error" class="field-error">{{ state.fields.descricao }}</p>
        <AcademicSelectors prefix="edit-material" :values="state.draft" :selectors="state.selectors" required :disabled="state.sending" @change="model.changeAcademic" @load="model.loadOptions" />
        <p v-if="state.fields.academico || state.fields.disciplinaId || state.fields.categoriaId" class="field-error" role="alert">{{ state.fields.academico || state.fields.disciplinaId || state.fields.categoriaId }}</p>
      </fieldset>
      <p class="form-footnote">Mecanismos na consulta inicial: {{ state.material.torrents.length }} Torrent(s) e {{ state.material.magnets.length }} Magnet(s). Outra aba pode modificar o registro depois desta consulta; a API verifica o estado atual no PUT. O rascunho será descartado ao sair. Cancelar a espera não garante cancelar a gravação no servidor.</p>
      <div class="account-actions"><button class="button-primary" type="submit" :disabled="state.sending || !changed">{{ state.sending ? 'Salvando metadados…' : state.uncertain ? 'Reenviar edição como pendente' : 'Salvar e retornar a pendente' }} ↗</button><button class="button-link" type="button" :disabled="state.sending" @click="model.reload()">Recarregar dados (descarta alterações)</button></div>
      <p v-if="!changed" class="form-footnote">Nenhuma alteração de metadados para salvar.</p>
    </form>
  </section>
</template>
