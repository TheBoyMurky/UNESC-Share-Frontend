<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedDelete, authenticatedJson, authState } from '@/features/auth/auth'
import { createInstituicaoExclusaoService } from './instituicao-exclusao-service'
import { createInstituicaoExclusaoModel } from './instituicao-exclusao-model'
const route = useRoute()
const model = createInstituicaoExclusaoModel(createInstituicaoExclusaoService(authenticatedJson, authenticatedDelete), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id]) => { void model.load(typeof id === 'string' ? id : '') }, { immediate: true })
watch(() => [state.value.deleted, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="institution-delete-title">
    <RouterLink class="material-back" to="/instituicoes">← Instituições</RouterLink>
    <p class="eyebrow">Administração acadêmica</p><h1 id="institution-delete-title">Excluir instituição</h1>
    <p v-if="state.loading" class="catalog-empty" role="status">Consultando a instituição antes da confirmação…</p>
    <div v-else-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/instituicoes">Consultar instituições</RouterLink></div>
    <div v-else-if="state.loadError" class="form-alert" role="alert"><p>{{ state.loadError }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.reload()">Consultar novamente</button><RouterLink v-else class="button-link" to="/instituicoes">Voltar à lista</RouterLink></div>
    <div v-else-if="state.deleted && state.institution" class="material-created catalog-filters">
      <h2 ref="feedback" tabindex="-1">Exclusão confirmada</h2>
      <p role="status">A API confirmou a exclusão física da instituição. Esta operação não tem restauração.</p>
      <p>{{ state.institution.nome }} ({{ state.institution.sigla }})</p>
      <RouterLink class="button-primary" to="/instituicoes">Voltar às instituições</RouterLink>
    </div>
    <form v-else-if="state.institution" class="catalog-filters material-remove-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <h2>Confira o registro</h2>
      <p class="remove-target">{{ state.institution.nome }} ({{ state.institution.sigla }})</p>
      <p class="form-description">UUID: <code>{{ state.institution.id }}</code></p>
      <p class="catalog-notice">A exclusão é física e não pode ser desfeita. A API impede a operação quando houver cursos vinculados (HTTP 409); nenhum curso ou dado será apagado em cascata.</p>
      <div v-if="state.error" ref="feedback" class="form-alert" role="alert" tabindex="-1">
        <p>{{ state.error }}</p>
        <button v-if="state.conflict || state.uncertain" class="button-link" type="button" @click="model.reload()">Consultar dados atuais antes de decidir novamente</button>
      </div>
      <fieldset :disabled="state.sending || state.uncertain || state.conflict">
        <legend>Confirmação obrigatória</legend>
        <label class="removal-confirmation" for="institution-delete-confirm"><input id="institution-delete-confirm" type="checkbox" :checked="state.confirmed" required @change="model.setConfirmed(($event.target as HTMLInputElement).checked)"><span>Confirmo a exclusão física desta instituição e entendo que não há restauração.</span></label>
        <button class="button-primary button-danger" type="submit" :disabled="!state.confirmed || state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Excluindo instituição…' : 'Confirmar exclusão física' }}</button>
      </fieldset>
      <div class="account-actions"><RouterLink class="button-secondary" :to="{ name: 'instituicao', params: { id: state.institution.id } }">{{ state.sending ? 'Sair da tela (a operação pode continuar)' : 'Cancelar e voltar ao detalhe' }}</RouterLink><button class="button-link" type="button" :disabled="state.sending" @click="model.reload()">Atualizar instituição (limpa a confirmação)</button></div>
      <p class="form-footnote">Nenhum DELETE é enviado ao abrir esta tela. O resultado 204 confirma a exclusão. Se a resposta for perdida, consulte a instituição antes de preparar outra confirmação; uma resposta 404 não será apresentada como sucesso desta tentativa. Sair durante o envio não garante cancelar a operação no servidor.</p>
    </form>
  </section>
</template>
