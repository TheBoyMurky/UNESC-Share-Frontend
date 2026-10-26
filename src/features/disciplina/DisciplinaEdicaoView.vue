<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createCursoService } from '@/features/curso/curso-service'
import { createInstituicaoService } from '@/features/instituicao/instituicao-service'
import { createDisciplinaEdicaoService } from './disciplina-edicao-service'
import { createDisciplinaEdicaoModel } from './disciplina-edicao-model'

const route = useRoute()
const model = createDisciplinaEdicaoModel(createDisciplinaEdicaoService(authenticatedJson), createCursoService(authenticatedJson), createInstituicaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
const state = shallowRef(model.getState()), feedback = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.instituicaoId, route.params.cursoId, route.params.disciplinaId, authState.value.status, authState.value.user?.id, authState.value.user?.perfil], ([institutionId, courseId, disciplineId]) => model.initialize(typeof institutionId === 'string' ? institutionId : '', typeof courseId === 'string' ? courseId : '', typeof disciplineId === 'string' ? disciplineId : ''), { immediate: true })
watch(() => [state.value.saved, state.value.error], async (values, previous) => { if (values.some((value, index) => value && value !== previous[index])) { await nextTick(); feedback.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="discipline-edit-title">
    <RouterLink class="material-back" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId || route.params.instituicaoId, cursoId: state.cursoId || route.params.cursoId } }">← Disciplinas do curso</RouterLink>
    <p class="eyebrow">Administração acadêmica</p><h1 id="discipline-edit-title" ref="feedback" tabindex="-1">Editar disciplina</h1>
    <div v-if="state.denied" class="form-alert" role="alert"><p>{{ state.error }}</p><RouterLink class="button-link" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId || route.params.instituicaoId, cursoId: state.cursoId || route.params.cursoId } }">Consultar disciplinas</RouterLink></div>
    <p v-else-if="state.loading" class="catalog-empty" role="status">Consultando disciplina e vínculos…</p>
    <div v-else-if="state.error && !state.disciplina" class="form-alert" role="alert"><p>{{ state.error }}</p><button class="button-link" type="button" @click="model.initialize(typeof route.params.instituicaoId === 'string' ? route.params.instituicaoId : '', typeof route.params.cursoId === 'string' ? route.params.cursoId : '', typeof route.params.disciplinaId === 'string' ? route.params.disciplinaId : '')">Tentar consultar novamente</button></div>
    <div v-else-if="state.saved && state.disciplina && state.curso && state.instituicao" class="material-created catalog-filters">
      <h2>Alterações salvas</h2><p role="status">A API confirmou a edição. Atualize os dados para consultar a versão atual.</p>
      <p class="form-footnote">{{ state.curso.nome }} · UUID da disciplina: <code>{{ state.id }}</code></p>
      <div class="account-actions"><button class="button-primary" type="button" @click="model.reload()">Atualizar disciplina</button><RouterLink class="button-secondary" :to="{ name: 'curso-disciplinas', params: { instituicaoId: state.instituicaoId, cursoId: state.cursoId } }">Consultar disciplinas</RouterLink></div>
    </div>
    <form v-else-if="state.disciplina && state.curso && state.instituicao" class="catalog-filters material-create-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
      <p class="form-description">Instituição: <strong>{{ state.instituicao.nome }} ({{ state.instituicao.sigla }})</strong><br>Curso: <strong>{{ state.curso.nome }}</strong>. O curso desta disciplina não pode ser transferido.</p>
      <div v-if="state.error" class="form-alert" role="alert"><p>{{ state.error }}</p><button v-if="state.uncertain || state.conflict" class="button-link" type="button" @click="model.reload()">Consultar disciplina atual</button></div>
      <fieldset :disabled="state.loading || state.sending || state.uncertain || state.conflict">
        <legend>Dados da disciplina</legend>
        <label for="discipline-edit-name">Nome</label><input id="discipline-edit-name" :value="state.draft.nome" maxlength="150" required :aria-invalid="!!state.fields.nome" aria-describedby="discipline-edit-name-error" @input="model.change('nome', ($event.target as HTMLInputElement).value)"><p v-if="state.fields.nome" id="discipline-edit-name-error" class="field-error">{{ state.fields.nome }}</p>
        <label for="discipline-edit-code">Código</label><input id="discipline-edit-code" :value="state.draft.codigo" maxlength="30" required :aria-invalid="!!state.fields.codigo" aria-describedby="discipline-edit-code-help discipline-edit-code-error" @input="model.change('codigo', ($event.target as HTMLInputElement).value)"><p id="discipline-edit-code-help" class="form-footnote">Até 30 caracteres; normalizado em maiúsculas e preservando zeros à esquerda.</p><p v-if="state.fields.codigo" id="discipline-edit-code-error" class="field-error">{{ state.fields.codigo }}</p>
        <label for="discipline-edit-description">Descrição ou ementa (opcional)</label><textarea id="discipline-edit-description" :value="state.draft.descricao" maxlength="1000" rows="5" :aria-invalid="!!state.fields.descricao" aria-describedby="discipline-edit-description-help discipline-edit-description-error" @input="model.change('descricao', ($event.target as HTMLTextAreaElement).value)"></textarea><p id="discipline-edit-description-help" class="form-footnote">Até 1000 caracteres. Não preencha ementas sem fonte oficial.</p><p v-if="state.fields.descricao" id="discipline-edit-description-error" class="field-error">{{ state.fields.descricao }}</p>
        <button class="button-primary" type="submit" :disabled="state.sending || state.uncertain || state.conflict">{{ state.sending ? 'Salvando…' : 'Salvar alterações' }}</button>
      </fieldset>
      <p class="form-footnote">O PUT envia os campos completos e mantém o curso atual. Sem controle de versão, edições simultâneas podem sobrescrever umas às outras. Sair durante o envio não garante cancelar a gravação.</p>
    </form>
  </section>
</template>
