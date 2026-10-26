# Cadastro inicial com arquivo .torrent

Incremento local de23/10/2026, continuando o cadastro com Magnets: `/materiais/novo` agora oferece **Magnets ou um .torrent**, nunca os dois no cadastro inicial. Mantem Vue3/Vite/TypeScript, fetch/Router e estilo existentes, sem dependencia ou alteracao Java/schema/permissao. Fluxo local, sem publicacao.

O UnescShare permanece catalogo BitTorrent. O arquivo enviado e somente metainfo `.torrent`, nao PDF/EPUB/ZIP/video/conteudo academico. Torrent/Magnet continuam entidades independentes. Um unico POST cria Material+Torrent na transacao existente; nenhuma etapa HTTP de Material vazio.

## Estrutura e codigo completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/shared/http/client.ts                      # multipart/FormData e resposta JSON segura
src/features/auth/authenticated-client.ts       # Bearer/401 compartilhado com JSON/download
src/features/auth/auth.ts                       # authenticatedMultipart
src/features/material/material-cadastro-service.ts # Metadados comuns e multipart projetado
src/features/material/material-cadastro-model.ts   # Modo/File/validacao/cancelamento
src/features/material/MaterialCadastroView.vue  # Escolha de mecanismo e input .torrent
src/features/material/MeusMateriaisView.vue     # Texto do cadastro atualizado
src/assets/main.css                            # Nome selecionado com quebra de linha
tests/material-torrent-cadastro.test.mjs
tests/material-torrent-cadastro-http.test.mjs
```

Codigo completo nesses arquivos. Reutiliza seletores academicos, parser de MaterialDetalheResponse e validacao de metadados do incremento anterior, documentado em [CADASTRO_MATERIAL_MAGNET_FRONTEND.md](CADASTRO_MATERIAL_MAGNET_FRONTEND.md). Nao cria outro formulario de metadados nem um parser BitTorrent no navegador.

## Contrato e envio

Ao escolher .torrent, POST autenticado `/api/v1/materiais` com FormData criado explicitamente, exatamente duas partes:

- `material`: Blob application/json, filename material.json, somente titulo/descricao/disciplinaId/categoriaId normalizados. Nunca inclui magnetUris/autor/status/hash/curso/instituicao/caminho.
- `arquivo`: File selecionado, preservando bytes e nome validado. Nao envia caminho local do sistema.

Nao definir Content-Type global: o navegador precisa gerar o boundary. Isso usa FormData nativo, nao parser/serializador multipart customizado: [MDN Using FormData Objects](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects).

authenticatedMultipart aplica as mesmas politicas do cliente: Authorization Bearer somente no header, credentials omit, cache no-store, redirect error e protecao de origem/prefixo. Sem cookies, sessao HTTP, JWT na URL, Axios, refresh ou ampliacao de CORS. JSON e FormData nao sao combinados no corpo da mesma requisicao. Respostas JSON/ProblemDetail/corpos vazios reutilizam o tratamento existente; nao classificar erro por texto de excecao.

Resposta201/DTO precisa indicar PENDENTE, views0, magnets vazio, exatamente um Torrent com tamanho igual ao File e referencias correspondentes. Parser valida UUIDs/datas/hash v1/formato do DTO, mas nao calcula hash do arquivo no cliente. Sucesso conserva somente UUID e mostra links explicitos para detalhe/Meus materiais; nao navega por Location arbitrario nem faz GET extra automaticamente.

O servidor continua responsavel por transacao, validacao bencode/metainfo v1, hash SHA-1, conflito entre tabelas, storage privado e limpeza em rollback. Validar DTO no frontend nao prova integridade ou atomicidade distribuida. Backend aceita somente Torrent v1 neste fluxo; v2/hibridos sao rejeitados. Magnets v2 continuam disponiveis no outro modo.

## Selecao, limites e privacidade

Modo inicial continua MAGNET, preservando compatibilidade. Trocar modo limpa URIs/File anteriores e erros de campo, preservando metadados e quatro selecoes academicas. Um aviso de resultado incerto e mantido se ja havia POST sem confirmacao. Nao oferece cadastro misto, lote de arquivos ou adicao posterior de mecanismos nesta entrega.

Input accept=.torrent e sem multiple; o modelo tambem exige exatamente um File, nao vazio e de no maximo2MiB. Rejeita nome nao .torrent, mais de255 caracteres, prefixo ponto, espacos nas bordas, caminhos/separadores/controles/nomes proibidos conforme checagem local. Mensagens nao ecoam nome/caminho privado. Extensao/accept/tamanho sao conveniencias, nao seguranca suficiente: um PDF renomeado nao vira Torrent valido. MIME informado pelo navegador pode ser vazio/octet-stream e nao decide validade; servidor valida bytes.

File e mantido apenas como referencia em RAM; a aplicacao nao le/mostra conteudo, calcula hash, abre cliente ou acessa trackers/peers. Exibe somente nome escapado e quantidade de bytes de metainfo. Nao confundir esse tamanho com o conteudo academico.

O input nativo e limpo apos change para permitir selecionar novamente o mesmo arquivo. A obrigatoriedade e validada pelo modelo (aria-required/label indicam a regra, sem required nativo no input ja limpo). Arquivo ausente, selecao multipla injetada ou arquivo invalido removem referencia anterior, evitando enviar um arquivo antigo por engano. Botao Remover selecao limpa somente a escolha local, sem tocar no disco ou em registros.

POST pendente bloqueia modo/edicoes/selecao/remocao/envio duplicado. Sucesso, troca de modo e desmontagem limpam File; erros mantem referencia em RAM para correcao/reenvio explicito. Nenhum File/bytes/nome/URI e persistido em storage/URL/logs. Nao prometer apagar todas as copias da memoria/rede/DevTools ou impedir comportamento proprio do navegador. Nao ha progresso percentual inventado; tela mostra Enviando cadastro enquanto aguarda resposta.

## Erros e resultado incerto

400 usa mensagens locais para campos conhecidos, nunca corpo arbitrario/SQL/nome/caminho rejeitado; resposta sem errors continua com mensagem generica segura.413 informa excesso permitido,415 formato nao suportado,409 conflito de mecanismos/referencias.401 invalida apenas token usado conforme helper existente, sem repetir upload automaticamente;403/404 nao concedem privilegios nem indicam sucesso.

Rede/protocolo/408/5xx podem ocultar cadastro ja confirmado no servidor: orientar conferir Meus materiais antes de reenviar. Sem chave de idempotencia/retry automatico. O botao Reenviar cadastro e acao explicita, nao garantia de inexistencia de registro. Backend continua bloqueando hashes em outro Material, sem reassociacao automatica.

Sair/logout/dispose aborta espera e ignora resposta antiga; **isso nao garante rollback no servidor**. Sem limpeza automatica de dados reais, reconciliacao de filesystem ou revogacao imediata de token. Contrato do backend: `../UNESC-Share-Backend/docs/CADASTRO_MATERIAL_TORRENT.md`.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run verify
npm run dev
```

