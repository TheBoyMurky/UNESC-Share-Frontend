# Cadastro de Material com Magnets

Incremento local de22/10/2026: `/materiais/novo` protegida e botao Cadastrar material em Meus materiais. Cria metadados +1..10Magnets em um POST JSON atomico existente. Nao existe etapa HTTP de material vazio. Autor vem do JWT e estado inicial PENDENTE sao definidos no servidor, sem campo selecionavel no formulario.

Vue3/Vite/TypeScript/Router/fetch e identidade visual preservados. Sem nova dependencia, Java/schema/permissao/publicacao ou dados reais alterados. O UnescShare continua catalogo BitTorrent: esta tela nao envia PDFs/ZIPs/videos/conteudo academico, nao abre cliente e nao consulta trackers/peers. Cadastro com .torrent fica para outro incremento.

## Estrutura e codigo completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/material/MaterialCadastroView.vue     # Formulario e confirmacao de sucesso
src/features/material/material-cadastro-model.ts  # Draft/selecao/concorrencia/envio testaveis
src/features/material/material-cadastro-service.ts# Validacao basica e POST projetado
src/features/material/material-service.ts          # Parser de detalhe reutilizado na resposta
src/features/catalogo/AcademicSelectors.vue        # Selects compartilhados com o catalogo
src/features/catalogo/CatalogoView.vue             # Usa o mesmo componente, filtros opcionais
src/features/catalogo/catalog-service.ts          # Servico existente de opcoes/paginas
src/router/index.ts                               # /materiais/novo antes do detalhe dinamico
src/features/material/MeusMateriaisView.vue        # Botao para novo cadastro
src/assets/main.css                               # Formulario responsivo
tests/material-cadastro-fixtures.mjs
tests/material-cadastro-service.test.mjs
tests/material-cadastro-model.test.mjs
tests/material-cadastro-http.test.mjs
tests/auth-navigation.test.mjs
```

Codigo completo nesses arquivos. Service/model/view separados, sem estado global de formulario. O parser parseMaterialDetail foi extraido da consulta existente para validar o POST sem novo GET. Consulta por UUID continua conferindo identidade da resposta; visibilidade nao foi alterada. AcademicSelectors compartilha a apresentacao/labels/paginacao com o catalogo; obrigatorio no formulario e opcional na busca. Estado de criacao e independente de busca, nunca dispara consulta geral de materiais ao carregar opcoes.

## Contrato preservado

POST autenticado `/api/v1/materiais` com application/json, Authorization Bearer, sem cookies/cache/redirect ou token em URL. Usa authenticatedJson:401 invalida somente o token efetivamente usado, mantendo as regras existentes da sessao. Campos enviados explicitamente:

```json
{
  "titulo": "Resumo de estudo",
  "descricao": "Descricao do material autorizado.",
  "disciplinaId": "UUID_EXISTENTE",
  "categoriaId": "UUID_EXISTENTE",
  "magnetUris": ["magnet:?xt=urn:btih:HASH_V1_VALIDO"]
}
```

Exemplo conceitual, substituir placeholders por referencias/URI validas. Instituicao e curso sao seletores auxiliares e nao entram no POST. Nao enviar usuarioId/perfil/status/views/infoHash/UUID de material ou mecanismos; servidor determina autoria/hash/estado/IDs. Sem escrita da estrutura academica por estudante ou autoaprovacao local.

Servidor retorna201/Location e MaterialDetalheResponse. Frontend reutiliza parser de DTO, exige PENDENTE,views0,torrents vazio,numero de Magnets igual ao lote e referencias correspondentes. Somente UUID do Material fica no estado de sucesso; nao usa Location arbitrario como redirecionamento nem faz GET automatico adicional. Nao reimplementa transacao/locks/hash do backend: teste HTTP sintetico nao prova atomicidade PostgreSQL.

Sucesso mostra Material cadastrado, explica que PENDENTE nao aparece no catalogo comum e oferece links explicitos para detalhes e Meus materiais. Nao publica, abre Magnet ou inicia download automaticamente. A nova consulta propria/detalhes fica sujeita ao servidor, inclusive se estado mudar depois.

## Formulario e validacao

- Titulo obrigatorio ate200 e descricao obrigatoria ate4000, com trim no envio e rejeicao local de U+0000. Normalizacao definitiva strip/Bean Validation/banco permanece no backend; texto simples, nao HTML.
- Instituicao -> curso -> disciplina dependentes; categoria independente. Modelo exige selecoes entre opcoes carregadas e limpa filhos ao trocar pai. Backend continua validando existencia/referencias.
- Opcoes carregadas pelo servico existente em paginas100, com Carregar mais e retry da pagina falha, sem truncar silenciosamente. Falha adicional preserva opcoes anteriores e IDs sao deduplicados.
- De1a10campos de Magnet, um por campo, cadaURI<=4000. Nao descartar campos vazios/extra silenciosamente nem dividir por virgula/quebras de linha. Adicionar/remover campo nao cria/remove entidade no servidor.
- Checagem local usa safeMagnetUri para protocolo/xt v1 hex/Base32 ou v2 SHA-256 sem fragmento/controles/espacos internos. Trim de bordas antes de enviar. Nao aceita URLHTTP/javascript nem multiplosxt/hibrido.
- Apenas duplicata textual exata apos trim e identificada localmente. Equivalencia de hashes (caixa/Base32/parametros extras), limite64parametros, canonicalizacao, duplicidade global/cruzada Torrent/Magnet e validacao completa sao autoridade do parser/guard no servidor. Sintaxe valida nao garante disponibilidade, licenca ou seguranca do conteudo.

Campos com labels, required/maxlength, erros textuais e foco no feedback apos envio. Nao exibir mensagens/corpo/valores rejeitados arbitrarios do servidor:400 mapeia somente titulo/descricao/referencias/magnetUris[indices] para mensagens locais.409 mostra conflito generico de Magnets/referencias, sem ecoar URI privada ou afirmar qual hash conflitou. Outros4xx usam mensagens seguras existentes.

Atualizar opcoes academicas cancela cargas e limpa as quatro selecoes, preservando titulo/descricao/Magnets; label avisa esse efeito. Serve para recarregar referencias removidas/alteradas durante preenchimento, sem editar dados academicos. Durante POST, fields e metodos de alteracao/opcoes/envio duplicado ficam bloqueados; sucesso tambem impede outro POST naquela instancia.

## Privacidade, resultado incerto e cancelamento

Rascunho somente em memoria enquanto tela aberta. Nunca persistir titulo/descricao/Magnets em URL/sessionStorage/localStorage/logs, nem criar links para URIs digitadas durante preenchimento. Ao sucesso/sair, o estado do draft e limpo; falhas preservam dados para correcao enquanto montado. Nao prometer apagar todas as copias da memoria/DevTools/rede ou impedir autofill do proprio navegador.

Rede/protocolo/408/5xx podem ocultar cadastro ja concluido; mensagem pede conferir Meus materiais antes de reenviar. Sem retry automatico ou chave de idempotencia. Botao Reenviar cadastro e acao explicita, nao garantia de ausencia de duplicidade. Backend protege hashes existentes; nao alterar regras para reassociar mecanismo automaticamente.

Trocar instituicao/curso cancela consultas antigas dos filhos e ignora respostas atrasadas. Desmontar/sair/logout cancela esperas e nao permite sucesso atrasado reabrir/repovoar a tela. Abort no HTTP **nao garante rollback/cancelamento do cadastro no servidor**. Cargas de opcoes ativas tambem sao canceladas ao iniciar POST valido. Sem guard de saida ou salvamento de rascunho nesta entrega: aviso explica que sair descarta formulario.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run verify
npm run dev
```

