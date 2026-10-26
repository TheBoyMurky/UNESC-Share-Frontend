# Detalhes e mecanismos de compartilhamento

Incremento local de 22/10/2026: rota autenticada `/materiais/:id`, acessivel pelo titulo no catalogo. Mantem Vue 3/Vite/TypeScript, Vue Router, fetch nativo e identidade visual existente, sem dependencias novas, publicacao ou alteracao de Java/schema. O UnescShare continua catalogo BitTorrent: nao hospeda nem baixa o conteudo academico.

## Estrutura e codigo completo

Todos os arquivos estao no repositorio `UNESC-Share-Frontend`, irmao do backend:

```text
src/features/material/
  MaterialView.vue          # Tela, rota observada, estados e acoes explicitas
  material-service.ts       # Contratos, projecao de DTOs e chamadas HTTP
  material-model.ts         # Estado testavel, cancelamento e respostas atrasadas
  browser-actions.ts        # Blob URL, solicitacao de download e clipboard
src/features/auth/
  authenticated-client.ts  # Bearer/401 compartilhado por JSON e Torrent
  auth.ts                  # Adaptador da sessao existente
src/shared/http/client.ts  # JSON/erros e leitura binaria limitada
src/router/index.ts        # Guarda de /materiais/:id
src/features/catalogo/CatalogoView.vue # Links nos titulos
src/assets/main.css        # Layout responsivo, hashes e copia manual
tests/material-*.test.mjs # Contratos, modelo e HTTP sintetico
tests/torrent-download.test.mjs
tests/browser-actions.test.mjs
tests/auth-navigation.test.mjs
tests/material-fixtures.mjs
```

O codigo completo esta nesses arquivos; nao ha trecho adicional a copiar no backend.

## Consulta e visibilidade

`GET /materiais/{id}` fornece titulo, descricao, estado, data de cadastro UTC, visualizacoes e listas independentes de Torrents/Magnets. DTOs sao validados e projetados; caminhos de storage e dados pessoais extras nao entram no estado. Textos usam interpolacao escapada do Vue, nunca v-html.

A tela aceita os quatro estados retornados pela API. PUBLICADO e consultavel por autenticados; PENDENTE/BLOQUEADO/REMOVIDO somente conforme autorizacao do servidor (autor/equipe); terceiros recebem404. A guarda local exige acesso, mas nao decide propriedade nem concede permissao privada. Sem incremento artificial de visualizacoes ou publicacao de dados de demonstracao.

Nomes academicos sao obtidos apenas no detalhe: disciplina e categoria em paralelo, depois curso e instituicao, quatro GETs por UUID. Nao consultar usuario/autor nem criar N+1 na lista. Falha nos nomes tem tentativa separada e nao oculta os mecanismos ja recebidos. Nao ha snapshot: mudancas posteriores na API podem tornar dados exibidos antigos.

## Download autenticado do .torrent

Cada clique faz novo `GET /materiais/{materialId}/torrents/{torrentId}` com Authorization Bearer, sem cookies, cache, redirecionamento ou JWT na URL. A API revalida visibilidade/arquivo a cada requisicao; nao ha cache local persistente de arquivos.401 invalida somente o token usado nessa requisicao;403/404/503 produzem erro por mecanismo e nao salvam corpo de erro como arquivo. Reutiliza o mesmo tratamento de ProblemDetail/corpos vazios do cliente JSON.

Sucesso exige200 e Content-Type application/x-bittorrent. A leitura em stream limita o total a2MiB, mesmo sem Content-Length. Comprimento invalido/divergente, arquivo vazio, MIME inesperado,206 e excesso sao rejeitados. O frontend nao reimplementa parser bencode/infohash: a validacao estrutural e de integridade continua no backend. Limite/MIME nao provam sozinhos que bytes sao um Torrent valido.

Nome local sempre `{torrentId}.torrent`, usando UUID validado, nunca nomeArquivo/Content-Disposition recebido. O nome original e mostrado somente como texto. O tamanho exibido mede metainfo, nao conteudo academico. Blob URL temporaria e ancora com download solicitam o salvamento; a tela confirma apenas envio da solicitacao ao navegador, nao arquivo salvo/disco concluido. URLs sao revogadas apos a solicitacao ou desmontagem, conforme [URL.revokeObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static).

## Magnet: copiar ou abrir

