# Adição de .torrent aos próprios materiais

Entrega de26/10/2026. Rota autenticada `/materiais/:id/torrents/adicionar`, com links **Adicionar .torrent** em Meus materiais e no detalhe comum próprio com saldo. Reutiliza a API/armazenamento existentes; nenhum upload de PDF, vídeo, ZIP ou conteúdo acadêmico foi acrescentado.

## Estrutura e código completo

Arquivos relativos ao frontend `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/material/material-torrent-adicao-service.ts  # GET e multipart/recibo
src/features/material/material-torrent-adicao-model.ts    # Seleção/confirmação/envio/descarte
src/features/material/MaterialTorrentAdicaoView.vue        # Formulário
src/features/material/material-compartilhamento.ts        # Projeção compartilhada da consulta
src/features/material/material-service.ts                # Parser TorrentInfo reutilizável
src/features/material/material-magnet-adicao-service.ts   # Reutiliza projeção extraída
src/features/material/MaterialView.vue                   # Link comum próprio com saldo
src/features/material/MeusMateriaisView.vue               # Link para consultar saldo
src/router/index.ts                                     # Rota requiresAuth
tests/material-torrent-adicao.test.mjs                    # 29 testes de contrato/modelo
tests/material-torrent-adicao-http.test.mjs               # 1 teste multipart HTTP sintético
tests/auth-navigation.test.mjs                           # 3 novas guardas
tests/integration/comentarios-spring.mjs                  # Trecho upload/download Spring real
```

No backend, somente teste foi ajustado: `src/test/java/br/com/murkyweb/unesc_share/material/ComentarioFrontendIT.java`, para isolar e conferir a limpeza do armazenamento de metainfo das fixtures. Código completo nesses arquivos. Sem alteração em Java de produção, schema, dependências, autenticação ou endpoints.

O modelo de envio é próprio porque o payload é um File e a resposta é um recibo de Torrent, diferente do detalhe de Material retornado pela adição de Magnets. Validação de arquivo, cliente multipart, regra de autoria/estado, parser de TorrentInfo, projeção do detalhe, estilos e Router são reutilizados; regressões do fluxo Magnet foram preservadas.

## Contrato e resposta

GET `/materiais/{id}` consulta e projeta título, autor, estado, data original e mecanismos; não busca contas ou referências acadêmicas. Confere limites10 de cada tipo. Somente autor em PENDENTE/PUBLICADO pode adicionar; equipe não recebe exceção para terceiros. BLOQUEADO/REMOVIDO não habilitam formulário. Com10 Torrents, a rota mostra limite atingido; Magnets possuem saldo independente.

```http
POST /materiais/{materialId}/torrents
Authorization: Bearer <token>
Content-Type: multipart/form-data; boundary=<gerado pelo navegador>

arquivo = <um File .torrent v1>
```

Rotas relativas a `/api/v1`. `FormData` contém exclusivamente `arquivo`, sem JSON, autor, estado, outros parâmetros ou múltiplos arquivos. Não define Content-Type manualmente. Reutiliza validação de nome simples `.torrent` até255 caracteres e tamanho1byte..2MiB; não lê/decodifica metainfo no navegador. MIME/extensão não comprovam validade: backend valida bencode v1 e Info Hash, limite acumulado10, duplicidade e autoria/estado vigentes. Requisição multipart possui limite servidor3MiB; v2/híbridos não são aceitos neste endpoint.

O backend responde201 e `TorrentResponse` com cinco campos: id, nomeArquivo, infoHash, tamanho, dataCadastro. O service valida/projeta esse recibo, exige hash v1, nome/tamanho iguais aos selecionados e UUID ainda ausente da consulta inicial. Descarta caminho/extras e conserva somente UUIDs do Material e novo Torrent após sucesso. Não segue Location, não abre cliente e não baixa o `.torrent` automaticamente na interface.

Essa resposta **não contém estado/autor/materialId**, e não é tratada como MaterialDetalheResponse. O endpoint verificado na integração real retorna Material a PENDENTE; a tela explica a regra e oferece consulta ao detalhe atual. Não infere o estado vigente depois do envio, cria snapshot otimista de Material ou atribui status lendo um recibo sem esse campo. Outra aba pode publicar/bloquear/alterar mecanismos após o POST.

## Seleção, confirmação e erros

Um File por vez. Após cada seleção, o input nativo é esvaziado para permitir escolher o mesmo arquivo; a referência File fica apenas no modelo. Seleção inválida ou múltipla descarta a anterior. Selecionar, limpar e tentar enviar consomem a confirmação do retorno a PENDENTE. Durante o POST bloqueia seleção, limpeza, confirmação, recarga interna e duplicidade.

