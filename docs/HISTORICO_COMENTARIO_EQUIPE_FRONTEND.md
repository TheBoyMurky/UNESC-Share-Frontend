# Histórico de moderação de comentário

Atualização posterior em26/10/2026: [ocultação com motivo e confirmação](OCULTACAO_COMENTARIO_FRONTEND.md) integrada em composição com este leitor. Este guia registra a entrega anterior de histórico e seus993 testes; o fluxo de histórico permanece somente de leitura.

Entrega de 25/10/2026, na seção de comentários da revisão `/moderacao/materiais/:id`. A equipe seleciona um comentário da página carregada para consultar eventos, sem recuperar seu texto após remoção lógica. Somente leitura nesta entrega.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/moderacao-comentario-service.ts     # Consulta e parser dos eventos
src/features/moderacao/comentario-consulta-equipe-model.ts # Composição: lista ou histórico, sem texto retido
src/features/moderacao/ComentarioHistoricoPanel.vue        # Painel paginado de eventos
src/features/moderacao/ComentariosModeracaoSection.vue     # Seleção de comentário e troca de painel
src/features/moderacao/moderacao-comentario-model.ts        # Dependência restrita ao método list
src/features/moderacao/moderacao-fila-model.ts              # Fábrica compartilhada de estado vazio
tests/comentario-historico.test.mjs                        # Contratos, descarte e contexto
tests/comentario-historico-http.test.mjs                   # HTTP sintético
```

Código completo nesses arquivos. Reutiliza listagem, paginação, cliente Bearer, validação de páginas, perfil/guardas e estilos já existentes. O novo modelo coordena uma única consulta ativa e não carrega o objeto do comentário para o histórico. Extração da fábrica de estado e restrição de dependência não mudam a fila anterior. Sem dependências, variáveis, rotas, entidades/schema, Java ou endpoints novos.

## Contrato existente

`GET /materiais/{materialId}/comentarios/{comentarioId}/historico-moderacao?page=0&size=20`, relativo à base `/api/v1`. Usa `authenticatedJson`/Authorization Bearer, sem corpo, cookies, Content-Type artificial, filtros extras ou fallback para a consulta comum.

Mantém sete campos: id, comentarioId, responsavelId, motivo, estadoAnterior, estadoNovo e dataCadastro. Confere UUID do comentário esperado, IDs de evento/responsável, data, motivo obrigatório até1000 semU+0000 e transição ATIVO→OCULTO ou OCULTO→ATIVO. Campos extras, inclusive conteudo/autor/nome/email, são descartados; eventos duplicados ou página incoerente são recusados. O backend verifica se o comentário pertence ao Material da rota; o histórico não contém campo materialId para conferência independente no cliente.

Motivo é texto simples escapado pelo Vue, com quebras de linha. Responsável identifica quem registrou a decisão, não necessariamente o autor do comentário. Não buscar nomes ou contas em requisições adicionais. Texto livre de motivo pode conter dados pessoais escritos pelo responsável; a projeção de campos não anonimiza seu conteúdo.

## Seleção e descarte de texto

Abrir a revisão consulta apenas a lista; não há prefetch de histórico. O botão de cada linha usa UUID de comentário ATIVO/OCULTO da página atualmente carregada. O modelo recusa UUID inválido, ausente da página, outra seleção com painel aberto ou falta de equipe válida. Não existe formulário de UUID arbitrário.

Ao abrir, descarta **toda a página textual**, cancela sua consulta e guarda somente o UUID selecionado. O estado do painel contém apenas metadados/eventos, sem texto, autor ou estado anterior do objeto selecionado. A lista não fica guardada atrás do painel. Isso não apaga o que o usuário já leu, mas evita reapresentar um snapshot textual enquanto consulta o histórico.

O endpoint permite histórico após remoção lógica pelo autor, sem devolver texto do comentário. Uma seleção conhecida pode continuar paginando/atualizando eventos após essa remoção, sem GET individual ou releitura do comentário. Voltar fecha/cancela o painel e consulta a lista atual desde20/primeira página; se o comentário não estiver mais na lista, não pode ser selecionado novamente por esta interface. A API permanece responsável pela permissão do par Material/comentário em cada GET.

## Paginação, consistência e erros

Histórico20/50/100, ordem recebida `dataCadastro/id ASC`; alterar tamanho volta à página zero e Atualizar conserva página/tamanho. Página fora do intervalo admite uma única correção, inclusive totalzero. Abrir outro contexto ou voltar à lista reinicia a paginação. Um painel por vez; pode ser fechado durante leitura pendente, cancelando/ignorando resposta antiga.

Não impor continuidade entre páginas nem inferir estado atual do comentário pelo último evento. Histórico registra somente ocultações/reexibições bem-sucedidas, não todas as edições/remoções; registros legados podem não ter eventos. Página parcial/vazia não prova ausência de moderação. Sem snapshot entre seleção, histórico e outras abas; a interface não reconstrói eventos ausentes.

Nova consulta retira eventos anteriores antes do GET. Rede/protocolo/5xx mostram erro com página nula e permitem retryGET explícito; não viram histórico vazio.401/403/404 retiram alvo/eventos e bloqueiam histórico naquela instância até nova carga;403 não encerra sessão e401 rejeita o token efetivamente enviado. Voltar à lista é uma consulta explícita de outro recurso, autorizada novamente pela API; não repete automaticamente a requisição negada. Sem identidade/perfil válidos, nem essa volta envia GET. Mensagens não refletem corpo privado de erro.

Material, conta, perfil, geração e dispose descartam/cancelam/ignoram respostas antigas. Um403 antigo não bloqueia novo Material/comentário; uma página antiga não reapresenta motivos após trocar seleção. Perfil de `/usuarios/me` é conveniência de UI, não revogação imediata de roles do JWT. Dados em RAM, sem query string de conteúdo, storage ou logs privados.

Consulta comum permanece ATIVO/PUBLICADO; equipe mantém ATIVO/OCULTO em qualquer estado do Material. Nenhum texto de comentário REMOVIDO é buscado pela funcionalidade de histórico. Não há ocultação/reexibição, edição, exclusão, restauração ou escrita arbitrária de auditoria nesta entrega. Não aplicar o conflito de interesse específico de Denuncia a comentários.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com conta de equipe existente: Moderação → revisar Material → Comentários para moderação → Consultar histórico. Não reativar bootstrap ou criar dados reais apenas para demonstração; a suíte usa dados sintéticos.

Roteiro manual: selecionar ATIVO/OCULTO; conferir que lista/texto/autor desaparecem no painel; paginação/tamanhos/vazio/erro; fechar durante GET e selecionar outra linha; atualizar após remoção em outra aba sem consultar texto; voltar à lista atual; troca de conta/perfil/Material;401/403/404 retirando alvo/motivos; teclado/foco/320px. Não deve haver mutações ou chamadas a contas/nomes/GET individual do texto.

`npm run verify`: **993 testes**, zero falhas/cancelados/ignorados, TypeScript/build aprovados. São25 novos sobre968:24 service/modelo e1 HTTP sintético. As968 regressões passaram após compor os painéis. Cobertura inclui seleção conhecida, descarte de texto antes de GET, projeção de extras, histórico após remoção sintética, paginação, negativos de acesso e respostas antigas. HTTP Node em RAM com Bearer falso não é Spring/PostgreSQL, DOM ou prova de autorização real/montagem de componentes.

Vite retornou200 na rota e módulos de seção/painel/Material compilados; servidor temporário encerrado. Inventário sem navegador: visual/mobile/DOM/teclado/foco/E2E com Spring pendentes. Sem Java/schema/dependências/Maven/Docker/backend iniciado/.env real/credenciais/dados reais/deploy/operações Git. Maven completo549/focado materiais20 permanecem históricos, não reexecutados.

Próximo recomendado: ocultação de comentário com motivo e confirmação explícita; reexibição depois, respeitando Material PUBLICADO.
