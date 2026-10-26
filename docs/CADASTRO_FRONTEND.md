# Cadastro de conta no frontend

Incremento local de22/10/2026: `/cadastro` publica e link no login. Reutiliza o cadastro do Spring existente, sem novas dependencias, alteracao de Java/schema/permissoes, publicacao ou mudanca de armazenamento do JWT. Mantem Vue/Vite/TypeScript, Router e fetch nativo no repositorio separado.

O UnescShare continua catalogo academico BitTorrent. Esta entrega cadastra usuarios, nao arquivos nem materiais; Torrent/Magnet continuam entidades independentes.

## Estrutura e codigo completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/auth/cadastro-service.ts # POST publico e validacao da confirmacao
src/features/auth/cadastro-model.ts   # Validacao/estado/erros/cancelamento testaveis
src/features/auth/CadastroView.vue    # Formulario, confirmacao e limpeza de campos
src/features/auth/auth.ts            # Composicao com o cliente HTTP publico existente
src/features/auth/LoginView.vue      # Link para /cadastro
src/features/auth/navigation.ts      # Autenticado vai de /cadastro para /conta
src/router/index.ts                  # Nova rota publica carregada sob demanda
src/features/inicio/InicioView.vue   # Texto de progresso atualizado
src/assets/main.css                  # Erros de campo e foco da confirmacao
tests/cadastro-service.test.mjs
tests/cadastro-model.test.mjs
tests/cadastro-http.test.mjs
tests/auth-navigation.test.mjs
```

O codigo completo esta nesses arquivos. Organizacao por funcionalidade, com service, modelo independente de Vue/DOM e view. O modelo nao guarda campos/DTOs pessoais em seu estado; a view guarda os campos somente em memoria enquanto montada.

## Contrato HTTP preservado

`POST /api/v1/auth/cadastro` recebe JSON, sem Bearer/cookies/query de credenciais. Usa o cliente publico (`client.json`), nao authenticatedJson: um401 nessa rota nao invalida um JWT salvo de outra operacao. O cliente mantem credentials omit, cache no-store e redirect error.

```json
{
  "nome": "Estudante",
  "email": "estudante@example.test",
  "senha": "senha-sintetica"
}
```

Envio e projetado explicitamente: somente esses tres campos, sem confirmacao/perfil/id. Nome/email recebem trim no cliente como conveniencia; normalizacao definitiva strip/email minusculo permanece no servidor. A senha e enviada exatamente como digitada, sem trim, truncamento ou alteracao de caixa. Nao enviar credenciais reais em exemplos/logs/capturas compartilhadas.

Servidor retorna201 com UsuarioResponse: id UUID, nome, email, perfil USUARIO e dataCadastro UTC. Nao emite token nem Location de usuario individual. Service valida o formato e perfil de resposta e descarta os dados; nao conserva senha/hash/campos extras, nao chama login/me nem cria sessao. Um DTO invalido nao e apresentado como sucesso; a conta pode ter sido criada mesmo assim.

O perfil e fixado pelo backend, nao por campo oculto do formulario. Confirmacao da senha e apenas usabilidade no cliente. Sem verificacao de e-mail, recuperacao de senha, selecao de perfil, bootstrap administrativo ou mudanca das regras de senha.

## Validacao e interface

Campos com labels, required, limites nativos e type=email, autocomplete name/username/new-password. Restricoes HTML melhoram a experiencia, mas podem ser contornadas e nao substituem Bean Validation: [MDN validacao de formularios](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Constraint_validation). Tokens de autocomplete orientam o navegador/gerenciador de senhas, nao garantem comportamento uniforme: [MDN autocomplete](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete).

Modelo tambem confere:

- Nome nao branco e ate120 caracteres depois de trim.
- E-mail nao branco, ate254 e estrutura basica com um @/sem espacos; HTML complementa essa checagem, que nao replica todo o @Email do servidor nem verifica propriedade do endereco.
- Senha nao branca,8..64 unidades UTF-16 (mesma contagem de String/Size Java) e ate72 bytes UTF-8 via TextEncoder. Acentos/emojis podem atingir o limite em menos caracteres; nao alterar a senha para caber.
- Confirmacao identica a senha, sem enviar esse campo ao backend.

Erros de campo vinculados por aria-describedby/aria-invalid; erro geral e confirmacao de sucesso recebem foco apos renderizacao. Native validation pode impedir submit antes do modelo. Nao foi verificado em navegador nesta sessao.

Senhas sao limpas da view quando um POST valido comeca e ao desmontar. Em erro local anterior ao POST, permanecem para correcao. Apos envio com falha, e preciso redigitar senha/confirmacao; nome/email permanecem para correcao enquanto a tela estiver aberta. Sucesso e desmontagem tambem limpam nome/email. Nao persistir dados do formulario em sessionStorage/localStorage/URL/logs; isso nao impede o proprio navegador/gerenciador de oferecer salvamento nem promete apagar todas as copias da memoria/DevTools/rede.

## Resultado, erros e concorrencia

Sucesso mostra Conta criada e link explicito para login, sem login automatico ou redirecionamento por temporizador. Essa opcao reaproveita o fluxo atual e nao conserva senha para autenticar em seguida. Visitante continua anonimo; JWT/sessionStorage existentes nao sao alterados pelo cadastro.

409 orienta entrar com conta existente;400 mostra mensagem geral e somente nomes de campos conhecidos, com textos locais fixos. Mapeia senhaCompativelComBCrypt para senha. Nunca exibir title/detail/message arbitrarios do servidor, rejectedValue, SQL, stack ou causa com credenciais.401/403/outros erros HTTP usam mensagens seguras existentes, sem repetir requisicao.

Falha de rede/protocolo/408/5xx tem resultado potencialmente incerto: orienta tentar login antes de reenviar, pois o servidor pode ter concluido a criacao. Sem retry automatico ou chave de idempotencia; o409/constraint de email do backend e a protecao existente para duplicidade.

Botao/fieldset desabilitados enquanto envia, modelo recusa submit duplicado e novo POST apos sucesso. Ao sair, AbortController cancela a espera e respostas atrasadas sao ignoradas; isso **nao garante desfazer cadastro no servidor**. Voltar a /cadastro cria tela nova e limpa. Conta ja autenticada e encaminhada para /conta pela guarda; acesso salvo indisponivel ainda permite rota publica, sem descartar silenciosamente esse acesso. A guarda e conveniencia de navegacao, nao autorizacao do servidor.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run verify
npm run dev
```

