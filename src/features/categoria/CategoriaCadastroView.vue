<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createCategoriaCadastroService } from './categoria-cadastro-service'
import { createCategoriaCadastroModel } from './categoria-cadastro-model'

const model = createCategoriaCadastroModel(createCategoriaCadastroService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [authState.value.status, authState.value.user?.id, authState.value.user?.perfil], () => model.initialize(), { immediate: true })
watch(() => [state.value.savedId, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="category-create-title">
    <RouterLink class="material-back" to="/categorias">← Categorias</RouterLink>
    <p class="eyebrow">Administração do catálogo</p><h1 id="category-create-title" ref="feedback" tabindex="-1">Cadastrar categoria</h1>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/categorias">Consultar categorias</RouterLink></div>
    <div v-else-if="state.savedId" class="material-created catalog-filters">
      <h2>Categoria cadastrada</h2><p role="status">A API confirmou o cadastro. Consulte o UUID para verificar os dados atuais.</p>
      <div class="account-actions"><RouterLink class="button-primary" :to="{ name: 'categoria', params: { id: state.savedId } }">Consultar categoria ↗</RouterLink><RouterLink class="button-secondary" to="/categorias">Voltar à lista</RouterLink></div>
    </div>
    <form v-else class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <p class="form-description">Categorias são globais e classificam materiais acadêmicos. O nome deve ser único; a API valida duplicidades.</p>
      <div v-if="state.error" ref="feedback" class="form-alert" role="alert" tabindex="-1">
        <p>{{ state.error }}</p>
        <RouterLink v-if="state.conflict || state.uncertain" class="button-link" to="/categorias">Consultar categorias</RouterLink>
      </div>
      <fieldset :disabled="state.sending || state.uncertain">
        <legend>Dados da categoria</legend>
        <label for="category-name">Nome</label><input id="category-name" :value="state.draft.nome" maxlength="80" required :aria-invalid="!!state.fields.nome" :aria-describedby="state.fields.nome ? 'category-name-error' : 'category-name-help'" @input="model.change('nome', ($event.target as HTMLInputElement).value)">
        <p id="category-name-help" class="form-footnote">Até 80 caracteres; a API remove espaços externos e compara duplicidades sem diferenciar maiúsculas de minúsculas.</p><p v-if="state.fields.nome" id="category-name-error" class="field-error">{{ state.fields.nome }}</p>
        <label for="category-description">Descrição <span class="form-footnote">(opcional)</span></label><textarea id="category-description" :value="state.draft.descricao" maxlength="500" :aria-invalid="!!state.fields.descricao" :aria-describedby="state.fields.descricao ? 'category-description-error' : 'category-description-help'" @input="model.change('descricao', ($event.target as HTMLTextAreaElement).value)"></textarea>
        <p id="category-description-help" class="form-footnote">Até 500 caracteres; conteúdo em branco será salvo sem descrição.</p><p v-if="state.fields.descricao" id="category-description-error" class="field-error">{{ state.fields.descricao }}</p>
        <button class="button-primary" type="submit" :disabled="state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Cadastrando categoria…' : 'Cadastrar categoria' }}</button>
      </fieldset>
      <button v-if="state.uncertain" class="button-secondary" type="button" @click="model.prepareNew()">Descartar formulário e preparar outro cadastro</button>
      <p class="form-footnote">O formulário existe somente nesta tela. Se a resposta for incerta, não será reenviado automaticamente; confira a lista antes de descartar.</p>
    </form>
  </section>
</template>
