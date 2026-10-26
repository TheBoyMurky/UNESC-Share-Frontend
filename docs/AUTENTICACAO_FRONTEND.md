# Primeiro incremento de autenticacao do frontend

## Decisoes aprovadas em 22/10/2026

O usuario escolheu sessionStorage para manter o acesso ao atualizar a aba, apos comparar memoria/sessionStorage/localStorage. Tambem aprovou Vue Router em vez de alternar componentes sem URLs. Uma dependencia de runtime adicionada: vue-router, com versao efetiva no package-lock.json. Sem Pinia, Axios, framework de UI ou novos servicos no backend.

SessionStorage nao protege contra XSS. Scripts da origem podem ler tokens; abas duplicadas/abertas por opener e restauracao do navegador podem copiar/conservar dados. Nenhuma promessa de revogacao ao fechar aba. A alternativa apresentada mais restritiva era memoria, com novo login ao atualizar; nao foi a escolhida. Cookies HttpOnly exigiriam revisar a premissa stateless/Bearer e CSRF do backend, portanto nao foram introduzidos. Referencia: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Fluxo e responsabilidades

1. Login envia email/senha em JSON para POST /api/v1/auth/login, sem Bearer/cookies e sem token em URL.
2. Resposta precisa conter accessToken sintaticamente JWT, tokenType Bearer, expiresIn positivo e expiresAt valido. Isso valida o contrato, nao a assinatura: autenticacao/autorizacao continuam no Spring Security.
3. Consulta GET /usuarios/me com Authorization: Bearer. Apenas apos sucesso, publica UsuarioResponse em memoria e salva `{accessToken, expiresAt}` em sessionStorage, chave `unescshare.auth.v1`. expiresAt salvo como epoch em milissegundos.
4. Atualizar a aba le o token salvo, valida formato/prazo e consulta /usuarios/me novamente antes de liberar /conta. Nao confiar em perfil/nome de dados locais: nao sao persistidos.
5. Logout remove somente a chave do projeto; nao usa clear() nem remove dados de outras aplicacoes. Nao chama uma rota de revogacao inexistente. Copias de JWT ja emitidas permanecem validas ate expirar no servidor.
6. Timer, retorno a aba, navegacao e uso do token conferem prazo local. Relogio do cliente nao e autoridade; API pode retornar401 antes desse prazo. Sem refresh ou tentativas automaticas de senha. Network/403 na restauracao deixa estado indisponivel, sem usuario liberado, e oferece tentativa explicita.

Restauracoes concorrentes compartilham validacao; contador de geracao impede resposta atrasada de login/restauracao ressuscitar sessao encerrada. Uma rejeicao401 com token antigo diferente nao derruba novo acesso. O helper authenticatedJson invalida somente o token efetivamente usado na resposta401; usar esse helper nos proximos endpoints autenticados.

Senha e limpa do formulario apos tentativa e desmontagem; nunca e salva no storage ou logs. API possui limite de64caracteres/72bytesUTF8 para login; interface aplica maxLength e confere bytes, sem impor minimo de cadastro ou alterar senha com trim. Email recebe trim; normalizacao definitiva permanece no servidor.

Quota/permissao de storage nao causa fallback silencioso para memoria/localStorage. Falha ao salvar impede concluir login; falha ao remover informa para fechar a aba. Nao e possivel prometer remocao quando o navegador recusa a operacao; nao ha revogacao no servidor.

## HTTP e erros

Cliente usa fetch, Headers e Response nativos. Requisicoes sem cookies (`credentials: omit`), cache no-store e redirect error para nao encaminhar credenciais por redirecionamento automatico. Rota precisa ser relativa a API e permanecer na origem/prefixo configurados. Nao cria filtros JWT, proxy de autenticacao ou sessoes no Spring.

Respostas JSON verificam Content-Type;204/205 nao leem corpo. Em erro HTTP com JSON/ProblemDetail, conserva somente title/detail e errors{field,message}; sem rejectedValue, stack/SQL/cause/corpo cru. Falhas Bearer com corpo vazio continuam usando status. Falha de rede vira mensagem fixa sem URL/headers/corpo/credenciais; AbortError preserva categoria com mensagem fixa. HTML ou JSON invalido em sucesso e erro de protocolo.

ApiError.message e generica por status. ProblemDetail e texto nao confiavel, nunca HTML; formulario usa interpolacao escapada e apenas erros dos campos de login. Nao registrar o objeto de erro completo, corpo de login, senha, token ou URI privada. O servidor continua responsavel por nao retornar dados sensiveis.

O helper authenticatedJson trata JSON; detalhes acrescentaram authenticatedTorrent e cadastro por .torrent acrescentou authenticatedMultipart, ambos com o mesmo controle de token/401 e tratamento de erro compartilhado. FormData nao recebe Content-Type manual. Nao introduzir upload de conteudo academico ao ampliar o cliente. Ver [MATERIAL_DETALHE_FRONTEND.md](MATERIAL_DETALHE_FRONTEND.md) e [CADASTRO_MATERIAL_TORRENT_FRONTEND.md](CADASTRO_MATERIAL_TORRENT_FRONTEND.md).

## Arquivos e codigo completo

Caminhos relativos a raiz do frontend; codigo completo nos arquivos:

