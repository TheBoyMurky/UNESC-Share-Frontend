# Publicação e bloqueio de materiais

Entrega de 25/10/2026, na revisão `/moderacao/materiais/:id`.

## Decisão aprovada

O usuário escolheu **manter ambos**: MODERADOR e ADMINISTRADOR podem publicar os próprios materiais. A regra existente do backend foi preservada e recebeu dois casos de regressão explícitos. Não aplicar a restrição de conflito de interesse de Denuncia à publicação de Material. Equipe continua sem impersonar autor nas rotas de edição/remoção.

## Estrutura e código

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`; o código completo está nesses arquivos:

```text
src/features/moderacao/material-decisao-service.ts  # POST e validação da resposta
src/features/moderacao/material-decisao-model.ts    # Composição do leitor e decisões
src/features/moderacao/MaterialDecisaoPanel.vue     # Seleção, confirmação e feedback
src/features/material/MaterialView.vue             # Integração somente no modo de equipe
src/assets/main.css                               # Estilo do painel
tests/material-decisao.test.mjs                    # Service/modelo/contexto/erros
tests/material-decisao-http.test.mjs               # HTTP sintético com Bearer
```

O modelo compõe `material-revisao-model` e conserva a leitura/nomes/download/cópia já implementados. A rota comum de detalhes preserva os fluxos anteriores. Não há dependências, variáveis, entidades, endpoints ou código Java de produção novos. No backend, `src/test/java/br/com/murkyweb/unesc_share/material/MaterialFluxoApiTests.java` ganhou a regressão parametrizada de autoaprovação pelos dois perfis.

## Contrato e fluxo

| Decisão | POST sem corpo | Regra existente no servidor |
| --- | --- | --- |
| Publicar | `/materiais/{id}/publicacao` | PENDENTE com ao menos um Torrent ou Magnet; resultado PUBLICADO |
| Bloquear | `/materiais/{id}/bloqueio` | PENDENTE, PUBLICADO ou BLOQUEADO; resultado BLOQUEADO |

As URLs acima são relativas à base `/api/v1`. `authenticatedJson` mantém Bearer exclusivamente em Authorization, sem cookie, corpo, Content-Type artificial, autor/status/motivo na requisição. O service confere o UUID e o DTO de Material, projeta os campos previstos e exige o estado de resposta correspondente. Publicação sem mecanismo na resposta é erro de protocolo.

Abrir a revisão não envia POST. Primeiro escolher publicação/bloqueio; depois marcar a confirmação e enviar pelo botão explícito. Toda tentativa consome a confirmação. Trocar ação, cancelar ou recarregar também descarta a confirmação; não há confirmação transferida entre contas, materiais ou tentativas. Seleção aguarda leitura/nomes e operações de mecanismos pendentes. Durante o painel aberto, cópia/download/recarga de nomes ficam indisponíveis; durante POST também não se pode cancelar/trocar decisão/recarregar ou enviar novamente. Sair da rota continua possível e não garante rollback.

Sucesso validado gera aviso e nova consulta GET de detalhes/nomes. Não se aplica a resposta POST como versão definitiva nem se faz atualização otimista da fila. O GET pode mostrar estado diferente por outra transação. Se esse GET falhar, o aviso da decisão confirmada permanece com o erro da consulta e nenhuma mutação é repetida. Voltar à fila monta uma consulta nova de pendentes.

409 e demais falhas exigem consultar o estado atual antes de nova escolha/confirmacão. Rede, protocolo,408 e5xx indicam resultado incerto: a decisão pode ter sido gravada. Sem retry automático ou promessa de idempotência. Nem GET indicando o estado desejado prova qual requisição o causou. 401/403/404 de mutação retiram a revisão inteira e a confirmação;401 usa a rejeição do token efetivamente enviado,403 não encerra a sessão nem inventa novo perfil.

Conta/perfil/UUID/geração/dispose invalidam dados e respostas antigas; requisições são abortadas e resultados tardios ignorados. Isso não desfaz uma decisão já aceita pelo servidor. Autorização permanece na API por roles do JWT; perfil de `/usuarios/me` e JWT podem divergir após mudança no banco, sem refresh/revogação imediata.

## Limites preservados

- A decisão atua sobre a versão atual no servidor. Lock transacional não garante que ela seja a mesma versão lida pelo revisor; sem ETag/versão.
- Sem justificativa, histórico de decisão, desbloqueio, restauração ou exclusão pela equipe nesta entrega. Bloqueio repetido é permitido pela API e continua exigindo confirmação na interface.
- Nenhuma consulta automática à rede BitTorrent ou hospedagem de conteúdo. Torrent e Magnet permanecem independentes.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com conta de equipe existente, abra Moderação, revise um registro autorizado e use Revisar publicação ou Revisar bloqueio. Não reativar bootstrap nem criar dados reais apenas para demonstração. Roteiro manual: conferir autoria própria nos dois perfis; estados/publicação sem mecanismo; cancelar/trocar ação/confirmar; duplo clique; conflito e resposta perdida; falha do GET após sucesso; troca de conta/rota; teclado/desktop/mobile. Não executar decisões em dados reais sem intenção de alterá-los.

No backend, com PostgreSQL local ativo e variáveis locais exportadas conforme o README:

```bash
./mvnw -Dtest=MaterialFluxoApiTests test
```

`npm run verify`: **828 testes**, zero falhas/cancelados/ignorados, TypeScript e build aprovados. São32 novos sobre796:31 service/modelo e1 HTTP sintético. A suíte de fluxo backend passou com **20 testes**, incluindo os dois novos casos de autoaprovação, usando Spring Security/JWT, PostgreSQL e rollback. A última suíte Maven completa registrada continua549; não foi repetida nesta entrega.

HTTP frontend é servidor sintético com dados em RAM, não integração com Spring nem prova de autorização/lock/rollback. Vite retornou200 na rota e módulos de painel/leitura/wrapper; servidor temporário encerrado. Inventário sem navegador: visual/mobile/DOM/foco/componentes Vue/E2E com Spring continuam pendentes. `.env` local foi carregado apenas para executar Maven, sem exibir/alterar valores. Nenhum Docker, bootstrap administrativo, login de usuário real, decisão em dados reais, deploy ou operação Git foi executado.

A consulta da fila de denúncias da equipe foi entregue no incremento seguinte: [FILA_DENUNCIAS_EQUIPE_FRONTEND.md](FILA_DENUNCIAS_EQUIPE_FRONTEND.md). Próximo recomendado: detalhe/histórico da equipe, somente leitura, preservando o impedimento de denunciante/autor do Material nas futuras ações de denúncia.
