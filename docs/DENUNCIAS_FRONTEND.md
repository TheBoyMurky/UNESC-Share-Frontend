# Denúncias: cadastro e acompanhamento próprio

Entrega local de 23/10/2026. Permite relatar problemas de Material PUBLICADO e acompanhar somente as próprias denúncias. Preserva o catálogo BitTorrent e os contratos existentes; não acrescenta upload acadêmico, anexos, edição, exclusão, cancelamento ou moderação.

## Estrutura e código completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/denuncia/denuncia-service.ts         # Enums/labels, validação, DTOs, GET/POST
src/features/denuncia/denuncia-cadastro-model.ts  # Material, rascunho, envio e resultado incerto
src/features/denuncia/denuncia-consulta-model.ts  # Lista/detalhe, conta, paginação e cancelamento
src/features/denuncia/DenunciaCadastroView.vue    # Formulário de motivo/descrição
src/features/denuncia/MinhasDenunciasView.vue     # Acompanhamento paginado
src/features/denuncia/DenunciaView.vue            # Detalhe do próprio relato
src/router/index.ts                             # Três rotas protegidas
src/App.vue                                     # Menu Minhas denúncias
src/features/auth/ContaView.vue                  # Atalho pessoal
src/features/material/MaterialView.vue           # Link para relatar problema em PUBLICADO
src/assets/main.css                             # Formulário, estados e cartões responsivos
tests/denuncia.test.mjs                          # Contratos/modelos/privacidade
tests/denuncia-http.test.mjs                     # fetch/Bearer/HTTP sintético
tests/auth-navigation.test.mjs                   # Guardas com Router em memória
```

Código completo nesses arquivos. Service/model/view separados, sem novas dependências, variáveis, entidades/schema ou Java. Reutiliza `authenticatedJson`, tratamento de401 do token usado, UUIDs, parser de Material e PagedModel/paginação. Não altera sessionStorage ou autenticação.

## Telas e endpoints

| Tela protegida | Acesso | API relativa a /api/v1 |
| --- | --- | --- |
| /materiais/:id/denunciar | Relatar problema nos detalhes PUBLICADO | GET /materiais/{id}; POST /materiais/{id}/denuncias |
| /minhas-denuncias | Menu e Minha conta | GET /denuncias/minhas?page=0&size=20 |
| /denuncias/:id | Lista ou confirmação de cadastro | GET /denuncias/{id} |

O formulário consulta o Material e guarda somente id/titulo/status, sem mecanismos, Magnet URIs, caminhos ou dados do autor. Se não estiver PUBLICADO, não abre cadastro, inclusive para dono/equipe. Qualquer autenticado pode relatar Material publicado, até o próprio; não aplicar a regra de autoavaliação às denúncias. O POST revalida o estado no servidor.

Minhas denúncias sempre usa o subject JWT na API, inclusive para administradores. Não envia usuarioId/filtros/sort na query, não acessa namespace de moderação e não usa a permissão de detalhe privado de Material para consultar relatos alheios. O DTO de denúncia não contém identidade do denunciante: a autorização é conferida pelo backend, não inferida de um campo inventado no frontend.

## Cadastro

Motivos exatos: DIREITOS_AUTORAIS, CONTEUDO_INADEQUADO, LINK_INVALIDO, SPAM e OUTRO. Nenhum motivo é selecionado por padrão. Descrição obrigatória para todos, trim externo, até2000 unidades UTF-16, sem U+0000 ou truncamento de entrada. Campos extras não são enviados.

POST JSON tem somente motivo/descricao. O backend fixa denunciante, UUID/data e estado PENDENTE. A resposta é validada nos seis campos, Material da rota, motivo/texto enviados e estado inicial; o modelo conserva apenas o UUID criado, limpa o rascunho e oferece links de consulta. Location não é seguido nem usado para navegação arbitrária.

Uma denúncia aberta PENDENTE/EM_ANALISE por usuário/Material, independentemente do motivo.409 pode ser duplicidade ou outro conflito e não edita o relato anterior. Depois de PROCEDENTE/IMPROCEDENTE, outro cadastro permitido cria novo UUID/data, preservando o histórico anterior. A denúncia não bloqueia, publica, remove ou altera o Material automaticamente.

O rascunho fica somente em RAM, sem URL/storage/log. O POST bloqueia duplo envio e edição. Sucesso bloqueia novo envio nesta instância.400 usa orientação local e permite correção;401/403/404 retiram Material/rascunho e não liberam envio. Mensagens não ecoam ProblemDetail privado, descrição rejeitada, SQL ou credenciais.

Rede/protocolo/408/5xx têm resultado incerto;409 exige conferir a situação atual. Nos dois casos, esta instância bloqueia reenvio/edição/retry e oferece Minhas denúncias. Para outra tentativa, confira os relatos e reabra o formulário pelo Material. Não há POST automático, tentativa de associar relatos por texto ou busca de todas as páginas em segundo plano. A API não fornece filtro por par usuário/Material nessa listagem; uma página sem relato não prova ausência de denúncia aberta. A proteção contra aberta duplicada continua no protocolo transacional da API, sem nova garantia de unicidade SQL externa.

## Consultas e privacidade

Lista de20/50/100, ordem fixa dataCadastro/id ASC e Atualizar lista. Não há filtros por estado/Material. A lista valida o DTO e projeta apenas id/motivo/status/dataCadastro/materialId, descartando a descrição e extras no estado. Se o total encolher, faz no máximo uma consulta corretiva, inclusive para página0 quando não houver mais registros. Paginação/rascunhos não são persistidos. Erro não é tratado como página vazia.

Detalhe busca o relato novamente e mostra somente os seis campos do DTO: id/motivo/descricao/status/dataCadastro/materialId, com texto interpolado Vue e quebras de linha. Nunca v-html/innerHTML/Markdown executável. Não busca nome do denunciante, título/autor/estado/mecanismos do Material ou informações de moderação que o DTO não fornece.

Os quatro estados são exibidos conforme a API; atualização é manual, sem polling. Relatos próprios continuam legíveis quando o Material fica privado/removido. O link para tentar consultar o Material relacionado é explícito e segue a permissão atual da rota de detalhes; possuir relato não concede acesso privado.

Troca de conta, rota, modo lista/detalhe, nova consulta ou desmontagem cancela tarefas/ignora respostas antigas. Lista/detalhe anteriores são limpos antes da nova consulta e em falha, inclusive401/403/404, evitando exibir relato antigo depois de perda de acesso.401 invalida apenas o token usado pelo helper;403 não revoga sessão. Cancelar a espera não garante cancelar um cadastro no servidor. Descrições de terceiros não são disponibilizadas pela interface; a garantia de autorização real continua no backend.

## Execução e validação

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Abra http://localhost:5173 com conta existente. Use registros descartáveis identificados para cadastro manual: uma denúncia cria dado real e não possui exclusão/cancelamento HTTP por estas telas.

1. Em Material PUBLICADO, usar Relatar problema, conferir alvo e preencher cada motivo. OUTRO também exige descrição. Testar branco/2000caracteres/U+0000; não há anexos.
2. Cadastrar, conferir confirmação PENDENTE e abrir detalhe/Minhas denúncias. Texto com tags deve aparecer literalmente. Não esperar bloqueio do Material.
3. Tentar novo relato enquanto houver PENDENTE/EM_ANALISE, mesmo com outro motivo:409. Após conclusão, novo cadastro cria outro relato, quando permitido pela API.
4. Conferir páginas, tamanhos, atualização e todos os estados. Não devem surgir nomes/títulos/dados privados ausentes do DTO nem consultas adicionais ao Material.
5. Entrar com outra conta: consultar o UUID alheio deve resultar404 e a lista deve conter somente relatos da nova conta, inclusive se ela for equipe.
6. Relato próprio continua legível após Material privado/removido; o cadastro não pode abrir nessa situação. O link explícito para Material pode resultar404 conforme a permissão atual.
7. Simular resposta perdida: não deve reenviar sozinho. Conferir relatos antes de nova tentativa; uma página vazia não prova ausência. Trocar conta/rota durante carga/envio não deve restaurar dados antigos.
8. Conferir teclado, foco na confirmação, leitor de tela e layout desktop/320px.

`npm run verify` passou com **719 testes**, zero falhas/cancelados/ignorados, vue-tsc e build Vite aprovados. São60 novos sobre659:56 de contratos/modelos,1 HTTP sintético e3 guardas Router. Incluem motivos/estados, descrição/DTOs/páginas, projeção sem dados extras, relatos próprios, aberto/concluído, Material privado, erro/resposta perdida,401 e descarte de dados antigos. A primeira verificação713 passou; seis testes adicionais de privacidade também passaram na suíte final719.

HTTP sintético usa servidor Node/fetch e dados em RAM, não Spring/PostgreSQL ou prova de autorização/locks/rollback. Guardas usam Router em memória, não navegação DOM. Vite retornou200 no fallback das três rotas e nos três componentes compilados; servidor temporário encerrado. Navegador indisponível: visual/mobile/DOM/foco/E2E com backend real pendentes. Nenhum cadastro real, Java/schema/dependência/Maven/Docker/backend iniciado/.env real/credencial/dado real/publicação/commit/push. Suite Maven registrada549 não reexecutada.

Próximo recomendado: área de moderação, começando pela consulta da fila de materiais pendentes para a equipe, sem incorporar todas as ações administrativas de uma vez.
