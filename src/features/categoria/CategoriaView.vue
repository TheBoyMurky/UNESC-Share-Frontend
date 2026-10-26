<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { canAdminister } from '@/features/auth/permissions'
import { createCategoriaService } from './categoria-service'
import { createCategoriaConsultaModel } from './categoria-consulta-model'

const route = useRoute()
const model = createCategoriaConsultaModel(createCategoriaService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id]) => { void model.loadDetail(typeof id === 'string' ? id : '') }, { immediate: true })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="category-title">
    <RouterLink class="material-back" to="/categorias">← Categorias</RouterLink>
    <p class="eyebrow">Classificação dos materiais</p><h1 id="category-title" class="institution-text">{{ state.categoria?.nome ?? 'Categoria' }}</h1>
    <div :aria-busy="state.loading">
      <p v-if="state.loading" class="catalog-empty" role="status">Consultando categoria…</p>
      <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button><RouterLink v-else class="button-link" to="/categorias">Consultar lista atual</RouterLink></div>
      <template v-else-if="state.categoria">
        <dl class="account-details"><div><dt>Nome</dt><dd>{{ state.categoria.nome }}</dd></div><div><dt>Descrição</dt><dd>{{ state.categoria.descricao || 'Sem descrição cadastrada.' }}</dd></div></dl>
        <RouterLink v-if="canAdminister(authState.user)" class="button-primary" :to="{ name: 'categoria-edicao', params: { id: state.categoria.id } }">Editar categoria</RouterLink>
        <RouterLink v-if="canAdminister(authState.user)" class="button-primary button-danger" :to="{ name: 'categoria-exclusao', params: { id: state.categoria.id } }">Excluir categoria</RouterLink>
        <button class="button-secondary" type="button" @click="model.reload()">Atualizar categoria</button>
      </template>
    </div>
  </section>
</template>