Abra http://localhost:5173/login e Criar uma conta, ou http://localhost:5173/cadastro. Para o fluxo real, backend/PostgreSQL devem estar disponiveis e VITE_API_BASE_URL apontar para http://localhost:8080/api/v1 (padrao). Nenhum segredo de servidor deve entrar em variavel VITE_*. Nao reativar administrador inicial para testar.

Roteiro manual pendente de navegador, usando conta descartavel de desenvolvimento (o POST real persiste o usuario):

1. Sem acesso salvo, abrir cadastro e conferir layout desktop/mobile, labels, foco, navegacao por teclado e mensagens nativas. Nao incluir credenciais em capturas.
2. Conferir obrigatorios, confirmacao divergente, nome/email excedentes, senha curta/longa e senha multibyte acima72bytes; nenhum POST deve partir para erro do modelo.
3. Cadastrar e conferir um unico POST de tres campos, sem Authorization/cookies/query de credenciais. Esperar201/confirmacao sem token/novo registro em storage; clicar Ir para o login e entrar explicitamente.
4. Repetir e-mail de teste:409 deve sugerir login, sem login automatico; redigitar senhas apos envio. Nao esperar recuperacao/verificacao de e-mail inexistentes.
5. Simular400 com campo conhecido/desconhecido e503/rede interrompida: nao mostrar corpo arbitrario nem anunciar conta criada sem resposta valida. Nao repetir o POST automaticamente.
6. Sair durante envio: nao mostrar sucesso atrasado ou reabrir a tela. Verificar manualmente o resultado no servidor antes de repetir, pois cancelamento nao implica rollback.
7. Ja autenticado, abrir /cadastro deve ir para /conta; falha ao restaurar token nao deve liberar rotas protegidas nem impedir a rota publica.

Verificacao em22/10/2026: **239 testes**, type-check e build aprovados.48 novos sobre191:11 service,33 modelo/limites/erros/concorrencia,1 HTTP sintetico e3 guardas. HTTP usa fetch real contra servidor temporario local:201,409,400,401,503 vazio, JSON malformado e conexao interrompida; confirma uma unica requisicao por tentativa, sem Bearer/cookies/confirmacao/perfil e sem alterar sessoes/storage. Nao e Spring/banco nem cadastro real. Guardas usam Router memory history, nao DOM. Vite200 para /cadastro/fallback e componente compilado nao comprovam validacao nativa/acessibilidade/fluxo visual. Inventario sem navegador: visual/mobile/DOM/cadastro-login E2E continuam pendentes.

Nenhuma dependencia, Java/schema, Maven/Docker/backend iniciado, .env real/credencial/dado real alterado, publicacao, commit/remoto/push neste incremento. Servidor temporario de verificacao encerrado ao finalizar. A ultima suite Maven registrada no backend continua549; nao confundir com239 testes frontend.

Meus materiais e cadastro de Material com Magnets implementados depois: [MEUS_MATERIAIS_FRONTEND.md](MEUS_MATERIAIS_FRONTEND.md), [CADASTRO_MATERIAL_MAGNET_FRONTEND.md](CADASTRO_MATERIAL_MAGNET_FRONTEND.md). Proximo recomendado cadastro inicial com .torrent, sem upload de conteudo academico.
