# Consulta de cursos por instituição

Incremento de 26/10/2026 para a estrutura acadêmica. Em `/instituicoes/:id/cursos`, qualquer perfil autenticado pode consultar cursos da instituição; as escritas seguem exclusivas de ADMINISTRADOR no backend e ainda não fazem parte desta tela.

## Arquivos

Relativos ao repositório `UNESC-Share-Frontend`:

```text
src/features/curso/curso-service.ts                 # GET paginado e parser do DTO
src/features/curso/curso-consulta-model.ts           # identidade, paginação e ciclo de consultas
src/features/curso/CursosInstituicaoView.vue         # tela da instituição selecionada
src/features/instituicao/InstituicaoView.vue         # link para os cursos
src/router/index.ts                                 # rota requiresAuth
tests/curso-consulta.test.mjs                       # contrato/modelo
tests/curso-consulta-http.test.mjs                  # HTTP com servidor sintético
tests/auth-navigation.test.mjs                     # acesso aos três perfis
```

## Consulta e contrato

Ao abrir a rota, o frontend valida a instituição com `GET /instituicoes/{id}`. Depois consulta `GET /cursos?instituicaoId={uuid}&page={n}&size={tamanho}`. Ambas as rotas são relativas a `/api/v1` e usam o Bearer por `authenticatedJson`.

O serviço confere que cada curso tem UUID, nome não vazio até150 caracteres, descrição nula ou até1000 caracteres e o mesmo `instituicaoId` filtrado. Projeta apenas `id`, `nome`, `descricao` e `instituicaoId`, rejeitando IDs duplicados e metadados de página incoerentes. A ordenação continua fixa no backend por nome/UUID. Página inicial0; tamanhos20/50/100; se a página atual deixar de existir, há uma correção de página limitada a uma tentativa.

O GET inicial da instituição evita tratar o `200` com cursos vazios de um UUID inexistente como se confirmasse a existência da instituição. A instituição e os cursos são duas consultas sequenciais, sem consulta por curso/N+1.

## Acesso e falhas

A rota exige autenticação e não restringe perfil: USUARIO, MODERADOR e ADMINISTRADOR podem ler. A UI não mostra ações de escrita nesta etapa. A API permanece autoridade.

- 401/403 limpam a página e bloqueiam novas consultas nesta instância; 403 não encerra a sessão.
- Rede/protocolo/5xx aparece como erro, nunca como lista vazia; atualização explícita pode tentar novamente.
- UUID inválido não dispara HTTP. GET404 da instituição apresenta o vínculo como indisponível.
- Troca de instituição/conta/perfil e dispose abortam/ignoram respostas antigas; dados ficam em RAM e não são guardados em URL/storage/logs.

## Executar e validar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# em outro terminal
npm run verify
```

Nesta entrega passaram 1208 testes frontend, TypeScript/build e 27 testes Maven focados no PostgreSQL local (21 API+6 serviço). Os testes HTTP do frontend usam servidor sintético e não integram a tela Vue com Spring. A suíte Maven verifica o contrato backend separadamente. Sem validação visual/DOM em navegador nesta entrega.

Próximo incremento recomendado: cadastro de cursos somente ADMINISTRADOR, reusando as regras de nome/descrição e instituição existente. Edição sem transferência de instituição e exclusão com409 quando houver disciplinas podem vir em incrementos posteriores. Contrato backend em `../UNESC-Share-Backend/docs/CURSOS.md`.
