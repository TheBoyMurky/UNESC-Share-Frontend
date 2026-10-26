<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createInstituicaoEdicaoService } from './instituicao-cadastro-service'
import { createInstituicaoEdicaoModel } from './instituicao-edicao-model'
const route = useRoute()
const model = createInstituicaoEdicaoModel(createInstituicaoEdicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id]) => model.initialize(typeof id === 'string' ? id : ''), { immediate: true })
watch(() => [state.value.saved, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="institution-edit-title">
    <RouterLink class="material-back" :to="{ name: 'instituicao', params: { id: state.id || route.params.id } }">← Instituição</RouterLink>
    <p class="eyebrow">Administração acadêmica</p><h1 id="institution-edit-title" ref="feedback" tabindex="-1">Editar instituição</h1>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/instituicoes">Consultar instituições</RouterLink></div>
    <p v-else-if="state.loading" class="catalog-empty" role="status">Consultando instituição…</p>
    <div v-else-if="state.error && !state.draft.nome" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.reload()">Tentar consultar novamente</button></div>
    <div v-else-if="state.saved" class="material-created catalog-filters"><h2>Alterações salvas</h2><p role="status">A API confirmou a edição. Atualize para carregar novamente os dados atuais.</p><div class="account-actions"><button class="button-primary" type="button" @click="model.reload()">Atualizar instituição</button><RouterLink class="button-secondary" :to="{ name: 'instituicao', params: { id: state.id } }">Consultar detalhe</RouterLink></div></div>
    <form v-else-if="state.id && state.draft.nome" class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <p class="form-description">Altere o nome ou a sigla. A sigla será salva em maiúsculas. A API revalida conflitos no momento da gravação.</p>
      <div v-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="state.uncertain || state.conflict" class="button-link" type="button" @click="model.reload()">Consultar dados atuais</button></div>
      <fieldset :disabled="state.loading || state.sending || state.uncertain || state.conflict">
        <legend>Dados da instituição</legend>
        <label for="institution-name">Nome</label><input id="institution-name" :value="state.draft.nome" maxlength="180" required :aria-invalid="!!state.fields.nome" @input="model.change('nome', ($event.target as HTMLInputElement).value)"><p v-if="state.fields.nome" class="field-error">{{ state.fields.nome }}</p>
        <label for="institution-acronym">Sigla</label><input id="institution-acronym" :value="state.draft.sigla" maxlength="30" required :aria-invalid="!!state.fields.sigla" @input="model.change('sigla', ($event.target as HTMLInputElement).value)"><p class="form-footnote">Até30 caracteres após converter para maiúsculas.</p><p v-if="state.fields.sigla" class="field-error">{{ state.fields.sigla }}</p>
        <button class="button-primary" type="submit" :disabled="state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Salvando…' : 'Salvar alterações' }}</button>
      </fieldset>
      <p class="form-footnote">O formulário começa com os dados consultados. Sem controle de versão, duas edições concorrentes podem sobrescrever uma à outra. Sair durante o envio não garante cancelar a gravação.</p>
    </form>
  </section>
</template>
