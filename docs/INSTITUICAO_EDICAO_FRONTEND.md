# Edição de instituições por administradores

Entrega de 26/10/2026 em `/instituicoes/:id/editar`. Somente ADMINISTRADOR pode abrir a rota; a consulta e o detalhe continuam disponíveis aos três perfis autenticados. A API existente é usada sem mudanças de backend.

## Arquivos

Relativos ao repositório `UNESC-Share-Frontend`:

```text
src/features/instituicao/instituicao-cadastro-service.ts # validação compartilhada e service GET/PUT
src/features/instituicao/instituicao-edicao-model.ts    # estado, autorização, requisições e concorrência
src/features/instituicao/InstituicaoEdicaoView.vue      # formulário de edição
src/features/instituicao/InstituicaoView.vue            # atalho visível somente ao administrador
src/router/index.ts                                    # rota requiresAdmin
tests/instituicao-edicao.test.mjs                      # contrato e modelo
tests/instituicao-edicao-http.test.mjs                 # HTTP com servidor sintético
```

## Contrato

Ao abrir, faz `GET /instituicoes/{id}` e confere o UUID retornado. O formulário só é preenchido após a consulta válida. Salvar envia `PUT /instituicoes/{id}` relativo a `/api/v1`, com corpo completo contendo somente `nome` e `sigla`. Nome recebe trim; sigla recebe trim e maiúsculas. Os limites existentes são 180 e 30 caracteres após normalização. O service exige que a resposta corresponda ao UUID, nome e sigla enviados e descarta campos extras.

Não envia PUT quando os dados normalizados não mudaram. Sucesso mostra confirmação sem montar resultado otimista; o usuário pode carregar novamente o detalhe. Não segue `Location`. O backend continua responsável pela validação definitiva e pela verificação de duplicidade. A verificação prévia de nome/sigla no backend ignora caixa, mas a constraint textual de nome não garante unicidade case-insensitive sob concorrência.

## Acesso e falhas

`requiresAdmin` usa o perfil de `/usuarios/me`, por meio da guarda existente. A tela verifica novamente UUID e perfil antes de ler/alterar. Isso é proteção de navegação e conveniência da UI; o backend mantém a autoridade sobre o Bearer. Um 403 não encerra a sessão.

- 400: mantém o draft e mostra mensagens locais fixas.
- 409: bloqueia novo PUT até consulta explícita dos dados atuais. Não tenta identificar qual campo causou conflito.
- 401/403/404: apaga campos e bloqueia a instância; reabrir exige uma nova leitura/autorização.
- Falha de rede, protocolo, 408 ou 5xx: resultado incerto; bloqueia edição/envio até um GET explícito bem-sucedido. Não repete PUT nem atribui o resultado por nome/sigla.
- Troca observada de conta/perfil, saída da rota ou dispose aborta e ignora respostas antigas; abortar não garante rollback no servidor.

Draft fica em RAM. Não há ETag/versão: duas edições concorrentes podem sobrescrever uma à outra. A API revalida cada escrita. A exclusão de instituição continua fora desta entrega e deve preservar o 409 quando houver cursos, sem cascata.

## Executar e validar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# em outro terminal
npm run verify
```

Entre com ADMINISTRADOR, abra um detalhe e use **Editar instituição**. Acesse diretamente `/instituicoes/{UUID}/editar` com USUARIO/MODERADOR e confirme o redirecionamento à conta com aviso administrativo. Confira GET inicial, campos sem alteração, PUT com dados normalizados, 400/409 e falha de rede sem repetição automática. A suíte validada nesta entrega tem 1180 testes, com TypeScript e build aprovados. O servidor HTTP sintético não prova autorização/integração com Spring ou PostgreSQL. Não houve validação visual/DOM em navegador nesta entrega.
