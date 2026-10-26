<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { authenticatedJson, authenticatedTorrent, authState } from '@/features/auth/auth'
import { canEditMaterial } from './material-edicao-service'
import { canAddMaterialMagnets } from './material-magnet-adicao-service'
import { canAddMaterialTorrent } from './material-torrent-adicao-service'
import { canRemoveMaterial } from './material-remocao-service'
import { createMaterialService, type MaterialStatus } from './material-service'
import { createMaterialModel } from './material-model'
import { createBrowserActions } from './browser-actions'
import ComentariosSection from '@/features/comentario/ComentariosSection.vue'
import AvaliacoesSection from '@/features/avaliacao/AvaliacoesSection.vue'
import { createMaterialDecisaoModel } from '@/features/moderacao/material-decisao-model'
import { createMaterialDecisaoService } from '@/features/moderacao/material-decisao-service'
import MaterialDecisaoPanel from '@/features/moderacao/MaterialDecisaoPanel.vue'
import ComentariosModeracaoSection from '@/features/moderacao/ComentariosModeracaoSection.vue'

// O wrapper da rota de revisao fixa review=true e evita reutilizar a instancia da rota comum.
const props = withDefaults(defineProps<{ review?: boolean }>(), { review: false })
const route = useRoute()
const actions = createBrowserActions()
const service = createMaterialService(authenticatedJson, authenticatedTorrent)
const moderation = props.review
  ? createMaterialDecisaoModel(service, actions, createMaterialDecisaoService(authenticatedJson), () => authState.value.status === 'authenticated' ? authState.value.user : null)
  : null
const model = moderation ?? createMaterialModel(service, actions)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
const decision = shallowRef(moderation?.getDecisionState())
const unsubscribeDecision = moderation?.subscribeDecision(value => { decision.value = value })
const labels: Record<MaterialStatus, string> = { PENDENTE: 'Pendente', PUBLICADO: 'Publicado', BLOQUEADO: 'Bloqueado', REMOVIDO: 'Removido' }
const dateLabel = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
const bytesLabel = (value: number) => value < 1024 ? `${value} bytes` : `${(value / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} KiB`
watch(() => [route.params.id, ...(props.review ? [authState.value.status, authState.value.user?.id, authState.value.user?.perfil] : [])], () => {
  void model.load(typeof route.params.id === 'string' ? route.params.id : '')
}, { immediate: true })
onBeforeUnmount(() => { unsubscribe(); unsubscribeDecision?.(); model.dispose(); actions.dispose() })
</script>

