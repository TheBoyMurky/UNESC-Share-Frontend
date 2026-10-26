# Consulta de comentários para moderação

Atualização posterior em25/10/2026: seleção/histórico integrados em [HISTORICO_COMENTARIO_EQUIPE_FRONTEND.md](HISTORICO_COMENTARIO_EQUIPE_FRONTEND.md). Este guia registra a entrega anterior de listagem e seus968 testes; as permissões da consulta permanecem preservadas.

Entrega de 25/10/2026, na revisão `/moderacao/materiais/:id`. Seção somente de leitura para MODERADOR e ADMINISTRADOR, por Material já carregado. Não cria uma fila global nem altera as permissões da seção comum.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/moderacao-comentario-service.ts   # GET da equipe e validação da página
src/features/moderacao/moderacao-comentario-model.ts     # Material/contexto e paginação compartilhada
src/features/moderacao/ComentariosModeracaoSection.vue  # Lista de leitura, sem formulários de ação
src/features/material/MaterialView.vue                  # Montagem somente no modo de revisão
src/features/comentario/comentario-service.ts            # Validação compartilhada, estados separados
src/features/moderacao/moderacao-fila-model.ts            # Política opcional de indisponibilidade
tests/moderacao-comentario.test.mjs                     # Contrato, estados e contexto
tests/moderacao-comentario-http.test.mjs                # HTTP sintético com Bearer
```

Código completo nesses arquivos. A paginação da equipe é reutilizada com Material vinculado à instância.401/403/404 encerram a consulta de comentários; as filas anteriores conservam sua política padrão401/403. Validação dos seis campos de Comentario foi compartilhada, mas o parser comum continua aceitando **somente ATIVO**; o parser de equipe aceita **ATIVO/OCULTO**. Sem dependências, variáveis, rotas, entidades/schema, Java ou endpoints novos.

## Contrato e apresentação

`GET /materiais/{materialId}/comentarios/moderacao?page=0&size=20`, relativo à base `/api/v1`, com `authenticatedJson`/Authorization Bearer. Sem corpo, cookies, Content-Type artificial, parâmetros de estado/autoria/sort, fallback para a consulta comum ou requisições adicionais a usuários/Material.

DTO de seis campos: id, conteudo, dataCadastro, status, usuarioId, materialId. O service valida IDs/vínculo ao Material, estado permitido, texto obrigatório até4000 semU+0000, data e metadados de página; rejeita IDs duplicados e descarta campos extras. Preserva texto/ordem recebidos, sem truncar, transformar HTML ou ordenar localmente. Vue exibe texto escapado com quebras de linha e UUID do autor, sem buscar nomes ou permitir edição.

**Material REMOVIDO** pode ter comentários ATIVO/OCULTO consultados pela equipe, conforme o endpoint existente. **Comentário REMOVIDO** não tem seu texto listado. Se uma resposta contrariar esse contrato, a página inteira é recusada como protocolo inválido, sem conservar seus textos no estado da interface; não filtrar silenciosamente e apresentar o restante como página válida. O backend já filtra ATIVO/OCULTO na consulta e na contagem. Esta defesa de UI não substitui a autorização da API.

Sem filtro de estado nesta seção: a API lista ATIVO/OCULTO juntos. Tamanhos20/50/100, ordem fixa `dataCadastro/id ASC`. Alterar tamanho volta à página zero; Atualizar mantém página/tamanho. Página fora do intervalo admite uma única correção, inclusive totalzero. Material novo/contexto novo volta a20/primeira página. Sem polling, snapshot entre Material/página de comentários ou garantia de que um comentário não mude logo após a leitura.

## Separação e permissões

O componente só é montado dentro do modo de equipe de MaterialView, após detalhe válido; não depende de Material PUBLICADO. A rota continua protegida pelas guardas existentes e o modelo exige UUID/perfil de equipe válidos antes de consultar. Não há campo para digitar UUID arbitrário. A API continua autoridade pelas roles do JWT; perfil de `/usuarios/me` não revoga imediatamente um token emitido.

A rota comum `/materiais/:id` preserva sua seção original: ATIVO em Material PUBLICADO, sem exceção por autor/equipe ou acesso a detalhe privado. A revisão usa componente próprio e não mostra cadastro, edição/remoção do autor, ocultação, reexibição ou histórico nesta entrega, mesmo quando o comentário é próprio. Nenhuma restrição de conflito de denúncia é aplicada aos comentários; os fluxos possuem regras diferentes no backend.

Trocar Material, conta ou perfil reinicializa/cancela a consulta; dispose cancela e limpa. Nova query retira a página anterior antes do GET; respostas antigas não repõem textos ou removem dados de um Material novo. Recarregar a revisão de Material desmonta a seção, descartando sua página; após detalhe válido ela carrega novamente. Dados em RAM, sem URL/storage/logs privados. Texto livre pode conter dados pessoais escritos pelo autor; projeção de DTO não equivale a anonimização do conteúdo.

401/403/404 retiram textos, mostram erro e bloqueiam consultas repetidas naquela instância até nova carga.403 não encerra sessão nem infere perfil;401 rejeita o token efetivamente usado. A falha da seção não é tratada como lista vazia nem usada para inventar permissões de outro recurso. Rede/protocolo/5xx retiram a página anterior e permitem retryGET explícito. Mensagens não refletem corpos privados. Sem POST/PUT/DELETE, mudança de estado, identidade forjada ou acesso automático à rede BitTorrent.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com conta de equipe existente, abrir Moderação → revisar um Material e localizar Comentários para moderação. Não reativar bootstrap ou criar dados reais apenas para demonstrar a seção; a suíte usa dados sintéticos.

Roteiro manual: conferir ATIVO/OCULTO e texto literal com HTML/linhas; Material nos quatro estados; ausência de textoREMOVIDO; consulta comum preservada; comentário próprio sem ações do autor; paginação/tamanhos/erro/vazio; troca de conta/Material durante GET;401/403/404 retirando textos; teclado/desktop/320px. A seção não deve enviar mutações ou consultar nomes de usuários.

`npm run verify`: **968 testes**, zero falhas/cancelados/ignorados, TypeScript/build aprovados. São23 novos sobre945:22 service/modelo e1 HTTP sintético. Incluem regressão explícita de parser comum rejeitando OCULTO/REMOVIDO, página mista comREMOVIDO recusada, escopo/privacidade, paginação e respostas antigas. HTTP Node em RAM com Bearer falso cobre ambos os perfis e quatro contextos sintéticos de Material, parâmetros, projeção e401/403/404/503; não é Spring/PostgreSQL nem prova de autorização real, DOM ou montagem de componente.

Vite retornou200 na rota e módulos de seção de equipe/Material/seção comum compilados; servidor temporário encerrado. Inventário sem navegador: visual/mobile/DOM/teclado/E2E com Spring pendentes. Sem Java/schema/dependências/Maven/Docker/backend iniciado/.env real/credenciais/dados reais/deploy/operações Git. Maven completo549/focado materiais20 permanecem históricos, não reexecutados.

Próximo recomendado: consulta do histórico de moderação de um comentário selecionado na lista da equipe, sem recuperar texto de comentários REMOVIDO. Ocultação/reexibição entram em incremento posterior.
