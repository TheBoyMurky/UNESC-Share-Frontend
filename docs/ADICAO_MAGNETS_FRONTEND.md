# Adição de Magnets aos próprios materiais

Entrega de 26/10/2026. Rota autenticada `/materiais/:id/magnets/adicionar`, acessível por **Meus materiais → Adicionar Magnets** e pelo detalhe comum de Material próprio com saldo. A tela consulta o Material antes de habilitar o formulário; equipe não recebe exceção de autoria. Revisão de Material da equipe permanece sem formulário do autor.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/material/material-magnet-adicao-service.ts  # Validação/GET/POST/projeção e contrato
src/features/material/material-magnet-adicao-model.ts    # Consulta, draft, confirmação e contexto
src/features/material/MaterialMagnetAdicaoView.vue        # Formulário com saldo e retorno a PENDENTE
src/features/material/MaterialView.vue                   # Link somente no detalhe comum próprio
src/features/material/MeusMateriaisView.vue              # Link para consultar saldo e adicionar
src/router/index.ts                                     # Rota requiresAuth
tests/material-magnet-adicao.test.mjs                    # 29 testes service/modelo
tests/material-magnet-adicao-http.test.mjs               # 1 teste HTTP sintético
tests/auth-navigation.test.mjs                          # 3 guardas adicionais
tests/integration/comentarios-spring.mjs                 # Novo trecho de adição no roteiro Spring real
```

Código completo nesses arquivos. Reutiliza `authenticatedJson`, parser de detalhe, `safeMagnetUri`, regra de autoria/estado existente, estilos e Vue Router. Não cria bibliotecas, variáveis, tabelas, endpoints, alterações Java ou mecanismo de autenticação. Torrent/Magnet continuam entidades independentes; nenhum conteúdo acadêmico é enviado.

## Contrato existente

GET `/materiais/{id}` carrega a consulta inicial. O service valida e projeta somente id, título, autor, estado, data original e mecanismos. Não busca referências acadêmicas, contas ou nomes; descrição e campos extras não são retidos. Recusa contagens acima de10 por tipo.

```http
POST /materiais/{id}/magnets
Authorization: Bearer <token>
Content-Type: application/json

