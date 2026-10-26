<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { canAdminister } from '@/features/auth/permissions'
import { createInstituicaoService } from './instituicao-service'
import { createInstituicaoConsultaModel } from './instituicao-consulta-model'
const route = useRoute()
const model = createInstituicaoConsultaModel(createInstituicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id]) => { void model.loadDetail(typeof id === 'string' ? id : '') }, { immediate: true })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="institution-title">
    <RouterLink class="material-back" to="/instituicoes">← Instituições</RouterLink>
    <p class="eyebrow">Estrutura acadêmica</p><h1 id="institution-title" class="institution-text">{{ state.institution?.nome ?? 'Instituição' }}</h1>
    <div :aria-busy="state.loading">
      <p v-if="state.loading" class="catalog-empty" role="status">Consultando instituição…</p>
      <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button><RouterLink v-else class="button-link" to="/instituicoes">Consultar lista atual</RouterLink></div>
      <template v-else-if="state.institution">
        <dl class="account-details"><div><dt>Nome</dt><dd>{{ state.institution.nome }}</dd></div><div><dt>Sigla</dt><dd>{{ state.institution.sigla }}</dd></div></dl>
        <RouterLink v-if="authState.status === 'authenticated' && canAdminister(authState.user)" class="button-primary" :to="{ name: 'instituicao-edicao', params: { id: state.institution.id } }">Editar instituição</RouterLink>
        <RouterLink v-if="authState.status === 'authenticated' && canAdminister(authState.user)" class="button-secondary" :to="{ name: 'instituicao-exclusao', params: { id: state.institution.id } }">Excluir instituição</RouterLink>
        <RouterLink class="button-secondary" :to="{ name: 'instituicao-cursos', params: { id: state.institution.id } }">Consultar cursos desta instituição ↗</RouterLink>
        <button class="button-secondary" type="button" @click="model.reload()">Atualizar instituição</button>
      </template>
    </div>
  </section>
</template>
