# Ocultação de comentários pela equipe

Atualização posterior em26/10/2026: [reexibição](REEXIBICAO_COMENTARIO_FRONTEND.md) integrada. Ciclo e formulário foram extraídos para `comentario-decisao-model.ts`/`ComentarioDecisaoPanel.vue`; os arquivos anteriores são adaptadores. Este guia registra a entrega anterior de ocultação e seus1021 testes.

Entrega de 26/10/2026 em `/moderacao/materiais/:id`, na seção **Comentários para moderação**. MODERADOR e ADMINISTRADOR podem selecionar um comentário ATIVO da página carregada, informar motivo e confirmar sua ocultação. Usa a API já existente; não altera Java, banco, dependências ou permissões.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/moderacao-comentario-service.ts   # POST e validação do motivo/resposta
src/features/moderacao/comentario-ocultacao-model.ts     # Seleção, confirmação, escrita e descarte
src/features/moderacao/ComentarioOcultacaoPanel.vue      # Formulário da ação
src/features/moderacao/ComentariosModeracaoSection.vue   # Composição com lista/histórico existentes
tests/comentario-ocultacao.test.mjs                     # 27 testes de contrato e modelo
tests/comentario-ocultacao-http.test.mjs                # 1 teste HTTP sintético
```

O código completo está nesses arquivos. A composição preserva `comentario-consulta-equipe-model.ts` e seu histórico somente de leitura; não infere o estado atual pelos eventos. Reutiliza cliente Bearer, DTO de comentário da equipe, paginação, perfil de `/usuarios/me` e estilos existentes. Não cria rota, formulário de UUID arbitrário, busca de nomes ou GET individual do texto.

## Contrato

Relativo à base `/api/v1`:

```http
POST /materiais/{materialId}/comentarios/{comentarioId}/ocultacao
Authorization: Bearer <token>
Content-Type: application/json

{"motivo":"Motivo informado pela equipe"}
```

Somente `motivo` no JSON, obrigatório, após trim com até 1000 caracteres, sem U+0000. UUIDs e motivo são validados antes de enviar. O DTO retornado é projetado nos seis campos do comentário; exige o par de UUIDs esperado, estado OCULTO, autor/data original preservados. Campos extras são descartados. A API registra a decisão e o motivo no histórico na mesma transação da ocultação, conforme o contrato do backend em `../UNESC-Share-Backend/docs/COMENTARIOS_MODERACAO.md`.

Ocultar ATIVO é permitido em qualquer estado do Material, inclusive privado/removido. Equipe pode moderar comentário próprio; não aplicar o impedimento de denunciante/autor do Material específico de denúncias. Nenhum estado do Material é alterado. Reexibição e restauração de comentário REMOVIDO não são oferecidas nesta entrega.

## Seleção, confirmação e concorrência

O botão aparece apenas para ATIVO na página consultada. Abrir descarta a página e conserva somente o comentário selecionado para conferência; histórico, outro alvo e recarga ficam indisponíveis enquanto o formulário está aberto. Texto é interpolado pelo Vue e preserva quebras de linha, sem HTML confiável. Motivo e dados ficam em RAM, sem URL, storage ou logs privados.

Exige caixa de confirmação e botão explícito. Editar o motivo ou tentar enviar consome a confirmação. Durante o POST, bloqueia edição, duplicidade, troca, cancelamento e consultas internas. Cancelar descarta motivo/confirmação e consulta lista nova, tamanho20/página0, sem reapresentar snapshot antigo. Mudanças externas de Material/conta/perfil ou desmontagem cancelam e ignoram respostas antigas; abortar não garante desfazer uma operação recebida pelo servidor.

Sem ETag/versão: a confirmação não fixa o texto lido. O autor pode editar antes do POST; a API verifica o estado vigente, e a ocultação pode atingir o texto atualizado. A resposta não é usada para sobrescrever a tela com conteúdo antigo. Sucesso confirmado fecha o formulário, descarta o alvo e consulta a lista atual. Não fabrica evento ou estado otimista, nem consulta histórico automaticamente. Aviso de sucesso permanece se esse GET falhar por rede; falhas de acesso retiram os dados e o aviso.

## Erros

- 400: preserva motivo, consome confirmação e pede revisão antes de nova tentativa explícita.
- 401/403/404 no POST: retiram lista, seleção e motivo; bloqueiam ações até reabrir a revisão. 403 não encerra sessão; 401 usa o helper existente para rejeitar o token efetivamente enviado.
- 409: descarta seleção/texto/motivo e exige voltar à lista, consultar novamente e preparar outra ação.
- Rede, protocolo, 408, 5xx ou resposta incompatível: resultado incerto; mesma exigência de descarte e nova consulta. A ocultação pode ter ocorrido. Não repetir POST automaticamente nem atribuir um evento consultado à tentativa perdida.

Lista vazia não prova ausência da operação. O histórico selecionado continua disponível por seu fluxo próprio, inclusive após remoção lógica, sem recuperar texto. Falha 401/403/404 do histórico retira alvo/eventos; voltar à lista faz uma consulta explicitamente autorizada de novo. Mensagens não refletem corpos privados de erro. A consulta comum permanece PUBLICADO/ATIVO.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Para testar na interface, use o backend e PostgreSQL já configurados e uma conta de equipe existente, mantendo o bootstrap administrativo desativado. Acesse `http://localhost:5173` → Moderação → revisar Material → Comentários para moderação. **Uma confirmação manual grava estado e histórico reais**; use conteúdo destinado a testes. A suíte automática usa somente fixtures sintéticas.