```text
src/shared/http/client.ts          # fetch, JSON/ProblemDetail e erros seguros
src/features/auth/auth-service.ts  # contratos de login e UsuarioResponse
src/features/auth/session.ts       # sessao testavel, sem Vue/DOM/storage global
src/features/auth/auth.ts          # adaptador Vue, sessionStorage e expiracao
src/features/auth/navigation.ts    # guardas testaveis
src/features/auth/LoginView.vue    # formulario, erros e tentativa de restauracao
src/features/auth/ContaView.vue    # usuario autenticado e logout
src/router/index.ts               # history, rotas e componentes lazy
src/shared/NotFoundView.vue        # rota inexistente
src/main.ts                       # instalacao do Router
src/App.vue                       # RouterView e navegacao
src/features/inicio/InicioView.vue # estado incremental atualizado
src/assets/main.css               # formulario/conta responsivos
tests/http-client.test.mjs
tests/auth-service.test.mjs
tests/auth-session.test.mjs
tests/auth-navigation.test.mjs
tests/auth-http.test.mjs
```

Endpoints/telas deste incremento: / (publica), /login (publica; autenticado vai para /conta), /conta (guardada) e404 local. Incrementos seguintes adicionaram catalogo/detalhe e /cadastro publica (autenticado vai para /conta), sem login automatico. Guardas nao sao seguranca do servidor: qualquer permissao deve ser conferida pela API. Sem redirect de URL arbitraria fornecida por query. History requer fallback do servidor para index.html no futuro deploy, exceto assets/API; Vite ja fornece fallback local.

## Executar e verificar

Backend na pasta irma, com variaveis do .env exportadas, pode ser iniciado por `./mvnw spring-boot:run`. Manter bootstrap administrativo desativado; nao cadastrar administrador para este teste. Se PostgreSQL nao estiver ativo, comandos Docker sao exclusivos do usuario.

No frontend:

```bash
npm ci
npm run verify
npm run dev
```

Abrir http://localhost:5173/login. Destino padrao http://localhost:8080/api/v1; nunca copiar JWT_SECRET para .env frontend. Usar localhost:5173 e nao127.0.0.1 para coincidir com CORS padrao. Nao e necessario nenhum material real para consultar o proprio usuario.

Roteiro manual (nao executado nesta sessao por ausencia de navegador):

1. Sem acesso salvo, abrir /conta e conferir ida ao login; URL inexistente mostra404.
2. Entrar com conta existente e conferir /conta com nome/email/perfil vindos de /usuarios/me, nunca inserir credenciais em logs ou capturas compartilhadas.
3. Atualizar /conta: restaura mesma aba apos consultar /me, sem reenvio de senha. Estado local nao substitui autorizacao.
4. Senha incorreta, corpo401 vazio e API indisponivel: mensagem clara, sem HTML/stack e sem tentativas infinitas.
5. Encerrar acesso: volta ao login, chave local removida; atualizar/voltar nao deve liberar conta sem nova validacao.
6. Aguardar prazo real do token e conferir expiracao/limpeza. Em falha de rede ao restaurar, tentar novamente ou descartar acesso salvo.
7. Conferir teclado, labels/foco, leitor de tela e layout mobile/desktop. Nunca colar token real como dado de teste em repositorio, console ou screenshot.

Em22/10/2026:68 testes nativos Node, type-check e build aprovados. Testes incluem contratos/erros/expiracao/storage/geracoes/guardas reais com memory history e fetch HTTP contra servidor sintetico local. Nao foi usado administrador, dado real do catalogo ou credencial real. Vite serviu /, /login e /conta com HTTP200/fallback e compilou LoginView; isso nao equivale a testar a guarda em navegador. Visual/E2E/autenticacao real pela interface continuam pendentes. Nenhum Docker ou deploy executado.
Backend estava parado e foi iniciado pelo Maven para conferir somente GET /usuarios/me semJWT (401/corpo vazio) e preflight de POST /auth/login (200/CORS esperado), com bootstrap administrativo desativado e zero disciplinas novas. Servidores temporarios Vite e Spring foram encerrados apos a verificacao; iniciar ambos para o roteiro manual. Codigo Java e .env reais nao foram alterados.

## Proxima entrega

Seletores e busca paginada de PUBLICADO foram implementados no incremento seguinte, usando authenticatedJson: consultar [CATALOGO_FRONTEND.md](CATALOGO_FRONTEND.md). Detalhes e mecanismos tambem implementados: [MATERIAL_DETALHE_FRONTEND.md](MATERIAL_DETALHE_FRONTEND.md). Cadastro de conta implementado sem login automatico: [CADASTRO_FRONTEND.md](CADASTRO_FRONTEND.md). Meus materiais e cadastro com Magnets tambem implementados: [MEUS_MATERIAIS_FRONTEND.md](MEUS_MATERIAIS_FRONTEND.md), [CADASTRO_MATERIAL_MAGNET_FRONTEND.md](CADASTRO_MATERIAL_MAGNET_FRONTEND.md). Proximo recomendado cadastro inicial com .torrent; recuperacao de senha, edicao de perfil/materiais, administracao e demais telas continuam pendentes; nao anunciar como disponiveis.
