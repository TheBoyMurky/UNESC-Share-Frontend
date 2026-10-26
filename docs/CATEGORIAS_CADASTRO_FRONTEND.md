# Cadastro de categorias no frontend

## O que foi implementado

Somente `ADMINISTRADOR` pode abrir `/categorias/nova`. A lista autenticada mostra **Cadastrar categoria** apenas para administradores; a rota também exige perfil administrativo no Vue Router. O backend continua sendo a autoridade de autorização.

O formulário envia `POST /categorias` com somente `nome` e `descricao`. Nome é obrigatório (até 80 caracteres); descrição é opcional (até 500). A tela remove espaços externos, preserva maiúsculas/minúsculas e transforma descrição vazia em `null`. A API compara nomes sem distinguir caixa e retorna `409` em caso de duplicidade.

## Respostas e proteção contra reenvio

- `201`: valida UUID, nome e descrição retornados e oferece consulta do novo registro.
- `400`: mantém o rascunho e apresenta mensagens locais, sem ecoar `ProblemDetail`.
- `409`: mantém o rascunho e bloqueia reenvio enquanto o nome normalizado continuar igual sem diferenciar maiúsculas/minúsculas; mudar só a capitalização ou a descrição não libera a tentativa.
- Rede, resposta inválida, `408` ou `5xx`: o cadastro pode ter ocorrido. Não há retry automático; o formulário fica bloqueado até o usuário descartá-lo explicitamente.
- `401/403/404`: limpa o rascunho e exige reabrir o formulário; `403` não encerra a sessão.
- Envio em andamento bloqueia edição e duplicidade. Troca observada de conta/perfil e desmontagem abortam ou ignoram respostas antigas; abortar a espera não garante rollback no servidor.

Os valores do formulário permanecem apenas em memória. Nenhuma categoria de seed foi alterada. O backend pode recriar categorias iniciais renomeadas/removidas se `SEED_ENABLED` continuar ativo; esta tela não implementa edição nem exclusão.

## Arquivos

- `src/features/categoria/categoria-cadastro-service.ts`: normalização, validação e POST.
- `src/features/categoria/categoria-cadastro-model.ts`: autorização observada, rascunho, conflito e envio.
- `src/features/categoria/CategoriaCadastroView.vue`: formulário e estados.
- `src/features/categoria/CategoriasView.vue`: atalho administrativo.
- `src/router/index.ts`: rota protegida por `requiresAdmin`.
- `tests/categoria-cadastro.test.mjs`, `tests/categoria-cadastro-http.test.mjs` e `tests/auth-navigation.test.mjs`: serviço/modelo, HTTP sintético e guarda.

Contrato backend: `../../UNESC-Share-Backend/docs/CATEGORIAS.md`.

## Executar e verificar

Inicie o backend e frontend conforme os respectivos READMEs e entre com uma conta administradora. Navegue por **Categorias → Cadastrar categoria**. Para uma verificação manual, use um nome de teste novo; não renomeie nem exclua as nove categorias iniciais.

```bash
npm run verify
```

O teste HTTP automatizado usa loopback sintético e não acessa PostgreSQL. Inspeção visual, DOM, teclado e E2E em navegador permanecem pendentes.
