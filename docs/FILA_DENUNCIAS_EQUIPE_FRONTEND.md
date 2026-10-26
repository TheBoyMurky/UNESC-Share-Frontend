# Fila de denúncias da equipe

Entrega de 25/10/2026. Rota `/moderacao/denuncias`, somente para MODERADOR e ADMINISTRADOR. Acesso pela conta ou pelo link na fila de materiais; o menu Moderação continua abrindo materiais pendentes.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/moderacao-denuncia-service.ts  # Contrato da fila de equipe
src/features/moderacao/moderacao-denuncia-model.ts    # Filtro e composição da paginação
src/features/moderacao/DenunciasEquipeView.vue        # Listagem, estados e navegação
src/features/moderacao/moderacao-fila-model.ts        # Modelo compartilhado das duas filas
src/features/moderacao/moderacao-material-model.ts    # Adaptador da fila já existente
src/features/denuncia/denuncia-service.ts             # Exportação do parser existente
src/features/moderacao/MateriaisPendentesView.vue     # Link entre filas
src/features/auth/ContaView.vue                      # Atalho de equipe
src/router/index.ts                                 # Rota protegida
tests/moderacao-denuncia.test.mjs                    # Contrato, filtros e contexto
tests/moderacao-denuncia-http.test.mjs               # HTTP sintético
tests/auth-navigation.test.mjs                      # Guardas da rota
```

O código completo está nesses arquivos. O modelo de paginação que já protegia a fila de materiais foi extraído sem alterar seu comportamento e agora é compartilhado pelas duas filas. DTOs, filtros e textos de cada funcionalidade permanecem separados. O parser de Denuncia foi exportado e reutilizado, sem mudar os fluxos de cadastro e acompanhamento próprios. Sem dependências, variáveis, endpoints, entidades, Java ou schema novos.

## Consulta e apresentação

`GET /denuncias/moderacao?page=0&size=20&status=PENDENTE`, relativo à base `/api/v1`, com `authenticatedJson` e Bearer existente. Sem corpo, Content-Type artificial, identidade do usuário, filtros de autoria/material, parâmetro sort ou chamadas adicionais por item.

O estado inicial é PENDENTE. O seletor oferece os quatro estados existentes: PENDENTE, EM_ANALISE, PROCEDENTE e IMPROCEDENTE. Não existe opção Todos. Tamanhos20/50/100; alterar estado ou tamanho volta à página zero. Trocar estado preserva tamanho, Atualizar preserva página/filtro. Página que deixou de existir admite uma única correção, inclusive para total zero. Ordenação recebida é preservada: `dataCadastro/id ASC`, mais antigas primeiro, conforme o backend. Sem polling ou promessa de snapshot entre consultas.

O service valida os seis campos do DTO existente e a página; exige que os itens pertençam ao estado consultado e rejeita UUIDs duplicados. O estado de UI retém só cinco campos: UUID da denúncia, UUID do Material, motivo, estado e data. Descrição e campos extras são descartados após validação. Não busca título/nomes/identidade do denunciante/metadados ou mecanismos do Material. Vue escapa o conteúdo.

Cada cartão oferece link explícito à revisão de Material já existente, usando somente `materialId`. A navegação faz uma consulta autorizada própria; não carrega Material em segundo plano nem altera denúncia. A revisão de Material possui suas decisões independentes de publicação/bloqueio; usá-las não analisa ou conclui a denúncia. Não apontar o cartão à rota `/denuncias/:id`, que continua restrita ao próprio denunciante.

## Permissões e descarte de dados

Guardas reutilizam `requiresAuth`, `requiresModeration` e `canModerate`, com perfil de `/usuarios/me`. Anônimo vai ao login; usuário comum vai à conta com aviso fixo. O modelo exige UUID/perfil de equipe válidos antes do HTTP. A API continua responsável pela autorização por roles do JWT; perfil e token podem divergir após alteração no banco, sem refresh ou revogação imediata.

Reinicializar por conta/perfil limpa dados e restaura PENDENTE/20. Nova consulta limpa a página anterior antes do GET. Mudança de filtro, conta, perfil ou dispose cancela/ignora respostas antigas. Erro de rede/protocolo/5xx não vira fila vazia e admite atualização explícita.401/403 retiram a lista e bloqueiam consultas repetidas naquela instância até reinicialização;401 rejeita o token efetivamente usado e403 não encerra sessão nem inventa novo perfil. Mensagens não refletem corpos privados. Filtros/dados ficam em RAM, sem URL, storage ou logs privados.

A equipe pode consultar a fila mesmo quando o membro é denunciante ou autor do Material. O DTO não informa a identidade do denunciante; não inferir elegibilidade pelas linhas nem fazer consultas adicionais para tentar descobri-la. Nas futuras mutações de denúncia, a API continua impedindo ambos, inclusive ADMINISTRADOR. A autoaprovação de Material mantida para ambos os perfis não altera essa regra.

Esta entrega não envia ações de análise/procedência/improcedência, não muda Material, não oferece edição/exclusão/cancelamento de denúncia e não implementa detalhes ou histórico da equipe.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com conta de equipe existente, abrir Minha conta → Consultar denúncias da equipe ou Moderação → Consultar denúncias da equipe. Não reativar bootstrap ou criar dados reais apenas para demonstrar a fila. Sem registros, usar a suíte sintética para verificar os estados.

Roteiro manual: conferir os quatro filtros/tamanhos/páginas, estados de vazio e erro; alternar as duas filas; validar link ao Material sem POST automático; negar URL direta ao usuário comum e preservar Minhas denúncias; trocar conta/perfil durante GET; conferir401/403, teclado e largura320px. Abrir link a Material não analisa/conclui denúncia.

`npm run verify`: **856 testes**, zero falhas/cancelados/ignorados, TypeScript e build aprovados. São28 novos sobre828:24 de service/modelo,3 guardas e1 HTTP sintético. A suíte anterior da fila de materiais continua cobrindo a extração do modelo compartilhado. HTTP sintético verifica somenteGET/Bearer/params, projeção e401/403/503 com dados em RAM; Router usa memória. Isso não é Spring/PostgreSQL/DOM, prova de autorização real ou teste visual.

Vite retornou200 na rota e módulos de fila de denúncias/materiais/conta; servidor temporário encerrado. Inventário sem navegador: visual/mobile/DOM/teclado/E2E com backend continuam pendentes. Sem Java/schema/dependências/Maven/Docker/backend iniciado/.env real/credenciais ou dados reais/deploy/operações Git nesta entrega. Última suíte Maven completa registrada549 e suíte focada de materiais20 são resultados históricos, não reexecutados aqui.

Detalhe e histórico da equipe foram entregues no incremento seguinte: [DENUNCIA_HISTORICO_EQUIPE_FRONTEND.md](DENUNCIA_HISTORICO_EQUIPE_FRONTEND.md). O resultado856 acima é histórico da entrega inicial da fila. Próximo recomendado: iniciar análise com justificativa e confirmação explícita; conclusões entram depois.
