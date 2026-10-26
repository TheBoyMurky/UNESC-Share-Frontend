<script setup lang="ts">
import { environment } from '@/config/env'

const estrutura = ['Instituição', 'Curso', 'Disciplina', 'Material']
const etapas = [
  { numero: '01', titulo: 'Base do frontend', descricao: 'Vue 3, Vite, TypeScript e configuração pública da API.', estado: 'Esta entrega', pronta: true },
  { numero: '02', titulo: 'Acesso à plataforma', descricao: 'Cadastro de conta, login, usuário autenticado e erros da API.', estado: 'Implementado', pronta: true },
  { numero: '03', titulo: 'Explorar o catálogo', descricao: 'Seletores acadêmicos e busca paginada de materiais publicados.', estado: 'Implementado', pronta: true },
]
</script>

<template>
  <section class="hero container" aria-labelledby="titulo-principal">
    <div class="hero-copy">
      <p class="eyebrow"><span class="status-dot" aria-hidden="true"></span> Um novo ponto de encontro acadêmico</p>
      <h1 id="titulo-principal">O conhecimento<br>cresce quando<br><em>circula.</em></h1>
      <p class="hero-description">Um lugar para organizar e descobrir materiais de estudo, conectando disciplinas, estudantes e conhecimento em rede.</p>
      <a class="button-primary" href="#como-funciona">Conheça a proposta <span aria-hidden="true">↓</span></a>
      <p class="prototype-note">Protótipo em desenvolvimento · Primeiro acesso autenticado</p>
    </div>
    <aside class="catalog-preview" aria-labelledby="titulo-estrutura">
      <div class="preview-header"><span class="eyebrow">Organização do catálogo</span><span class="small-label">01 / 04</span></div>
      <h2 id="titulo-estrutura">Do seu curso.<br>Para a sua próxima ideia.</h2>
      <ol class="catalog-tree" aria-label="Hierarquia dos materiais">
        <li v-for="(nivel, index) in estrutura" :key="nivel" :style="{ marginInlineStart: `${index * 1.1}rem` }">
          <span class="tree-number">0{{ index + 1 }}</span><span>{{ nivel }}</span>
          <span v-if="index === estrutura.length - 1" class="tree-tag">.torrent / Magnet</span>
        </li>
      </ol>
      <div class="preview-footnote"><span aria-hidden="true">↗</span> O catálogo organiza. A rede BitTorrent distribui.</div>
    </aside>
  </section>

  <section id="como-funciona" class="proposal container" aria-labelledby="titulo-proposta">
    <div><p class="eyebrow">Compartilhar, com propósito</p><h2 id="titulo-proposta">Referências aqui.<br>Conteúdo na rede.</h2></div>
    <div class="proposal-copy">
      <p>O UnescShare é um catálogo acadêmico, não um serviço de hospedagem. Materiais são registros com título, descrição e vínculos com a estrutura de ensino.</p>
      <p>O compartilhamento acontece por <strong>arquivos .torrent e Magnet URIs</strong>, usando um cliente BitTorrent compatível. PDFs, vídeos e outros conteúdos acadêmicos não são enviados ao servidor.</p>
      <p class="responsibility">Compartilhe apenas conteúdos próprios ou com autorização e respeite suas licenças.</p>
    </div>
  </section>

  <section id="proximos-passos" class="roadmap container" aria-labelledby="titulo-etapas">
    <div class="section-heading"><div><p class="eyebrow">Um passo de cada vez</p><h2 id="titulo-etapas">Uma base para continuar.</h2></div><span class="stage-label">Desenvolvimento incremental</span></div>
    <ol class="milestones">
      <li v-for="etapa in etapas" :key="etapa.numero" :class="{ 'milestone-current': etapa.pronta }">
        <div class="milestone-top"><span class="step-number">{{ etapa.numero }}</span><span class="step-status">{{ etapa.estado }}</span></div>
        <h3>{{ etapa.titulo }}</h3><p>{{ etapa.descricao }}</p>
      </li>
    </ol>
    <div class="api-config" aria-labelledby="titulo-api">
      <div><h3 id="titulo-api">Destino da API</h3><p>URL configurada — a validação do acesso ocorre ao entrar na plataforma.</p></div>
      <code>{{ environment.apiBaseUrl }}</code>
    </div>
  </section>
</template>