Nao existe consulta automatica a trackers, peers, seeds ou webseeds. URIs recebidas passam por defesa de navegacao: protocolo magnet, sem espacos/controles/fragmento, um xt v1 btih hex/Base32 ou v2 btmh SHA-256. Essa checagem nao substitui o parser/normalizador do servidor, nem verifica disponibilidade, licenca ou seguranca do conteudo. Parametros extras sao preservados, nao acessados.

Copiar chama writeText somente no clique e anuncia sucesso somente apos resolver a Promise; nunca le o clipboard. Se indisponivel/negado, oferece textarea somente leitura para selecao/copia manual, sem execCommand. A API de clipboard depende de contexto seguro e pode recusar a operacao: [MDN writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText).

Abrir no cliente e link magnet explicito, sem token e sem acao automatica. O navegador/cliente instalado decide o tratamento; nao ha confirmacao de aplicativo aberto. O cliente BitTorrent pode contatar servicos/peers externos. Uma URI ja copiada ou um download ja solicitado nao podem ser desfeitos por logout.

## Estado e concorrencia

Trocar UUID/repetir consulta/sair da tela cancela requisicoes antigas, limpa o registro anterior e ignora respostas atrasadas. Downloads independentes por Torrent, com bloqueio de clique duplicado enquanto pendentes. Copias tambem verificam identidade da tarefa antes de atualizar mensagens. Desmontagem ao perder acesso descarta trabalho pendente; nao ha garantia de revogacao imediata de JWT ou de bytes ja recebidos. Sem refresh, retry automatico, edicao/cadastro de mecanismos ou ampliacao de permissoes.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run verify
npm run dev
```

Abra http://localhost:5173, com backend/PostgreSQL locais ja disponiveis para o fluxo autenticado. A URL publica padrao e http://localhost:8080/api/v1. Nao copiar segredos do backend para variaveis VITE_* e nao reativar bootstrap administrativo para testar a tela.

Roteiro manual com registros autorizados existentes:

1. Sem acesso, abrir /materiais/{UUID} deve levar ao login; autenticar e entrar pelo titulo no catalogo.
2. Conferir textos, datas UTC, nomes academicos e layout em telas largas/estreitas; titulo/descricao/nomes com caracteres especiais devem aparecer como texto.
3. Baixar um .torrent: conferir GET Bearer, ausencia de token na URL, nome UUID.torrent e bytes do metainfo. Cancelar no dialogo do navegador nao deve ser anunciado como arquivo salvo.
4. Copiar Magnet, conferir texto; negar permissao e testar selecao manual. Abrir no cliente apenas se desejar contatar a rede externa, nunca como teste automatico.
5. Conferir mecanismos vazios e material privado autorizado; terceiro deve receber404. Se visibilidade mudar apos carregar, novo download deve obedecer a API.
6. Navegar rapidamente entre UUIDs/sair/logout durante carga ou download: nenhuma resposta antiga deve repovoar a tela ou iniciar salvamento pendente.
7. Simular401/403/404/503, falha nos nomes e rede indisponivel sem usar credenciais em logs; nenhuma resposta HTML/JSON deve ser salva como .torrent.

Verificacao em22/10/2026: **191 testes**, type-check e build aprovados (76 novos sobre115). Inclui fetch/stream, MIME/tamanho/erros, contratos/URIs, modelo/cancelamento, guardas Router em memoria, objetos de navegador simulados e servidor HTTP temporario com Bearer sintetico. O HTTP confirma nova autorizacao em cada download; nao usa Spring/banco nem credenciais reais. Objetos simulados nao comprovam clipboard/download em navegador. Vite retornou200 para rota SPA e componente compilado; isso nao comprova guarda/DOM. Inventario sem navegador disponivel: visual/mobile, clipboard real, salvamento e cliente BitTorrent/E2E continuam pendentes.

Sem novas dependencias, Maven/Docker/backend iniciado, alteracao de .env real, dados reais, credenciais, commit/remoto/push ou publicacao neste incremento. Cadastro de conta, Meus materiais e cadastro com Magnets foram implementados depois: [CADASTRO_FRONTEND.md](CADASTRO_FRONTEND.md), [MEUS_MATERIAIS_FRONTEND.md](MEUS_MATERIAIS_FRONTEND.md), [CADASTRO_MATERIAL_MAGNET_FRONTEND.md](CADASTRO_MATERIAL_MAGNET_FRONTEND.md). Proximo recomendado cadastro inicial com .torrent, depois interacoes.
