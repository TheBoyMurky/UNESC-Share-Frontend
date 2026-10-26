# Início de análise de denúncia

Atualização posterior em25/10/2026: as conclusões foram integradas e o ciclo de decisão compartilhado, mantendo adaptadores de compatibilidade para este incremento. Consulte [CONCLUSAO_DENUNCIA_FRONTEND.md](CONCLUSAO_DENUNCIA_FRONTEND.md). O escopo/contagem921 abaixo são históricos da entrega inicial de análise.

Entrega de 25/10/2026, na revisão `/moderacao/denuncias/:id`. Integra somente PENDENTE→EM_ANALISE, com justificativa e confirmação explícita. Conclusões procedente/improcedente ficam para o próximo incremento.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/denuncia-analise-service.ts           # Validação e POST de análise
src/features/moderacao/denuncia-analise-model.ts             # Composição do leitor e ciclo da confirmação
src/features/moderacao/DenunciaAnalisePanel.vue              # Justificativa, confirmação e feedback
src/features/moderacao/DenunciaEquipeView.vue                # Integração na rota existente
src/features/moderacao/moderacao-denuncia-detalhe-model.ts   # Exportação da fábrica de estado vazio
tests/denuncia-analise.test.mjs                             # Contrato, estado, erros e contexto
tests/denuncia-analise-http.test.mjs                        # HTTP sintético com Bearer
```

O código completo está nesses arquivos. O modelo compõe o leitor existente de relato/histórico, sem duplicar suas consultas e paginação. Reutiliza o cliente HTTP/Bearer, parser de Denuncia, guardas e estilos existentes. A exportação da fábrica de estado não muda o comportamento do leitor isolado. Sem dependências, variáveis, rotas, entidades/schema, endpoints ou Java novos.

## Contrato existente

`POST /denuncias/moderacao/{id}/analise`, relativo à base `/api/v1`, com JSON:

```json
{ "justificativa": "Relato conferido para início da análise." }
```

Só esse campo é enviado. Justificativa obrigatória, trim no frontend, até1000 unidades UTF-16 e sem U+0000; backend aplica strip/Bean Validation. Autor/responsável vêm do JWT no servidor; estado/transição são fixados pelo endpoint. Nenhuma identidade, data, estado, relato original ou evento de histórico é enviado pelo formulário. Usa `authenticatedJson`, Authorization Bearer e Content-Type JSON; sem cookies ou JWT em URL.

O service valida a resposta DenunciaResponse e exige UUID da rota/EM_ANALISE. O modelo também confere os campos imutáveis do relato consultado: materialId, motivo, descrição e data. Resposta inesperada é resultado incerto; essa checagem posterior não impede uma gravação já aceita pelo servidor nem substitui ETag. A autorização e os locks/transação/histórico continuam no backend existente, sem mecanismo JWT customizado.

## Formulário e ciclo da tentativa

Abrir a revisão continua somente consultando dados. Preparar início da análise exige equipe com UUID/perfil válidos, relato PENDENTE e histórico carregado com sucesso. A interface não conhece o denunciante e não tenta inferir elegibilidade nem consultá-lo. A API verifica impedimento na mutação, inclusive para administrador.

Preparar abre o formulário; digitar justificativa não envia nada. Confirmar requer caixa marcada e botão explícito. Editar o texto desmarca a caixa; toda tentativa consome a confirmação. Cancelar ou atualizar tudo descarta rascunho/confirmacão. Enquanto o painel está aberto, consultas parciais/páginas/tamanho do histórico ficam bloqueadas para manter o contexto escolhido. Durante POST, também ficam bloqueados edição, cancelamento, atualização e envio duplicado. Navegar para outra rota continua possível, aborta a espera e descarta dados locais, sem garantir cancelar/retroceder a transação no servidor.

Sucesso validado limpa o rascunho, mostra aviso e consulta novamente relato/histórico desde a primeira página/tamanho20. Não cria evento otimista, não agrega histórico em RAM e não atribui evento a uma tentativa perdida por texto, data ou contagem. A consulta pode mostrar estado posterior ao da resposta; se GET falhar por rede/protocolo, o aviso de POST confirmado permanece com o erro da leitura, sem repetir a mutação.

## Erros e permissões

| Resultado da mutação | Comportamento |
| --- | --- |
| 400 | Conserva o rascunho, consome confirmação e mostra orientação fixa para conferir/corrigir e confirmar novamente |
| 403 | Limpa rascunho/confirmacão e bloqueia a ação nesta consulta; conserva leitura previamente autorizada |
| 401/404 | Retira relato, histórico e formulário, bloqueando nova tentativa nessa instância até nova carga de contexto |
| 409/outros erros HTTP recusados | Exige descartar justificativa e consultar estado atual antes de nova escolha/justificativa/confirmacão |
| Rede/protocolo/408/5xx | Resultado incerto; a análise pode ter sido iniciada. Sem retry automático; exige a mesma reconsulta e preparação explícitas |

403 de mutação **não identifica a causa**: pode ser impedimento de interesse ou outra negativa de permissão. Não classificar pela mensagem nem afirmar quem é denunciante/autor. A ação permanece bloqueada após Atualizar nessa mesma consulta, mas o histórico pode ser consultado conforme a API.403 não encerra a sessão;401 usa rejeição do token efetivamente enviado. Se um GET posterior retornar401/403/404, todo o leitor também é retirado, conforme seu contrato existente. Mensagens não refletem texto privado de ProblemDetail/validação.

Após409/incerteza, o formulário não pode editar/fechar/reconfirmar para tentar de novo: a ação explícita é descartar e consultar o estado atual. Se a consulta mostrar EM_ANALISE, não oferece novo início nem declara que foi a tentativa perdida que causou o estado. Se continuar PENDENTE, é preciso preparar uma nova tentativa conscientemente; não há garantia de snapshot entre GET e POST ou idempotência de POST.

Conta, perfil, UUID, geração e dispose invalidam leitor, rascunho e respostas antigas; dados em RAM, sem URL/storage/logs privados. Um403 antigo não bloqueia uma consulta nova de outro contexto. Perfil de `/usuarios/me` não substitui roles do Bearer nem revoga imediatamente JWT emitido.

## Regras preservadas

Denunciante e autor do Material não podem iniciar análise, inclusive ADMINISTRADOR. Leitura da equipe permanece permitida mesmo quando impedida de agir. Outra pessoa elegível pode concluir uma análise iniciada por colega; esta ação não atribui exclusividade. Não há conclusão, reabertura, edição/exclusão de denúncia, criação arbitrária de evento ou alteração automática de Material nesta entrega. Autoaprovação de Material mantida para ambos os perfis é uma regra distinta.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com conta de equipe existente: Minha conta → Denúncias da equipe → Consultar denúncia e histórico → Preparar início da análise. Não reativar bootstrap ou solicitar senha real. Enviar a ação manualmente grava estado/histórico reais; os testes automatizados desta entrega usam somente dados sintéticos em RAM.

Roteiro manual: preparar/editar/desmarcar/cancelar; limites de justificativa; duplo envio; outro estado de denúncia;403 preservando leitura e bloqueando nova ação; conflito/resposta perdida exigindo recarga; falhaGET após sucesso; troca de conta/rota durante envio; teclado/foco/320px. Confirmar que texto pode ser digitado sem o foco saltar para o título. Foco usa fontes reativas separadas de abertura/erros; não observa cada edição do rascunho.

Testes frontend: **921 aprovados**, zero falhas/cancelados/ignorados;31 novos sobre890 (30 service/modelo e1 HTTP sintético). `npm run verify` passou; TypeScript/build foram revalidados após ajuste do foco do componente. HTTP Node/fetch com Bearer falso e dados em RAM cobre ambos os perfis, payload único, resposta perdida/malformada após efeito sintético, validação e401/403/404/409/503. Não é Spring/PostgreSQL, prova de autorização/lock/rollback real, DOM ou teste visual.

Vite retornou200 na rota e módulos de revisão/painel compilados; servidor temporário encerrado. Inventário sem navegador: visual/mobile/DOM/teclado/foco/E2E com Spring pendentes. Sem Java/schema/dependências/Maven/Docker/backend iniciado/.env real/credenciais/dados reais/deploy/operações Git nesta entrega. Maven completo549/focado de materiais20 permanecem históricos, não reexecutados.

Próximo recomendado: conclusão procedente/improcedente com justificativa e confirmação explícita, reutilizando o mesmo cuidado com impedimentos e resultados incertos.