{"magnetUris":["magnet:?xt=urn:btih:..."]}
```

Rotas relativas à base `/api/v1`. JSON somente `magnetUris`, de1 a10 elementos e dentro do saldo `10 - quantidade atual`; cada campo até4000 caracteres. Envio aplica trim nas URIs. Validação local reaproveita formato v1 hex/Base32 ou v2 SHA-256 com um único xt e recusa repetição exata no lote. Não reimplementa o parser/cálculo de hash: normalização, duplicatas por hash em representações diferentes, reservas entre materiais e integralidade do lote são responsabilidade do backend. Não consulta trackers/peers/disponibilidade nem abre cliente BitTorrent.

Somente autor de qualquer perfil, em PENDENTE/PUBLICADO. GET que permitir leitura à equipe não concede escrita sobre Material de terceiro. BLOQUEADO/REMOVIDO não habilitam formulário. Ao atingir10 Magnets, a rota mostra limite atingido, sem enviar; a lista Meus materiais não conhece a contagem e por isso seu link apenas abre essa consulta. Saldo de Torrents é independente.

POST retorna detalhe atualizado, obrigatoriamente PENDENTE e do mesmo Material/autor/data original. Confere que mecanismos antigos continuam com UUID/campos preservados e que há pelo menos a quantidade enviada de novos Magnets, sem exceder10. Não exige igualdade de título/categoria/visualizações ou contagem exata com o snapshot anterior: outra aba pode editar metadados/acrescentar mecanismos. Não atribui cada novo UUID a uma URI por comparação textual; o servidor pode normalizar URIs.

Sucesso mantém somente UUID para navegar à consulta atual; descarta draft, mecanismos e confirmação. Não mantém um detalhe otimista nem publica o Material. Contrato backend em `../UNESC-Share-Backend/docs/MAGNETS.md`.

## Formulário e erros

Uma URI por campo, adicionar/remover campo dentro do saldo observado, título e contagens para conferir o alvo. O usuário confirma que o lote colocará o Material em PENDENTE e retirará PUBLICADO do catálogo comum até nova publicação. Alterar URI, acrescentar/remover campo ou tentar enviar consome a confirmação. Sem escolha de autor/status no formulário.

Durante o POST, bloqueia edição, campos, confirmação, duplicidade e recarga interna. Navegar para fora cancela/ignora resultados locais, mas não garante cancelar uma operação já recebida pelo servidor. Sem ETag ou revisão fixa; a API confere estado, autoria e saldo vigentes.

- 400: preserva rascunho, consome confirmação e orienta revisar URIs, sem ecoar ProblemDetail privado.
- 401/403/404 de leitura/escrita: retiram Material/URIs/draft e bloqueiam esta consulta até nova carga;403 não desloga,401 usa o helper do token efetivamente enviado.
- 409: retira snapshot e draft, exige consultar dados atuais e preparar outro lote; não presume qual estado/hash/limite provocou o conflito.
- Rede, protocolo,408,5xx ou resposta incompatível após POST: resultado incerto; mesmo descarte e reconsulta, sem retry automático. O lote pode ter sido salvo.

Reconsulta explícita sempre descarta draft/confirmação e carrega o Material novamente. Um novo GET ou contagem alterada não prova que a tentativa perdida foi aplicada. Use o link **Conferir mecanismos no detalhe atual** para examinar o registro antes de outro envio. Se a recarga falhar, não oferece formulário com snapshot antigo; limite/estado atual podem impedir nova adição.

Conta/perfil/Material/geração/dispose descartam e abortam tarefas; respostas antigas não repõem URIs nem sucesso no novo contexto. Dados em RAM, sem URL de URI, storage ou logs privados; texto Vue escapado. Rota exige autenticação, enquanto autoria e elegibilidade dependem da leitura/modelo/API, não da guarda de navegação.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com backend/PostgreSQL disponíveis e conta existente, abra **Meus materiais → Adicionar Magnets**. Não precisa reativar o bootstrap. Envio manual grava referências/estado reais; use material destinado a testes.

Roteiro manual: conferir alvo/saldo; adicionar/remover campos e consumir checkbox ao editar; testar v1/v2, URI inválida e lote duplicado; confirmar em PUBLICADO e conferir PENDENTE/mecanismos anteriores preservados no detalhe. Conferir limite10, BLOQUEADO/REMOVIDO, tentativa por terceiro inclusive equipe,400,409, queda de rede, troca de conta e saída durante POST. Verificar formulário em320px, teclado/foco e ausência de formulário do autor na revisão da equipe.

Com ambiente backend exportado e PostgreSQL disponível:

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Backend
set -a
source .env
set +a
ADMIN_SEED_ENABLED=false SEED_ENABLED=false SPRING_PROFILES_ACTIVE=test \
  ./mvnw -Dtest=MaterialMagnetAdicaoApiTests,MagnetServiceTests,MagnetParserTests test
ADMIN_SEED_ENABLED=false SEED_ENABLED=false SPRING_PROFILES_ACTIVE=test \
  ./mvnw -Dtest=ComentarioFrontendIT test
```

O último comando executa o roteiro opcional [frontend→Spring real](../../UNESC-Share-Backend/docs/VALIDACAO_INTEGRADA_COMENTARIOS.md), agora com um trecho inicial de adição pelo novo modelo: Material PUBLICADO recebe Magnet, retorna PENDENTE, e a equipe publica a fixture antes do restante dos testes de comentários. Usa somente fixtures/JWTs de teste, limpa porUUID emfinally e confere ausência. Não faz parte das suítes padrão.

## Validação executada

- `npm run verify`: **1077 testes**, zero falhas/cancelados/ignorados, TypeScript/build aprovados. São33 novos sobre1044:29 service/modelo,1 HTTP sintético e3 guardas em Router de memória.
- Backend focado: **54 testes** aprovados, sendo17 API,5 service e32 parser, com PostgreSQL nos testes de API/rollback.
- Integração opcional: **2 cenários** aprovados com cliente/modelo frontend, Spring HTTP e PostgreSQL reais; fixtures limpas. Ambos usam autor USUARIO, com equipe MODERADOR ou ADMINISTRADOR.
- Vite200 na rota e módulos de formulário/detalhe/lista; servidor temporário encerrado.

HTTP sintético não comprova autorização Spring; os testes nativos e o roteiro opcional acrescentam essa verificação no escopo descrito. Nenhum monta Vue/DOM ou prova concorrência real entre abas. Sem navegador disponível: visual/mobile/teclado/foco/E2E Vue pendentes. Suíte completa Maven551 anterior não repetida; código Java de produção/schema/dependências não alterados. Sem Docker, `.env` real alterado, uso de dados reais, deploy ou operações Git.

Próximo recomendado: adicionar arquivo `.torrent` a Material próprio, em incremento separado, usando armazenamento/limites/validação existentes. Não há PUT/DELETE de mecanismos nesta entrega.
