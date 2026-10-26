# Comentarios: listagem e cadastro

Este guia registra o primeiro incremento (509 testes). Edição e remoção próprias foram acrescentadas depois, conforme [COMENTARIOS_EDICAO_REMOCAO_FRONTEND.md](COMENTARIOS_EDICAO_REMOCAO_FRONTEND.md); a verificação atual está nesse guia e no README.

Entrega local de 23/10/2026, integrada a `/materiais/:id`. A secao e montada somente quando o detalhe informa `PUBLICADO`. Autor e equipe seguem essa mesma regra; poder consultar um Material privado nao permite consultar ou cadastrar comentarios nele. Backend continua sendo a autoridade e confere o estado novamente nas requisicoes.

## Estrutura e codigo completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/comentario/comentario-service.ts   # Contrato, validacao/projecao e GET/POST
src/features/comentario/comentario-model.ts     # Paginas, draft, cancelamento e envio incerto
src/features/comentario/ComentariosSection.vue  # Lista e formulario acessivel
src/features/material/MaterialView.vue          # Composicao somente para PUBLICADO
src/assets/main.css                            # Estilos da secao e responsividade existente
tests/comentario.test.mjs                       # Contratos, estados e respostas atrasadas
tests/comentario-http.test.mjs                  # fetch/Bearer/JSON em HTTP sintetico local
```

Codigo completo nesses arquivos. Reutiliza `authenticatedJson`, `ApiError`, `pagination`/`parsePage`, UUIDs e os estilos existentes. Sem dependencias novas, rotas adicionais, cookies, alteracao de entidades ou endpoints Java. Torrent e Magnet permanecem entidades independentes; nao ha upload de conteudo academico nesta funcionalidade.

## Contrato

| Operacao | API relativa a /api/v1 | Comportamento |
| --- | --- | --- |
| Listar | GET /materiais/{materialId}/comentarios?page=0&size=20 | PagedModel, apenas ATIVO em PUBLICADO |
| Comentar | POST /materiais/{materialId}/comentarios | JSON somente `{ "conteudo": "Texto simples" }`, resposta 201/DTO |

Bearer apenas no cabecalho Authorization pelo helper existente; sem token ou usuarioId em URL/corpo. O servidor escolhe autor/estado ATIVO/data/UUID. A identidade passada ao service serve somente para conferir o DTO de resposta, nao e enviada. Qualquer autenticado pode comentar, inclusive autor e equipe quando PUBLICADO; multiplos comentarios da mesma pessoa sao permitidos.

Texto obrigatorio, trim nas bordas, ate 4000 unidades UTF-16 (inclusive contagem HTML/JavaScript), sem U+0000, sem truncar. Bean Validation/normalizacao do backend permanecem definitivas. Retorno projetado em seis campos: id/conteudo/dataCadastro/status/usuarioId/materialId. UUIDs, data, texto, ATIVO, Material da rota e pagina sao validados; POST tambem confere autor/texto. Campos extras descartados e IDs duplicados na mesma pagina rejeitados.

Conteudo aparece por interpolacao Vue, com quebras de linha e palavras longas; nunca `v-html`, innerHTML ou Markdown/HTML executavel. Nao buscar nomes/perfis de usuarios: rotulo proprio por UUID ou comentario de outro usuario e data UTC. Sem N+1 de dados pessoais.

## Lista e formulario

Paginas de 20/50/100, Anterior/Proxima/Ultima pagina e Atualizar lista. Ordem fixa do servidor: dataCadastro/id ASC (mais antigos primeiro), sem ordenar localmente. Trocar tamanho volta a pagina0. Se a pagina encolher, faz no maximo uma consulta corretiva, inclusive para pagina0 quando totalzero; nao existe snapshot ou polling automatico. Carga, erro e pagina vazia sao estados distintos.

Rascunho fica somente em RAM e e preservado ao navegar entre paginas, atualizar ou corrigir erro. Sair, trocar material/conta ou perder acesso limpa texto/lista. Sem salvar texto em URL/storage/log. Durante POST, novas escritas, edicao do texto e consultas ficam bloqueadas; submit duplicado nao envia outra requisicao. Nao envia com lista indisponivel/carregando.

Sucesso limpa o texto e recarrega pagina0; nao insere artificialmente o novo comentario no inicio de uma pagina ASC nem altera totais por conta propria. Mensagem orienta usar Ultima pagina se necessario. Se esse GET falhar, sucesso de POST continua confirmado, com erro separado de listagem; nao sugerir reenviar o comentario confirmado.

Se GET ou POST retornar 404 (por exemplo, Material mudou para PENDENTE), a secao descarta lista/draft e bloqueia operacoes, sem tratar como zero comentarios. 401/403 tambem retiram acesso; helper invalida somente o token usado em401. Reabrir detalhes permite nova consulta de estado. Nao conservar excecao para autor/equipe.

## Falhas de envio

Erros400 usam orientacao local; demais mensagens sao fixas por status. Nao exibir mensagens arbitrarias de ProblemDetail/rejectedValue/causaSQL ou texto rejeitado. Erros de rede/protocolo/408/5xx tem resultado incerto: o servidor pode ter gravado mesmo sem resposta valida.

Nesse caso nao ha retry automatico nem chave de idempotencia. O formulario preserva o texto, bloqueia Publicar e exige um GET bem-sucedido e a acao explicita **Conferi a lista; preparar nova tentativa (pode duplicar)** antes de permitir outro POST. Preparar nao envia. Confira tambem as paginas recentes; uma pagina vazia ou atualizada nao prova ausencia de comentario, especialmente sob moderacao concorrente. O aviso explica que nova tentativa pode duplicar. Essa protecao e local a tela, nao uma garantia de deduplicacao apos sair/reabrir.

AbortController e identidade das tarefas ignoram retornos antigos ao trocar pagina/material/conta/desmontar. Cancelar a espera nao garante cancelar uma gravacao no servidor.

## Executar e verificar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Abra http://localhost:5173, entre com uma conta existente e abra um Material PUBLICADO. Para exercicio manual, utilize um registro descartavel identificado: enviar comentario cria dado real, sem limpeza automatica nesta entrega. Nao alterar dados reais apenas para demonstrar a interface.

1. Conferir lista/paginacao/Ultima pagina, texto com quebras e rotulo proprio. HTML escrito deve aparecer como texto, sem executar.
2. Enviar texto, conferir confirmacao/limpeza e a pagina recente; testar branco/limite/duplo clique sem duplicidade local.
3. Conferir Material PENDENTE/BLOQUEADO/REMOVIDO: secao nao faz requisicoes, inclusive para dono/equipe.
4. Em ambiente descartavel, mudar PUBLICADO para outro estado entre detalhe e consulta/envio:404 retira lista/formulario. Nao interpretar como ausencia de comentarios.
5. Simular rede perdida: conferir aviso, reconsultar as paginas e preparar nova tentativa somente se desejado. Essa acao aceita risco de duplicar; nao ha reenvio automatico.
6. Trocar material/conta ou sair durante carga/envio: resposta antiga nao deve repor texto/lista. Conferir teclado, leitor de tela, telas320px e desktop.

Validacao automatizada: **509 testes aprovados** (466 anteriores +42 novos de contrato/modelo +1 HTTP sintetico), zero falhas/cancelados/ignorados. Type-check e build Vite aprovados. `npm run verify` executou os 508 testes disponiveis antes do ultimo teste HTTP; apos adiciona-lo, `npm run test` passou com509, sem alteracao posterior do codigo da aplicacao. Os testes incluem texto/DTO/pagina/ordem, autorJWT no transporte, erros vazios/ProblemDetail privados,404/401, respostas antigas, POST duplicado e resposta perdida apos gravacao simulada.

HTTP sintetico usa servidor nativo local e dados somente em RAM; nao e Spring/PostgreSQL, prova de autorizacao/rollback, teste DOM ou E2E. Vite retornou200 no fallback de detalhe e nos modulos compilados MaterialView/ComentariosSection. Sem navegador disponivel: visual/mobile/HTML/foco e E2E com backend real ainda pendentes. Nenhum comentario real cadastrado; sem Java/schema/dependencias/.env real/Docker/Maven/credenciais/publicacao/commit/push nesta entrega. Suite Maven registrada549 nao foi reexecutada.

## Continuidade

Edicao e remocao logica de comentarios proprios foram implementadas no segundo incremento, usando as rotas existentes e as permissoes especificas do autor do Comentario. Moderacao, historico, avaliacoes e denuncias ficam em entregas separadas; nao deduzir essas permissoes do autor do Material ou do perfil de equipe.
