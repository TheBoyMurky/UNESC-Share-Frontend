<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { canAdminister } from '@/features/auth/permissions'
import { createCursoService } from '@/features/curso/curso-service'
import { createInstituicaoService } from '@/features/instituicao/instituicao-service'
import { createDisciplinaService } from './disciplina-service'
import { createDisciplinaConsultaModel } from './disciplina-consulta-model'

const route = useRoute()
const model = createDisciplinaConsultaModel(createDisciplinaService(authenticatedJson), createCursoService(authenticatedJson), createInstituicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.instituicaoId, route.params.cursoId, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([institutionId, courseId]) => model.load(typeof institutionId === 'string' ? institutionId : '', typeof courseId === 'string' ? courseId : ''), { immediate: true })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="disciplines-title">
    <RouterLink class="material-back" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId || route.params.instituicaoId } }">← Cursos</RouterLink>
    <p class="eyebrow">Estrutura acadêmica</p>
    <h1 id="disciplines-title">{{ state.curso?.nome ? `Disciplinas — ${state.curso.nome}` : 'Disciplinas do curso' }}</h1>
    <p v-if="state.instituicao && state.curso" class="form-footnote">{{ state.instituicao.nome }} ({{ state.instituicao.sigla }}) · <code>{{ state.curso.id }}</code></p>
    <RouterLink v-if="canAdminister(authState.user) && state.instituicao && state.curso" class="button-primary" :to="{ name: 'disciplina-cadastro', params: { instituicaoId: state.instituicaoId, cursoId: state.cursoId } }">Cadastrar disciplina ↗</RouterLink>
    <div class="reports-toolbar">
      <label for="disciplines-size">Disciplinas por página <select id="disciplines-size" :value="state.size" :disabled="state.loading || state.unavailable" @change="model.setSize(Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label>
      <button class="button-secondary" type="button" :disabled="state.loading || state.unavailable" @click="model.reload()">Atualizar lista</button>
    </div>
    <div :aria-busy="state.loading">
      <p v-if="state.loading" class="catalog-empty" role="status">Consultando disciplinas…</p>
      <div v-else-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.reload()">Tentar carregar novamente</button><RouterLink v-else class="button-link" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId || route.params.instituicaoId } }">Voltar aos cursos</RouterLink></div>
      <template v-else-if="state.data">
        <p class="form-footnote">{{ state.data.page.totalElements }} disciplinas neste curso</p>
        <p v-if="!state.data.content.length" class="catalog-empty">Nenhuma disciplina cadastrada para este curso.</p>
        <ul v-else class="material-list">
          <li v-for="discipline in state.data.content" :key="discipline.id" class="material-summary">
            <h2 class="institution-text">{{ discipline.nome }}</h2>
            <p class="form-footnote">Código: <code>{{ discipline.codigo }}</code></p>
            <p v-if="discipline.descricao" class="institution-text">{{ discipline.descricao }}</p>
            <div v-if="canAdminister(authState.user)" class="account-actions"><RouterLink class="button-link" :to="{ name: 'disciplina-edicao', params: { instituicaoId: state.instituicaoId, cursoId: state.cursoId, disciplinaId: discipline.id } }">Editar disciplina</RouterLink><RouterLink class="button-link" :to="{ name: 'disciplina-exclusao', params: { instituicaoId: state.instituicaoId, cursoId: state.cursoId, disciplinaId: discipline.id } }">Excluir disciplina</RouterLink></div>
          </li>
        </ul>
        <nav v-if="state.data.page.totalPages > 1" class="catalog-pagination" aria-label="Páginas das disciplinas">
          <button class="button-secondary" type="button" :disabled="state.data.page.number === 0" @click="model.goToPage(state.data.page.number - 1)">Anterior</button>
          <span>Página {{ state.data.page.number + 1 }} de {{ state.data.page.totalPages }}</span>
          <button class="button-secondary" type="button" :disabled="state.data.page.number + 1 >= state.data.page.totalPages" @click="model.goToPage(state.data.page.number + 1)">Próxima</button>
        </nav>
      </template>
    </div>
  </section>
</template>
