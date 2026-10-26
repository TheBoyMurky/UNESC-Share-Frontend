<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { canAdminister } from '@/features/auth/permissions'
import { createInstituicaoService } from '@/features/instituicao/instituicao-service'
import { createCursoService } from './curso-service'
import { createCursoConsultaModel } from './curso-consulta-model'
const route = useRoute()
const model = createCursoConsultaModel(createCursoService(authenticatedJson), createInstituicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([id]) => model.load(typeof id === 'string' ? id : ''), { immediate: true })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="courses-title">
    <RouterLink class="material-back" :to="{ name: 'instituicao', params: { id: state.instituicaoId || route.params.id } }">← Instituição</RouterLink>
    <p class="eyebrow">Estrutura acadêmica</p><h1 id="courses-title">{{ state.instituicao?.nome ? `Cursos — ${state.instituicao.nome}` : 'Cursos da instituição' }}</h1>
    <p v-if="state.instituicao" class="form-footnote">{{ state.instituicao.sigla }} · <code>{{ state.instituicao.id }}</code></p>
    <RouterLink v-if="canAdminister(authState.user) && state.instituicao" class="button-primary" :to="{ name: 'curso-cadastro', params: { id: state.instituicao.id } }">Cadastrar curso ↗</RouterLink>
    <div class="reports-toolbar"><label for="courses-size">Cursos por página <select id="courses-size" :value="state.size" :disabled="state.loading || state.unavailable" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label><button class="button-secondary" type="button" :disabled="state.loading || state.unavailable" @click="model.reload()">Atualizar lista</button></div>
    <div :aria-busy="state.loading">
      <p v-if="state.loading" class="catalog-empty" role="status">Consultando cursos…</p>
      <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button><RouterLink v-else class="button-link" to="/instituicoes">Consultar instituições</RouterLink></div>
      <template v-else-if="state.data">
        <p class="form-footnote">{{ state.data.page.totalElements }} cursos nesta consulta</p>
        <p v-if="!state.data.content.length" class="catalog-empty">Nenhum curso cadastrado para este vínculo.</p>
        <ul v-else class="material-list"><li v-for="course in state.data.content" :key="course.id" class="material-summary"><h2 class="institution-text">{{ course.nome }}</h2><p v-if="course.descricao" class="institution-text">{{ course.descricao }}</p><p class="form-footnote">UUID: <code>{{ course.id }}</code></p><div class="account-actions"><RouterLink class="button-link" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId, cursoId: course.id } }">Ver disciplinas</RouterLink><template v-if="canAdminister(authState.user)"><RouterLink class="button-link" :to="{ name: 'curso-edicao', params: { instituicaoId: state.instituicaoId, id: course.id } }">Editar curso</RouterLink><RouterLink class="button-link" :to="{ name: 'curso-exclusao', params: { instituicaoId: state.instituicaoId, id: course.id } }">Excluir curso</RouterLink></template></div></li></ul>
        <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas dos cursos"><button class="button-secondary" type="button" :disabled="state.data.page.number === 0" @click="model.goToPage(state.data.page.number - 1)">Anterior</button><span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span><button class="button-secondary" type="button" :disabled="state.data.page.number + 1 >= state.data.page.totalPages" @click="model.goToPage(state.data.page.number + 1)">Próxima</button></nav>
      </template>
    </div>
  </section>
</template>
