# Moderação: consulta de materiais pendentes

Primeiro incremento da área de equipe, em25/10/2026. Rota `/moderacao/materiais`, restrita na interface a MODERADOR/ADMINISTRADOR, com paginação e links para os detalhes existentes. Não acrescenta publicação, bloqueio, remoção ou alteração de permissões da API.

## Estrutura e código completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/moderacao-material-service.ts # GET/PagedModel/DTO de pendentes
src/features/moderacao/moderacao-material-model.ts   # Conta/perfil, consulta, páginas e cancelamento
src/features/moderacao/MateriaisPendentesView.vue    # Fila somente de leitura
src/features/auth/permissions.ts                   # canModerate compartilhado
src/features/auth/navigation.ts                    # Guarda de equipe e mudança observada de perfil
src/router/index.ts                                # requiresAuth/requiresModeration
src/App.vue                                        # Menu Moderação para equipe
src/features/auth/ContaView.vue                     # Atalho e aviso de acesso restrito
src/assets/main.css                                # Controles responsivos
tests/moderacao-material.test.mjs                   # Contratos/modelo/permissão local
tests/moderacao-material-http.test.mjs              # fetch/Bearer/GET em HTTP sintético
tests/auth-navigation.test.mjs                      # Guardas Router e perfis
```

Código completo nesses arquivos. Mantém service/model/view, fetch nativo/`authenticatedJson`, parser de páginas e UUIDs. Sem nova dependência, variável, entidade/schema ou Java. Material continua sendo metadados de conteúdo BitTorrent, com Torrent/Magnet independentes; a fila não abre conteúdo, trackers ou mecanismos de distribuição.

## Consulta

GET `/api/v1/materiais/moderacao?page=0&size=20&status=PENDENTE`, somente Bearer em Authorization. Não envia corpo/Content-Type/usuarioId/sort, não usa `/meus` e não filtra por autoria. MODERADOR/ADMINISTRADOR podem consultar pendentes de todos os autores, inclusive os próprios conforme a API.

Esta tela fixa PENDENTE e não oferece outros estados/filtros ainda. Paginação20/50/100 e Atualizar fila. Ordem existente do backend: dataCadastro DESC/id DESC, **mais recentes primeiro**; não implementar FIFO ou reordenar localmente. Trocar tamanho volta à página0, atualizar conserva página/tamanho em RAM, reabrir inicia0/20. Página fora do total faz no máximo uma correção, inclusive para0 quando totalzero; não há snapshot entre GETs ou polling automático.

O parser valida os oito campos de MaterialResumoResponse, rejeita outros estados e projeta somente id/titulo/status/dataCadastro/visualizacoes. Não guarda dados pessoais/extras, UUIDs acadêmicos ou do autor no estado da fila. IDs duplicados/paginação inconsistente são erro de protocolo, não fila vazia. Título é interpolado Vue, sem HTML executável. Não faz consultas N+1 para completar nomes.

Links usam `/materiais/:id`, cuja visibilidade é revalidada pela API. A fila não cria uma representação administrativa paralela do detalhe. Os detalhes existentes mantêm suas permissões: equipe consulta privados, mas não impersona autor em PUT/DELETE; se o membro também for autor, suas ações próprias preexistentes continuam independentes desta fila. Nenhuma mutação é disparada por abrir a fila ou um detalhe.

## Guardas e autorização

`canModerate` consulta somente o perfil do usuário obtido por `/usuarios/me`; não decodifica JWT nem lê perfil salvo em storage. É compartilhado por menu, conta, guardas e modelo.

A rota usa meta `requiresAuth` e `requiresModeration` do Vue Router. Anônimo/acesso não validado vai ao login. Autenticado sem equipe vai à conta com `acesso=moderacao`, parâmetro que serve apenas para uma mensagem fixa de restrição; não concede permissão. Catálogo e Meus materiais continuam disponíveis pelas regras anteriores. A guarda também reage à perda de perfil observada no estado de sessão enquanto a rota está aberta.

O modelo confere UUID/perfil antes de cada consulta e ignora respostas se conta ou perfil mudar. A view observa status/UUID/perfil e reinicializa, descartando a fila anterior. Isso também impede uma resposta antiga de MODERADOR sobrescrever uma consulta nova de outra conta ou ADMINISTRADOR. Remover links e barrar a rota são conveniências de interface, **não garantias de autorização**.

O backend continua usando Spring Security e `@PreAuthorize`/roles do JWT já existentes. Perfil retornado por `/me` e claims de um token emitido podem divergir após alterações no banco; não há atualização de claims, refresh ou revogação imediata nesta entrega. A interface não consulta perfil periodicamente nem promete detectar alterações externas instantaneamente. Mudanças observadas limpam a interface; a validade/permissão efetiva do Bearer segue a política existente do servidor.

## Erros e privacidade

Carregar/atualizar limpa dados anteriores antes de GET; falha não mantém títulos privados antigos nem aparece como “zero pendentes”. Rede/protocolo/5xx permitem nova tentativa explícita, sem retry automático.401/403 retiram dados e bloqueiam consultas repetidas desta instância;401 invalida apenas o token realmente usado pelo helper,403 não encerra sessão nem inventa novo perfil. Reabrir a área é uma ação explícita e a API verifica novamente o acesso.

Mensagens são locais/fixas, sem ecoar ProblemDetail privado, SQL, credenciais ou URI de mecanismo. Troca de conta/perfil, nova consulta ou desmontagem aborta/ignora tarefas antigas; estado fica somente em RAM, sem URL/storage/log de títulos ou dados da fila. Abortar a consulta não muda registros.

## Executar e verificar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Abra http://localhost:5173 com uma conta já existente. Não reativar bootstrap, pedir senha administrativa ou promover contas para testar esta entrega; testes automatizados usam perfis sintéticos. Uma fila vazia é resultado válido quando não existem pendentes.

1. MODERADOR/ADMINISTRADOR devem ver Moderação no menu e atalho na conta; abrir a fila, trocar tamanho/página e atualizar. Não deve ocorrer POST/PUT/DELETE.
2. USUARIO não deve ver o atalho; URL direta redireciona à conta com mensagem de restrição, sem consulta da fila. Anônimo vai ao login.
3. Conferir ordenação mais recentes primeiro, títulos como texto, data UTC/visualizações e ausência de dados pessoais ou nomes inventados. Abrir um item consulta o detalhe existente, sem publicar/bloquear.
4. Diferenciar fila vazia de falha de rede/protocolo/acesso.403 deve retirar dados sem deslogar;401 usa o fluxo existente de encerramento do acesso local.
5. Trocar conta/sair durante carga não deve restaurar pendentes da conta anterior. Quando uma mudança de perfil for observada na sessão, a área deve ser retirada e seus dados descartados.
6. Conferir teclado, leitor de tela, menu e layout desktop/320px. Validação completa de perfil/HTTP deve usar o backend real em ambiente de teste, sem alterar registros reais apenas para produzir cartões.

`npm run verify` passou com **759 testes**, zero falhas/cancelados/ignorados, vue-tsc e build Vite aprovados. São40 novos sobre719:32 de service/modelo/permissão local,7 de guardas e1 HTTP sintético. Cobrem perfis, DTOs/páginas, protocolo sóGET/statusPENDENTE, ordenação recebida, acesso negado, descarte de dados/respostas antigas e preservação das rotas comuns.

HTTP sintético usa Node/fetch local e dados em RAM; guardas usam Router em memória. Não são Spring/PostgreSQL, navegação DOM ou prova de autorização real/locks/rollback. Vite retornou200 no fallback de `/moderacao/materiais` e nos módulos compilados de fila/menu/conta; servidor temporário encerrado. Navegador indisponível: visual/mobile/DOM/teclado/E2E com Spring pendentes. Nenhuma consulta autenticada real ou dado real alterado; sem Java/schema/dependência/Maven/Docker/backend iniciado/.env real/credenciais/publicação/commit/push. Suite Maven registrada549 não reexecutada.

## Próxima entrega

A revisão individual somente de leitura foi implementada no incremento seguinte: [REVISAO_MATERIAL_FRONTEND.md](REVISAO_MATERIAL_FRONTEND.md). Os links da fila agora abrem `/moderacao/materiais/:id`. O resultado759 acima é histórico da entrega inicial da fila.

Em seguida, o usuário escolheu manter autoaprovação para ambos os perfis e as ações foram integradas: [DECISOES_MATERIAL_FRONTEND.md](DECISOES_MATERIAL_FRONTEND.md). Não há histórico, justificativa, desbloqueio ou restauração nesta interface. Próximo recomendado: consulta da fila de denúncias da equipe.
