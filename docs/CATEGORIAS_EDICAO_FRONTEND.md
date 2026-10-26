# Edição de categorias no frontend

## O que foi implementado

Somente `ADMINISTRADOR` pode editar uma categoria em `/categorias/:id/editar`. A tela de detalhe oferece a ação **Editar categoria** para administradores; a rota exige autenticação e `requiresAdmin` no Vue Router, enquanto a API continua sendo autoridade de autorização.

O formulário consulta `GET /categorias/{id}` antes de carregar os campos e usa o UUID da rota no PUT. O corpo é completo e contém somente `nome` e `descricao`; o UUID e os materiais associados permanecem inalterados. Nome é obrigatório até 80 caracteres; descrição é opcional até 500. Espaços externos são removidos, a capitalização é preservada e descrição vazia vira `null`.

## Respostas e concorrência

- `200`: valida UUID e os campos retornados. A tela mostra sucesso e permite consultar os dados atuais explicitamente.
- `400`: mantém o rascunho para correção.
- `409`: bloqueia nova edição até GET explícito da categoria atual; o GET substitui o rascunho pelos dados consultados antes de uma nova decisão.
- Rede, resposta inválida, `408` ou `5xx`: resultado potencialmente incerto; bloqueia nova edição até GET explícito.
- `401/403/404`: remove categoria e rascunho; é necessário reabrir a tela. `403` não encerra a sessão.
- O PUT não é enviado se nome e descrição normalizados não mudaram.
- Trocas observadas de conta/perfil/UUID e desmontagem abortam ou ignoram respostas antigas. O backend não oferece ETag/versão; edições concorrentes podem sobrescrever mudanças. Abortamento do cliente não garante rollback.

O rascunho permanece em memória. Não edite as nove categorias iniciais durante uma validação: `SEED_ENABLED` pode recriar categorias iniciais renomeadas ou removidas.

## Arquivos

- `src/features/categoria/categoria-edicao-service.ts`: GET/PUT, validação e projeção.
- `src/features/categoria/categoria-edicao-model.ts`: autorização observada, baseline, rascunho e bloqueios após conflito/incerteza.
- `src/features/categoria/CategoriaEdicaoView.vue`: formulário e estados.
- `src/features/categoria/CategoriaView.vue`: ação administrativa no detalhe.
- `src/router/index.ts`: rota protegida para administradores.
- `tests/categoria-edicao.test.mjs`, `tests/categoria-edicao-http.test.mjs` e `tests/auth-navigation.test.mjs`: serviço/modelo, HTTP sintético e guarda.

Contrato backend: `../../UNESC-Share-Backend/docs/CATEGORIAS.md`.

## Executar e verificar

Inicie os serviços conforme os READMEs e use uma conta administradora. Navegue por **Categorias → abrir detalhe → Editar categoria**. Para teste manual, use somente categorias de teste dedicadas; a suíte HTTP automatizada é sintética e não altera PostgreSQL.

```bash
npm run verify
```

Inspeção visual, DOM, teclado e E2E em navegador permanecem pendentes.
