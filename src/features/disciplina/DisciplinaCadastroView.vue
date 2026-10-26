<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createCursoService } from '@/features/curso/curso-service'
import { createInstituicaoService } from '@/features/instituicao/instituicao-service'
import { createDisciplinaCadastroService } from './disciplina-cadastro-service'
import { createDisciplinaCadastroModel } from './disciplina-cadastro-model'

const route = useRoute()
const model = createDisciplinaCadastroModel(createDisciplinaCadastroService(authenticatedJson), createCursoService(authenticatedJson), createInstituicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.instituicaoId, route.params.cursoId, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([institutionId, courseId]) => { void model.initialize(typeof institutionId === 'string' ? institutionId : '', typeof courseId === 'string' ? courseId : '') }, { immediate: true })
watch(() => [state.value.savedId, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="discipline-create-title">
    <RouterLink class="material-back" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId || route.params.instituicaoId, cursoId: state.cursoId || route.params.cursoId } }">← Disciplinas do curso</RouterLink>
    <p class="eyebrow">Administração acadêmica</p><h1 id="discipline-create-title" ref="feedback" tabindex="-1">Cadastrar disciplina</h1>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" to="/instituicoes">Consultar instituições</RouterLink></div>
    <p v-else-if="state.loading" class="catalog-empty" role="status">Validando instituição e curso…</p>
    <div v-else-if="state.unavailable" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" :to="{ name: 'instituicao-cursos', params: { id: state.instituicaoId || route.params.instituicaoId } }">Consultar cursos</RouterLink></div>
    <div v-else-if="state.error && !state.curso" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.initialize(typeof route.params.instituicaoId === 'string' ? route.params.instituicaoId : '', typeof route.params.cursoId === 'string' ? route.params.cursoId : '')">Tentar consultar novamente</button></div>
    <div v-else-if="state.savedId && state.instituicao && state.curso" class="material-created catalog-filters">
      <h2>Disciplina cadastrada</h2><p role="status">A API confirmou o cadastro. Consulte a lista para carregar os dados atuais.</p>
      <p class="form-footnote">{{ state.instituicao.nome }} · {{ state.curso.nome }} · UUID: <code>{{ state.savedId }}</code></p>
      <RouterLink class="button-primary" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId, cursoId: state.cursoId } }">Consultar disciplinas</RouterLink>
    </div>
    <form v-else-if="state.instituicao && state.curso" class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <p class="form-description">Instituição: <strong>{{ state.instituicao.nome }} ({{ state.instituicao.sigla }})</strong><br>Curso: <strong>{{ state.curso.nome }}</strong>. O vínculo é fixado pelas referências da rota.</p>
      <div v-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink v-if="state.conflict || state.uncertain" class="button-link" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId, cursoId: state.cursoId } }">Consultar disciplinas existentes</RouterLink></div>
      <fieldset :disabled="state.sending || state.uncertain">
        <legend>Dados da disciplina</legend>
        <label for="discipline-name">Nome</label><input id="discipline-name" :value="state.draft.nome" maxlength="150" required :aria-invalid="!!state.fields.nome" aria-describedby="discipline-name-error" @input="model.change('nome', ($event.target as HTMLInputElement).value)"><p v-if="state.fields.nome" id="discipline-name-error" class="field-error">{{ state.fields.nome }}</p>
        <label for="discipline-code">Código</label><input id="discipline-code" :value="state.draft.codigo" maxlength="30" required :aria-invalid="!!state.fields.codigo" aria-describedby="discipline-code-help discipline-code-error" @input="model.change('codigo', ($event.target as HTMLInputElement).value)"><p id="discipline-code-help" class="form-footnote">Até 30 caracteres. O código é enviado em maiúsculas e preserva zeros à esquerda.</p><p v-if="state.fields.codigo" id="discipline-code-error" class="field-error">{{ state.fields.codigo }}</p>
        <label for="discipline-description">Descrição ou ementa (opcional)</label><textarea id="discipline-description" :value="state.draft.descricao" maxlength="1000" rows="5" :aria-invalid="!!state.fields.descricao" aria-describedby="discipline-description-help discipline-description-error" @input="model.change('descricao', ($event.target as HTMLTextAreaElement).value)"></textarea><p id="discipline-description-help" class="form-footnote">Até 1000 caracteres. Deixe vazia quando não houver descrição oficial disponível.</p><p v-if="state.fields.descricao" id="discipline-description-error" class="field-error">{{ state.fields.descricao }}</p>
        <button class="button-primary" type="submit" :disabled="state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Cadastrando disciplina…' : 'Cadastrar disciplina' }}</button>
      </fieldset>
      <button v-if="state.uncertain" class="button-secondary" type="button" @click="model.prepareNew()">Descartar rascunho e preparar outro cadastro</button>
      <p class="form-footnote">O código precisa ser único neste curso. Se a resposta do servidor se perder, o cadastro pode ter ocorrido: não reenvie o mesmo formulário. Descartar o rascunho não consulta nem altera registros no servidor.</p>
    </form>
  </section>
</template>
