# Edição e remoção dos próprios comentários

Entrega local de 23/10/2026, na seção de comentários de `/materiais/:id`. Reutiliza a lista existente e os endpoints do backend. O UnescShare continua sendo um catálogo BitTorrent; nenhum conteúdo acadêmico é enviado ou hospedado por essa funcionalidade.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/comentario/comentario-service.ts   # canManageComentario, PUT e DELETE
src/features/comentario/comentario-model.ts     # Alvo, edição, confirmação, bloqueios e recarga
src/features/comentario/ComentariosSection.vue  # Botões e painel de ação com foco
src/assets/main.css                            # Painel, confirmação e ações responsivas
tests/comentario-acoes.test.mjs                 # Contratos, autoria, confirmação e respostas antigas
tests/comentario-acoes-http.test.mjs            # Transporte HTTP sintético com fetch real
```

Código completo nesses arquivos. Preserva service/model/view, `authenticatedJson`, `authenticatedDelete`, validação de texto/UUID/DTO e paginação compartilhada. Sem novas dependências, rotas, campos ou Java/schema alterados. As permissões definitivas continuam no Spring Security e no service transacional do backend.

## Permissões e alcance da interface

Botões aparecem somente nos comentários `ATIVO` da página carregada cujo `usuarioId` corresponde à conta autenticada. Ser dono do Material, moderador ou administrador não concede controle sobre comentário de terceiro. O modelo também verifica o alvo antes da operação; a visibilidade do botão não é uma garantia de autorização no servidor.

A lista permanece exclusiva de Material `PUBLICADO`. Esta entrega não adiciona GET individual, lista privada de comentários próprios ou formulário para UUID arbitrário. Assim, comentários que já estavam ocultos ou em Material privado ao abrir a tela não possuem novo caminho de descoberta pela interface.

Se o estado mudar após selecionar um comentário, a API revalida: PUT exige `ATIVO`/`PUBLICADO`; DELETE próprio por UUID conhecido aceita qualquer estado de Comentário/Material e é idempotente. O painel de remoção não faz GET privado nem precisa confirmar novamente a publicação para enviar esse DELETE. Após sucesso, uma recarga pode retornar404 se o Material já não estiver publicado; nesse caso a seção fica indisponível.

## Edição

“Editar meu comentário” copia o texto para um painel identificado pelo UUID e pela data. Campo obrigatório até4000 unidades UTF-16, trim externo, sem U+0000. Texto e prévia usam interpolação Vue, nunca HTML executável. Texto inalterado após trim não gera PUT.

PUT `/api/v1/materiais/{materialId}/comentarios/{comentarioId}` envia somente `{ "conteudo": "Texto corrigido" }`. Não envia autor/status/data nem altera o Material. A resposta deve preservar UUID, autor, Material, dataCadastro e ATIVO, além de corresponder ao texto enviado. Campo extra no DTO é descartado. O backend preserva esses atributos; nenhuma alteração de contrato foi necessária.

A mudança aparece imediatamente. Não há ETag/versão/histórico de edição: salvar pode substituir uma edição feita em outra aba. O painel apresenta esse efeito antes do envio. Cancelar descarta o rascunho da edição sem PUT.

## Remoção lógica

“Revisar remoção” abre um painel com texto, UUID e data do comentário, aviso de preservação do registro/texto e ausência de restauração. Abrir, cancelar ou tentar enviar sem confirmação não gera DELETE. A caixa de confirmação e o botão “Confirmar remoção lógica” são obrigatórios.

DELETE usa o mesmo caminho individual, sem corpo/Content-Type/autor ou token na URL. `authenticatedDelete` reutiliza Bearer/401/políticas HTTP e exige204 sem ler JSON. Resposta2xx diferente de204 é erro de protocolo com resultado incerto. Confirmação é consumida antes de cada tentativa e não é reaproveitada em erro, troca de UUID/conta ou fechamento do painel.

O comentário passa a `REMOVIDO` no servidor, sai da lista comum e mantém conteúdo/referências no banco. Não existe exclusão física, anonimização, restauração, remoção do Material ou alteração de Torrent/Magnet. DELETE repetido sobre o mesmo comentário próprio conhecido continua204; a interface não o repete automaticamente.

## Estado, recarga e falhas

Uma ação por vez: o painel aberto bloqueia nova seleção, paginação, recarga comum e cadastro. O rascunho de **novo** comentário fica preservado, separado da edição, em RAM. Durante a mutação também ficam bloqueados fechar, modificar texto/confirmar e submeter novamente.

Sucesso fecha o painel e recarrega a página consultada, sem mudar texto/totais de forma otimista nem reordenar ASC. A correção única de página cobre uma última linha removida. Falha de rede na recarga mantém a mensagem de mutação confirmada e mostra erro de consulta separado. Falha de acesso401/403/404 limpa lista, alvo e rascunhos e deixa a seção indisponível;401 invalida apenas o token usado.404 não é interpretado como página vazia.

Erro400 usa texto local e permite corrigir a edição; em remoção a confirmação continua consumida.409 bloqueia nova mutação pelo painel antigo. Rede/protocolo/408/5xx têm resultado incerto e também bloqueiam outra tentativa. Nesses casos, “Fechar, descartar edição e atualizar lista” elimina o alvo/draft antigo e exige uma consulta nova antes de selecionar outro comentário. Se GET falhar, não há snapshot antigo elegível para nova operação. A ação de fechar nunca repete PUT/DELETE.

Ausência na lista não prova remoção: o comentário pode ter sido ocultado ou a visibilidade pode ter mudado. Uma nova seleção lê o texto atual disponível e exige nova confirmação para remover; isso não é controle de versão nem garantia contra mudanças concorrentes. Não há retry automático.

AbortController e identidade da tarefa descartam respostas após mudança de Material/conta/desmontagem. A saída limpa dados em RAM, mas cancelar a espera não garante cancelar uma gravação no servidor. Mensagens de erro não ecoam ProblemDetail privado, SQL ou texto rejeitado.

O foco é direcionado ao título do painel ao abri-lo e ao título da seção ao fechar. A implementação usa elementos nativos/labels/aria-busy/role alert-status; o comportamento real de foco e leitores de tela ainda precisa de validação em navegador.

## Execução e validação

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Abra http://localhost:5173 e entre com uma conta existente. Use apenas registros descartáveis identificados para os passos de escrita manual; eles alteram dados reais, sem limpeza automática:

1. Abrir Material PUBLICADO com comentário próprio e de terceiro. Apenas o próprio deve oferecer ações, inclusive usando conta de equipe ou dono do Material.
2. Editar texto, cancelar e conferir ausência de alteração. Testar branco/limite/HTML como texto; salvar e conferir conteúdo/data preservada. Salvar sem mudança não envia.
3. Revisar remoção, cancelar e tentar sem caixa marcada: nenhuma remoção. Confirmar e conferir saída da lista, sem opção de restauração. Recarregar a última página depois de remover sua última linha.
4. Conferir rascunho de novo comentário preservado ao abrir/fechar ações; paginação/recarga/cadastro ficam bloqueados enquanto o painel está aberto.
5. Em ambiente descartável, mudar estado após seleção: PUT pode retornar404/409; DELETE próprio conhecido continua permitido. Nenhuma consulta privada é adicionada.
6. Simular falha de resposta: não deve haver reenvio automático; fechar/atualizar antes de nova seleção. Conferir estado atual antes de outra edição. Mudar Material/conta durante envio não deve restaurar alvo antigo.
7. Verificar foco, teclado, leitor de tela e layout desktop/320px. Sair durante envio pode deixar a operação concluída no servidor.

`npm run verify` passou com **555 testes**, zero falhas/cancelados/ignorados, vue-tsc e build Vite aprovados. São46 novos sobre509:45 testes de service/modelo e1 HTTP sintético. Cobrem autoria/DTO/PUT mínimo/DELETE204, confirmação consumida, conflitos/acesso, bloqueios, recarga/página encolhida, resposta perdida e troca de conta/Material/dispose. A primeira execução falhou numa expectativa do teste HTTP que tratava novo envio explícito após400 como duplicação em voo; expectativa corrigida, sem relaxar os bloqueios de resultado incerto.

HTTP sintético utiliza servidor Node local e dados em RAM, não Spring/PostgreSQL ou prova de locks/rollback/autorização no backend. Vite retornou200 no fallback de detalhe e nos componentes MaterialView/ComentariosSection compilados; servidor temporário encerrado. Navegador indisponível: visual/mobile/DOM/foco/E2E com backend real pendentes. Nenhum PUT/DELETE contra Spring ou dado real alterado. Sem Java/schema/dependência/Maven/Docker/.env real/credenciais/publicação/commit/push; suite Maven registrada549 não reexecutada.

Próximo recomendado: avaliações, começando por resumo, cadastro e consulta da própria nota0,00..5,00 com atéduas casas, respeitando a proibição de autoavaliação já existente. Moderação de comentários/histórico e demais interações ficam em incrementos separados.
