# Seletores academicos e busca de materiais

## Escopo

Primeiro incremento do catalogo autenticado, em22/10/2026. Rota /materiais com Vue Router e guarda existente. Fluxo local, mantendo identidade visual, sem hospedagem/publicacao, nova dependencia ou alteracao Java/schema/seguranca. O UnescShare continua catalogo BitTorrent; nenhum upload ou download de conteudo academico foi implementado.

A tela carrega instituicoes, categorias e primeira pagina de materiais PUBLICADO. Cursos so apos selecionar instituicao; disciplinas so apos selecionar curso. Dados vem da API, sem codificar UNESC/Matriz6 ou nomes reais na interface.

## Contrato e decisoes

| Consulta | Parametros |
| --- | --- |
| GET /instituicoes | page>=0, size100 |
| GET /categorias | page>=0, size100 |
| GET /cursos | instituicaoId obrigatorio neste seletor, page>=0, size100 |
| GET /disciplinas | cursoId obrigatorio neste seletor, page>=0, size100 |
| GET /materiais | q opcional ate200; instituicaoId/cursoId/disciplinaId/categoriaId opcionais; page>=0, size20/50/100 |

Rotas relativas a /api/v1, compostas pela configuracao existente. authenticatedJson fornece Bearer e trata401 conforme sessao; nada de token em URL, cookies, localStorage ou nova persistencia. URLSearchParams codifica texto/UUIDs; nao envia usuarioId, status ou sort para tentar ampliar visibilidade. Ordenacao de materiais continua dataCadastro/id DESC, academico/categorias nome/id ASC. A busca textual e literal/contem em titulo OU descricao segundo a API, nao pesquisa por Info Hash.

Trocar instituicao limpa imediatamente curso/disciplina/opcoes antigas e cancela buscas dependentes. Trocar curso limpa disciplina. Categoria e independente. Selecao desconhecida fora das opcoes carregadas nao e aplicada pelo modelo. Sem pai, nao consultar toda a tabela de cursos/disciplinas. Erro em um seletor nao bloqueia os demais nem a busca geral.

Seletores usam paginas de100 e botao Carregar mais enquanto houver paginas restantes, sem truncar silenciosamente. Apendice deduplica UUIDs e preserva opcoes anteriores se a proxima pagina falhar; tentativa explicita repete a pagina que falhou. Nao ha snapshot: alteracoes concorrentes na estrutura podem mudar contagens/ordem entre paginas. Reabrir a tela recarrega estado; nao persistir listas no navegador.

Editar formulario nao pesquisa por tecla. Buscar aplica copia dos filtros, trim no texto e pagina0; limpar filtros faz busca geral, preservando o tamanho de pagina escolhido e opcoes independentes ja carregadas. Se houver filtros/tamanho editados, um aviso identifica resultados da ultima busca aplicada e a navegacao da pagina anterior fica desabilitada ate aplicar. Nenhum filtro e salvo na URL/historico/storage nesta etapa.

Paginas usam `content` e `page{number,size,totalElements,totalPages}`, com validacao de contrato, limites, totais e UUIDs. Leitura projeta somente campos necessarios; dados extras nao sao conservados. Resultado com estado diferente de PUBLICADO ou DTO invalido gera erro de protocolo, nao cartao privado. Isso nao substitui autorizacao/filtragem no servidor.

## Resultados, erros e concorrencia

Resumo mostra titulo, data de cadastro (nao data de publicacao) com calendarioUTC e visualizacoes. DTO resumo nao traz descricao, nomes de disciplina/categoria/autor ou mecanismos: nao inventar esses campos nem criar uma consulta extra por cartao. O incremento seguinte adicionou link no titulo para /materiais/:id, com detalhes e mecanismos: [MATERIAL_DETALHE_FRONTEND.md](MATERIAL_DETALHE_FRONTEND.md).

Carga, erro de rede/HTTP/contrato e pagina vazia sao estados distintos. Falha de busca limpa resultados antigos para nao parecer sucesso; mensagem nao ecoa consulta/corpo/causa privada. Novo Buscar pode substituir uma busca lenta. A alteracao do filtro por si so mantem resultados anteriores identificados como ultima busca aplicada.

AbortController nativo cancela requisicoes substituidas; identidade do controller impede resposta antiga de sobrescrever estado mesmo se o servidor ignorar cancelamento. Desmontar/encerrar acesso cancela trabalhos e remove listeners, sem publicar respostas atrasadas. Nao ha retries infinitos ou reenvio automatico de credenciais.401 segue helper da sessao;403 nao significa token invalido.

Se a pagina ficou fora do total apos o catalogo encolher, ha uma unica consulta corretiva para a ultima pagina. Nova mudanca simultanea nao inicia loop: uma pagina ainda vazia com totalpositivo oferece Atualizar busca e nao exibe paginacao impossivel. Totalzero mostra mensagem de nenhum material publicado, sem confundir com erro. Contagens/paginas sao da resposta, nao uma garantia de snapshot ou disponibilidade futura.

