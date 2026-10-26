# Conclusão de denúncias

Entrega de 25/10/2026, na revisão `/moderacao/denuncias/:id`. MODERADOR e ADMINISTRADOR podem preparar conclusão procedente ou improcedente de denúncia EM_ANALISE. A API continua impedindo denunciante e autor do Material, inclusive administrador.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/denuncia-decisao-service.ts   # Três ações e validação de justificativa/DTO
src/features/moderacao/denuncia-decisao-model.ts     # Ciclo único de confirmação e contexto
src/features/moderacao/DenunciaDecisaoPanel.vue      # Escolha explícita e formulário único
src/features/moderacao/DenunciaEquipeView.vue        # Integração na revisão existente
src/features/moderacao/denuncia-analise-service.ts   # Adaptador de compatibilidade do início
src/features/moderacao/denuncia-analise-model.ts     # Adaptador limitado a analise
src/features/moderacao/DenunciaAnalisePanel.vue      # Adaptador do componente anterior
tests/denuncia-conclusao.test.mjs                   # Contratos, escolhas, estados e contexto
tests/denuncia-conclusao-http.test.mjs              # HTTP sintético com Bearer
```

Código completo nesses arquivos. O controle já testado de início de análise foi compartilhado para evitar implementar outro ciclo de rascunho, confirmação e tratamento de incerteza. Os adaptadores anteriores conservam a interface de início e suas regressões; a revisão usa o modelo/painel comum para as três ações. Leitor de relato/histórico, parser de Denuncia, cliente Bearer, guardas, estilos e autenticação permanecem reutilizados. Sem dependências, variáveis, rotas, entidades/schema, endpoints ou Java novos.

## Contratos existentes

URLs relativas à base `/api/v1`:

| Decisão | Estado exigido | POST | Resultado esperado |
| --- | --- | --- | --- |
| Iniciar análise | PENDENTE | `/denuncias/moderacao/{id}/analise` | EM_ANALISE |
| Procedente | EM_ANALISE | `/denuncias/moderacao/{id}/procedencia` | PROCEDENTE |
| Improcedente | EM_ANALISE | `/denuncias/moderacao/{id}/improcedencia` | IMPROCEDENTE |

JSON contém **somente** justificativa obrigatória, trim, até1000 unidades UTF-16 e sem U+0000:

```json
{ "justificativa": "Relato e material conferidos para esta decisão." }
```

Sem estado, ação, identidade ou evento no corpo. O endpoint fixa a transição e a API obtém o responsável do JWT; cliente usa `authenticatedJson`, Authorization Bearer e Content-Type JSON, sem cookies. Whitelist de ações impede construir caminho arbitrário. Resposta deve corresponder ao UUID e ao estado da decisão escolhida; campos imutáveis do relato são conferidos. Essa validação posterior não impede uma gravação já aceita em caso de resposta inesperada.

## Escolha e confirmação

Depois de relato/histórico carregados, PENDENTE oferece somente início; EM_ANALISE oferece as duas conclusões, sem escolha padrão; estados finais não oferecem outra decisão ou reabertura. Histórico vazio/legado não é convertido em novo estado nem impede uma conclusão válida de EM_ANALISE. A interface não exige que o membro atual tenha iniciado a análise: outra pessoa elegível pode concluir, conforme a API existente.

Um único formulário por vez. Escolher procedente ou improcedente mostra a decisão e o estado solicitado antes da justificativa/caixa/botão específicos. Para trocar, cancelar e preparar outra escolha descarta rascunho e confirmação. Editar texto desmarca a caixa; cada tentativa consome a confirmação. Durante envio, não se pode trocar decisão, editar, cancelar, recarregar ou reenviar. Consultas parciais do histórico ficam bloqueadas com formulário aberto. Sair da rota cancela a espera/descarta dados locais, sem garantir rollback da transação.

Sucesso mostra aviso, limpa o formulário e consulta novamente relato/histórico desde20/primeira página. Nenhum evento é criado ou anexado localmente. Falha de rede/protocolo no GET posterior conserva o aviso de POST confirmado com o erro da consulta. O estado observado após a recarga é o da API; não há ETag/snapshot ou garantia de que seja a versão lida antes de decidir.

## Falhas e permissões

- 400 conserva decisão/rascunho, consome confirmação e orienta conferir a justificativa antes de confirmar outra tentativa.
- 403 de POST limpa o formulário e bloqueia **ambas** as conclusões naquela consulta, inclusive após Atualizar, conservando leitura autorizada. Não classifica a causa ou identifica denunciante/autor pela mensagem;403 não encerra sessão.
- 401/404 de POST retiram relato, histórico e formulário.401 usa rejeição do token efetivamente enviado.
- 409, rede, protocolo,408 e5xx bloqueiam nova tentativa e troca para a decisão oposta até descartar/reconsultar/preparar nova justificativa e confirmação. Sem retry automático nem promessa de idempotência.
- Se GET após conflito/resposta perdida mostrar uma conclusão, não oferece outra decisão e não atribui o efeito à tentativa perdida por texto, estado, agente ou contagem.

GET401/403/404 continua retirando toda a leitura. Corpo privado de erro não é refletido. Conta, perfil, UUID, geração e dispose descartam/cancelam/ignoram respostas antigas; uma conclusão ou403 antigo não muda rascunho/confirmação de outro contexto. Dados e filtros permanecem em RAM, sem URL/storage/logs privados. Perfil de `/usuarios/me` não substitui a autorização da API por roles do JWT.

Denunciante e autor do Material seguem impedidos de decidir, inclusive ADMINISTRADOR, mas podem ler como equipe. Não inferir elegibilidade pelo responsável de evento nem consultar contas/denunciante em segundo plano. A conclusão não bloqueia, remove, publica ou restaura Material; não reabre denúncia, não altera relato original nem cria evento arbitrário. Autoaprovação de Material mantida para ambos os perfis permanece uma regra separada.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com conta de equipe existente: abrir denúncia EM_ANALISE → preparar uma conclusão → justificar → confirmar pelo botão específico. Enviar grava estado/histórico reais; a suíte desta entrega usa somente dados sintéticos. Não reativar bootstrap ou solicitar senha real para testes.

Roteiro manual: ambas as conclusões/perfis; conclusão por outro membro; cancelar/trocar escolha sem transferir justificativa/checkbox; duplo envio; estados finais;403 preservando leitura; conflito com conclusão oposta; resposta perdida; falhaGET posterior; troca de conta/rota durante POST; teclado/foco/320px. Procedência não deve provocar requisição automática de bloqueio de Material.

`npm run verify`: **945 testes**, zero falhas/cancelados/ignorados, TypeScript/build aprovados. São24 novos sobre921:23 service/modelo e1 HTTP sintético; as921 regressões anteriores passaram também após o compartilhamento do fluxo. Testes HTTP cobrem ambos os perfis/conclusões, payload, conflito com decisão oposta, efeito sintético com resposta perdida/malformada e negativas401/403. Servidor Node em RAM e Bearer falso não são Spring/PostgreSQL nem prova de autorização/locks/rollback reais ou DOM.

Vite retornou200 na rota e módulos de revisão/painel/adaptador compilados; servidor temporário encerrado. Inventário sem navegador: visual/mobile/DOM/teclado/foco/E2E com Spring pendentes. Sem Java/schema/dependências/Maven/Docker/backend iniciado/.env real/credenciais/dados reais/deploy/operações Git. Maven completo549/focado materiais20 permanecem históricos, não reexecutados.

A consulta de comentários da equipe foi entregue no incremento seguinte: [COMENTARIOS_EQUIPE_FRONTEND.md](COMENTARIOS_EQUIPE_FRONTEND.md). Próximo recomendado: histórico de moderação de um comentário selecionado; ocultação/reexibição depois. A contagem945 acima é histórica desta entrega de conclusão.
