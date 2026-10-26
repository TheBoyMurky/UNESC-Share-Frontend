# Exclusão de cursos — frontend

Entrega de 26/10/2026. `ADMINISTRADOR` pode solicitar exclusão física em `/instituicoes/:instituicaoId/cursos/:id/excluir`. A leitura continua disponível aos três perfis autenticados.

## Arquivos

- `src/features/curso/curso-exclusao-service.ts`: consulta curso e instituição, valida o vínculo e chama DELETE por UUID.
- `src/features/curso/curso-exclusao-model.ts`: guarda de perfil, confirmação consumível, conflito, resultado incerto e descarte de respostas antigas.
- `src/features/curso/CursoExclusaoView.vue`: resumo do alvo, confirmação explícita e mensagens de estado.
- `src/features/curso/CursosInstituicaoView.vue`: atalho **Excluir curso**, somente para administradores.
- `src/router/index.ts`: rota protegida por `requiresAuth` e `requiresAdmin`.
- `tests/curso-exclusao.test.mjs`, `tests/curso-exclusao-http.test.mjs` e `tests/auth-navigation.test.mjs`: service/modelo, HTTP sintético e guarda.

## Fluxo e contrato

Ao abrir, consulta `GET /cursos/{id}` e confere se o curso pertence à instituição da rota; em seguida consulta `GET /instituicoes/{instituicaoId}` para identificar o vínculo. Nenhum DELETE é enviado ao abrir ou cancelar. O usuário precisa marcar a confirmação e acionar **Confirmar exclusão física**. A confirmação é consumida a cada tentativa.

O pedido é `DELETE /cursos/{id}`, sem corpo, query de identidade ou `Content-Type`. O cliente autenticado exige resposta HTTP `204` sem corpo para confirmar. O frontend não consulta disciplinas nem tenta prever a exclusão: o backend é autoridade e recusa com `409` se houver disciplinas ou conflito de estado. Não há cascata nem restauração.

- `204`: confirma a exclusão e oferece retorno à lista.
- `409`: informa que a API não confirmou a exclusão e que pode haver disciplinas vinculadas ou mudança de estado. Bloqueia nova confirmação até consultar curso/instituição explicitamente.
- `401/403`: limpa o alvo e bloqueia a instância; `403` não encerra a sessão.
- `404`: remove o alvo sem apresentar a resposta como confirmação da tentativa.
- Rede, resposta inesperada, `408` ou `5xx`: resultado incerto; bloqueia novo DELETE até GET explícito e confirmação renovada. Se o GET retornar `404`, não afirma sucesso nem oferece outro DELETE.
- `400`/outros erros conhecidos: mantém o alvo e exige nova confirmação manual.

Mudanças observadas de conta/perfil/rota e desmontagem abortam/ignoram respostas antigas. Abortar o cliente não garante rollback de operação já recebida pelo servidor. Sem controle de versão, um registro pode mudar entre GET e DELETE; o backend revalida estado e vínculos.

## Executar e validar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
```

Com backend e PostgreSQL em execução, entre como `ADMINISTRADOR`, abra uma instituição → **Cursos da instituição** → **Excluir curso**. Para validar testes, TypeScript e build:

```bash
npm run verify
```

Em 26/10/2026, a suíte passou com **1260 testes**, TypeScript e build aprovados: 17 novos (15 service/modelo, 1 HTTP sintético e 1 guarda), com 1243 regressões preservadas. Os **27 testes Maven focados de Curso** (21 API + 6 serviço) também passaram contra PostgreSQL local, cobrindo `409` e a integridade dos vínculos. O teste HTTP frontend usa servidor sintético; não integra componente Vue com Spring/PostgreSQL. Sem alteração Java/schema/dependências e sem comandos Docker. A inspeção visual/DOM/teclado/foco/E2E em navegador continua pendente.
