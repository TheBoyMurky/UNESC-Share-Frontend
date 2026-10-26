<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createCategoriaEdicaoService } from './categoria-edicao-service'
import { createCategoriaEdicaoModel } from './categoria-edicao-model'

const route = useRoute()
const model = createCategoriaEdicaoModel(createCategoriaEdicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id]) => model.initialize(typeof id === 'string' ? id : ''), { immediate: true })
watch(() => [state.value.saved, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="category-edit-title">
    <RouterLink class="material-back" :to="{ name: 'categoria', params: { id: state.id || route.params.id } }">← Categoria</RouterLink>
    <p class="eyebrow">Administração do catálogo</p><h1 id="category-edit-title" ref="feedback" tabindex="-1">Editar categoria</h1>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/categorias">Consultar categorias</RouterLink></div>
    <p v-else-if="state.loading" class="catalog-empty" role="status">Consultando categoria…</p>
    <div v-else-if="state.error && !state.categoria" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.reload()">Tentar consultar novamente</button></div>
    <div v-else-if="state.saved" class="material-created catalog-filters">
      <h2>Alterações salvas</h2><p role="status">A API confirmou a edição. Consulte os dados atuais antes de continuar.</p>
      <div v-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.reload()">Tentar consultar novamente</button></div>
      <div class="account-actions"><button class="button-primary" type="button" :disabled="state.loading" @click="model.reload()">Consultar dados atuais</button><RouterLink class="button-secondary" :to="{ name: 'categoria', params: { id: state.id } }">Abrir detalhe</RouterLink></div>
    </div>
    <form v-else-if="state.categoria" class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <p class="form-description">Altere o nome ou a descrição. O UUID e os materiais associados serão preservados; a API valida nomes duplicados ao salvar.</p>
      <div v-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="state.conflict || state.uncertain" class="button-link" type="button" :disabled="state.loading" @click="model.reload()">Consultar dados atuais</button></div>
      <fieldset :disabled="state.loading || state.sending || state.uncertain || state.conflict">
        <legend>Dados da categoria</legend>
        <label for="category-edit-name">Nome</label><input id="category-edit-name" :value="state.draft.nome" maxlength="80" required :aria-invalid="!!state.fields.nome" @input="model.change('nome', ($event.target as HTMLInputElement).value)"><p v-if="state.fields.nome" class="field-error">{{ state.fields.nome }}</p>
        <label for="category-edit-description">Descrição <span class="form-footnote">(opcional)</span></label><textarea id="category-edit-description" :value="state.draft.descricao" maxlength="500" :aria-invalid="!!state.fields.descricao" @input="model.change('descricao', ($event.target as HTMLTextAreaElement).value)"></textarea><p v-if="state.fields.descricao" class="field-error">{{ state.fields.descricao }}</p>
        <button class="button-primary" type="submit" :disabled="state.loading || state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Salvando…' : 'Salvar alterações' }}</button>
      </fieldset>
      <p class="form-footnote">O PUT envia nome e descrição completos; descrição vazia limpa esse campo. Sem controle de versão, duas edições concorrentes podem sobrescrever uma à outra.</p>
    </form>
  </section>
</template>
