# Exclusão física de disciplinas no frontend

## O que foi implementado

Somente `ADMINISTRADOR` pode abrir a rota `/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas/:disciplinaId/excluir`. A lista de disciplinas exibe a ação **Excluir disciplina** para administradores. A rota exige autenticação e perfil administrativo no Vue Router; o backend continua sendo a autoridade de autorização.

Antes de habilitar a confirmação, a tela consulta instituição, curso e disciplina pelos UUIDs da rota e valida os vínculos. A exclusão é física, por `DELETE /disciplinas/{id}`, sem corpo ou identidade na query. Um `204` sem corpo é a única resposta apresentada como sucesso. A tela exige checkbox e botão explícitos; a confirmação é consumida por tentativa.

## Regras e respostas

- O backend retorna `409` quando há materiais vinculados, inclusive no estado `REMOVIDO`. Não há exclusão em cascata de materiais nem da instituição/curso.
- Após `409`, a tela bloqueia nova confirmação até uma consulta explícita. A resposta não revela os materiais que causaram o conflito.
- Falha de rede, resposta inválida, `408` ou `5xx` deixa o resultado incerto e também exige consulta explícita antes de uma nova confirmação.
- Se um GET posterior retornar `404`, isso não é atribuído como sucesso da tentativa anterior e outro DELETE fica bloqueado.
- `401/403` retiram os dados da tela; `403` não encerra a sessão. `404` no DELETE não é tratado como sucesso.
- Troca observada de conta/perfil/rota e desmontagem abortam ou ignoram respostas antigas. Abortamento do cliente não garante rollback no servidor.

## Arquivos

- `src/features/disciplina/DisciplinaExclusaoView.vue`: confirmação, estados de erro e sucesso.
- `src/features/disciplina/disciplina-exclusao-model.ts`: autorização observada, contexto, confirmação consumível e fluxo.
- `src/features/disciplina/disciplina-exclusao-service.ts`: GET dos vínculos, DELETE por UUID e validação/projeção dos DTOs.
- `src/features/disciplina/DisciplinasCursoView.vue`: ação administrativa na lista.
- `src/router/index.ts`: rota protegida para administradores.
- `tests/disciplina-exclusao.test.mjs`, `tests/disciplina-exclusao-http.test.mjs` e `tests/auth-navigation.test.mjs`: serviço/modelo, servidor HTTP sintético e guarda.

Contrato do backend: `../../UNESC-Share-Backend/docs/DISCIPLINAS.md`.

## Executar e verificar

Com frontend e backend em execução, entre com uma conta administradora e navegue por **Instituições → Cursos → Ver disciplinas → Excluir disciplina**. O teste HTTP sintético cobre a barreira `409` sem criar dados. Para uma verificação manual do sucesso `204`, use somente uma disciplina descartável em ambiente de teste; não use disciplinas da Matriz 6.

```bash
npm run verify
```

A validação automatizada usa servidor HTTP sintético local e não altera o PostgreSQL. Inspeção visual, DOM, navegação por teclado e E2E em navegador permanecem pendentes.
