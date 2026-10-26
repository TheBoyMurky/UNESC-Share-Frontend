<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createInstituicaoCadastroService } from './instituicao-cadastro-service'
import { createInstituicaoCadastroModel } from './instituicao-cadastro-model'
const model = createInstituicaoCadastroModel(createInstituicaoCadastroService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [authState.value.status, authState.value.user?.id, authState.value.user?.perfil], () => model.initialize(), { immediate: true })
watch(() => [state.value.savedId, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="institution-create-title">
    <RouterLink class="material-back" to="/instituicoes">← Instituições</RouterLink>
    <p class="eyebrow">Administração acadêmica</p><h1 id="institution-create-title" ref="feedback" tabindex="-1">Cadastrar instituição</h1>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/instituicoes">Consultar instituições</RouterLink></div>
    <div v-else-if="state.savedId" class="material-created catalog-filters"><h2>Instituição cadastrada</h2><p role="status">A API confirmou o cadastro. Abra o detalhe para consultar os dados atuais.</p><div class="account-actions"><RouterLink class="button-primary" :to="{ name: 'instituicao', params: { id: state.savedId } }">Consultar instituição ↗</RouterLink><RouterLink class="button-secondary" to="/instituicoes">Voltar à lista</RouterLink></div></div>
    <form v-else class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <p class="form-description">Informe o nome e a sigla da instituição. A sigla será cadastrada em maiúsculas.</p>
      <div v-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink v-if="state.conflict || state.uncertain" class="button-link" to="/instituicoes">Conferir lista de instituições</RouterLink></div>
      <fieldset :disabled="state.sending || state.uncertain">
        <legend>Dados da instituição</legend>
        <label for="institution-name">Nome</label><input id="institution-name" :value="state.draft.nome" maxlength="180" required :aria-invalid="!!state.fields.nome" :aria-describedby="state.fields.nome ? 'institution-name-error' : undefined" @input="model.change('nome', ($event.target as HTMLInputElement).value)"><p v-if="state.fields.nome" id="institution-name-error" class="field-error">{{ state.fields.nome }}</p>
        <label for="institution-acronym">Sigla</label><input id="institution-acronym" :value="state.draft.sigla" maxlength="30" required :aria-invalid="!!state.fields.sigla" aria-describedby="institution-acronym-help institution-acronym-error" @input="model.change('sigla', ($event.target as HTMLInputElement).value)"><p id="institution-acronym-help" class="form-footnote">Até30 caracteres após converter para maiúsculas.</p><p id="institution-acronym-error" class="field-error">{{ state.fields.sigla }}</p>
        <button class="button-primary" type="submit" :disabled="state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Cadastrando instituição…' : 'Cadastrar instituição' }}</button>
      </fieldset>
      <button v-if="state.uncertain" class="button-secondary" type="button" @click="model.prepareNew()">Descartar formulário e preparar outro cadastro</button>
      <p class="form-footnote">O rascunho fica somente nesta tela e será descartado ao sair. Sair durante o envio não garante cancelar a gravação. Uma página da lista não prova que um cadastro com resultado incerto deixou de ocorrer.</p>
    </form>
  </section>
</template>
