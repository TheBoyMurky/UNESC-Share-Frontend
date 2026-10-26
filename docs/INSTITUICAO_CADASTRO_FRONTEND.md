# Cadastro de instituições por administradores

Entrega de26/10/2026 em `/instituicoes/nova`. Atalhos **Cadastrar instituição** na lista e na conta, somente para ADMINISTRADOR. Leitura de instituições permanece disponível para autenticados dos três perfis; esta entrega não implementa edição/exclusão.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/instituicao/instituicao-cadastro-service.ts  # Validação, normalização, POST e recibo
src/features/instituicao/instituicao-cadastro-model.ts    # Draft, permissão, conflito/incerteza e contexto
src/features/instituicao/InstituicaoCadastroView.vue      # Formulário administrativo
src/features/instituicao/instituicao-service.ts          # Parser de resposta compartilhado
src/features/instituicao/InstituicoesView.vue            # Atalho administrativo
src/features/auth/permissions.ts                        # canAdminister
src/features/auth/navigation.ts                         # requiresAdmin e perda de perfil observada
src/features/auth/ContaView.vue                         # Atalho/aviso de acesso
src/router/index.ts                                    # Rota estática /nova antes de /:id
tests/instituicao-cadastro.test.mjs                     # 25 testes service/modelo/permissão
tests/instituicao-cadastro-http.test.mjs                # 1 teste HTTP sintético
tests/auth-navigation.test.mjs                         # 5 guardas novas
tests/integration/comentarios-spring.mjs                # Cadastro ADMIN/negativos USER-MOD/409 reais
```

No backend, somente `src/test/java/br/com/murkyweb/unesc_share/material/ComentarioFrontendIT.java` foi ajustado para reservar e limpar uma instituição de teste adicional. Código completo nesses arquivos. Sem Java de produção, schema, dependências, endpoints ou permissões backend novos.

## Contrato e normalização

```http
POST /instituicoes
Authorization: Bearer <token>
Content-Type: application/json

