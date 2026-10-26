<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createInstituicaoService } from '@/features/instituicao/instituicao-service'
import { createCursoCadastroService } from './curso-cadastro-service'
import { createCursoCadastroModel } from './curso-cadastro-model'
const route = useRoute()
const model = createCursoCadastroModel(createCursoCadastroService(authenticatedJson), createInstituicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id]) => { void model.initialize(typeof id === 'string' ? id : '') }, { immediate: true })
watch(() => [state.value.savedId, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="course-create-title">
    <RouterLink class="material-back" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId || route.params.id } }">← Cursos da instituição</RouterLink>
    <p class="eyebrow">Administração acadêmica</p><h1 id="course-create-title" ref="feedback" tabindex="-1">Cadastrar curso</h1>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/instituicoes">Consultar instituições</RouterLink></div>
    <p v-else-if="state.loading" class="catalog-empty" role="status">Validando instituição…</p>
    <div v-else-if="state.unavailable" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/instituicoes">Consultar instituições</RouterLink></div>
    <div v-else-if="state.error && !state.instituicao" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.initialize(typeof route.params.id === 'string' ? route.params.id : '')">Tentar consultar novamente</button></div>
    <div v-else-if="state.savedId && state.instituicao" class="material-created catalog-filters">
      <h2>Curso cadastrado</h2><p role="status">A API confirmou o cadastro. Consulte a lista atual de cursos para carregar os dados atuais.</p>
      <p class="form-footnote">{{ state.instituicao.nome }} · UUID do curso: <code>{{ state.savedId }}</code></p>
      <RouterLink class="button-primary" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId } }">Consultar cursos</RouterLink>
    </div>
    <form v-else-if="state.instituicao" class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <p class="form-description">Instituição: <strong>{{ state.instituicao.nome }} ({{ state.instituicao.sigla }})</strong>. O curso será vinculado a esta instituição. Transferência de cursos não faz parte desta operação.</p>
      <div v-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink v-if="state.conflict || state.uncertain" class="button-link" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId } }">Consultar cursos cadastrados</RouterLink></div>
      <fieldset :disabled="state.sending || state.uncertain">
        <legend>Dados do curso</legend>
        <label for="course-name">Nome</label><input id="course-name" :value="state.draft.nome" maxlength="150" required :aria-invalid="!!state.fields.nome" :aria-describedby="state.fields.nome ? 'course-name-error' : undefined" @input="model.change('nome', ($event.target as HTMLInputElement).value)"><p v-if="state.fields.nome" id="course-name-error" class="field-error">{{ state.fields.nome }}</p>
        <label for="course-description">Descrição (opcional)</label><textarea id="course-description" :value="state.draft.descricao" maxlength="1000" rows="5" :aria-invalid="!!state.fields.descricao" aria-describedby="course-description-help course-description-error" @input="model.change('descricao', ($event.target as HTMLTextAreaElement).value)"></textarea><p id="course-description-help" class="form-footnote">Até 1000 caracteres; se ficar vazia, será enviada como nula.</p><p v-if="state.fields.descricao" id="course-description-error" class="field-error">{{ state.fields.descricao }}</p>
        <button class="button-primary" type="submit" :disabled="state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Cadastrando curso…' : 'Cadastrar curso' }}</button>
      </fieldset>
      <button v-if="state.uncertain" class="button-secondary" type="button" @click="model.prepareNew()">Descartar rascunho e preparar outro cadastro</button>
      <p class="form-footnote">Em caso de conflito, altere os dados antes de tentar novamente. Se a resposta se perder, o cadastro pode ter ocorrido: não reenvie o mesmo formulário. Descartar o rascunho não faz consulta nem altera registros no servidor.</p>
    </form>
  </section>
</template>