## Arquivos completos

Caminhos relativos a raiz do frontend; codigo completo nos arquivos:

```text
src/features/catalogo/catalog-service.ts  # query/DTOs/PagedModel e opcoes
src/features/catalogo/catalog-model.ts    # estado independente de Vue e concorrencia
src/features/catalogo/CatalogoView.vue    # formulario, resultados, erros e paginacao
src/router/index.ts                      # /materiais protegida e lazy
src/App.vue                              # menu Catalogo apos login
src/features/auth/ContaView.vue           # acesso ao catalogo
src/features/auth/LoginView.vue           # orientacao atualizada
src/features/inicio/InicioView.vue        # etapas atualizadas
src/assets/main.css                      # estilos responsivos
tests/catalog-fixtures.mjs                # apenas dados sinteticos
tests/catalog-service.test.mjs
tests/catalog-model.test.mjs
tests/catalog-http.test.mjs
tests/auth-navigation.test.mjs            # acesso/logout na nova rota
```

Separacao service/model/view mantem regras testaveis, reutiliza fetch/autenticacao/Router nativos existentes e nao adiciona Pinia/Axios/UI kit. Nenhuma entidade de conteudo hospedado, upload tradicional, endpoint ou dependencia nova.

## Executar e testar

Com backend ativo na pasta irma e banco local disponivel, iniciar frontend:

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run verify
npm run dev
```

Abrir http://localhost:5173/login, entrar com conta existente e seguir Catalogo ou Minha conta -> Explorar o catalogo. Backend usa .env proprio e ./mvnw spring-boot:run com variaveis exportadas. Nao fornecer credenciais reais ao agente nem publica-las em capturas/logs; manter bootstrap administrativo desativado. Docker somente pelo usuario se necessario.

Roteiro de navegador (ainda nao executado):

1. Abrir /materiais sem acesso: ida ao login; apos entrar, acesso pelo menu/conta.
2. Instituicoes/categorias carregam; curso/disciplina ficam sem opcoes ate selecionar seus pais.
3. Trocar instituicao/curso rapidamente: filhos limpos, nunca reaparecer lista do pai anterior.
4. Aplicar texto/filtros, navegar proxima/anterior, trocar tamanho e reaplicar; limpar busca volta a pagina0. Campos editados antes de aplicar precisam mostrar aviso.
5. Mais de100opcoes: carregar paginas adicionais; para simular usar exclusivamente fixture/teste, sem alterar Matriz6 real.
6. Sem PUBLICADO, mostrar pagina vazia honestamente. Nao criar/aprovar material real apenas para forcar cartoes; os testes sinteticos cobrem resultados.
7. Falha de API, seletor ou pagina adicional: mensagem clara e tentativa explicita; nunca tratar erro como zero resultados.
8. Expirar/encerrar acesso durante busca: voltar ao login e nao restaurar lista por resposta atrasada. Conferir teclado, labels/foco, leitor de tela e mobile/desktop.

Em22/10/2026:115 testes aprovados (68anteriores+47novos), type-check/build concluidos. Novos:29servico,15modelo,1HTTP sintetico e2guardas de catalogo. HTTP sintetico usa fetch real em servidor temporario local com101instituicoes, filtros encadeados e pagina1, sem Spring/banco/credenciais reais. Guardas usam Router com memory history; nao sao testes DOM.

Vite serviu /materiais com200/fallback e compilou CatalogoView. Isso nao comprova guarda, autenticacao, layout ou integracao visual. Navegador indisponivel na sessao, portanto E2E/visual/mobile com backend real pendentes. Nenhum Java/schema alterado, Maven/Docker executado, registro real lido/modificado, .env alterado ou commit/push realizado nesta entrega. Vite temporario encerrado apos verificacao.

## Proxima entrega

Detalhes, download Bearer do arquivo .torrent e copia/abertura explicita de Magnet foram implementados no incremento seguinte, documentado em [MATERIAL_DETALHE_FRONTEND.md](MATERIAL_DETALHE_FRONTEND.md). Cadastro de conta, Meus materiais e cadastro de Material com Magnets tambem implementados: [CADASTRO_FRONTEND.md](CADASTRO_FRONTEND.md), [MEUS_MATERIAIS_FRONTEND.md](MEUS_MATERIAIS_FRONTEND.md), [CADASTRO_MATERIAL_MAGNET_FRONTEND.md](CADASTRO_MATERIAL_MAGNET_FRONTEND.md). AcademicSelectors agora compartilhado com formulario, preservando filtros opcionais no catalogo. Proximo recomendado: cadastro inicial com .torrent; administracao e interacoes exigem novos incrementos.
