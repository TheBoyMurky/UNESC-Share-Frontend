<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createInstituicaoService } from '@/features/instituicao/instituicao-service'
import { createCursoEdicaoService } from './curso-edicao-service'
import { createCursoEdicaoModel } from './curso-edicao-model'
const route = useRoute()
const model = createCursoEdicaoModel(createCursoEdicaoService(authenticatedJson), createInstituicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, route.params.instituicaoId, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id, institutionId]) => model.initialize(typeof institutionId === 'string' ? institutionId : '', typeof id === 'string' ? id : ''), { immediate: true })
watch(() => [state.value.saved, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="course-edit-title">
    <RouterLink class="material-back" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId || route.params.instituicaoId } }">← Cursos da instituição</RouterLink>
    <p class="eyebrow">Administração acadêmica</p><h1 id="course-edit-title" ref="feedback" tabindex="-1">Editar curso</h1>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId || route.params.instituicaoId } }">Consultar cursos</RouterLink></div>
    <p v-else-if="state.loading" class="catalog-empty" role="status">Consultando curso e instituição…</p>
    <div v-else-if="state.error && !state.curso" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.initialize(typeof route.params.instituicaoId === 'string' ? route.params.instituicaoId : '', typeof route.params.id === 'string' ? route.params.id : '')">Tentar consultar novamente</button></div>
    <div v-else-if="state.saved && state.curso && state.instituicao" class="material-created catalog-filters">
      <h2>Alterações salvas</h2><p role="status">A API confirmou a edição. Atualize os dados para consultar a versão atual.</p>
      <p class="form-footnote">{{ state.instituicao.nome }} · {{ state.curso.nome }} · UUID: <code>{{ state.id }}</code></p>
      <div class="account-actions"><button class="button-primary" type="button" @click="model.reload()">Atualizar curso</button><RouterLink class="button-secondary" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId } }">Consultar cursos</RouterLink></div>
    </div>
    <form v-else-if="state.curso && state.instituicao" class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <p class="form-description">Instituição: <strong>{{ state.instituicao.nome }} ({{ state.instituicao.sigla }})</strong>. A instituição vinculada é fixa nesta edição.</p>
      <div v-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="state.uncertain || state.conflict" class="button-link" type="button" @click="model.reload()">Consultar curso atual</button></div>
      <fieldset :disabled="state.loading || state.sending || state.uncertain || state.conflict">
        <legend>Dados do curso</legend>
        <label for="course-edit-name">Nome</label><input id="course-edit-name" :value="state.draft.nome" maxlength="150" required :aria-invalid="!!state.fields.nome" aria-describedby="course-edit-name-error" @input="model.change('nome', ($event.target as HTMLInputElement).value)"><p v-if="state.fields.nome" id="course-edit-name-error" class="field-error">{{ state.fields.nome }}</p>
        <label for="course-edit-description">Descrição (opcional)</label><textarea id="course-edit-description" :value="state.draft.descricao" maxlength="1000" rows="5" :aria-invalid="!!state.fields.descricao" aria-describedby="course-edit-description-help course-edit-description-error" @input="model.change('descricao', ($event.target as HTMLTextAreaElement).value)"></textarea><p id="course-edit-description-help" class="form-footnote">Até 1000 caracteres; se ficar vazia, será enviada como nula.</p><p v-if="state.fields.descricao" id="course-edit-description-error" class="field-error">{{ state.fields.descricao }}</p>
        <button class="button-primary" type="submit" :disabled="state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Salvando…' : 'Salvar alterações' }}</button>
      </fieldset>
      <p class="form-footnote">O PUT envia o corpo completo exigido pela API, mantendo o UUID da instituição atual. Sem controle de versão, edições simultâneas podem sobrescrever umas às outras. Sair durante o envio não garante cancelar a gravação.</p>
    </form>
  </section>
</template>
