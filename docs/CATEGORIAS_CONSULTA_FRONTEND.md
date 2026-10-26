# Consulta de categorias no frontend

## O que foi implementado

Usuários autenticados podem consultar a lista paginada em `/categorias` e o detalhe em `/categorias/:id`. A navegação está disponível no menu principal e na página da conta. A consulta é igual para `USUARIO`, `MODERADOR` e `ADMINISTRADOR`; o perfil não concede nem restringe acesso localmente.

O serviço usa somente `GET /categorias?page=...&size=...` e `GET /categorias/{id}` com Bearer pelo cliente autenticado existente. Valida UUIDs, campos e paginação e projeta somente `id`, `nome` e `descricao`. A ordenação fixa da API é preservada; não há busca, filtros, consulta por linha ou mutações nesta etapa.

A lista permite páginas de 20, 50 ou 100 itens. Atualizar preserva a página; trocar o tamanho retorna à primeira página; uma única correção explícita trata página que ficou além do total. Erros não são apresentados como lista vazia. Mudanças observadas de conta/perfil/rota abortam ou ignoram respostas antigas.

## Arquivos

- `src/features/categoria/categoria-service.ts`: GETs, validação e projeção dos DTOs.
- `src/features/categoria/categoria-consulta-model.ts`: paginação, estado de lista/detalhe e controle de contexto.
- `src/features/categoria/CategoriasView.vue`: consulta paginada.
- `src/features/categoria/CategoriaView.vue`: detalhe por UUID.
- `src/router/index.ts`: rotas autenticadas.
- `src/App.vue` e `src/features/auth/ContaView.vue`: navegação para a consulta.
- `tests/categoria-consulta.test.mjs`, `tests/categoria-consulta-http.test.mjs` e `tests/auth-navigation.test.mjs`: testes de serviço/modelo, HTTP sintético e guardas.

Contrato do backend: `../../UNESC-Share-Backend/docs/CATEGORIAS.md`.

## Executar e verificar

Inicie o backend e o frontend conforme o README e abra **Categorias** no menu ou em **Minha conta**. A rota exige login. O detalhe mostra nome e descrição; categorias sem descrição recebem uma indicação local.

```bash
npm run verify
```

A verificação HTTP usa loopback sintético e não acessa PostgreSQL. Nenhuma categoria inicial é alterada. A inspeção visual/DOM e o E2E em navegador permanecem pendentes.

## Próximo incremento

Cadastro administrativo de categorias. O contrato limita o nome a 80 caracteres e a descrição a 500; a API normaliza os espaços e decide duplicidade. As nove categorias de seed devem ser preservadas durante testes.
