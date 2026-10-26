# Consulta de instituições no frontend

Atualização posterior26/10/2026: [cadastro administrativo](INSTITUICAO_CADASTRO_FRONTEND.md) integrado com atalho para ADMINISTRADOR na lista/conta. Leitura dos três perfis preservada. Este guia registra a entrega anterior de consultas e seus1135 testes.

Entrega de26/10/2026. Listagem `/instituicoes` e detalhe `/instituicoes/:id`, acessíveis pelo menu **Instituições** e pela conta. Ambos exigem autenticação e permitem USUARIO, MODERADOR e ADMINISTRADOR, conforme o contrato existente. Esta entrega inicia a consulta da estrutura acadêmica; formulários de cadastro/edição/exclusão não foram adicionados.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/instituicao/instituicao-service.ts          # GETs e parser de DTO/página
src/features/instituicao/instituicao-consulta-model.ts   # Lista/detalhe, contexto e cancelamento
src/features/instituicao/InstituicoesView.vue            # Lista paginada
src/features/instituicao/InstituicaoView.vue             # Detalhe por UUID
src/router/index.ts                                    # Duas rotas requiresAuth
src/App.vue                                            # Menu autenticado
src/features/auth/ContaView.vue                         # Atalho na conta
src/assets/main.css                                    # Quebra de nomes/siglas longos
tests/instituicao-consulta.test.mjs                     # 21 testes de service/modelo
tests/instituicao-consulta-http.test.mjs                # 1 teste HTTP sintético
tests/auth-navigation.test.mjs                         # 3 novas guardas
tests/integration/comentarios-spring.mjs                # Consulta à instituição da fixture
```

No backend, `src/test/java/br/com/murkyweb/unesc_share/material/ComentarioFrontendIT.java` passa também o UUID da instituição temporária ao roteiro Node. Nenhum Java de produção/schema/endpoints foi alterado. Código completo nesses arquivos. Reutiliza cliente Bearer, parser/paginação compartilhados, Router e estilos, sem novas dependências.

## Contrato e permissões

Relativo à base `/api/v1`:

```text
GET /instituicoes?page=0&size=20
GET /instituicoes/{id}
```

Somente GET, sem corpo, Content-Type artificial, filtros de nome/sigla, sort ou identidade em query. Ordem recebida da API por nome/id, sem ordenar novamente com regras de colação do navegador. DTO mantido: **id, nome, sigla**. Valida UUID, nome obrigatório até180, sigla obrigatória até30, sem U+0000; projeta extras e cursos fora do estado. Não força maiúsculas na resposta para preservar registros legados; texto é escapado pelo Vue.

Detalhe valida o UUID da rota antes da chamada e confere o vínculo da resposta. Lista valida página/contagens, IDs únicos após normalização e conteúdo compatível com o intervalo da página. Não busca detalhe de cada linha, cursos, contas, contagem de materiais ou outros filhos; não cria N+1/prefetch.

As consultas já eram permitidas a autenticados de qualquer perfil. Por isso a navegação usa **Instituições**, sem restringir leitura a administradores. Escrita continua exclusiva de ADMINISTRADOR no backend e ficará para incrementos próprios. Acesso a esta tela não concede nova permissão de escrita nem cria exceção para MODERADOR.

## Paginação, dados e erros

Lista começa em20/página0; seletor20/50/100, mudar tamanho volta à primeira página. Atualizar preserva página/tamanho. Uma página que ficou fora do total admite uma única correção, inclusive para totalzero; não entra em loop se os dados mudarem novamente. Total é da consulta atual, sem snapshot entre páginas.

Abrir o detalhe usa uma nova consulta por UUID. Trocar rota/conta/perfil, atualizar ou paginar retira o resultado anterior antes do GET, cancela e ignora respostas antigas. Voltar à lista recria sua consulta20/0, sem cache textual ou paginação em storage/URL. Dados ficam em RAM; URL de detalhe contém somente UUID. Dispose limpa e aborta tarefas; nenhum dado ou corpo privado é registrado em logs.

Rede, protocolo e5xx exibem erro, sem confundir com lista vazia e sem conservar dados antigos. Retry de GET é explícito.401/403 retiram dados e bloqueiam novas consultas naquela instância até nova carga;403 não encerra sessão e401 usa o helper do token efetivamente enviado. Detalhe404 retira registro e apresenta indisponibilidade, sem inventar instituição vazia; permite voltar à lista atual. UUID inválido não envia GET. Mensagens não refletem ProblemDetail privado.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com backend/PostgreSQL disponíveis, entre com uma conta existente ou um cadastro USUARIO e abra `http://localhost:5173/instituicoes`. Não é necessário bootstrap administrativo. Esta entrega não escreve instituições pela interface.

Roteiro manual: consultar lista/detalhe nos três perfis; testar20/50/100, atualizar, voltar à lista, vazio e falha de rede; abrir UUID inválido/inexistente; conferir401/403 sem dados antigos, logout/troca de conta/perfil/rota e respostas atrasadas. Conferir nomes/siglas longos, texto HTML literal, menu em320px, teclado/foco e anúncios de carregamento/erro. Não devem aparecer ações de escrita ou chamadas adicionais a cursos/materiais.

Com ambiente backend exportado e PostgreSQL disponível:

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Backend
set -a
source .env
set +a
ADMIN_SEED_ENABLED=false SEED_ENABLED=false SPRING_PROFILES_ACTIVE=test \
  ./mvnw -Dtest=InstituicaoApiTests,InstituicaoServiceTests,ComentarioFrontendIT test
```

Os dois cenários opcionais usam o novo service/modelo para consultar somente a instituição da própria fixture, como USUARIO e equipe MODERADOR/ADMINISTRADOR, e conferir401 sem token. Não percorrem o catálogo real de instituições nesse trecho Node. O restante do roteiro continua validando mecanismos e comentários. A limpeza existente remove apenas registros e arquivos próprios de teste, com ausência e diretório vazio conferidos. [Guia do roteiro integrado](../../UNESC-Share-Backend/docs/VALIDACAO_INTEGRADA_COMENTARIOS.md).

## Validação executada

- **1135 testes frontend** em `npm run verify`, zero falhas/cancelados/ignorados; TypeScript/build aprovados. São25 novos sobre1110:21 service/modelo,1 HTTP sintético e3 guardas Router em memória.
- **21 testes backend focados**:16 API e5 service, com PostgreSQL e transações de teste.
- **2 cenários opcionais frontend→Spring HTTP real→PostgreSQL** ampliados com o detalhe da instituição passaram, com fixtures/registros/arquivos/diretório limpos. Juntos,23 testes nessa execução Maven.
- Vite200 nas duas rotas e módulos de lista/detalhe/menu compilados; servidor temporário encerrado.

HTTP sintético/Router em memória não montam Vue nem provam autorização Spring; os testes nativos e o roteiro integrado exercitam a API no escopo descrito. Nenhum comprova DOM, colação de navegador, concorrência ou snapshot entre páginas. Sem navegador disponível: visual/mobile/DOM/teclado/foco/E2E Vue pendentes. Maven completo551 anterior não repetido. Sem Java produção/schema/dependências/Docker/`.env` real alterado/uso de dados reais no novo trecho/deploy/operações Git.

Próximo recomendado: cadastro de instituições no frontend, somente ADMINISTRADOR, com nome/sigla e tratamento de duplicidade conforme API. Edição e exclusão em incrementos posteriores; não alterar a permissão de leitura nem prometer unicidade case-insensitive sob concorrência.
