# Detalhe e histórico de denúncia para a equipe

Atualização posterior em25/10/2026: início de análise foi integrado em [INICIO_ANALISE_DENUNCIA_FRONTEND.md](INICIO_ANALISE_DENUNCIA_FRONTEND.md). Este guia registra a entrega anterior de leitura e seus890 testes; as permissões das consultas permanecem preservadas.

Entrega de 25/10/2026. A fila abre `/moderacao/denuncias/:id`, com relato completo e histórico de moderação somente para MODERADOR e ADMINISTRADOR. As consultas próprias continuam em `/denuncias/:id`, sem histórico interno.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/moderacao-denuncia-service.ts        # Detalhe, histórico e parser dos eventos
src/features/moderacao/moderacao-denuncia-detalhe-model.ts  # Contexto, consultas e descarte conjunto
src/features/moderacao/DenunciaEquipeView.vue               # Relato e histórico paginado
src/features/moderacao/DenunciasEquipeView.vue              # Links da fila para o detalhe
src/features/moderacao/moderacao-denuncia-model.ts          # Dependência restrita ao método list
src/router/index.ts                                       # Rota de equipe
tests/moderacao-denuncia-detalhe.test.mjs                   # Contratos e estado/contexto
tests/moderacao-denuncia-detalhe-http.test.mjs              # HTTP sintético
tests/auth-navigation.test.mjs                             # Guardas da rota individual
```

Código completo nesses arquivos. Service de equipe existente expandido, parser de relato já existente reutilizado, modelo independente para coordenar relato/histórico e retirada conjunta de dados após perda de acesso. Reutiliza cliente HTTP/Bearer, guardas, labels e estilos existentes. Sem dependências, variáveis, entidades/schema, Java ou endpoints novos.

## Contratos de leitura

URLs relativas à base `/api/v1`:

| Consulta | Endpoint | Dados mantidos na interface |
| --- | --- | --- |
| Relato | `GET /denuncias/moderacao/{id}` | id, materialId, motivo, descricao, status, dataCadastro |
| Histórico | `GET /denuncias/moderacao/{id}/historico?page=0&size=20` | id, denunciaId, responsavelId, justificativa, estadoAnterior, estadoNovo, dataCadastro |

Somente GET com Authorization Bearer; sem corpo, cookies, Content-Type artificial, filtros de autoria ou sort. Não há fallback para o namespace de relato próprio. Cada DTO é validado/projetado; UUID da denúncia deve corresponder à rota. Evento exige responsável válido, justificativa obrigatória até1000 caracteres sem U+0000 e transição existente: PENDENTE→EM_ANALISE ou EM_ANALISE→PROCEDENTE/IMPROCEDENTE. Campos extras são descartados, eventos duplicados na página ou vinculados a outra denúncia são rejeitados.

A tela mostra descrição e justificativas como texto simples escapado pelo Vue, preservando quebras de linha. O UUID do responsável identifica quem registrou o evento, não o denunciante. Não busca nomes, contas ou dados do Material em chamadas adicionais; o link ao Material é explícito e usa a revisão da equipe já existente. Textos livres podem conter dados pessoais escritos pelo autor: projeção de DTO não equivale a anonimização/redação do texto. Não registrar corpos em logs ou storage.

## Fluxo e consistência

O relato é consultado antes do histórico. Sem relato válido, não há GET de histórico. Histórico usa20/50/100 eventos por página, ordenação recebida `dataCadastro/id ASC`, atualização explícita e uma única correção de página fora do intervalo, inclusive total zero. Alterar tamanho volta à página zero; Atualizar histórico preserva página/tamanho; Atualizar relato e histórico descarta ambos e volta a20/primeira página.

Relato e histórico são consultas independentes, sem snapshot comum ou ETag. Não exigir que o último evento coincida com o estado do relato, nem inferir estado novo a partir do histórico. Dados legados podem não ter eventos anteriores; páginas parciais ou vazias não provam ausência de moderação. Não reconstruir eventos, completar lacunas ou impor continuidade entre páginas. O service preserva a ordem recebida sem ordenar ou agregar localmente.

Erro de rede/protocolo/5xx no relato deixa ambas as áreas vazias e permite recarga explícita. Erro desse tipo no histórico retira a página anterior, mostra erro e conserva o relato já consultado; não apresenta erro como histórico vazio.401/403/404 em qualquer uma das consultas retiram **todo** o relato/histórico e bloqueiam retries naquela instância até nova carga da rota/contexto.403 não encerra sessão nem inventa perfil;401 usa rejeição do token efetivamente enviado. Mensagens não refletem corpo privado de erro.

Guardas e modelo exigem equipe com UUID/perfil válidos. Mudança observada de UUID da rota, conta ou perfil reinicializa o modelo, cancela tarefas e descarta resultados anteriores; dispose também limpa os dados. Respostas antigas não repõem relato/justificativa nem retiram uma consulta nova. Dados em RAM, sem query string privada, storage ou logs. A API continua autoridade pelas roles do JWT; perfil de `/usuarios/me` não é revogação imediata de um token emitido.

## Permissões preservadas

Equipe pode consultar relato/histórico mesmo quando o membro é denunciante ou autor do Material. O DTO não informa a identidade do denunciante; não inferir elegibilidade pelo responsável do evento ou fazer consultas para descobri-la. Futuras mutações continuam impedidas a denunciante/autor do Material, inclusive administrador. A política de autoaprovação de Material mantida para ambos os perfis não altera esse impedimento.

Nenhum POST/PUT/DELETE de denúncia ou evento nesta entrega. Sem análise, conclusão, edição, cancelamento, remoção ou escrita arbitrária de histórico. Consultar ou concluir denúncia não bloqueia Material automaticamente. Botões de publicação/bloqueio na revisão de Material pertencem a outro fluxo e não mudam a denúncia.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com conta de equipe existente: Minha conta → Consultar denúncias da equipe → Consultar denúncia e histórico. Não reativar bootstrap, solicitar senha real ou criar denúncias reais apenas para demonstrar a tela; a suíte usa dados sintéticos.

Roteiro manual: conferir descrição/justificativa com quebras de linha e caracteres HTML literais; testar os dois perfis; confirmar que usuário comum não acessa a URL e seu relato próprio continua separado; navegar páginas/tamanhos, atualizar somente histórico e atualizar tudo; simular vazio/erro; trocar denúncia/conta/perfil durante GET; conferir401/403/404 sem dados anteriores; testar teclado, leitor de tela e largura320px. Nenhuma requisição de escrita deve ocorrer.

`npm run verify`: **890 testes**, zero falhas/cancelados/ignorados, TypeScript/build aprovados. São34 novos sobre856:30 service/modelo,3 guardas e1 HTTP sintético. Cobrem projeção de campos, vínculos/transições, histórico parcial/vazio, consultas independentes, paginação, falhas de acesso e respostas antigas. HTTP usa servidor Node em RAM com Bearer falso de teste; guardas usam Router em memória. Não são Spring/PostgreSQL/DOM nem prova da autorização real do backend.

Vite retornou200 no fallback da rota e módulos do detalhe/fila compilados; servidor temporário encerrado. Inventário sem navegador: visual/mobile/DOM/teclado/E2E com Spring continuam pendentes. Sem Java/schema/dependências/Maven/Docker/backend iniciado/.env real/credenciais/dados reais/deploy/operações Git nesta entrega. Maven completo549 e focado de materiais20 permanecem históricos, não reexecutados.

Próximo recomendado: iniciar análise com justificativa e confirmação explícita, usando a regra existente do backend. Conclusões procedente/improcedente entram em incremento posterior.
