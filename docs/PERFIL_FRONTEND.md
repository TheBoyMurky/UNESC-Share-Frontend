# Perfil da conta no frontend

O menu da conta (`/conta`) permite atualizar nome/e-mail e trocar a senha. Implementação em `src/features/auth/perfil-service.ts`, `perfil-model.ts` e `PerfilSection.vue`, integrada à sessão em memória pelo serviço de autenticação existente.

## Nome e e-mail

`PUT /usuarios/me` envia apenas `nome` e `email` quando o endereço não mudou. Se o usuário trocar o e-mail, o formulário exige `senhaAtual` e envia os três campos. Nome e e-mail são normalizados e validados no cliente, mas o backend continua sendo a autoridade. A alteração de endereço é imediata; confirme-o antes de salvar. Ainda não há verificação por e-mail.

O cliente valida a resposta `UsuarioResponse` e confirma UUID, perfil e data de cadastro sem aceitar alteração desses dados. `400` preserva o formulário; `409` informa que o e-mail já está em uso. Em falha de rede/protocolo/timeout/5xx, não repete o PUT: permite consultar `GET /usuarios/me` explicitamente para confirmar o estado atual. Os dados da conta são mantidos somente na sessão em memória e não são escritos no `sessionStorage`.

## Troca de senha

`PUT /usuarios/me/senha` envia somente `senhaAtual` e `novaSenha`. A tela exige confirmação local da nova senha, 8–64 caracteres e no máximo 72 bytes UTF-8; não remove espaços nem trunca a senha. O endpoint responde `204` sem corpo. Em resultado incerto, não há repetição automática.

Após sucesso, a tela limpa os campos, encerra a sessão local e solicita novo login com a senha nova. A sessão Bearer que estava no servidor não é revogada: tokens existentes permanecem válidos até a expiração, de até 30 minutos conforme `JWT_TTL` (15 minutos por padrão). Não há recuperação de senha neste incremento.

Senhas ficam apenas nos campos durante a edição; não são incluídas no modelo persistente da interface, storage, URLs, logs ou mensagens de erro. A troca exige a senha atual.

## Testes e limitações

`npm run verify` passou com 1.408 testes, TypeScript e build. Os testes de service/modelo e HTTP usam transporte local sintético; não substituem uma chamada real ao Spring/PostgreSQL. O backend passou `./mvnw clean verify` com 555 testes e JAR gerado. Não foi feita inspeção visual nem E2E em navegador, indisponível nesta sessão. Nenhum comando Docker foi executado.

Guia do contrato backend: `../UNESC-Share-Backend/docs/PERFIL_USUARIO.md`.
