<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authState } from '@/features/auth/auth'
import { createDenunciaService, motivos, motivoLabel } from './denuncia-service'
import { createDenunciaCadastroModel } from './denuncia-cadastro-model'

const route = useRoute()
const model = createDenunciaCadastroModel(createDenunciaService(authenticatedJson), () => authState.value.user?.id ?? null)
const state = shallowRef(model.getState()), successHeading = ref<HTMLElement | null>(null)
const unsubscribe = model.subscribe(value => { state.value = value })
watch(() => [route.params.id, authState.value.user?.id], () => { void model.load(typeof route.params.id === 'string' ? route.params.id : '') }, { immediate: true })
watch(() => state.value.createdId, async id => { if (id) { await nextTick(); successHeading.value?.focus() } })
onBeforeUnmount(() => { unsubscribe(); model.dispose() })
</script>

<template>
  <section class="catalog-page container" aria-labelledby="report-create-title">
    <RouterLink class="material-back" to="/minhas-denuncias">Minhas denúncias ↗</RouterLink>
    <p class="eyebrow">Relatar um problema</p><h1 id="report-create-title">Cadastrar denúncia</h1>
    <p class="catalog-description">Selecione o motivo e descreva o problema. A denúncia será analisada e não bloqueia nem remove o Material automaticamente.</p>
    <p v-if="state.loading" class="catalog-empty" role="status">Consultando o material…</p>
    <div v-else-if="state.loadError" class="form-alert" role="alert"><p>{{ state.loadError }}</p><button v-if="!state.unavailable" class="button-link" type="button" @click="model.retry()">Tentar carregar novamente</button><RouterLink v-else class="button-link" to="/materiais">Voltar ao catálogo</RouterLink></div>
    <div v-else-if="state.createdId" class="report-success" role="status">
      <h2 ref="successHeading" tabindex="-1">Denúncia registrada</h2><p>Seu relato foi cadastrado como pendente. Acompanhe o estado pelas suas denúncias.</p>
      <div class="account-actions"><RouterLink class="button-primary" :to="{ name: 'denuncia', params: { id: state.createdId } }">Consultar meu relato ↗</RouterLink><RouterLink class="button-secondary" to="/minhas-denuncias">Minhas denúncias</RouterLink></div>
    </div>
    <template v-else-if="state.material">
      <div class="report-target"><h2>{{ state.material.titulo }}</h2><p>Material: <code>{{ state.material.id }}</code></p><RouterLink class="button-link" :to="{ name: 'material', params: { id: state.material.id } }">Voltar aos detalhes</RouterLink></div>
      <p class="catalog-notice">É permitida uma denúncia aberta sua por Material, mesmo com motivos diferentes. Depois de concluída, um novo relato pode ser cadastrado. Não há edição, cancelamento ou exclusão do relato por esta tela.</p>
      <form class="catalog-filters report-form" :aria-busy="state.sending" @submit.prevent="model.submit()">
        <fieldset :disabled="state.sending || !!state.blocked">
          <legend>Seu relato</legend>
          <label for="report-reason">Motivo</label><select id="report-reason" required :value="state.draft.motivo" :aria-invalid="!!state.errors.motivo" aria-describedby="report-reason-error" @change="model.changeField('motivo', ($event.target as HTMLSelectElement).value)"><option value="" disabled>Selecione um motivo</option><option v-for="motivo in motivos" :key="motivo" :value="motivo">{{ motivoLabel[motivo] }}</option></select>
          <p v-if="state.errors.motivo" id="report-reason-error" class="field-error">{{ state.errors.motivo }}</p>
          <label for="report-description">Descrição do problema</label><textarea id="report-description" required maxlength="2000" rows="7" autocomplete="off" :value="state.draft.descricao" :aria-invalid="!!state.errors.descricao" aria-describedby="report-description-hint report-description-error" @input="model.changeField('descricao', ($event.target as HTMLTextAreaElement).value)" />
          <p id="report-description-hint" class="form-footnote">{{ state.draft.descricao.length }}/2000 caracteres. Descrição obrigatória em todos os motivos. Use texto simples, sem anexos ou dados pessoais desnecessários.</p>
          <p v-if="state.errors.descricao" id="report-description-error" class="field-error">{{ state.errors.descricao }}</p>
          <button class="button-primary" type="submit">{{ state.sending ? 'Enviando relato…' : 'Cadastrar denúncia' }}</button>
        </fieldset>
        <p v-if="state.error" class="form-alert" role="alert">{{ state.error }}</p>
        <div v-if="state.blocked" class="catalog-notice"><p>O reenvio está bloqueado nesta tela. Confira seus relatos; se ainda precisar de outra tentativa, reabra o cadastro pelo Material.</p><RouterLink class="button-link" to="/minhas-denuncias">Conferir Minhas denúncias ↗</RouterLink></div>
        <p class="form-footnote">Sair descarta o rascunho. Sair durante o envio não garante cancelar a gravação. Não é necessário enviar arquivos acadêmicos para relatar o problema.</p>
      </form>
    </template>
  </section>
</template>
