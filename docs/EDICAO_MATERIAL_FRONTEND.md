# Edicao dos metadados de Material

Incremento local de23/10/2026: `/materiais/:id/editar` protegida, com links em Meus materiais e detalhes para autor em PENDENTE/PUBLICADO. Somente titulo, descricao, disciplina e categoria; nao adiciona/remove/edita Torrents/Magnets nem recebe arquivos. Mantem Vue3/Vite/TypeScript, Router, fetch e identidade visual, sem dependencia nova ou publicacao.

Premissa preservada: UnescShare e catalogo BitTorrent, nao hospedagem de conteudo academico. Material e metadados; mecanismos independentes sao preservados pelo PUT existente do backend.

## Estrutura e codigo completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/material/material-edicao-service.ts # GET/referencias/PUT projetado e canEditMaterial
src/features/material/material-edicao-model.ts   # Draft, seletores, autoria, races e envio
src/features/material/MaterialEdicaoView.vue      # Formulario e avisos de PENDENTE/concorrencia
src/features/material/MaterialView.vue           # Link autor em estado editavel
src/features/material/MeusMateriaisView.vue       # Link nos registros proprios editaveis
src/features/catalogo/AcademicSelectors.vue       # Componente reutilizado, aviso de total alterado
src/features/catalogo/catalog-service.ts          # Servico de opcoes existente/pagina100
src/features/material/material-cadastro-service.ts # Validacao de metadados existente
src/features/material/material-service.ts        # Parser de detalhe existente
src/router/index.ts                              # Nova rota protegida
tests/material-edicao-fixtures.mjs
tests/material-edicao-service.test.mjs
tests/material-edicao-model.test.mjs
tests/material-edicao-http.test.mjs
tests/auth-navigation.test.mjs
```

Codigo completo nesses arquivos. Service/model/view separados; reutiliza UI/HTTP de seletores, regras de metadados e parser do DTO. Estado da edicao e independente do cadastro, sem modo de compartilhamento/File/URI editavel. Nao introduz filtros JWT ou mecanismos HTTP de seguranca customizados.

## Consulta, autoria e pre-preenchimento

GET /api/v1/materiais/{id} por authenticatedJson, com UUID validado antes de HTTP. A guarda exige acesso validado, mas nao concede propriedade. canEditMaterial compara usuarioId do DTO ao usuario de /usuarios/me e estados PENDENTE/PUBLICADO apenas como conveniencia de UI; perfil de equipe nao impersona autor.

Editor nao abre para terceiro (mesmo PUBLICADO legivel), BLOQUEADO ou REMOVIDO. Nesses casos nao conserva o DTO no estado de formulario, nao carrega referencias e nao permite PUT. Isso nao substitui autorizacao do backend: ele revalida autor e estado sob lock a cada escrita. Nao derivar identidade de query/storage/perfil nao validado nem decodificar JWT para conceder acesso.

Para preencher corretamente, consulta disciplina e categoria por UUID, depois curso e instituicao pelas FKs, quatro GETs vinculados e validados. Somente nomes/codigo/sigla/UUIDs necessarios, sem buscar usuario/email. Referencias atuais entram como opcoes selecionadas antes das listas paginadas; nao dependem de aparecer nos primeiros100registros.

Em seguida carrega pagina0 de cada seletor (100opcoes), com Carregar mais/retry sem truncar. A selecao atual e preservada se estiver fora da pagina; nome atualizado da lista tem prioridade quando UUID reaparece, sem duplicar. Conta apresentada inclui opcoes consultadas por UUID e pagina. Se quantidade em memoria superar total informado por mudanca concorrente, componente avisa em vez de anunciar contagem coerente ficticia. Nao ha snapshot entre GETs.

Falha ao resolver referencias impede formulario parcial e permite recarregar. Falha de lista paginada preserva selecoes/opcoes ja obtidas e permite retry; a API continua autoridade sobre existencia. Trocar instituicao limpa curso/disciplina, trocar curso limpa disciplina, cancelando/ignorando consultas antigas de filhos. Categoria independente. Nao ha N+1 na listagem: essas consultas sao limitadas a uma tela de edicao.

## PUT e efeito da gravacao

PUT JSON `/api/v1/materiais/{id}` por Bearer, apenas:

```json
{
  "titulo": "Titulo revisado",
  "descricao": "Descricao revisada",
  "disciplinaId": "UUID_EXISTENTE",
  "categoriaId": "UUID_EXISTENTE"
}
```

Placeholders devem ser substituidos em teste manual. Cliente projeta esses quatro campos, com trim de texto/UUIDs normalizados; nao envia autor/estado/data/views/infoHash/magnets/torrents/curso/instituicao/arquivo. Conteudo de titulo/descricao e texto escapado, nunca v-html. Limites200/4000, obrigatorios/U+0000/referencias reutilizam validacao do cadastro; Bean Validation e integridade finais continuam no servidor.

Sucesso200 precisa conter mesmo UUID, estado PENDENTE e referencias correspondentes no DTO validado. A tela mostra confirmacao, limpa draft/detalhe privado e oferece consulta atual/Meus materiais, sem novo GET ou navegacao automatica arbitraria. O PUT nao altera mecanismos; retorno pode incluir mecanismos adicionados concorrentemente de forma legitima, portanto nao exigir igualdade de arrays/contagens com o snapshot antigo.

Salvar PUBLICADO o retira do catalogo comum ate nova publicacao pela equipe. Aviso e botao tornam esse efeito explicito. Apenas alterações reais nos quatro metadados habilitam envio; espacos de borda equivalentes e cliques sem alteracao nao fazem PUT. Servidor manteria a regra PENDENTE em qualquer PUT aceito, mesmo sem mudanca de valores; cliente evita esse envio desnecessario.

## Concorrencia, erros e privacidade

**Sem ETag/@Version/controle otimista.** O lock do servidor serializa mutacoes, mas nao garante que a edicao foi baseada na ultima versao. Uma escrita concorrente pode ser sobrescrita. Nao apresentar este incremento como deteccao de conflito de versao ou revisao mais recente garantida.

Durante envio, edicao/seletores/duploPUT ficam bloqueados e cargas de opcoes sao canceladas. Troca de UUID/recarregar/desmontar cancela tarefas e ignora respostas antigas. Mudanca de conta observada pela view recarrega; modelo tambem descarta retorno se identidade mudou durante espera. Rascunho somente RAM, nao URL/sessionStorage/localStorage/logs. Sem autosave/guard de saida; sair descarta alteracoes. Mecanismos recebidos no GET ficam somente na consulta em memoria e sao mostrados como contagens iniciais, nao campos editaveis.

400 mapeia somente metadados conhecidos para textos locais, sem ecoar title/detail/message arbitrarios/URIs privadas.401 usa invalidacao do token utilizado e navegacao existente;403/404/409 nao concedem privilegios nem confirmam gravacao.409 pede conferir estado/referencias atuais, sem adivinhar causa por texto de excecao. Falhas de rede/protocolo/408/5xx tem resultado potencialmente incerto e orientam consultar antes de reenviar, preservando draft enquanto a mesma conta/tela estiver ativa. Nao repetir PUT automaticamente.

Recarregar dados (descarta alteracoes) e acao explicita que substitui draft por nova consulta; botao indisponivel durante PUT. Sair/abort nao garante cancelar a gravacao no servidor. Nova tentativa manual apos resultado incerto pode sobrescrever outra edicao ou retornar novamente a PENDENTE; verificar estado primeiro. Nenhuma remocao/restauracao, escrita de mecanismos, acesso a tracker/peer/conteudo ou limpeza de banco nesta entrega.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run verify
npm run dev
```