{"nome":"Universidade Exemplo","sigla":"UEX"}
```

Relativo à base `/api/v1`. Envia somente nome/sigla, sem UUID, perfil ou filhos. Usa trim local, sigla em maiúsculas e valida nome obrigatório até180/sigla obrigatória até30 após conversão; não trunca, e recusa U+0000. A API mantém sua validação nativa e normalização. A expansão de maiúsculas também conta no limite, por exemplo `ß`→`SS`.

Parser compartilhado valida os três campos do DTO e projeta extras. Cadastro exige nome/sigla correspondentes ao payload normalizado; resposta inesperada após POST é resultado incerto. Sucesso guarda somente UUID para abrir consulta atual, limpando draft/campos. Não segue Location, não fabrica linha otimista na lista ou navega para URL enviada pela API.

Duplicidade definitiva é do backend: a verificação prévia ignora caixa, mas a constraint textual do nome não garante unicidade case-insensitive sob concorrência. Não há consulta prévia de disponibilidade, busca por nome/sigla ou varredura de páginas para decidir se pode cadastrar. Contrato backend em `../UNESC-Share-Backend/docs/INSTITUICOES.md`.

## Autorização e navegação

`canAdminister` usa o perfil recebido de `/usuarios/me`, sem decodificar JWT, perfil em storage ou exceção para MODERADOR. A rota declara requiresAuth/requiresAdmin; requiresAdmin também implica autenticação na guarda. Anônimo vai ao login; USUARIO/MODERADOR vão à conta com aviso fixo `acesso=administracao`, preservando a sessão e a leitura. A guarda observa perda de perfil e logout; o modelo exige UUID válido/perfil administrativo antes de editar/enviar.

Isso é conveniência da UI, não concessão ou revogação imediata de autoridade. A API continua verificando roles do Bearer. Divergência entre perfil atual e JWT pode produzir403; a tela não infere novo perfil nem desloga por esse status. Sem refresh, polling de perfil ou alteração do TTL existente.

## Ciclo do formulário

Inicializar não envia HTTP. Nome/sigla em RAM, com botão explícito **Cadastrar instituição**; durante POST, edição, reenvio e preparação de outro cadastro ficam bloqueados. Troca de conta/perfil, saída e dispose descartam/abortam/ignoram resultados antigos, sem garantir rollback no servidor. Não persistir draft em URL, storage ou logs privados. Texto Vue escapado.

- 400: preserva valores e usa mensagens fixas para revisar nome/sigla, sem refletir ProblemDetail privado.
- 409: preserva draft e bloqueia novo POST com o mesmo payload normalizado. Alterar dados permite tentativa explícita; voltar aos dados rejeitados volta a bloquear. Isso não implementa comparação de duplicidade do banco: nomes/siglas diferentes continuam sujeitos à API.
- 401/403/404: retira draft/resultado e bloqueia a instância até reabrir;401 usa o helper do token enviado,403 não desloga.
- Rede, protocolo,408,5xx ou DTO incompatível: resultado incerto. Preserva campos visíveis, bloqueia edição/envio e orienta conferir Instituições. **Descartar formulário e preparar outro cadastro** é uma ação explícita, limpa campos e não envia POST/GET automaticamente.

Uma página da lista ou comparação por nome/sigla não comprova que a tentativa perdida deixou de ser gravada. Não atribuir registro encontrado à tentativa, nem repetir automaticamente. Sucesso também não oferece novo envio usando os dados antigos: links abrem detalhe atual ou lista.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com backend/PostgreSQL disponíveis, entre com conta administradora existente e abra **Instituições → Cadastrar instituição**. Não reativar bootstrap nem fornecer credenciais reais para a suíte; confirmação manual grava instituição real, então use registros destinados a testes.

Roteiro manual: USUARIO/MODERADOR continuam lendo mas não veem o botão e não abrem `/instituicoes/nova`; ADMIN abre formulário. Conferir limites/trim/maiúsculas, nome com texto HTML literal, envio único, sucesso e detalhe,400, duplicidade409 e alteração dos dados, queda de rede com cadastro possivelmente salvo,403 sem logout, troca de conta/perfil/saída e teclado/foco/320px. Sem PUT/DELETE, promoção de perfil ou criação automática de administrador.

Com ambiente backend exportado e PostgreSQL local:

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Backend
set -a
source .env
set +a
ADMIN_SEED_ENABLED=false SEED_ENABLED=false SPRING_PROFILES_ACTIVE=test \
  ./mvnw -Dtest=InstituicaoApiTests,InstituicaoServiceTests,ComentarioFrontendIT test
```

O IT reserva nome/sigla aleatórios, confirma ausência prévia e passa somente esses dados ao Node. Exercita403 real de USUARIO/MODERADOR e cadastro+consulta+409 real com ADMINISTRADOR pelo novo service/modelo. Limpa a instituição criada pelo **par exclusivo reservado**, sem confiar em UUID retornado pelo cliente, e verifica ausência; demais fixtures continuam limpas porUUID, arquivos exatos e root temporário vazio. Nenhum cadastro real ou bootstrap usado. [Roteiro integrado](../../UNESC-Share-Backend/docs/VALIDACAO_INTEGRADA_COMENTARIOS.md).

## Validação executada

- **1166 testes frontend**, zero falhas/cancelados/ignorados, TypeScript/build aprovados em `npm run verify`, inclusive após ajuste final da comparação do payload rejeitado. São31 novos sobre1135:25 service/modelo/permissão,1 HTTP e5 guardas. Regressões preservadas.
- **21 testes backend focados** (16 API,5 service) e **2 cenários opcionais SpringHTTP/PostgreSQL reais** passaram, total23 na execução Maven. Cadastro/duplicidade/negativos e limpeza da instituição adicional conferidos.
- Vite200 na rota e módulos de formulário/lista/conta compilados; servidor temporário encerrado.

HTTP sintético/Router em memória não montam Vue nem provam autorização Spring; native/IT cobrem a API no escopo descrito. Sem navegador disponível: visual/mobile/DOM/teclado/foco/E2E Vue pendentes. Não prova concorrência ou revogação imediata. Maven completo551 anterior não repetido. Sem Java produção/schema/dependências/Docker/`.env` real alterado/uso de dados reais/deploy/Git.

Próximo recomendado: edição de instituição por ADMINISTRADOR com consulta inicial e PUT completo; exclusão em incremento posterior, preservando409 quando houver cursos e a política sem cascata.
