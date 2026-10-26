# Exclusão de instituições por administradores

Entrega de 26/10/2026 em `/instituicoes/:id/excluir`. A rota exige ADMINISTRADOR e usa os endpoints existentes, sem alteração do backend. A leitura continua liberada para os três perfis autenticados.

## Arquivos

Relativos ao repositório `UNESC-Share-Frontend`:

```text
src/features/instituicao/instituicao-exclusao-service.ts # GET do alvo e DELETE pelo UUID
src/features/instituicao/instituicao-exclusao-model.ts   # contexto, confirmação, conflitos e resultado incerto
src/features/instituicao/InstituicaoExclusaoView.vue     # confirmação explícita
src/features/instituicao/InstituicaoView.vue             # atalho para ADMINISTRADOR
src/router/index.ts                                     # rota requiresAdmin
tests/instituicao-exclusao.test.mjs                     # serviço/modelo
tests/instituicao-exclusao-http.test.mjs                # HTTP com servidor sintético
tests/auth-navigation.test.mjs                          # autorização da rota
```

## Fluxo e contrato

Ao abrir a tela, o frontend consulta `GET /instituicoes/{id}` e mostra nome, sigla e UUID. Nenhum DELETE ocorre ao abrir, cancelar ou atualizar. O usuário precisa marcar a confirmação e acionar **Confirmar exclusão física**. A cada tentativa, a confirmação é consumida.

O envio usa `DELETE /instituicoes/{id}` (relativo a `/api/v1`), sem corpo, query de identidade ou `Content-Type`. O helper autenticado exige resposta HTTP 204 sem corpo para confirmar. Não há chamada automática à lista ou consulta dos cursos vinculados. O backend revalida a existência e as dependências, mantendo a FK como proteção e sem cascata.

## Tratamento das respostas

- `204`: mostra exclusão confirmada e oferece retorno à lista.
- `409`: informa que há cursos vinculados ou conflito de estado. A tela desabilita nova confirmação até um GET explícito; não afirma qual curso causou o bloqueio.
- `401/403`: limpa o alvo e bloqueia a instância; 403 não encerra a sessão.
- `404`: informa que o registro não está disponível; não atribui o resultado à tentativa atual.
- Rede, protocolo, `408` ou `5xx`: resultado incerto. Bloqueia novo DELETE até GET explícito e confirmação renovada. Se esse GET retornar 404, a tela não afirma sucesso e não oferece nova exclusão.
- Mudança observada de conta/perfil, rota ou dispose aborta/ignora respostas antigas. O aborto não garante rollback no servidor.

A exclusão é física e não tem restauração. A UI avisa que cursos não serão excluídos em cascata. O backend continua autoridade: a guarda `requiresAdmin` e o modelo usam perfil de `/usuarios/me` como proteção da interface, mas não substituem autorização do Bearer na API.

## Executar e validar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# em outro terminal
npm run verify
```

Abra um detalhe de instituição como ADMINISTRADOR e teste a confirmação. Para testar 409 real, use uma instituição que tenha curso vinculado; uma instituição sem cursos pode ser removida fisicamente, então não use dados reais sem intenção. A suíte desta entrega passou com 1197 testes frontend, TypeScript/build, além de 21 testes Maven focados (16 API e 5 serviço) no PostgreSQL local. O HTTP do frontend usa servidor sintético; o Maven valida o contrato backend separadamente, sem integrar a tela Vue com Spring. Validação visual/DOM em navegador não foi feita nesta entrega.