Abra http://localhost:5173, login -> Meus materiais -> Editar metadados, ou o link nos detalhes de material proprio editavel. Fluxo real requer backend/PostgreSQL locais disponiveis e URL publica padrao http://localhost:8080/api/v1. Nao reativar administrador inicial nem copiar segredos para VITE_*.

Roteiro manual pendente de navegador, somente com material autorizado de desenvolvimento (PUT real altera registro e PUBLICADO volta a PENDENTE):

1. Sem acesso, rota de edicao vai ao login; terceiro/equipe nao autora e estados BLOQUEADO/REMOVIDO nao devem abrir formulario ou disparar PUT. Forcar URL nao deve contornar a API.
2. Conferir dados preenchidos, inclusive disciplina/categoria fora da primeira pagina, e Carregar mais/retry. Nao trocar referencias automaticamente por primeira opcao da lista. Testar troca rapida de pai.
3. Conferir limites/obrigatorios, texto escapado, ausencia de inputs de arquivos/Magnets e botao bloqueado sem alteracao. Titulo/descricao/disciplina/categoria sao os unicos quatro campos do PUT JSON Bearer.
4. Salvar alteracao em PENDENTE/PUBLICADO e confirmar retorno PENDENTE, mesmo UUID/data/mecanismos preservados no backend, conforme regras existentes. Nao esperar restauracao ou publicacao automatica.
5. Simular400/401/403/404/409/503/resposta perdida; sem mensagens privadas/retry/sucesso indevido. Conferir consulta atual antes de reenviar resultado incerto. Recarregar deve descartar draft explicitamente.
6. Trocar conta/UUID/sair durante carga ouPUT: resposta antiga nao deve repopular tela ou anunciar sucesso. Conferir no servidor antes de repetir, pois abort nao implica rollback.
7. Conferir teclado/foco, labels, avisos, layout desktop/mobile e impacto de edicoes em duas abas. Nao alegar conflito de versao detectado: a API atual nao oferece essa garantia.

Verificacao em23/10/2026: **426 testes**, type-check/build aprovados (41novos sobre385:18service/contratos/visibilidade,21modelo/seletores/races/erros,1guardaRouter e1HTTP sintetico). Regressao de cadastro/Magnets/Torrent/catalogo/detalhes preservada.

HTTP usa fetch real com servidor temporario, Bearer, GETs vinculados por UUID/101opcoes, PUT quatrocampos200/400/401/403/404/409/503/DTOinvalido/conexao perdida; confirma nao reenviar automaticamente, PENDENTE e arrays preservados no contrato simulado. Nao e Spring/PostgreSQL nem prova de autorizacao/rollback/preservacao em banco real; regras de backend foram inspecionadas, nao modificadas/retestadas por Maven. Guardas usam memory history, nao DOM.

Vite200 para rota/fallback e MaterialEdicaoView/MaterialView/MeusMateriaisView compilados; nao comprova formulario/visibilidade no navegador. Inventario sem navegador: visual/mobile/DOM/acessibilidade/E2E Spring pendentes. Servidor temporario encerrado ao finalizar. Sem Java/schema/dependencias novas, Maven/Docker/backend iniciado/.env real/credencial/dado real alterado/publicacao/commit/remoto/push. Maven registrado549 nao reexecutado.

Remocao logica propria implementada no incremento seguinte: [REMOCAO_MATERIAL_FRONTEND.md](REMOCAO_MATERIAL_FRONTEND.md), com confirmacao explicita e sem restauracao/remocao fisica de mecanismos. Proximo recomendado comentariosPUBLICADO/listagem-cadastro.
