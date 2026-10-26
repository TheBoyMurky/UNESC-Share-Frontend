# Meus materiais

Incremento local de22/10/2026: rota protegida `/meus-materiais`, disponivel no menu e na area Minha conta. Apenas consulta: listagem propria em todos os estados, busca por texto/estado, paginacao e links para detalhes existentes. Nao implementa cadastro, edicao, exclusao, restauracao ou moderacao de Material.

Mantem Vue3/Vite/TypeScript, Router, fetch e identidade visual existentes. Sem dependencia nova, publicacao, alteracao Java/schema/autorizacao ou dados de demonstracao inseridos. O UnescShare continua catalogo BitTorrent, nunca hospedagem de conteudos academicos.

## Estrutura e codigo completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/material/meus-materiais-service.ts # Query propria e validacao/projecao DTO
src/features/material/meus-materiais-model.ts   # Filtros/pagina/cancelamento testaveis
src/features/material/MeusMateriaisView.vue     # Lista, estados e detalhes por UUID
src/shared/http/page.ts                        # Contrato PagedModel compartilhado
src/features/catalogo/catalog-service.ts       # Reutiliza parser sem liberar privados
src/router/index.ts                           # Guarda de /meus-materiais
src/App.vue                                   # Link autenticado no menu
src/features/auth/ContaView.vue                # Atalho da conta
src/assets/main.css                           # Estados, filtros e menu responsivos
tests/meus-materiais-service.test.mjs
tests/meus-materiais-model.test.mjs
tests/meus-materiais-http.test.mjs
tests/auth-navigation.test.mjs
```

O codigo completo esta nesses arquivos. Helpers de pagina/validacao antes locais ao catalogo foram extraidos para shared/http/page.ts; tipos Page/PageInfo continuam reexportados pelo catalogo para preservar consumidores existentes. Catalogo geral continua rejeitando resumos que nao sejam PUBLICADO. Meus materiais possui validacao propria dos quatro estados, sem ampliar a busca comum.

## API e identidade

`GET /api/v1/materiais/meus?page=0&size=20` por authenticatedJson/Bearer. Autoria deriva exclusivamente de UsuarioAutenticado/JWT no backend: nao enviar usuarioId, autorId, email, perfil ou token na URL. Nao filtrar uma busca publica no cliente para simular registros privados. Mesmo MODERADOR/ADMINISTRADOR consulta apenas seus proprios registros nesta rota, nao a fila da equipe.

Sem status na query significa todos: PENDENTE, PUBLICADO, BLOQUEADO e REMOVIDO. Filtro opcional usa exatamente um desses enums. Busca q usa trim/ate200 e codificacao URLSearchParams; combinada com estado. A API tambem suporta filtros academicos, mas esses seletores ficam fora deste incremento de consulta propria. Sem sort arbitrario: ordem fixa dataCadastro DESC/id DESC no servidor.

Somente page,size,q,status sao emitidos; propriedades extras nao alteram identidade/rota. UUIDs, titulo, estado, data e contador do resumo sao validados e projetados. Filtro de estado explicito exige resposta coerente, em vez de reclassificar o resultado no cliente. DTOs nao conservam campos extras de email, caminhos, descricao ou mecanismos; nomes academicos continuam carregados apenas no detalhe, sem N+1 na lista. Texto via interpolacao Vue escapada, sem v-html.

PagedModel exige content e page{number,size,totalElements,totalPages} coerentes com a requisicao. Backend permite size1..100; interface oferece20/50/100, padrao20. Registro mostra titulo com link UUID, estado textual (nao apenas cor), cadastro UTC e visualizacoes. REMOVIDO e remocao logica preservada, sem restauracao; detalhes/downloads continuam sujeitos a autorizacao ja existente do servidor. O link de detalhe nao concede permissao por si so.

## Estado, filtros e concorrencia

Ao montar, faz uma consulta propria sem filtros. Digitar/trocar estado/tamanho muda rascunho, nao gera HTTP; botao Buscar meus materiais aplica e volta a pagina0. Limpar filtros tambem busca pagina0/todos estados e preserva tamanho escolhido. Paginacao usa filtros aplicados e fica indisponivel durante carga ou rascunho alterado, evitando apresentar pagina antiga como resultado novo.

Nova busca cancela anterior e ignora sucesso/erro atrasados por identidade da tarefa. Modelo separado de Vue/DOM, sem persistencia em storage/URL. Sair/desmontar limpa estado e cancela esperas; reabrir recarrega pagina0, inclusive ao voltar de detalhes. O menu permite retornar a Meus materiais; nao ha preservacao de pagina/filtros neste incremento.

Carga, erro e lista vazia sao estados diferentes. Erro remove resultado anterior; mensagens fixas/status seguros, sem ecoar corpo/credenciais/causa privada.401 usa o helper de sessao existente (invalida somente token da requisicao) e navegacao leva ao login ao perder acesso;403/rede nao sao interpretados como zero materiais nem promovem permissoes. Nova tentativa e explicita, sem retry automatico de erros.

Se uma pagina deixa de existir porque o total encolheu, permite somente uma consulta corretiva para a ultima pagina restante. Total zero ou pagina ainda vazia nao geram loop; tela orienta atualizar quando totalpositivo. Consultas separadas nao sao snapshot: alteracoes concorrentes podem mudar contagens/itens entre paginas.

Nenhuma requisicao POST/PUT/DELETE, leitura de credenciais, contato a trackers/peers ou acesso a conteudo BitTorrent e feita por essa tela. Regras de criacao/edicao/publicacao/remocao do backend permanecem intactas; botoes de escrita nao sao anunciados como prontos.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run verify
npm run dev
```

