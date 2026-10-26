# UnescShare — Frontend

Base local Vue 3, Vite e TypeScript, criada incrementalmente com o gerador oficial create-vue e mantida em repositorio separado do backend Spring Boot.

O UnescShare e um catalogo academico BitTorrent, nao hospedagem de conteudos. Somente arquivos `.torrent` e Magnet URIs; nunca upload de PDF, EPUB, MP4, ZIP ou conteudos academicos para o servidor.

## Requisitos e execucao

Node.js `^22.18.0 || >=24.12.0` e npm, conforme engines do projeto. Validado com Node 22.23.3 e npm 10.9.9. As dependencias ja foram instaladas; em uma nova copia, execute `npm ci`.

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
cp .env.example .env
npm run dev
```

Abra `http://localhost:5173`. Servidor somente em localhost, com strictPort para nao mudar de origem silenciosamente. Encerrar com Ctrl+C. Backend/PostgreSQL nao sao necessarios para renderizar esta pagina inicial; serao necessarios na integracao autenticada.

O `.env` e opcional para o padrao local e deve conter apenas configuracao publica:

```dotenv
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

Reinicie o Vite apos alterar variaveis. Variaveis VITE_* sao visiveis ao usuario e incorporadas ao build: nunca incluir JWT_SECRET, senhas ou credenciais de banco/administrador. `.env` e variantes locais estao ignorados, `.env.example` e versionavel. Nenhum `.env` real do backend foi copiado ou alterado.

URL da API: HTTP(S), sem credenciais/query/fragmento, terminando em /api/v1; prefixo adicional de proxy permitido. Configuracao invalida interrompe o modulo com mensagem fixa, sem ecoar o valor. A pagina inicial exibe o destino configurado; o login valida o acesso por POST /auth/login e GET /usuarios/me.

## Estrutura e codigo completo

```text
UNESC-Share-Frontend/
  .env.example             # URL publica da API
  AGENTS.md                # Instrucoes para continuidade
  docs/CONTEXTO_PROJETO.md  # Decisoes, estado e proximos passos
  index.html               # Entrada HTML pt-BR
  env.d.ts                 # Tipos de ambiente Vite
  package.json             # Scripts/dependencias
  package-lock.json        # Versoes reproduziveis
  tsconfig*.json           # TypeScript de aplicacao/ferramentas
  vite.config.ts           # Vue, alias @ e portas fixas
  public/favicon.svg       # Icone local
  src/
    main.ts                # Montagem Vue e estilos
    App.vue                # Layout e navegacao por ancoras
    assets/main.css        # CSS responsivo, fontes locais
    config/
      api-url.ts           # Resolucao/validacao de URL
      env.ts               # Configuracao publica tipada
    features/inicio/
      InicioView.vue       # Proposta e etapas do prototipo
    features/auth/         # Cadastro, login, usuario, sessao e guardas
    features/catalogo/     # Seletores dependentes e busca paginada
    features/curso/        # Consulta e CRUD administrativo de cursos
    features/disciplina/   # Consulta, cadastro, edição e exclusão
    features/categoria/    # Consulta paginada e detalhe das categorias
    features/material/     # Cadastro, edicao, remocao logica, listagem e detalhes
    features/avaliacao/    # Resumo, propria nota e cadastro em Material PUBLICADO
    features/comentario/   # Listagem/cadastro em Material PUBLICADO
    features/denuncia/    # Cadastro, lista e detalhe dos proprios relatos
    features/moderacao/  # Fila de materiais pendentes para equipe
    router/index.ts        # Rotas publicas/protegidas
    shared/http/client.ts  # fetch/JSON/Torrent limitado/erros
    shared/http/page.ts    # PagedModel e parametros de pagina compartilhados
  tests/*.test.mjs         # Testes nativos Node
```

Codigo completo nos arquivos acima; organizacao por funcionalidade, alias @ para src. O gerador inclui Vue DevTools no ambiente de desenvolvimento. Identidade visual inicial ajustavel, sem depender de CDN, fontes externas ou dados ficticios do catalogo.

## Apresentação local em containers

O frontend possui uma imagem multi-stage: Node 22 compila a aplicação e Nginx serve os arquivos estáticos com fallback para as rotas do Vue. A URL da API é incorporada ao build por `VITE_API_BASE_URL`; não coloque segredos ou credenciais de banco em variáveis `VITE_*`.

Para executar a apresentação integrada, mantenha `UNESC-Share-Frontend` e `UNESC-Share-Backend` como diretórios irmãos, preencha o `.env` do backend e siga o comando e o roteiro em [instruções do ambiente containerizado](../UNESC-Share-Backend/README.md). O Compose de apresentação expõe o frontend em `http://localhost:5173` e usa a API em `http://localhost:8080/api/v1`.

## Login e navegacao

Em 22/10/2026, apos apresentacao das alternativas e riscos, o usuario aprovou **sessionStorage e Vue Router**. Implementadas rotas `/`, `/login`, `/conta` (protegida) e pagina de rota inexistente. Cliente HTTP nativo fetch, sem Axios/Pinia/UI kit. Token e expiracao ficam em `sessionStorage`, chave `unescshare.auth.v1`; senha, perfil e dados pessoais nao sao persistidos. Atualizar a aba restaura o acesso somente apos nova consulta a /usuarios/me.

Logout/expiracao/401 removem a copia local e a identidade em memoria; nao revogam JWT no backend. Falha de rede ou403 ao restaurar nao apaga o token salvo nem libera /conta: usuario pode tentar novamente ou descartar. Sem refresh token/cookies/localStorage. Guardas do frontend nao substituem autorizacao do servidor.

`sessionStorage` e acessivel por JavaScript da origem e vulneravel a XSS; nao e a opcao mais restritiva apresentada. O escopo por aba nao constitui isolamento forte: duplicacao/restauracao de abas e comportamento de opener podem conservar/copiar estado. Nao depender de fechar o navegador como revogacao. A escolha foi explicita para manter acesso ao atualizar a aba. Riscos, estrutura completa e roteiro manual estao em [docs/AUTENTICACAO_FRONTEND.md](docs/AUTENTICACAO_FRONTEND.md).

## Cadastro de conta

Rota publica `/cadastro`, acessivel pelo link Criar uma conta no login. Nome, e-mail, senha e confirmacao, com validacao HTML e modelo testavel alinhado aos limites do backend (inclusive72bytesUTF8 para BCrypt). POST publico envia somente nome/email/senha; perfil USUARIO continua fixado no servidor. Confirmacao de sucesso leva ao login por link, sem autenticacao automatica nem alterar sessionStorage.

Senhas limpas ao iniciar envio e ao sair; duplicidade409 orienta login, erros400 usam mensagens locais sem ecoar credenciais. Falha de rede/resposta invalida pode ocorrer depois da criacao, por isso nao ha retry automatico. Cancelar a espera nao garante rollback. Arquivos completos, contrato e roteiro: [docs/CADASTRO_FRONTEND.md](docs/CADASTRO_FRONTEND.md).

## Catalogo e busca

Rota `/materiais` autenticada, acessivel pelo menu Catalogo ou pela area Minha conta. Consulta `/instituicoes`, `/cursos?instituicaoId=...`, `/disciplinas?cursoId=...`, `/categorias` e `/materiais`, sempre por authenticatedJson/Bearer. Nenhuma escrita ou mudanca de permissao no backend.

Busca por texto (ate200), instituicao, curso, disciplina e categoria; botao Buscar aplica filtros e volta a pagina0. Paginas de20/50/100, ordenacao fixa da API e estados distintos de carga/erro/vazio. Trocar instituicao limpa curso/disciplina; trocar curso limpa disciplina. Seletores carregam100opcoes por pagina e oferecem Carregar mais, sem limitar o catalogo aos primeiros100registros. Filtros editados ficam sinalizados ate nova busca e nao sao gravados em URL/storage.

Lista mostra titulo com link para detalhe, data de cadastro emUTC e visualizacoes do DTO; sem inventar descricao, nomes academicos nao retornados ou fazer consultas N+1 por cartao. Requisicoes substituidas/desmontadas sao canceladas e respostas atrasadas ignoradas. Guia completo, arquivos e roteiro: [docs/CATALOGO_FRONTEND.md](docs/CATALOGO_FRONTEND.md).

## Detalhes e compartilhamento

Rota protegida `/materiais/:id` mostra metadados, nomes academicos e listas independentes de Torrent/Magnet. Visibilidade decidida pela API, inclusive registros privados para autor/equipe; falha nos nomes nao impede mostrar mecanismos. Download Bearer com nova requisicao por clique, stream limitado a2MiB/MIME application/x-bittorrent e nome seguro UUID.torrent, sem JWT na URL. Somente metainfo, nunca o conteudo academico.

Copiar Magnet usa acao explicita e oferece copia manual em caso de falha; abrir usa link magnet validado e depende do cliente instalado. Sem consulta automatica a trackers/peers nem confirmacao de arquivo salvo ou aplicativo aberto. Fluxos, limites, arquivos completos e testes manuais: [docs/MATERIAL_DETALHE_FRONTEND.md](docs/MATERIAL_DETALHE_FRONTEND.md).

## Meus materiais

Rota protegida `/meus-materiais`, disponivel no menu e na conta. GET Bearer /materiais/meus lista apenas os registros da identidade JWT, incluindo PENDENTE/PUBLICADO/BLOQUEADO/REMOVIDO, sem usuarioId em query. Filtros de texto/estado aplicados por botao, paginas20/50/100, carga/erro/vazio distintos e cancelamento de consultas substituidas. Titulos abrem detalhes existentes, sem nomes academicos inventados ou N+1.

Listagem com atalhos para cadastro, edicao e revisao de remocao em paginas proprias, sem escritas inline ou restauracao. Filtros/pagina nao persistidos; reabrir retorna pagina0. Guia, codigo completo e roteiro: [docs/MEUS_MATERIAIS_FRONTEND.md](docs/MEUS_MATERIAIS_FRONTEND.md).

## Cadastro de Material

Cadastro de Material em `/materiais/novo`, acessivel por Meus materiais: titulo/descricao, seletores academicos dependentes e1..10Magnets no modo JSON. POST JSON atomico apenas dos cinco campos previstos, autorJWT/PENDENTE no backend, sem publicacao automatica. Sucesso com links de consulta; falhas incertas orientam conferir Meus materiais antes de reenviar, sem retry automatico. Rascunho somente em memoria, descartado ao sair/sucesso. Codigo completo e roteiro: [docs/CADASTRO_MATERIAL_MAGNET_FRONTEND.md](docs/CADASTRO_MATERIAL_MAGNET_FRONTEND.md).

Desde23/10/2026, o mesmo formulario oferece alternativamente um .torrent v1 de1byte a2MiB, em POSTmultipart atomico com partes material(application/json) e arquivo(File), sem boundary manual. Trocar modo limpa os mecanismos anteriores e preserva metadados; nao suporta cadastro misto nem conteudo academico. Sucesso PENDENTE/umTorrent/zeroMagnets. Extensao/tamanho sao checagens de usabilidade; parser/hash definitivos no servidor. Arquivo apenas emRAM, limpo ao sair/sucesso, abort nao garante rollback. Guia completo: [docs/CADASTRO_MATERIAL_TORRENT_FRONTEND.md](docs/CADASTRO_MATERIAL_TORRENT_FRONTEND.md).

## Edicao dos metadados

Edicao protegida em `/materiais/:id/editar`, com links nos detalhes e Meus materiais somente para autor em PENDENTE/PUBLICADO. Preenche referencias por UUID mesmo fora das primeiras100opcoes e permite alterar apenas titulo/descricao/disciplina/categoria. PUT retorna aPENDENTE e preserva mecanismos; semPUT se nada mudou. Aviso explicito de retirada do catalogo/ausencia de controle de versao, erros seguros e sem retry automatico. Codigo completo e roteiro: [docs/EDICAO_MATERIAL_FRONTEND.md](docs/EDICAO_MATERIAL_FRONTEND.md).

## Remocao logica de Material

Rota protegida `/materiais/:id/remover`, links Revisar remocao para autor em PENDENTE/PUBLICADO/BLOQUEADO. GETconsulta alvo antes de checkbox obrigatorio e botao Confirmar remocao logica; abrir/cancelar nao fazDELETE. Aviso semrestauracao/preservacao de registro e mecanismos, sem apagar copias na rede. Somente204 confirma sucesso, sem lerJSON; jaREMOVIDO noGET nao repete. Confirmacao consumida por tentativa/UUID; resultado incerto bloqueia nova tentativa ate consulta e nova confirmacao. Guia completo e testes: [docs/REMOCAO_MATERIAL_FRONTEND.md](docs/REMOCAO_MATERIAL_FRONTEND.md).

## Comentarios

Detalhes de Material PUBLICADO incluem lista paginada20/50/100 e formulario de comentario (texto simples obrigatorio ate4000). Autor do JWT/estadoATIVO no servidor, sem nomes/perfis extras ou HTML executavel. Mesmo dono/equipe nao podem comentar pela visibilidade privada de Material. Sucesso limpa texto/atualiza pagina0, ordem ASC preservada; resposta perdida bloqueia reenvio ate reconsulta e acao explicita com aviso de duplicidade. Codigo do primeiro incremento: [docs/COMENTARIOS_FRONTEND.md](docs/COMENTARIOS_FRONTEND.md).

Comentarios proprios carregados oferecem edicao e revisao de remocao logica, sem permissao extra ao dono do Material/equipe. PUT so conteudo/ATIVO/PUBLICADO, sem enviar se inalterado; DELETE exige caixa/botao de confirmacao porUUID/tentativa,204 sem corpo, preserva registro/texto e nao tem restauracao. Uma acao por vez, rascunho de novo comentario preservado;409/resultado incerto exigem fechar e atualizar antes de selecionar novamente. Sem consulta privada ou moderacao. Estrutura, codigo e roteiro: [docs/COMENTARIOS_EDICAO_REMOCAO_FRONTEND.md](docs/COMENTARIOS_EDICAO_REMOCAO_FRONTEND.md).

## Avaliacoes

Detalhes PUBLICADO incluem media/quantidade, consulta da propria nota e cadastro0,00..5,00 com ate2casas. Entrada aceita virgula/ponto, valida centesimos inteiros sem arredondar, enviaJSONnumerico; media soAPI e exibicao pt-BR2casas. Uma nota porusuario/Material e semautoavaliacao, inclusive equipe.404de/minha so admite ausencia aposresumo valido; nao ampliar permissao de detalhe privado. POSTduplicado bloqueado,409/incerto exigem consulta e acaoexplicita antesdenovatentativa, semretry/PUTautomatico. Codigo, estrutura e roteiro: [docs/AVALIACOES_FRONTEND.md](docs/AVALIACOES_FRONTEND.md).

Nota propria carregada oferece edicao e exclusao definitiva com confirmacao explicita. PUTpreservaUUID/data e nao e upsert; DELETE/minha remove a nota atual, inclusive se Material ficar privado apos selecao, sem consulta privada/restauracao. Confirmacao consumida por tentativa;409/incerto exige fechar/reconsultar antesdenovaselecao, semretry. Aviso de concorrencia: recriacao em outra aba pode ser atingida por/minha; semETag/versao. Guia completo: [docs/AVALIACOES_EDICAO_REMOCAO_FRONTEND.md](docs/AVALIACOES_EDICAO_REMOCAO_FRONTEND.md).

## Denuncias

Relatar problema nos detalhes PUBLICADO abre /materiais/:id/denunciar; motivo e descricao<=2000, POSTsomente dois campos/denuncianteJWT/PENDENTE servidor. Qualquer autenticado pode relatar, inclusive donoMaterial/equipe; nao alteraMaterial automaticamente. /minhas-denuncias no menu/conta oferece paginas20/50/100/todosestados e /denuncias/:id mostra relato proprio, inclusive aposMaterialprivado, semampliarpermissoes deMaterial ou acessar dados de terceiros.409/incerto bloqueiamreenvio nesta tela e orientam conferir relatos antesdeabriroutratentativa. Sem anexos/edicao/cancelamento/exclusao/moderacao. Guia completo: [docs/DENUNCIAS_FRONTEND.md](docs/DENUNCIAS_FRONTEND.md).

## Moderacao: fila de pendentes

Rota /moderacao/materiais e atalhos para MODERADOR/ADMINISTRADOR, perfil de /usuarios/me e meta VueRouter requiresModeration. USUARIO vai aconta com aviso; anônimo vai aologin. Fila sóGET/materiais/moderacao statusPENDENTE, pagina20/50/100, ordemdataCadastro-idDESC, linksdetalhes existentes. Semnovasmutacoes/N+1/filtros extras. Guardas/modelo descartam dados na troca observada deconta/perfil; aAPI continua autorizando peloBearer. Guia: [docs/MODERACAO_MATERIAIS_FRONTEND.md](docs/MODERACAO_MATERIAIS_FRONTEND.md).

A fila abre `/moderacao/materiais/:id`, com metadados, vínculos acadêmicos e mecanismos para revisão. O usuário aprovou manter a autoaprovação para **MODERADOR e ADMINISTRADOR**. A tela agora oferece publicação/bloqueio com escolha, caixa de confirmação e botão explícito; não mostra edição/remoção do autor ou interações. Cada envio consome a confirmação; conflito ou resultado incerto exige nova consulta antes de decidir novamente. Sucesso é seguido de GET, sem retry automático de POST. Conta/perfil/rota e falhas de acesso descartam dados/URIs/confirmações. Não há histórico, motivo, desbloqueio ou restauração. Código, estrutura e roteiro: [docs/DECISOES_MATERIAL_FRONTEND.md](docs/DECISOES_MATERIAL_FRONTEND.md). A composição da leitura está em [docs/REVISAO_MATERIAL_FRONTEND.md](docs/REVISAO_MATERIAL_FRONTEND.md).

A equipe também possui `/moderacao/denuncias`, acessível pela conta e pela fila de materiais. Consulta por PENDENTE (inicial), EM_ANALISE, PROCEDENTE ou IMPROCEDENTE, páginas20/50/100 e ordem mais antigas primeiro. Cada linha mostra motivo, estado, data e UUIDs, sem descrição/identidade do denunciante ou consultas adicionais ao Material. Link explícito abre a revisão de Material; não analisa nem conclui a denúncia. Modelo de paginação compartilhado com a fila anterior, preservando descarte de dados e respostas antigas. Sem ações de denúncia nesta entrega. Guia: [Fila de denúncias da equipe](docs/FILA_DENUNCIAS_EQUIPE_FRONTEND.md).

A fila abre `/moderacao/denuncias/:id`, com relato e histórico paginado. Mostra justificativa, transição, data e UUID do responsável; sem buscar nomes/contas ou inferir elegibilidade para agir. Relato/histórico são consultas independentes;401/403/404 em GET retiram ambos. Troca de conta/perfil/rota descarta respostas antigas; histórico vazio ou parcial não muda o estado do relato. Composição da leitura: [Detalhe e histórico da equipe](docs/DENUNCIA_HISTORICO_EQUIPE_FRONTEND.md).

Denúncia PENDENTE pode iniciar análise; EM_ANALISE oferece conclusão procedente ou improcedente, sem escolha padrão. Justificativa até1000 e confirmação específica, POST somente justificativa. Um formulário por vez; trocar decisão exige descartar justificativa/checkbox. A API verifica impedimentos inclusive para administrador, sem exigir o mesmo agente que iniciou a análise.403 de mutação bloqueia decisões e preserva leitura autorizada; conflito/incerteza exige nova consulta e preparação, sem retry automático. Sucesso reconsulta relato/histórico sem evento otimista; estados finais não permitem outra decisão. Concluir não altera Material automaticamente. Código, estrutura e execução: [Conclusão de denúncias](docs/CONCLUSAO_DENUNCIA_FRONTEND.md); [guia anterior de início](docs/INICIO_ANALISE_DENUNCIA_FRONTEND.md).

A revisão de Material também mostra **Comentários para moderação**, com consulta de ATIVO/OCULTO em qualquer estado do Material. Não exibe texto de comentário REMOVIDO nem formulários do autor. GET específico da equipe, paginação20/50/100/ASC, sem filtros adicionais ou buscas de nomes. Consulta comum continua ATIVO/PUBLICADO; troca de conta/perfil/Material e falhas de acesso descartam textos antigos. Guia original da consulta: [Comentários da equipe](docs/COMENTARIOS_EQUIPE_FRONTEND.md).

Cada comentário carregado permite consultar seu histórico. Abrir descarta a lista textual e mantém somente o UUID selecionado, motivos e metadados dos eventos. O histórico pode continuar após remoção lógica sem recuperar o texto; voltar consulta a lista atual novamente. Um painel por vez, paginação20/50/100, falhas de acesso retiram alvo/eventos e respostas antigas são ignoradas. Sem mutações. Código, estrutura e execução: [Histórico de comentário da equipe](docs/HISTORICO_COMENTARIO_EQUIPE_FRONTEND.md).

Comentários ATIVO oferecem **Ocultar comentário**; OCULTO oferece **Reexibir comentário** quando o Material está PUBLICADO na revisão. Formulário compartilhado com motivo até1000 e confirmação específica, sem ação padrão; trocar exige cancelar/descartar e consultar novamente. Só o alvo permanece no painel, editar/tentar enviar consome confirmação e o envio bloqueia novas ações. Sucesso consulta lista nova; conflito ou resultado incerto exige descarte e nova consulta, sem repetir POST automaticamente. Equipe pode moderar comentário próprio, conforme API; nenhuma das ações altera o Material. Estado observado pode ficar desatualizado: backend revalida cada POST. Estrutura, código completo e roteiro: [Reexibição de comentário](docs/REEXIBICAO_COMENTARIO_FRONTEND.md); [guia anterior de ocultação](docs/OCULTACAO_COMENTARIO_FRONTEND.md).

## Verificacao

O menu e a conta oferecem **Instituições**, com lista paginada20/50/100 e detalhe por UUID para autenticados dos três perfis, sem buscas adicionais por linha. ADMINISTRADOR pode cadastrar, editar e excluir instituições. Exclusão física exige confirmação, depende de 204, informa 409 para cursos vinculados e não apaga em cascata. Resultado incerto exige GET atual e nova confirmação; um 404 posterior não é apresentado como sucesso. Código e roteiros: [Consultas](docs/INSTITUICOES_CONSULTA_FRONTEND.md), [Cadastro](docs/INSTITUICAO_CADASTRO_FRONTEND.md), [Edição](docs/INSTITUICAO_EDICAO_FRONTEND.md), [Exclusão](docs/INSTITUICAO_EXCLUSAO_FRONTEND.md).

O detalhe da instituição permite consultar cursos em `/instituicoes/:id/cursos`, leitura disponível aos três perfis. `ADMINISTRADOR` pode cadastrar em `/instituicoes/:id/cursos/novo`, editar em `/instituicoes/:instituicaoId/cursos/:id/editar` e excluir em `/instituicoes/:instituicaoId/cursos/:id/excluir`. A edição mantém o vínculo. A exclusão exige confirmação e só considera sucesso com `204`; o backend bloqueia com `409` quando houver disciplinas vinculadas, sem cascata. Conflito e resultado incerto exigem consulta explícita antes de decidir novamente. Guias: [Consulta](docs/CURSOS_CONSULTA_FRONTEND.md), [Cadastro](docs/CURSOS_CADASTRO_FRONTEND.md), [Edição](docs/CURSOS_EDICAO_FRONTEND.md) e [Exclusão](docs/CURSOS_EXCLUSAO_FRONTEND.md).

Cada curso também oferece consulta paginada de disciplinas em `/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas`, disponível aos três perfis autenticados. `ADMINISTRADOR` pode cadastrar, editar e excluir disciplinas. Cadastro e edição fixam instituição/curso na rota; código obrigatório, trim/maiúsculas e descrição opcional. A edição mantém o curso e consulta estado atual após `409` ou resultado incerto. A exclusão física exige confirmação e só considera sucesso com `204`; o backend bloqueia com `409` enquanto existir qualquer material vinculado, inclusive `REMOVIDO`, sem cascata. Conflito e resultado incerto exigem consulta explícita antes de nova confirmação. A Matriz 6 já está populada: não recadastre códigos existentes nem invente ementas. Guias: [Consulta](docs/DISCIPLINAS_CONSULTA_FRONTEND.md), [Cadastro](docs/DISCIPLINAS_CADASTRO_FRONTEND.md), [Edição](docs/DISCIPLINAS_EDICAO_FRONTEND.md) e [Exclusão](docs/DISCIPLINAS_EXCLUSAO_FRONTEND.md).

Categorias globais podem ser consultadas por qualquer perfil autenticado em `/categorias`, com detalhe por UUID. A lista usa paginação20/50/100 e projeta apenas nome, descrição e UUID. `ADMINISTRADOR` pode cadastrar pela lista e editar/excluir pelo detalhe. A edição envia PUT completo de nome e descrição, preservando UUID e materiais; `409` ou resultado incerto exige GET explícito antes de nova edição. O cadastro envia só nome/descrição normalizados conforme o backend; `409` bloqueia nome duplicado sem diferenciar caixa. A exclusão é física, pede confirmação explícita e só considera sucesso com `204`; `409` impede a operação enquanto houver material vinculado, inclusive `REMOVIDO`, sem cascata. Conflito ou resultado incerto exige GET e nova confirmação, e `404` não comprova sucesso anterior. Não renomeie/exclua categorias seed durante a validação. Guias: [Consulta](docs/CATEGORIAS_CONSULTA_FRONTEND.md), [Cadastro](docs/CATEGORIAS_CADASTRO_FRONTEND.md), [Edição](docs/CATEGORIAS_EDICAO_FRONTEND.md) e [Exclusão](docs/CATEGORIAS_EXCLUSAO_FRONTEND.md).

Materiais próprios também oferecem **Adicionar .torrent**: um arquivo v1 de até2MiB, saldo de10 Torrents e confirmação do retorno a PENDENTE, sem exceção de autoria para equipe. Multipart somente `arquivo`; recibo não é tratado como detalhe de Material. Erros de validação liberam seleção, conflitos/incertos exigem nova consulta sem retry. Código e roteiro: [Adição de .torrent](docs/ADICAO_TORRENT_FRONTEND.md).

Materiais próprios em PENDENTE/PUBLICADO oferecem **Adicionar Magnets** em Meus materiais e no detalhe comum com saldo. Nova tela consulta o alvo e permite lote dentro do limite acumulado10, com confirmação do retorno a PENDENTE. Só autoria, sem exceção de equipe; conflitos/resultados incertos descartam draft e exigem consulta nova, sem retry automático. Estrutura, código e roteiro: [Adição de Magnets](docs/ADICAO_MAGNETS_FRONTEND.md).

```bash
npm run test
npm run type-check
npm run build
```

Ou todos os testes e build com checagem de tipos:

```bash
npm run verify
```

Em26/10/2026: `npm run verify` passou com **1.408 testes** (9 novos:7 service/modelo+1 HTTP sintético+1 sessão), zero falhas/cancelados/ignorados, TypeScript/build aprovados. A seção de conta permite editar nome/e-mail e trocar senha; troca de e-mail pede senha atual, e-mail muda imediatamente, troca de senha encerra a sessão local e exige login novamente. JWTs antigos não são revogados. Backend `./mvnw clean verify`:555 testes aprovados e JAR gerado. Sem Docker. HTTP de teste local não substitui chamada real/browser; inspeção visual/DOM/E2E pendente. Guia: [perfil da conta](docs/PERFIL_FRONTEND.md) e [contrato backend](../UNESC-Share-Backend/docs/PERFIL_USUARIO.md).

A suíte padrão atual de 1319 testes permanece independente, com HTTP sintético. O roteiro `tests/integration/comentarios-spring.mjs` é iniciado exclusivamente por `ComentarioFrontendIT`; recebe JWTs/fixtures por stdin sem segredos reais e usa nome/sigla reservados para o cadastro, sem depender do UUID recebido para limpar. Não monta Vue ou aplica CORS como navegador. Vite200 na rota/formulário/lista/conta compilados; servidores/subprocessos encerrados. Visual/mobile/DOM/teclado/foco/FilePicker/sessionStorage/E2E Vue pendentes sem navegador. Sem Docker, `.env` real alterado, dados reais, deploy ou operação Git.

`npm run preview` serve dist em http://localhost:4173 para conferir o build. Essa origem precisa ser autorizada separadamente no backend ao testar chamadas HTTP; nao e igual a porta 5173. Preview nao e servidor de producao. Variaveis Vite sao resolvidas durante desenvolvimento/build, nao pelo Spring em tempo de execucao.

## Backend, Git e proximos passos

Backend local em `../UNESC-Share-Backend`, API `/api/v1`; contrato consolidado em `../UNESC-Share-Backend/docs/INTEGRACAO_FRONTEND.md`. Origem dev padrao ja aceita pelo CORS padrao; 127.0.0.1, porta ou host diferentes precisam de configuracao correspondente. Nao introduzir cookies de autenticacao ou consultas anonimas sem discutir a mudanca.

Git local inicializado com branch main, sem commit, remoto ou push. Nao reutilizar o remoto do backend; o repositorio GitHub frontend ainda precisa ser informado/criado pelo usuario.

Próximo recomendado: validar manualmente edição de perfil/troca de senha com conta de teste e, quando houver navegador disponível, fazer inspeção visual, DOM, teclado e fluxo E2E. Recuperação de senha e verificação de e-mail seguem pendentes. Contexto completo em [docs/CONTEXTO_PROJETO.md](docs/CONTEXTO_PROJETO.md).

Referencias oficiais: [Vue Quick Start](https://vuejs.org/guide/quick-start.html), [Vue e TypeScript](https://vuejs.org/guide/typescript/overview), [Vite](https://vite.dev/guide/).