Abra http://localhost:5173, faca login e entre em Meus materiais -> Cadastrar material, ou /materiais/novo. Backend/PostgreSQL locais precisam estar disponiveis para fluxo real; URLpublica padrao http://localhost:8080/api/v1. Nao copiar segredos para VITE_* nem reativar bootstrap administrativo. POST real persiste registros, portanto usar somente materiais autorizados de desenvolvimento.

Roteiro manual pendente de navegador:

1. Sem acesso, abrir /materiais/novo deve levar ao login, nunca ao detalhe de UUID invalido. Autenticado de qualquer perfil pode preencher; nao mostrar selecao de autor/status/perfil ou input de arquivo.
2. Conferir teclado/foco/layout desktop-mobile, obrigatorios e limites200/4000/1..10/4000. Textos com caracteres especiais devem aparecer escapados.
3. Conferir instituicao->curso->disciplina/categoria, troca rapida de pai e Carregar mais alem100, falha/retry preservando opcoes e nenhum GET /materiais para preencher seletores.
4. Conferir que so referencias carregadas sao enviadas; atualizar opcoes deve limpar apenas selecao academica. A API deve receber exatamente cinco campos no POST JSON Bearer, sem cookies/identidade/estado/hash na URL ou corpo extra.
5. Cadastrar lote autorizado: um POST e201, sucesso PENDENTE, draft limpo e links de consulta; verificar via Meus materiais/detalhes, nao esperar publicacao automatica no catalogo.
6. Testar URI invalida, lote vazio/duplicado e hashes equivalentes que backend reconhece como409. Nenhuma URI privada deve aparecer em erros/causas/logs. Nenhum acesso automatico a tracker/peer/cliente deve ocorrer.
7. Simular400/401/403/404/409/503/rede/resposta malformada, sem reenviar automaticamente. Para resultado incerto, conferir Meus materiais antes de repetir; nao concluir ausencia de registro so por erro no cliente.
8. Sair/logout durante POST/carga de opcoes: nao atualizar instancia desmontada; conferir resultado no servidor antes de repetir, pois abort nao garante rollback.

Verificacao em22/10/2026: **342 testes**, type-check e build aprovados (50novos sobre292:26service/validacao/DTO,22modelo/selecao/concorrencia,1HTTP sintetico e1guardaRouter). Regressao de catalogo/detalhes preservada apos compartilhar componente/parser. HTTPfetch real em servidor temporario local usa101instituicoes e referencias vinculadas, POST cinco campos com Bearer,201/400/401/409/503/DTOinvalido/conexao interrompida; confirma uma tentativa por acao e ausencia de retry/sucesso indevido. Nao usa Spring/banco/trackers/dados reais nem prova rollback real. Router memory history, nao DOM.

Vite200 /materiais/novo/fallback e componentes MaterialCadastroView/AcademicSelectors/CatalogoView compilados; isso nao comprova formulario/guarda no navegador. Inventario sem navegador: visual/mobile/DOM/acessibilidade/cadastro E2E com Spring pendentes. Servidor temporario encerrado ao finalizar. Nenhuma dependencia/Java/schema/Maven/Docker/backend iniciado/.env real/credencial/dado real alterado, publicacao/commit/remoto/push neste incremento; Maven registrado549 nao reexecutado.

Cadastro inicial com .torrent implementado no incremento seguinte, como opcao alternativa no mesmo formulario: [CADASTRO_MATERIAL_TORRENT_FRONTEND.md](CADASTRO_MATERIAL_TORRENT_FRONTEND.md). JSON/Magnets preservado; nao misturar mecanismos no cadastro inicial. Proximo recomendado edicao dos metadados proprios, sem alterar mecanismos.