<template>
  <section class="material-page container" aria-labelledby="material-title">
    <RouterLink class="material-back" :to="review ? '/moderacao/materiais' : '/materiais'">{{ review ? '← Voltar à fila de pendentes' : '← Voltar ao catálogo' }}</RouterLink>
    <p v-if="decision?.message" class="catalog-notice" role="status">{{ decision.message }}</p>
    <div v-if="state.loading" class="catalog-empty" role="status"><h1 id="material-title">{{ review ? 'Carregando revisão…' : 'Carregando material…' }}</h1></div>
    <div v-else-if="state.error" class="catalog-empty"><h1 id="material-title">{{ review ? 'Revisão indisponível' : 'Material indisponível' }}</h1><p role="alert">{{ state.error }}</p><button class="button-secondary" type="button" @click="model.retry()">Tentar novamente</button></div>
    <template v-else-if="state.material">
      <div class="material-title-row"><p class="eyebrow">{{ review ? 'Revisão da equipe' : 'Material acadêmico' }}</p><span class="stage-label">{{ labels[state.material.status] }}</span></div>
      <h1 id="material-title">{{ state.material.titulo }}</h1>
      <RouterLink v-if="!review && state.material.status === 'PUBLICADO'" class="button-link" :to="{ name: 'denuncia-cadastro', params: { id: state.material.id } }">Relatar problema neste material ↗</RouterLink>
      <RouterLink v-if="!review && canEditMaterial(state.material, authState.user?.id)" class="button-link" :to="{ name: 'material-edicao', params: { id: state.material.id } }">Editar meus metadados ↗</RouterLink>
      <RouterLink v-if="!review && canAddMaterialMagnets(state.material, authState.user?.id)" class="button-link" :to="{ name: 'material-magnet-adicao', params: { id: state.material.id } }">Adicionar Magnets ↗</RouterLink>
      <RouterLink v-if="!review && canAddMaterialTorrent(state.material, authState.user?.id)" class="button-link" :to="{ name: 'material-torrent-adicao', params: { id: state.material.id } }">Adicionar .torrent ↗</RouterLink>
      <RouterLink v-if="!review && canRemoveMaterial(state.material, authState.user?.id)" class="button-link removal-link" :to="{ name: 'material-remocao', params: { id: state.material.id } }">Revisar remoção do meu material ↗</RouterLink>
      <p class="material-date">Cadastrado em {{ dateLabel(state.material.dataCadastro) }} (UTC) · {{ state.material.visualizacoes }} visualizações</p>
      <div v-if="review" class="catalog-notice">
        <p>Confira metadados e mecanismos antes de escolher uma decisão.</p>
        <p v-if="state.material.usuarioId.toLowerCase() === authState.user?.id?.toLowerCase()">Este material foi cadastrado por você.</p>
        <p v-if="state.material.status !== 'PENDENTE'">O estado atual é {{ labels[state.material.status] }}. O registro não está mais pendente nesta consulta.</p>
        <p>O registro pode mudar em outra aba. Recarregue para conferir os dados atuais.</p>
        <button class="button-link" type="button" :disabled="decision?.sending" @click="model.retry()">Recarregar revisão</button>
      </div>
      <MaterialDecisaoPanel v-if="moderation && decision" :state="decision" :can-publish="moderation.canChoose('publicar')" :can-block="moderation.canChoose('bloquear')" @choose="moderation.choose" @confirm="moderation.setConfirmed" @submit="moderation.submit" @cancel="moderation.cancel" @reload="moderation.retry" />
      <p v-if="state.material.status !== 'PUBLICADO'" class="catalog-notice">Registro não publicado. A API autorizou esta consulta; a visibilidade é conferida novamente em cada download.</p>
      <div class="material-description"><h2>Sobre este material</h2><p>{{ state.material.descricao }}</p></div>
      <section class="material-academic" aria-labelledby="academic-title" :aria-busy="state.academicLoading">
        <h2 id="academic-title">Organização acadêmica</h2>
        <p v-if="state.academicLoading" role="status">Carregando os vínculos acadêmicos…</p>
        <div v-else-if="state.academicError" class="form-alert" role="alert"><p>{{ state.academicError }} Os mecanismos abaixo continuam disponíveis conforme a API.</p><button class="button-link" type="button" :disabled="!!decision?.action" @click="model.loadAcademic()">Tentar carregar vínculos novamente</button></div>
        <dl v-else-if="state.academic" class="material-academic-grid"><div><dt>Instituição</dt><dd>{{ state.academic.instituicao }}</dd></div><div><dt>Curso</dt><dd>{{ state.academic.curso }}</dd></div><div><dt>Disciplina</dt><dd>{{ state.academic.codigo }} — {{ state.academic.disciplina }}</dd></div><div><dt>Categoria</dt><dd>{{ state.academic.categoria }}</dd></div></dl>
      </section>
      <section class="sharing-section" aria-labelledby="sharing-title">
        <p class="eyebrow">Compartilhamento BitTorrent</p><h2 id="sharing-title">Escolha como acessar.</h2>
        <p class="catalog-description">Os arquivos .torrent são metadados, não o conteúdo acadêmico. Para obter o material, use um cliente BitTorrent compatível. Compartilhe somente conteúdos autorizados.</p>
        <h3 class="mechanism-heading">Arquivos .torrent <span>({{ state.material.torrents.length }})</span></h3>
        <p v-if="!state.material.torrents.length" class="form-footnote">Nenhum arquivo .torrent associado a este registro.</p>
        <ul v-else class="mechanism-list"><li v-for="torrent in state.material.torrents" :key="torrent.id" class="mechanism-card">
          <h4>{{ torrent.nomeArquivo }}</h4><p>{{ bytesLabel(torrent.tamanho) }} de metainfo · Cadastrado em {{ dateLabel(torrent.dataCadastro) }} (UTC)</p>
          <div class="info-hash"><span>Info Hash</span><code>{{ torrent.infoHash }}</code></div>
          <button class="button-primary" type="button" :disabled="state.downloads[torrent.id]?.loading || !!decision?.action" @click="model.download(torrent.id)">{{ state.downloads[torrent.id]?.loading ? 'Recebendo metadados…' : 'Baixar .torrent' }} <span aria-hidden="true">↓</span></button>
          <p v-if="state.downloads[torrent.id]?.error" class="mechanism-error" role="alert">{{ state.downloads[torrent.id]?.error }}</p>
          <p v-else-if="state.downloads[torrent.id]?.message" class="form-footnote" role="status">{{ state.downloads[torrent.id]?.message }}</p>
        </li></ul>
        <h3 class="mechanism-heading">Magnet URIs <span>({{ state.material.magnets.length }})</span></h3>
        <p v-if="!state.material.magnets.length" class="form-footnote">Nenhum Magnet associado a este registro.</p>
        <ul v-else class="mechanism-list"><li v-for="magnet in state.material.magnets" :key="magnet.id" class="mechanism-card">
          <h4>Magnet · {{ magnet.infoHash.length === 64 ? 'v2 SHA-256' : 'v1' }}</h4>
          <div class="info-hash"><span>Info Hash</span><code>{{ magnet.infoHash }}</code></div>
          <div class="mechanism-actions"><button class="button-primary" type="button" :disabled="state.copies[magnet.id]?.loading || !!decision?.action" @click="model.copy(magnet.id)">{{ state.copies[magnet.id]?.loading ? 'Copiando…' : 'Copiar Magnet' }}</button><a v-if="!decision?.action" class="button-secondary" :href="magnet.magnetUri" referrerpolicy="no-referrer" rel="noreferrer">Abrir no cliente ↗</a></div>
          <p v-if="state.copies[magnet.id]?.message" class="form-footnote" role="status">{{ state.copies[magnet.id]?.message }}</p>
          <div v-if="state.copies[magnet.id]?.manual" class="manual-magnet"><label :for="'magnet-' + magnet.id">Magnet para cópia manual</label><textarea :id="'magnet-' + magnet.id" :value="magnet.magnetUri" readonly rows="3" spellcheck="false" @focus="($event.target as HTMLTextAreaElement).select()" /></div>
        </li></ul>
        <p class="form-footnote">A abertura depende do navegador e do cliente instalado; não é possível confirmar por esta tela se o aplicativo abriu. O cliente pode acessar trackers e peers externos. Nenhuma consulta à rede BitTorrent é feita automaticamente pelo UnescShare.</p>
      </section>
      <AvaliacoesSection v-if="!review && state.material.status === 'PUBLICADO'" :key="state.material.id" :material-id="state.material.id" :autor-id="state.material.usuarioId" />
      <p v-else-if="!review" class="catalog-notice">Avaliações disponíveis somente enquanto o material estiver publicado, inclusive para autor e equipe.</p>
      <ComentariosSection v-if="!review && state.material.status === 'PUBLICADO'" :key="state.material.id" :material-id="state.material.id" />
      <p v-else-if="!review" class="catalog-notice">Comentários disponíveis somente enquanto o material estiver publicado, inclusive para autor e equipe.</p>
      <ComentariosModeracaoSection v-if="review" :key="state.material.id" :material-id="state.material.id" :material-status="state.material.status" />
    </template>
  </section>
</template>
