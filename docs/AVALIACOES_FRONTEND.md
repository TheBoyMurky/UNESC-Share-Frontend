# Avaliações: resumo, consulta própria e cadastro

Este guia registra o primeiro incremento (612 testes). Edição e exclusão da própria nota foram acrescentadas depois, conforme [AVALIACOES_EDICAO_REMOCAO_FRONTEND.md](AVALIACOES_EDICAO_REMOCAO_FRONTEND.md); o README registra a verificação vigente.

Entrega local de 23/10/2026, na tela `/materiais/:id`. A seção é montada somente para Material `PUBLICADO`, independentemente de ser autor ou equipe. Usa os endpoints existentes do backend, que continua responsável por autorização, unicidade, precisão e agregação das notas.

## Estrutura e código completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/avaliacao/avaliacao-service.ts   # Centésimos, DTOs, GETs e POST
src/features/avaliacao/avaliacao-model.ts     # Consultas, nota própria, cadastro e reconciliação
src/features/avaliacao/AvaliacoesSection.vue  # Resumo, nota própria e formulário decimal
src/features/material/MaterialView.vue       # Composição exclusiva de PUBLICADO
src/assets/main.css                         # Estilos responsivos da seção
tests/avaliacao.test.mjs                     # Precisão, contratos, estados e respostas antigas
tests/avaliacao-http.test.mjs                # fetch/Bearer/JSON em HTTP sintético
```

Código completo nesses arquivos, com service/model/view separados. Reutiliza `authenticatedJson`, `ApiError`, UUIDs, Vue/Router e estilos existentes. Sem dependências novas, mudanças de segurança, entidades/schema/Java ou variáveis de ambiente. Comentários e mecanismos de compartilhamento continuam independentes da avaliação; nenhum upload de conteúdo acadêmico foi acrescentado.

## Contrato e permissões

| Operação | Caminho relativo a /api/v1 | Resultado |
| --- | --- | --- |
| Consultar própria | GET /materiais/{id}/avaliacoes/minha | DTO da identidade JWT ou404 |
| Resumo | GET /materiais/{id}/avaliacoes/resumo | Somente media/quantidade |
| Cadastrar | POST /materiais/{id}/avaliacoes | JSON somente nota,201 com DTO |

Bearer somente em Authorization pelo helper existente; sem cookies, usuário/perfil no corpo, token/query ou consulta de notas de terceiros. Identidade vem da API de usuário autenticado, e o backend a deriva do JWT na operação. O DTO próprio projeta id/nota/dataCadastro/usuarioId/materialId, conferindo os UUIDs da conta e da rota. Extras descartados; a resposta de POST também deve corresponder à nota enviada. Location não é usado para navegação arbitrária.

Uma avaliação por usuário/Material. Autor não pode avaliar o próprio Material, inclusive quando é moderador/administrador. A tela compara UUIDs e não oferece cadastro; o service também impede essa tentativa local, e a API revalida definitivamente. O autor ainda pode consultar o resumo. As consultas da API exigem PUBLICADO; visibilidade de detalhe privado não concede exceção.

O escopo é leitura/cadastro. Não há PUT, DELETE, lista de avaliadores ou gerenciamento por equipe nesta entrega. As rotas de edição/remoção já existentes no backend serão integradas separadamente.

## Nota decimal

Campo `type=text` com `inputmode=decimal`, para aceitar tanto vírgula quanto ponto sem depender da conversão do campo number do navegador. Obrigatório, de0 a5, com uma ou duas casas opcionais. Exemplos aceitos: `0`, `0,00`, `4`, `4.5`, `4,25`, `5,00`; espaços externos são retirados. Não aceita sinal, expoente, separador sem fração, zeros extras à esquerda, valor fora do intervalo ou três casas, mesmo `4,250`.

`notaEmCentavos` valida a forma textual inteira e converte em inteiro0..500 por separação dos dígitos. Não usa arredondamento, tolerância de ponto flutuante ou truncamento de entrada. Somente após validar divide por100 para enviar JSON numérico, por exemplo `{ "nota": 4.25 }` ou `{ "nota": 0 }`; JSON não preserva zeros finais. O servidor usa BigDecimal e normaliza escala2 conforme contrato existente.

DTOs exigem nota/média numéricas válidas no intervalo e com até duas casas. Exibição pt-BR sempre com duas casas. A média é a retornada pela API; não calcular média, soma ou quantidade no frontend. `media=null/quantidade=0` aparece como “Sem avaliações”, enquanto `media=0/quantidade=1` aparece como “0,00 / 5,00”, incluindo zero normalmente. Quantidade deve ser inteiro seguro não negativo.

## Ausência, visibilidade e recarga

GET `/minha` retorna404 tanto quando falta nota própria quanto quando o Material está indisponível. O service não classifica a mensagem da exceção: consulta `/minha` primeiro, trata somente HTTP404 como ausência candidata e depois exige `/resumo` válido. Se o resumo também retornar404, a seção fica indisponível e não oferece cadastro; erro de rede/protocolo/401/403 da consulta própria não vira “nenhuma nota”.

Os dois GETs não constituem snapshot. Notas ou estado podem mudar entre consultas; o POST revalida PUBLICADO, autoria e duplicidade sob lock/constraint no backend. Nunca inferir autorização definitiva dessa confirmação local.

Consulta inicial/Atualizar avaliações limpa dados anteriores durante carga e só marca a nota própria como consultada depois da sequência válida. Erro é diferente de ausência. Rascunho fica somente em RAM e é preservado em erros de consulta/correção; muda de Material/autor/conta, sai ou perde acesso, ele é descartado. Não salvar nota/dados em URL/storage/logs.

Cadastro exige confirmação de consulta, ausência de própria nota, resumo disponível, autoria diferente e entrada válida. Durante POST, novo envio, edição da nota e recarga ficam bloqueados. Sucesso mostra a nota do DTO, limpa a entrada e consulta novamente somente o resumo, sem calcular ou incrementar totais localmente. Falha de rede nessa recarga preserva a nota própria e o cadastro confirmado, com erro separado do resumo; nunca sugerir reenviar a nota já confirmada.

401 limpa acesso pelo helper apenas para o token usado.401/403/404 de leitura ou401/404 de escrita retiram dados da seção.403 de escrita bloqueia novos cadastros nesta instância e mostra erro, sem invalidar a sessão nem reclassificar o Material; reabrir detalhes permite conferir a situação atual.

## Conflito e resultado incerto

400 permite corrigir a entrada com mensagem local.409 não é tratado como prova de que existe nota: pode haver duplicidade ou outro conflito. Rede/protocolo/408/5xx também bloqueiam novo cadastro porque a gravação pode ter ocorrido sem resposta válida. Não há retry automático ou conversão de POST em PUT.

“Conferir minha avaliação e resumo” faz somente GETs. Encontrar nota atual remove o formulário e mostra o valor consultado, que pode vir de outra aba; não atribui essa nota ao POST cuja resposta foi perdida. Se a sequência válida continuar indicando ausência, exige o botão explícito “Conferi a ausência de nota; preparar nova tentativa” antes de permitir outro envio. Preparar não envia. Falha na reconsulta não libera o botão. A restrição única do backend continua sendo a garantia contra duas notas do mesmo usuário/Material.

AbortController e identidade das tarefas ignoram respostas antigas após mudança de rota/conta/desmontagem, inclusive resumo posterior de um POST antigo. Cancelar a espera não garante rollback. Mensagens fixas não ecoam nota rejeitada, ProblemDetail privado, SQL ou credenciais.

## Executar e verificar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Abra http://localhost:5173 e autentique-se normalmente. Para testar escrita manual, use Material PUBLICADO descartável de outro usuário; cadastrar nota altera dados reais e não há limpeza automática nesta entrega.

1. Sem notas, conferir “Sem avaliações” e quantidade0. Cadastrar0,00 e conferir nota própria/média0,00/quantidade1.
2. Testar vírgula/ponto, nota4,25, limites0 e5, valores fora do intervalo e três casas: rejeitar sem arredondar. Nunca selecionar zero por padrão.
3. Abrir Material próprio: mostrar resumo e orientação, sem cadastro. Repetir com conta de equipe: não há exceção para autoavaliação.
4. Com nota já existente, mostrar somente a própria, sem campo para cadastrar outra. Não apresentar identidade ou nota individual de terceiros.
5. Material não PUBLICADO não monta seção, inclusive para dono/equipe. Mudança durante carga/envio deve ser revalidada pela API;404 não pode virar ausência com formulário.
6. Simular resposta perdida/conflito, consultar nota atual e conferir ausência de POST automático. Falha na reconsulta não libera nova tentativa.
7. Conferir troca de Material/conta durante consulta/envio, teclado, leitor de tela, entrada decimal no celular e layout desktop/320px.

`npm run verify` passou com **612 testes**, zero falhas/cancelados/ignorados, vue-tsc e build Vite aprovados. São57 novos sobre555:56 de contrato/modelo e1 HTTP sintético. Um teste verifica todos os501 valores em centésimos, com vírgula/ponto e serialização numérica; os demais incluem DTOs,404 ambíguo, zero, autoavaliação, respostas antigas,401/409 e reconciliação de resposta perdida.

HTTP sintético usa servidor Node local e dados em RAM; não é Spring/PostgreSQL, prova de autorização/locks/rollback, DOM ou E2E. Vite retornou200 no fallback de detalhes e nos componentes MaterialView/AvaliacoesSection compilados; servidor temporário encerrado. Sem navegador disponível: visual/mobile/DOM/entrada decimal/teclado/E2E com backend real pendentes. Nenhuma nota real cadastrada, sem Java/schema/dependência/Maven/Docker/backend iniciado/.env real/credenciais/publicação/commit/push. Suite Maven registrada549 não reexecutada.

Continuidade: edição e remoção da própria avaliação implementadas no segundo incremento, preservando a distinção entre remoção física de Avaliacao e remoção lógica de Comentario/Material.
