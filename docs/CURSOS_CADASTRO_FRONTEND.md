# Cadastro de cursos — frontend

Entrega de 26/10/2026. O formulário cadastra um curso sob uma instituição existente. Somente `ADMINISTRADOR` pode abrir a rota e enviar; a consulta de cursos continua disponível aos três perfis autenticados.

## Arquivos

- `src/features/curso/curso-cadastro-service.ts`: valida e normaliza os campos e chama `POST /cursos`.
- `src/features/curso/curso-cadastro-model.ts`: controla consulta da instituição, rascunho, permissões observadas, envio e tratamento de resultado incerto.
- `src/features/curso/CursoCadastroView.vue`: formulário e estados visíveis.
- `src/features/curso/CursosInstituicaoView.vue`: atalho administrativo para o formulário.
- `src/router/index.ts`: rota protegida `/instituicoes/:id/cursos/novo` (`requiresAuth` e `requiresAdmin`).
- `tests/curso-cadastro.test.mjs`, `tests/curso-cadastro-http.test.mjs` e `tests/auth-navigation.test.mjs`: validação do contrato, comportamento do modelo, HTTP sintético e guarda de rota.

## Contrato e comportamento

Ao abrir, o modelo consulta `GET /instituicoes/{id}`. Só após validar o UUID e receber a instituição correspondente habilita o formulário. O corpo do POST contém exatamente `nome`, `descricao` e `instituicaoId`; nome é obrigatório com até 150 caracteres, descrição opcional com até 1000. Ambos são aparados; descrição vazia vira `null`. U+0000 é rejeitado. O formulário não oferece transferência de curso.

Um `201` só é aceito quando UUID, instituição, nome e descrição da resposta correspondem ao pedido. `Location` e campos extras são ignorados. Depois do sucesso, a tela guarda somente o UUID confirmado e oferece consulta à lista atual; não insere dados otimistas na lista.

Erro `400` conserva os campos e apresenta validação local. `409` bloqueia novo envio do mesmo conteúdo normalizado até o usuário alterá-lo. `401`, `403` e `404` limpam o alvo e o rascunho. Rede, protocolo, `408` e `5xx` deixam o rascunho bloqueado porque o POST pode ter sido aplicado; não há retry automático. A pessoa pode descartar o rascunho explicitamente, sem chamada ao servidor, antes de preparar outra tentativa. Falha na consulta inicial tem botão para repetir somente o GET.

Mudanças observadas de conta, perfil ou rota, e desmontagem cancelam tarefas e ignoram respostas atrasadas. Isso não garante rollback de um POST já recebido pelo servidor. Guardas e botões do frontend melhoram o fluxo; o Spring Security continua autoridade para autorização.

## Executar e validar

Na pasta `UNESC-Share-Frontend`:

```bash
npm run dev
```

Entre com usuário `ADMINISTRADOR`, abra uma instituição e selecione **Cursos da instituição** → **Cadastrar curso**. A tela usa a API configurada em `VITE_API_BASE_URL`; o backend/PostgreSQL precisam estar em execução para testar a integração local.

Verificação automatizada:

```bash
npm run verify
```

Em 26/10/2026, a verificação passou com **1225 testes**, TypeScript e build aprovados. Os testes HTTP usam servidor local sintético: não comprovam a integração do componente Vue com Spring/PostgreSQL nem concorrência no banco. Não houve alteração no backend, schema, dependências ou Docker. A inspeção visual/DOM, teclado/foco e E2E em navegador seguem pendentes.
