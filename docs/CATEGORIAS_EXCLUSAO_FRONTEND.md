# Exclusão de categorias no frontend

Este incremento adiciona a exclusão física de categorias à administração do catálogo. A categoria precisa estar sem materiais vinculados para o backend permitir a operação.

## Acesso e fluxo

- A consulta inicial é `GET /categorias/{id}`; a tela não envia `DELETE` ao abrir.
- A rota `/categorias/:id/excluir` e a ação no detalhe estão disponíveis somente para `ADMINISTRADOR`. O backend continua sendo a autoridade de autorização.
- O administrador confere UUID, nome e descrição, marca a confirmação e aciona o botão explícito.
- O `DELETE /categorias/{id}` envia somente o UUID no caminho, sem corpo, query de identidade ou `Content-Type`.
- Somente `204 No Content` do cliente HTTP autenticado conclui a exclusão. `404` não é mostrado como sucesso.

## Integridade e erros

O backend retorna `409` se qualquer material estiver associado, incluindo `PENDENTE`, `PUBLICADO`, `BLOQUEADO` ou `REMOVIDO`. A tela informa esse bloqueio sem exibir detalhes privados e exige nova consulta antes de uma confirmação posterior. Não há cascata: materiais, torrents e magnets não são removidos.

`401/403` retiram o alvo da tela; `403` não encerra a sessão. Conflitos e resultados incertos (rede, protocolo, `408` ou `5xx`) consomem a confirmação e bloqueiam nova tentativa até um GET explícito. Se essa consulta responder `404`, a tela não infere que a tentativa anterior foi concluída e não permite outro DELETE.

Troca observada de UUID, conta, perfil ou desmontagem cancela/ignora respostas antigas. Abortar a requisição no navegador não garante rollback de uma operação que o servidor já recebeu. Não há controle de versão; uma alteração concorrente entre GET e DELETE pode resultar em conflito.

## Testes

Os testes unitários/modelo verificam acesso, confirmação, `204`, conflitos, resultados incertos, estados `401/403/404` e descarte de respostas antigas. O teste HTTP usa um servidor sintético local para conferir Bearer, DELETE sem corpo, `204` estrito, `409`, resposta `200` inesperada e conexão interrompida. Ele não acessa Spring nem PostgreSQL.

Para executar:

```bash
node --test tests/categoria-exclusao.test.mjs tests/categoria-exclusao-http.test.mjs tests/auth-navigation.test.mjs
npm run verify
```

Não use as nove categorias iniciais para validação manual: se `SEED_ENABLED` estiver ativo, uma categoria inicial renomeada ou excluída pode ser criada novamente com outro UUID. Use somente categoria descartável, sem materiais vinculados.

## Arquivos

- `src/features/categoria/categoria-exclusao-service.ts`
- `src/features/categoria/categoria-exclusao-model.ts`
- `src/features/categoria/CategoriaExclusaoView.vue`
- `src/router/index.ts`
- `tests/categoria-exclusao.test.mjs`
- `tests/categoria-exclusao-http.test.mjs`

Inspeção visual no navegador, DOM real, responsividade, teclado e fluxo E2E permanecem pendentes enquanto não houver navegador disponível nesta sessão.
