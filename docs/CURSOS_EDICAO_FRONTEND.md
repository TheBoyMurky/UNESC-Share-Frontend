# Edição de cursos — frontend

Entrega de 26/10/2026. `ADMINISTRADOR` pode editar nome e descrição em `/instituicoes/:instituicaoId/cursos/:id/editar`. A instituição do curso não pode ser transferida nesta operação. A leitura continua disponível aos três perfis autenticados.

## Arquivos

- `src/features/curso/curso-edicao-service.ts`: GET/PUT por UUID, validação do DTO e corpo completo exigido pelo backend.
- `src/features/curso/curso-edicao-model.ts`: consulta inicial do curso e da instituição, valida vínculo, rascunho, permissões, envio e resultados incertos.
- `src/features/curso/CursoEdicaoView.vue`: formulário, estados e recuperação explícita.
- `src/features/curso/CursosInstituicaoView.vue`: link **Editar curso**, somente para administradores.
- `src/router/index.ts`: rota protegida por `requiresAuth` e `requiresAdmin`.
- `tests/curso-edicao.test.mjs`, `tests/curso-edicao-http.test.mjs` e `tests/auth-navigation.test.mjs`: testes de service/modelo, HTTP sintético e guarda de rota.

## Contrato e comportamento

Ao abrir, consulta `GET /cursos/{id}` e valida que o DTO pertence à instituição da rota; depois consulta `GET /instituicoes/{instituicaoId}`. O formulário deixa o vínculo visível e imutável. O `PUT /cursos/{id}` envia o corpo completo `{ nome, descricao, instituicaoId }`, mantendo o UUID consultado. Nome é obrigatório até 150 caracteres; descrição é opcional até 1000. Os campos são aparados, descrição vazia vira `null`, e U+0000 é rejeitado. Não envia PUT quando os dados não mudaram.

Resposta `200` é conferida contra o UUID, instituição e campos enviados. `400` conserva o rascunho com mensagens locais. `409` bloqueia o formulário até um GET explícito do curso e instituição atuais; depois dessa consulta o rascunho volta aos valores vigentes. Rede, protocolo, `408` e `5xx` também exigem GET explícito antes de nova edição, pois não é possível saber se o PUT foi aplicado. `401`, `403` ou `404` limpam o alvo e bloqueiam a instância. Não há retry automático.

Mudanças observadas de conta, perfil, rota e desmontagem cancelam tarefas e ignoram respostas antigas. Cancelar o cliente não garante rollback de um PUT já recebido. O backend permanece autoridade para autorização e para impedir transferência, duplicidade ou edição de curso inexistente. Sem ETag/versão, edições simultâneas ainda podem sobrescrever umas às outras.

## Executar e validar

Na pasta `UNESC-Share-Frontend`:

```bash
npm run dev
```

Inicie backend/PostgreSQL, entre com perfil `ADMINISTRADOR`, abra uma instituição → **Cursos da instituição** → **Editar curso**. Para validar a compilação e a suíte:

```bash
npm run verify
```

Em 26/10/2026, a verificação passou com **1243 testes**, TypeScript e build aprovados; 18 novos testes (16 service/modelo, 1 HTTP sintético e 1 guarda), com 1225 regressões preservadas. O HTTP usa servidor local sintético e não integra Vue ao Spring/PostgreSQL. Os 27 testes Maven de curso passaram na entrega anterior e não foram repetidos, pois o contrato backend já existia e não foi alterado. Sem alteração Java/schema/dependências; nenhum comando Docker. Inspeção visual/DOM, teclado/foco e E2E em navegador continuam pendentes.
