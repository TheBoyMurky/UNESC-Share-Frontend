# Remocao logica dos proprios materiais

Incremento local de23/10/2026: `/materiais/:id/remover` protegida e links Revisar remocao em Meus materiais/detalhes para autor em PENDENTE/PUBLICADO/BLOQUEADO. Abrir o link apenas consulta; nenhuma escrita automatica. REMOVIDO observado em nova consulta mostra informacao sem repetir DELETE.

Preserva Vue3/Vite/TypeScript/Router/fetch, estilo e API existentes. Sem nova dependencia, Java/schema/permissao alterados ou publicacao. UnescShare continua catalogo BitTorrent, nao hospedagem de conteudo academico; Torrent/Magnet continuam independentes e sao preservados pela remocao logica existente.

## Estrutura e codigo completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/material/material-remocao-service.ts # Consulta resumida/UUID/DELETE e canRemoveMaterial
src/features/material/material-remocao-model.ts   # Alvo/confirmacao/tarefas/resultado incerto
src/features/material/MaterialRemocaoView.vue      # Pagina de revisao e confirmacao obrigatoria
src/features/material/MaterialView.vue            # Link autor em estado elegivel
src/features/material/MeusMateriaisView.vue        # Link de revisao, sem remocao inline
src/shared/http/client.ts                        # DELETE estrito204 sem leituraJSON
src/features/auth/authenticated-client.ts         # Token/401 compartilhado
src/features/auth/auth.ts                         # authenticatedDelete
src/router/index.ts                              # Rota protegida
src/assets/main.css                              # Botao destrutivo/checkbox/avisos
tests/material-remocao.test.mjs
tests/material-remocao-http.test.mjs
tests/auth-navigation.test.mjs
```

Codigo completo nesses arquivos. Service/model/view separados, parser de DTO e seguranca HTTP reutilizados. Confirmacao nao adiciona operacao de backend nem muda a semantica de DELETE. Nao foi usado window.confirm ou exclusao inline: pagina propria mostra alvo/impacto e permite cancelar antes do envio.

## Consulta e confirmacao

GET /api/v1/materiais/{id} por authenticatedJson ao entrar, com UUID validado antes de HTTP. Projeta somente id/titulo/usuarioId/status/contagens de mecanismos; nao conserva descricao/URIs/nomes de arquivos/caminhos/dados pessoais extras no estado da confirmacao. Titulo interpolado/escapado, nunca HTML confiavel.

canRemoveMaterial e conveniencia de UI, com autor de /usuarios/me e estados elegiveis, sem excecao por perfil de equipe. Forcar rota de terceiro nao abre confirmacao nem envia DELETE, mesmo se o material publicado for legivel. Backend continua revalidando autor sob lock; nao enviar usuarioId/perfil no corpo/query ou usar perfil local como autorizacao.

Pagina mostra titulo, UUID e estado/contagens da consulta, aviso de indisponibilidade no catalogo comum, preservacao do registro/Torrents/Magnets e **ausencia de restauracao**. Autor/equipe podem continuar consultando o registro conforme visibilidade da API; copias distribuidas pela rede nao sao apagadas por esta acao. Info Hashes continuam associados/reservados, inclusive apos REMOVIDO: a remocao nao libera mecanismos para cadastrar outro Material.

Checkbox obrigatorio e botao Confirmar remocao logica sao a acao explicita. Nenhum DELETE em mount, reload, navegacao, simples abertura do link ou submit sem confirmacao. A confirmacao vale somente para o UUID/tentativa atual, nao para uma versao de titulo/estado: nao ha ETag/controle otimista no backend. Dados podem mudar depois de GET.

Marcacao nao e persistida em URL/storage. Desmarcar cancela consentimento antes do envio. Toda tentativa consome a confirmacao, inclusive em erro; alterar UUID/conta/recarregar/desmontar limpa o estado e nao transfere consentimento para outro alvo. Durante envio, checkbox/botao/reconsulta ficam bloqueados e a saida avisa que operacao pode continuar no servidor.

## Contrato DELETE e resultado

DELETE autenticado `/api/v1/materiais/{id}`, sem corpo/Content-Type, parametros de identidade ou JWT na URL. authenticatedDelete reutiliza controle de token/401, credentials omit, cache no-store, redirect error e protecao de origem/prefixo. Transport exige **204** e nao le JSON.2xx inesperados (200/202/205) sao erro de protocolo, nao remocao confirmada; nao interpretar corpo arbitrario como instrucao/sucesso.

Backend muda apenas Material.status para REMOVIDO, preservando relacionamentos/arquivos. Permite autor em qualquer estado; repetir DELETE de registro ja REMOVIDO e204 idempotente. UI normalmente evita repetir apos observar REMOVIDO, mas outro fluxo pode remover entre GET/DELETE:204 ainda confirma resultado final sem indicar se houve nova transicao.

Sucesso mostra confirmacao, sem nova escrita automatica, e oferece Meus materiais/consulta preservada. Entrar novamente faz nova consulta; listas e detalhes nao recebem cache global falso ou exclusao fisica no cliente. Sem restauracao, expurgo de filesystem, remocao de mecanismos, limpeza de banco ou evento de moderacao novo.

4xx usam mensagens seguras por status sem ecoar ProblemDetail/URI/SQL/causa privada.401 invalida somente token utilizado e segue navegacao existente; equipe nao recebe permissao de remover terceiros. Confirmacao e consumida tambem nesses casos, sem retry automatico.

Rede/protocolo/408/5xx podem ocorrer apos commit: resultado incerto pede consultar estado atual. Modelo bloqueia checkbox/DELETE ate novo GET; se indicar REMOVIDO, informa ja removido sem DELETE. Se ainda indicar estado elegivel, e necessaria nova confirmacao explicita. Nova consulta nao e snapshot ou garantia de que uma transacao pendente nao concluira depois; idempotencia do DELETE continua sendo garantia da API.

Sair/logout/abort cancela espera e ignora resposta antiga, **nao garante cancelar/verter remocao no servidor**. Troca de conta durante GET/DELETE descarta dados e retorno. Nao ha renovacao/revogacao imediata de JWT ou restauracao adicionada ao prototipo.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run verify
npm run dev
```

