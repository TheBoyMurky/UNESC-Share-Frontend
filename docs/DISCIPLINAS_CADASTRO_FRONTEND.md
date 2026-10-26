# Cadastro de disciplinas no frontend

## O que foi implementado

Na consulta de disciplinas, usuários com perfil `ADMINISTRADOR` veem **Cadastrar disciplina**. A rota `/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas/nova` é protegida pelo Vue Router e valida o usuário pelo `/usuarios/me`. O backend mantém a autorização final.

O formulário consulta a instituição e o curso por UUID e confere o vínculo antes de aceitar cadastro. O curso fica fixo na rota. O POST `/disciplinas` envia somente `nome`, `descricao`, `codigo` e `cursoId`.

- Nome obrigatório, até 150 caracteres.
- Código obrigatório, até 30 caracteres, trim e maiúsculas antes do envio. É string para preservar zeros à esquerda.
- Descrição opcional, até 1000 caracteres; vazia é enviada como `null`.
- Sem `id`, lista de materiais ou outras propriedades no payload.

O backend limita código duplicado dentro do curso e devolve `409`; nomes iguais podem ter códigos diferentes. Como a Matriz 6 já está populada, não recadastre códigos existentes. Não preencha descrição/ementa que não esteja na fonte oficial. O contrato completo, incluindo semântica de erros e integridade, está em `../UNESC-Share-Backend/docs/DISCIPLINAS.md`.

## Tratamento de resultados

- `201`: valida o UUID e os dados retornados, limpa o rascunho e mostra confirmação; a lista é consultada novamente ao voltar.
- `400`: mantém o rascunho para correção.
- `409`: impede repetir o mesmo payload normalizado; editar os dados libera uma nova tentativa.
- `401/403/404`: remove o alvo e exige reabrir a tela; `403` não faz logout.
- Rede, resposta inválida, `408` ou `5xx`: o resultado pode ser incerto. Edição e reenvio ficam bloqueados até descartar o rascunho; não há retry automático nem tentativa de adivinhar o resultado por uma página da lista.

Trocas de conta/perfil/rota e desmontagem cancelam ou ignoram respostas antigas. Cancelar a espera não garante rollback no servidor. Os dados do formulário ficam somente em memória.

## Arquivos

- `src/features/disciplina/DisciplinaCadastroView.vue`: formulário e estados acessíveis.
- `src/features/disciplina/disciplina-cadastro-model.ts`: autorização observada, contexto, validação de fluxo e proteção contra repetição.
- `src/features/disciplina/disciplina-cadastro-service.ts`: normalização, validação, payload e verificação do DTO de resposta.
- `src/features/disciplina/DisciplinasCursoView.vue`: atalho administrativo.
- `src/router/index.ts`: rota com `requiresAdmin`.
- `tests/disciplina-cadastro.test.mjs`, `tests/disciplina-cadastro-http.test.mjs` e `tests/auth-navigation.test.mjs`: serviço/modelo, HTTP sintético e guarda.

## Executar e verificar

Com backend e frontend em execução, autentique-se com um administrador, abra **Instituições → Cursos → Ver disciplinas → Cadastrar disciplina**. Configure `VITE_API_BASE_URL` para terminar em `/api/v1`.

```bash
npm run verify
```

Os testes automatizados simulam HTTP localmente e não inserem registros no PostgreSQL. Não executei Docker nem fiz cadastro real. Inspeção visual/DOM e E2E de navegador permanecem pendentes.