Abra http://localhost:5173, login -> Meus materiais -> Cadastrar material -> Um arquivo .torrent v1. Fluxo real requer backend/PostgreSQL disponiveis e URL publica padrao http://localhost:8080/api/v1. Nao reativar administrador inicial, executar Docker pelo agente ou copiar segredos para VITE_*.

Roteiro manual pendente de navegador, com .torrent v1 proprio/autorizado e descartavel de desenvolvimento (POST real persiste registros):

1. Conferir default Magnets e cadastro JSON anterior. Trocar para .torrent limpa Magnets, mantendo titulo/descricao/referencias; trocar de volta limpa File. Nenhum mecanismo inativo deve ser enviado.
2. Selecionar um .torrent, remover e escolher o mesmo novamente; conferir nome/tamanho e obrigatoriedade pelo modelo. Testar vazio, maior2MiB, nome nao permitido e PDF/ZIP sem rename. Extensao valida com bytes invalidos deve falhar no backend, nao ser anunciada como validada no cliente.
3. Conferir teclado, foco, rotulos, selecao de arquivo e layout desktop/mobile, inclusive nome longo. Somente metainfo deve ser selecionado, nunca conteudo academico.
4. Cadastrar: um POST multipart Bearer, duas partes/JSON application/json/arquivo com bytes originais/boundary automatico. Sem etapa de Material vazio e sem magnetUris/autor/status/hash/caminho no corpo de metadados.
5.201 deve confirmar PENDENTE e oferecer detalhe com um Torrent/zero Magnets; download posterior continua autorizado pela API. Nao esperar publicacao automatica ou cliente BitTorrent aberto.
6. Simular400/401/409/413/415/503/resposta perdida; conferir mensagens sem dados privados e ausencia de retry automatico. Conferir Meus materiais antes de repetir em resultado incerto.
7. Durante envio, tentar duplo clique/trocar modo/arquivo e sair/logout: controles bloqueados, tarefa descartada apos unmount. Verificar resultado no servidor antes de repetir, pois abort nao significa rollback.

Verificacao em23/10/2026: **385 testes**, type-check/build aprovados (43novos sobre342:42unitarios de service/model/HTTP/helper e1HTTP sintetico nativo). Regressao de JSON/Magnets/catalogo/detalhes preservada. HTTP usa fetch/FormData/File reais em servidor temporario local e parser Request.formData nativo; confirma boundary,duas partes,metadados projetados,bytes,Bearer e201/400/401/409/413/415/503/DTOinvalido/conexao interrompida, sem etapas adicionais/retry. LimiteServlet413 foi simulado, nao retestado no Spring. Bytes sao fixtures sinteticas de frontend, nao prova de metainfo valido, hash ou rollback real.

Vite200 /materiais/novo/fallback/componente compilado; isso nao prova formulario/selecionador no navegador. Inventario sem navegador: visual/mobile/DOM/acessibilidade/selecao de arquivo/E2E Spring pendentes. Servidor temporario encerrado ao finalizar. Sem Java/schema/dependencias novas, Maven/Docker/backend iniciado/.env real/credencial/dado real alterado/publicacao/commit/remoto/push. Ultima suite Maven registrada continua549, nao reexecutada.

Edicao dos metadados proprios implementada no incremento seguinte: [EDICAO_MATERIAL_FRONTEND.md](EDICAO_MATERIAL_FRONTEND.md). Preserva mecanismos/retornaPENDENTE. Proximo recomendado remocao logica propria com confirmacao explicita, sem restauracao.
