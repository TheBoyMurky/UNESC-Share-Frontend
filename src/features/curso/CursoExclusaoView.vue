<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedDelete, authenticatedJson, authState } from '@/features/auth/auth'
import { createCursoExclusaoService } from './curso-exclusao-service'
import { createCursoExclusaoModel } from './curso-exclusao-model'
const route = useRoute()
const model = createCursoExclusaoModel(createCursoExclusaoService(authenticatedJson, authenticatedDelete), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, route.params.instituicaoId, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id, institutionId]) => model.load(typeof institutionId === 'string' ? institutionId : '', typeof id === 'string' ? id : ''), { immediate: true })
watch(() => [state.value.deleted, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="course-delete-title">
    <RouterLink class="material-back" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId || route.params.instituicaoId } }">← Cursos da instituição</RouterLink>
    <p class="eyebrow">Administração acadêmica</p><h1 id="course-delete-title">Excluir curso</h1>
    <p v-if="state.loading" class="catalog-empty" role="status">Consultando o curso antes da confirmação…</p>
    <div v-else-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/instituicoes">Consultar instituições</RouterLink></div>
    <div v-else-if="state.loadError" class="form-alert" role="alert"><p>{{ state.loadError }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.load(typeof route.params.instituicaoId === 'string' ? route.params.instituicaoId : '', typeof route.params.id === 'string' ? route.params.id : '')">Consultar novamente</button><RouterLink v-else class="button-link" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId || route.params.instituicaoId } }">Voltar à lista de cursos</RouterLink></div>
    <div v-else-if="state.deleted && state.curso && state.instituicao" class="material-created catalog-filters">
      <h2 ref="feedback" tabindex="-1">Exclusão confirmada</h2>
      <p role="status">A API confirmou a exclusão física do curso. Esta operação não tem restauração.</p>
      <p>{{ state.curso.nome }} · {{ state.instituicao.nome }} · UUID: <code>{{ state.curso.id }}</code></p>
      <RouterLink class="button-primary" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId } }">Voltar aos cursos</RouterLink>
    </div>
    <form v-else-if="state.curso && state.instituicao" class="catalog-filters material-remove-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <h2>Confira o registro</h2>
      <p class="remove-target">{{ state.curso.nome }}</p>
      <p v-if="state.curso.descricao" class="institution-text">{{ state.curso.descricao }}</p>
      <p class="form-description">{{ state.instituicao.nome }} ({{ state.instituicao.sigla }}) · UUID: <code>{{ state.curso.id }}</code></p>
      <p class="catalog-notice">A exclusão é física e não pode ser desfeita. A API impede a exclusão se houver disciplinas vinculadas (HTTP 409); nenhuma disciplina ou dado será apagado em cascata.</p>
      <div v-if="state.error" ref="feedback" class="form-alert" role="alert" tabindex="-1">
        <p>{{ state.error }}</p>
        <button v-if="state.conflict || state.uncertain" class="button-link" type="button" @click="model.reload()">Consultar dados atuais antes de decidir novamente</button>
      </div>
      <fieldset :disabled="state.sending || state.uncertain || state.conflict">
        <legend>Confirmação obrigatória</legend>
        <label class="removal-confirmation" for="course-delete-confirm"><input id="course-delete-confirm" type="checkbox" :checked="state.confirmed" required @change="model.setConfirmed(($event.target as HTMLInputElement).checked)"><span>Confirmo a exclusão física deste curso e entendo que não há restauração.</span></label>
        <button class="button-primary button-danger" type="submit" :disabled="!state.confirmed || state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Excluindo curso…' : 'Confirmar exclusão física' }}</button>
      </fieldset>
      <div class="account-actions"><RouterLink class="button-secondary" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId } }">{{ state.sending ? 'Sair da tela (a operação pode continuar)' : 'Cancelar e voltar aos cursos' }}</RouterLink><button class="button-link" type="button" :disabled="state.sending" @click="model.reload()">Atualizar curso (limpa a confirmação)</button></div>
      <p class="form-footnote">Nenhum DELETE é enviado ao abrir esta tela. Apenas a resposta 204 confirma a exclusão. Se a resposta se perder, consulte o curso antes de preparar outra confirmação; um GET 404 não será apresentado como sucesso desta tentativa. Sair durante o envio não garante cancelar a operação no servidor.</p>
    </form>
  </section>
</template>
