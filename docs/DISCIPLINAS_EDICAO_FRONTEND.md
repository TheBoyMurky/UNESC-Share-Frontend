# Edição de disciplinas no frontend

## O que foi implementado

Usuários `ADMINISTRADOR` podem editar disciplinas pela ação **Editar disciplina** na consulta do curso. A rota é `/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas/:disciplinaId/editar` e exige autenticação e perfil administrativo no Vue Router; o backend continua sendo a autoridade de autorização.

A tela consulta instituição, curso e disciplina por UUID antes de carregar o formulário e confere todos os vínculos. O curso é imutável. O PUT completo para `/disciplinas/{id}` envia somente `nome`, `descricao`, `codigo` e o mesmo `cursoId`.

- Nome obrigatório até 150 caracteres.
- Código obrigatório até 30 caracteres; trim, maiúsculas e preservação de zeros à esquerda.
- Descrição opcional até 1000 caracteres; vazia vira `null`.
- Sem transferência de curso, alteração de UUID ou mutação de materiais.
- PUT não é enviado quando os valores normalizados não mudaram.

## Tratamento de resultados

- `200`: valida o DTO/UUID/vínculo e mostra confirmação; uma leitura GET explícita atualiza a tela.
- `400`: mantém o rascunho para correção.
- `409`: bloqueia o formulário até GET explícito da disciplina; esse GET repovoa os valores atuais antes de nova decisão.
- Rede, resposta inválida, `408` ou `5xx`: resultado potencialmente incerto; bloqueia a edição e exige GET explícito antes de nova tentativa.
- `401/403/404`: remove alvo e rascunho e exige reabrir; `403` não faz logout.

Não há retry automático, `ETag` ou garantia contra sobrescrita por edições concorrentes. Mudanças observadas de conta/perfil/rota e desmontagem abortam ou ignoram respostas antigas; abortar o cliente não garante rollback no servidor. O formulário fica em memória.

## Arquivos

- `src/features/disciplina/DisciplinaEdicaoView.vue`: formulário e estados.
- `src/features/disciplina/disciplina-edicao-model.ts`: acesso, contexto, consulta, rascunho e fluxo de atualização.
- `src/features/disciplina/disciplina-edicao-service.ts`: GET/PUT, validação e projeção do DTO.
- `src/features/disciplina/DisciplinasCursoView.vue`: ação administrativa por linha.
- `src/router/index.ts`: rota administrativa.
- `tests/disciplina-edicao.test.mjs`, `tests/disciplina-edicao-http.test.mjs` e `tests/auth-navigation.test.mjs`: testes de serviço/modelo, HTTP sintético e guarda.

O contrato backend completo está em `../UNESC-Share-Backend/docs/DISCIPLINAS.md`. Edições de códigos oficiais devem usar a fonte da Matriz 6; não criar ementas com dados da Matriz 5.

## Executar e verificar

Com frontend e backend em execução, entre com uma conta administradora e navegue por **Instituições → Cursos → Ver disciplinas → Editar disciplina**.

```bash
npm run verify
```

O teste HTTP automatizado usa loopback sintético; ele não grava PostgreSQL nem substitui o teste visual. Inspeção visual/DOM e E2E em navegador permanecem pendentes.