Abra http://localhost:5173, login -> Meus materiais -> Revisar remocao ou o link nos detalhes proprios. Backend/PostgreSQL locais sao necessarios para fluxo real; URL publica padrao http://localhost:8080/api/v1. Nao reativar bootstrap administrativo/copiar segredos para VITE_*.

Roteiro manual pendente de navegador, apenas pelo usuario com material proprio descartavel/autorizado de desenvolvimento: **DELETE real altera o registro sem restauracao pela aplicacao**. O agente nao executou esse roteiro contra banco real.

1. Sem acesso, rota leva ao login. Terceiro/equipe nao autora nao deve receber confirmacao ou enviar DELETE. BLOQUEADO proprio pode ser removido; REMOVIDO apenas informa resultado da consulta.
2. Conferir alvo/titulo/UUID, textos escapados, impactos, teclado/foco/checkbox e layout desktop/mobile. Apenas abrir, desmarcar, cancelar ou navegar nao deve enviar DELETE.
3. Marcar confirmacao e clicar botao: uma requisicao DELETE Bearer ao UUID consultado, sem corpo/cookies/parametros de autoria.204 semJSON deve mostrar sucesso; duplo clique nao repete.
4. Conferir no backend status REMOVIDO e preservacao de UUID/metadados/Torrents/Magnets/relacionamentos, sem catalogo comum ou restauracao. Nao esperar apagar copias da rede BitTorrent.
5. Simular400/401/403/404/409/503/conexao interrompida/2xx inesperado: sem mensagem privada/sucesso indevido/retry. Em incerto, nova consulta antes de checkbox; REMOVIDO observado nao envia novamente, estado ainda elegivel exige nova confirmacao.
6. Trocar UUID/conta/sair durante GET/DELETE: nao transferir confirmacao ou atualizar outro alvo com resposta antiga. Conferir resultado no servidor antes de repetir; cancelar espera nao garante rollback.

Verificacao em23/10/2026: **466 testes**, type-check/build aprovados (40novos sobre426:38unitarios de service/model/helper,1guardaRouter,1HTTP sintetico). Regressao de cadastro/edicao/consultas/download/Magnets preservada.

HTTP usa fetch real contra servidor temporario descartavel em RAM: GET antes de confirmacao, DELETEBearer semcorpo204, quatro estados, idempotencia simulada,400/401/403/404/409/503/200inesperado/conexao perdida e reconsulta de resultado incerto sem novoDELETE. Arrays de mecanismos preservados no fixture; isso nao prova autorizacao/rollback/preservacao no Spring/PostgreSQL. Guardas memory history e modelo nao sao testes DOM.

Vite200 para rota/fallback/componente compilado nao comprova selecao/confirmacao/foco no navegador. Inventario sem navegador: visual/mobile/DOM/acessibilidade/E2E Spring pendentes. Servidor temporario encerrado ao finalizar. Sem DELETE contra Spring/banco real, Java/schema/dependencia/Maven/Docker/backend iniciado/.env real/credencial/dado real alterado/publicacao/commit/remoto/push. Maven registrado549 nao reexecutado.

Proximo recomendado: comentarios nos materiais PUBLICADO, com listagem e cadastro primeiro; nao reutilizar permissao de detalhes privados de Material para liberar comentarios.