Roteiro manual:

1. Selecionar ATIVO; conferir alvo/texto e ausência da lista anterior. OCULTO oferece apenas histórico.
2. Conferir motivo obrigatório, limite1000, checkbox e edição consumindo confirmação; cancelar deve buscar lista nova.
3. Confirmar: um POST, seguido de GET da lista; comentário aparece OCULTO. Abrir histórico e conferir a decisão, sem texto do comentário no painel de eventos.
4. Conferir que usuário comum não vê a área da equipe e que a consulta comum deixa de listar o comentário ocultado.
5. Simular 400, conflito, falha de rede e acesso negado; não deve haver repetição automática. Após incerteza, consultar lista/histórico antes de preparar outra ação.
6. Testar troca de Material/conta e saída durante envio; teclado, foco, mensagens e largura320px. Sair não garante rollback.

## Verificação executada e limites

`npm run verify`: **1021 testes**, zero falhas/cancelados/ignorados, TypeScript/build aprovados. São28 novos sobre993:27 service/modelo e1 HTTP sintético. Após os ajustes finais de formulário/foco, `npm run build` passou novamente com TypeScript. As993 regressões foram preservadas.

Cobertura inclui seleção conhecida ATIVO, comentário próprio dos dois perfis, descarte da página, confirmação por tentativa, bloqueio durante POST, reconsulta, erros e respostas antigas após mudança de contexto. HTTP Node em RAM verifica Bearer/JSON, perda simulada após gravação, não reenvio, histórico e401/403. **Não executa Spring/PostgreSQL nem comprova autorização ou rollback reais**; o backend não foi alterado e Maven não foi reexecutado.

Vite retornou200 na rota de revisão e nos módulos de seção/painel compilados; servidor temporário encerrado. Inventário sem navegador: visual/mobile/DOM/teclado/foco/E2E com Spring continuam pendentes. Sem Docker, backend iniciado, `.env` real, credenciais/dados reais, dependências, deploy ou operações Git. Resultados Maven anteriores549 completo/20 focado permanecem históricos.

Próximo recomendado: reexibição de comentário OCULTO, com motivo e confirmação, somente quando o Material estiver PUBLICADO.