Abra http://localhost:5173, faca login e selecione Meus materiais, ou abra /meus-materiais diretamente. Fluxo real requer backend/PostgreSQL locais disponiveis, URL padrao http://localhost:8080/api/v1 e CORS para localhost:5173. Nao reativar bootstrap administrativo nem copiar segredos para VITE_*.

Roteiro manual com registros autorizados existentes de desenvolvimento (nao criar/publicar dados reais apenas para demonstrar a tela):

1. Sem acesso, abrir /meus-materiais deve levar ao login. Autenticado, conferir menu/atalho e somente consulta GET /materiais/meus com Bearer, sem parametro de usuario/token/cookie.
2. Conferir todos estados e filtro individual, inclusive REMOVIDO; nao esperar restauracao/edicao. Verificar titulo, UTC e contador como texto. Clicar no titulo deve abrir detalhes e aplicar visibilidade normal da API.
3. Digitar texto e trocar estado: deve aparecer aviso de filtros pendentes sem HTTP por tecla; aplicar reinicia pagina0. Limpar retorna todos estados. Testar caracteres especiais, acentos, limite200 e20/50/100 por pagina.
4. Conferir erro distinto de lista vazia e pagina anterior/proxima; ao mudar filtros, nao navegar resultados da busca anterior. Nao inserir nomes academicos ficticios ou buscar dados por cartao.
5. Simular rede lenta, duas buscas seguidas, erro antigo e sair/logout: respostas antigas nao devem sobrescrever dados nem repovoar tela encerrada. Trocar conta por logout/login deve recarregar registros da nova identidade, nunca reaproveitar lista antiga.
6. Simular401/403/503 sem dados/credenciais em logs:401 encerra acesso local conforme fluxo existente; outros erros oferecem nova tentativa e nao mostram zero registros silenciosamente.
7. Conferir teclado/foco, leitura dos estados e menu/filtros/paginacao em largura desktop/mobile. Voltar de detalhe reinicia consulta; persistencia de filtros nao esta implementada.

Verificacao em22/10/2026: **292 testes**, type-check e build aprovados.53 novos sobre239:33 service/query/DTO/paginacao,17 modelo/filtros/races/erros,1 HTTP sintetico e2 guardas Router em memoria. Regressao do catalogo e demais funcionalidades preservada apos extrair parser de paginas.

HTTP usa fetch real contra servidor temporario local com24 registros sinteticos de uma conta e1 de outra, quatro estados, pagina1/texto especial/status e401 vazio. Servidor sintetico seleciona dados pelo Bearer, sem ID de usuario em query; isso testa integracao cliente/contrato, nao seguranca do Spring real. Guardas/estado nao sao testes DOM. Vite200 /meus-materiais/fallback e componente compilado nao comprovam autenticacao ou renderizacao no navegador. Inventario sem navegador disponivel: visual/mobile/DOM/E2E com Spring pendentes.

Servidor temporario encerrado ao finalizar. Nenhum Maven/Docker/backend iniciado, Java/schema/dependencia alterados, dado real/credencial/.env modificado, commit/remoto/push ou publicacao neste incremento. Ultima suite Maven registrada continua549, nao reexecutada.

Cadastro com Magnets, alternativa .torrent, edicao e revisao de remocao implementados depois, com links em Meus materiais: [CADASTRO_MATERIAL_MAGNET_FRONTEND.md](CADASTRO_MATERIAL_MAGNET_FRONTEND.md), [CADASTRO_MATERIAL_TORRENT_FRONTEND.md](CADASTRO_MATERIAL_TORRENT_FRONTEND.md), [EDICAO_MATERIAL_FRONTEND.md](EDICAO_MATERIAL_FRONTEND.md), [REMOCAO_MATERIAL_FRONTEND.md](REMOCAO_MATERIAL_FRONTEND.md). Escritas em paginas proprias; listagem nao remove inline. Proximo recomendado comentariosPUBLICADO/listagem-cadastro.