- 400/413/415: conserva a consulta do Material, libera File e consome confirmação. Pede conferir metainfo/limite e selecionar novamente, sem repetir upload ou refletir corpo privado de erro.
- 401/403/404 de consulta/envio: retira todos os dados e bloqueia até nova carga;403 não desloga e401 usa o helper do token enviado.
- 409: descarta File e snapshot; não presume se o conflito veio de hash, limite ou estado. Exige GET novo, seleção e confirmação novas.
- Rede/protocolo/408/5xx ou recibo incompatível: resultado incerto, o upload pode ter sido salvo. Mesmo descarte e reconsulta; não repetir POST automaticamente nem atribuir um Torrent encontrado à tentativa perdida.

Recarga explícita descarta seleção/confirmação e consulta de novo; contagem, vazio ou novo estado não comprovam resultado de tentativa anterior. O detalhe existente permite conferir mecanismos antes de reenviar. Conta/perfil/Material/geração/dispose cancelam e ignoram tarefas antigas; saída não garante rollback. No frontend, File/bytes, URIs, metadados e confirmações ficam em RAM, sem storage do navegador, URL ou logs privados. O servidor armazena o metainfo validado no diretório privado conforme o contrato existente. Texto é interpolado pelo Vue. A revisão da equipe não oferece ações de autor.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com backend/PostgreSQL disponíveis, use conta e Material próprios de teste: **Meus materiais → Adicionar .torrent**, confira saldo/alvo, selecione metainfo v1 autorizado e confirme. Upload manual grava referência e arquivo reais. Não reativar bootstrap administrativo.

Roteiro manual: conferir limite2MiB e10Torrents, independência de Magnets, seleção cancelada/múltipla/inválida/mesmoarquivo, confirmação por seleção e bloqueio em voo; conferir PENDENTE e mecanismos anteriores preservados no detalhe. Testar negativo de autoria inclusive equipe, BLOQUEADO/REMOVIDO,400/413/415, conflito, queda de rede, logout/troca de Material e teclado/foco/320px.

Com ambiente backend exportado e PostgreSQL local disponível:

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Backend
set -a
source .env
set +a
ADMIN_SEED_ENABLED=false SEED_ENABLED=false SPRING_PROFILES_ACTIVE=test \
  ./mvnw -Dtest=TorrentApiTests,TorrentTransacaoTests,TorrentHttpTests,TorrentParserTests,TorrentStorageTests test
ADMIN_SEED_ENABLED=false SEED_ENABLED=false SPRING_PROFILES_ACTIVE=test \
  ./mvnw -Dtest=ComentarioFrontendIT test
```

O roteiro opcional usa os services/modelos reais do frontend para adicionar Magnet e `.torrent`, conferir PENDENTE, baixar e comparar metainfo e publicar a fixture antes dos cenários de comentários. Gera apenas metainfo sintético, sem conteúdo acadêmico ou consulta externa. Storage é diretório temporário exclusivo do IT, sem usar `data/torrents` ou o diretório real do `.env`. Limpa porUUID os registros da fixture e os arquivos correspondentes, confirma ausência, exige diretório vazio e o remove em AfterAll. JWTs de teste porstdin e ambiente Node reduzido aPATH, sem credenciais reais. Fora das suítes padrão; [guia de integração](../../UNESC-Share-Backend/docs/VALIDACAO_INTEGRADA_COMENTARIOS.md).

## Validação executada

- **1110 testes frontend** em `npm run verify`, zero falhas/cancelados/ignorados, TypeScript/build aprovados. São33 novos sobre1077:29 service/modelo,1 HTTP multipart sintético e3 guardas. Regressões preservadas após extrair a projeção e o parser.
- **79 testes backend focados**:50 parser,5 storage,6 HTTP Servlet real,15 API e3 transação/rollback; zero falhas/erros/ignorados.
- **2 cenários opcionais frontend→Spring HTTP→PostgreSQL reais** passaram com upload/download e limpeza de registros/arquivos/diretório. Autor USUARIO e equipe MODERADOR ou ADMINISTRADOR.
- Vite200 na rota e módulos formulário/detalhe/lista compilados, servidor temporário encerrado.

HTTP sintético não prova autorização Spring; native/IT exercitam o escopo acima. Nenhum monta Vue/DOM ou prova simultaneidade entre abas. Sem navegador disponível: visual/mobile/teclado/foco/FilePicker/E2E Vue pendentes. Maven completo551 anterior não repetido. Sem Java produção/schema/dependências/Docker/`.env` real alterado/dados reais/deploy/Git.

Próximo módulo sugerido: área administrativa da estrutura acadêmica no frontend, começando pela consulta de instituições. Manter escrita exclusiva de ADMINISTRADOR conforme API; não implementar edição/exclusão de mecanismos sem discutir o contrato antes.
