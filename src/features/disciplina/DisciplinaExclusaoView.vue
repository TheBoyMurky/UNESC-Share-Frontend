<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedDelete, authenticatedJson, authState } from '@/features/auth/auth'
import { createDisciplinaExclusaoService } from './disciplina-exclusao-service'
import { createDisciplinaExclusaoModel } from './disciplina-exclusao-model'

const route = useRoute()
const model = createDisciplinaExclusaoModel(createDisciplinaExclusaoService(authenticatedJson, authenticatedDelete), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.instituicaoId, route.params.cursoId, route.params.disciplinaId, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([institutionId, courseId, disciplineId]) => model.load(typeof institutionId === 'string' ? institutionId : '', typeof courseId === 'string' ? courseId : '', typeof disciplineId === 'string' ? disciplineId : ''), { immediate: true })
watch(() => [state.value.deleted, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="discipline-delete-title">
    <RouterLink class="material-back" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId || route.params.instituicaoId, cursoId: state.cursoId || route.params.cursoId } }">← Disciplinas do curso</RouterLink>
    <p class="eyebrow">Administração acadêmica</p><h1 id="discipline-delete-title">Excluir disciplina</h1>
    <p v-if="state.loading" class="catalog-empty" role="status">Consultando disciplina e vínculos antes da confirmação…</p>
    <div v-else-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/instituicoes">Consultar instituições</RouterLink></div>
    <div v-else-if="state.loadError" class="form-alert" role="alert"><p>{{ state.loadError }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.load(typeof route.params.instituicaoId === 'string' ? route.params.instituicaoId : '', typeof route.params.cursoId === 'string' ? route.params.cursoId : '', typeof route.params.disciplinaId === 'string' ? route.params.disciplinaId : '')">Consultar novamente</button><RouterLink v-else class="button-link" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId || route.params.instituicaoId, cursoId: state.cursoId || route.params.cursoId } }">Voltar à lista de disciplinas</RouterLink></div>
    <div v-else-if="state.deleted && state.disciplina && state.curso && state.instituicao" class="material-created catalog-filters">
      <h2 ref="feedback" tabindex="-1">Exclusão confirmada</h2>
      <p role="status">A API confirmou a exclusão física da disciplina. Esta operação não tem restauração.</p>
      <p>{{ state.disciplina.nome }} · {{ state.disciplina.codigo }} · UUID: <code>{{ state.disciplina.id }}</code></p>
      <RouterLink class="button-primary" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId, cursoId: state.cursoId } }">Voltar às disciplinas</RouterLink>
    </div>
    <form v-else-if="state.disciplina && state.curso && state.instituicao" class="catalog-filters material-remove-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <h2>Confira o registro</h2>
      <p class="remove-target">{{ state.disciplina.nome }}</p>
      <p class="form-description">Código: <code>{{ state.disciplina.codigo }}</code> · {{ state.curso.nome }} · {{ state.instituicao.nome }}</p>
      <p v-if="state.disciplina.descricao" class="institution-text">{{ state.disciplina.descricao }}</p>
      <p class="catalog-notice">A exclusão é física e não pode ser desfeita. A API impede a exclusão com HTTP 409 se houver qualquer material vinculado, inclusive com estado REMOVIDO. Nenhum material ou conteúdo será apagado em cascata.</p>
      <div v-if="state.error" ref="feedback" class="form-alert" role="alert" tabindex="-1">
        <p>{{ state.error }}</p>
        <button v-if="state.conflict || state.uncertain" class="button-link" type="button" @click="model.reload()">Consultar dados atuais antes de decidir novamente</button>
      </div>
      <fieldset :disabled="state.sending || state.uncertain || state.conflict">
        <legend>Confirmação obrigatória</legend>
        <label class="removal-confirmation" for="discipline-delete-confirm"><input id="discipline-delete-confirm" type="checkbox" :checked="state.confirmed" required @change="model.setConfirmed(($event.target as HTMLInputElement).checked)"><span>Confirmo a exclusão física desta disciplina e entendo que ela não pode ser restaurada.</span></label>
        <button class="button-primary button-danger" type="submit" :disabled="!state.confirmed || state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Excluindo disciplina…' : 'Confirmar exclusão física' }}</button>
      </fieldset>
      <div class="account-actions"><RouterLink class="button-secondary" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId, cursoId: state.cursoId } }">{{ state.sending ? 'Sair da tela (a operação pode continuar)' : 'Cancelar e voltar às disciplinas' }}</RouterLink><button class="button-link" type="button" :disabled="state.sending" @click="model.reload()">Atualizar disciplina (limpa a confirmação)</button></div>
      <p class="form-footnote">Nenhum DELETE é enviado ao abrir esta tela. Apenas a resposta 204 confirma a exclusão. Se a resposta se perder, consulte a disciplina antes de preparar outra confirmação; um GET 404 não será apresentado como sucesso desta tentativa. Sair durante o envio não garante cancelar a operação no servidor.</p>
    </form>
  </section>
</template>
