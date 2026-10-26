# Edição e exclusão da própria avaliação

Entrega local de 23/10/2026, na seção de avaliações dos detalhes de Material. Usa os endpoints existentes, sem mudança de Java/schema, segurança, dependências ou premissa BitTorrent. A exclusão física foi aprovada para Avaliacao; Material e Comentario continuam com remoção lógica.

## Estrutura e código completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/avaliacao/avaliacao-service.ts   # PUT/minha, DTO e DELETE pelo helper existente
src/features/avaliacao/avaliacao-model.ts     # Alvo, edição, confirmação, recarga e falhas
src/features/avaliacao/AvaliacoesSection.vue  # Ações próprias/painel/foco/confirmação
src/assets/main.css                         # Painel e ações responsivas
tests/avaliacao-acoes.test.mjs               # Contratos e estados sem DOM
tests/avaliacao-acoes-http.test.mjs          # fetch/Bearer/PUT/DELETE em HTTP sintético
```

Código completo nesses arquivos. Reutiliza `authenticatedJson`, `authenticatedDelete`, parser de DTO, centésimos inteiros, formatação pt-BR e o modelo já existente de avaliações. Não há nova rota Vue nem alteração no armazenamento JWT/sessionStorage.

## Permissões e alcance

As ações partem da própria nota já carregada na seção PUBLICADO. Modelo e service conferem conta e Material da nota; perfil de equipe ou propriedade do Material não permitem escolher nota de terceiro. A API deriva a identidade do JWT, não de parâmetro/corpo/UUID da avaliação.

Editar exige Material PUBLICADO de outro usuário e nota própria existente. Remover não exige autoria diferente do Material: até uma autoavaliação legada pode ser retirada pelo avaliador, embora não possa ser editada. A interface não acrescenta lista privada ou formulário de UUID arbitrário. Se o Material ficar privado depois de abrir a confirmação, o DELETE conhecido continua autorizado; a recarga posterior pode retornar404 e retirar os dados da seção.

Esta entrega não torna a nota própria de Material já privado ao abrir a tela consultável. GET/minha e GET/resumo continuam exclusivos de PUBLICADO, inclusive para autor/equipe. O backend permite retirar a nota em qualquer estado do Material sem devolver dados privados.

## Edição

“Editar minha nota” abre um painel com nota, data e UUID consultados. Entrada text/inputmode decimal aceita vírgula/ponto de0,00 a5,00 com até duas casas, sem arredondar/truncar, reutilizando centésimos inteiros. Nota equivalente à original não envia PUT.

PUT `/api/v1/materiais/{materialId}/avaliacoes/minha` envia somente JSON numérico `{ "nota": 3.25 }`. Não envia id/usuarioId/data/status. Resposta deve corresponder à nota e manter UUID/data/autor/Material do registro consultado. Não há upsert:404 não gera POST automático. A própria nota é atualizada pelo DTO, e média/quantidade vêm de novo GET/resumo, sem cálculos otimistas locais.

Sem ETag/versão: a operação pode sobrescrever uma alteração feita em outra aba. Se a nota tiver sido removida/recriada entre consulta e PUT, o backend pode alterar a nova linha atual de `/minha`. A checagem posterior de UUID/data detecta essa resposta inesperada como resultado incerto, mas **não impede a gravação**. A interface avisa sobre a possibilidade antes do envio; nova seleção exige consultar a nota atual.

## Exclusão física e confirmação

“Revisar remoção” mostra nota/data/UUID consultados e o impacto: exclusão definitiva da própria Avaliacao, sem histórico/restauração pela API, preservando Material/Torrent/Magnet/comentários e notas de terceiros.

Checkbox e botão “Confirmar exclusão definitiva” são obrigatórios. Abrir, cancelar, recarregar ou submeter sem confirmação não escreve. Cada tentativa consome o consentimento, vinculado à conta/Material/painel atual; erro, fechamento ou mudança de contexto não o reaproveitam.

DELETE `/api/v1/materiais/{materialId}/avaliacoes/minha` não envia corpo, Content-Type ou identidade em query. O helper Bearer existente exige204 e não lê JSON;2xx diferente é erro de protocolo com resultado incerto.204 também cobre nota já ausente em Material existente. Material inexistente retorna404.

O UUID mostrado é uma referência da consulta, não uma condição enviada ao servidor. DELETE/minha significa remover a **nota atual**: se outra aba recriar uma nota antes da execução de outra tentativa, essa nova linha poderá ser removida. Há aviso explícito no painel, sem retry automático nem promessa de proteção por geração.

Após204, a interface elimina a nota antiga, bloqueia novo cadastro e consulta novamente própria/resumo. Somente após sequência válida, ausência e demais regras, novo POST é liberado: ele cria outra Avaliacao/UUID/data, não restaura a anterior. Se o Material já estiver privado, GET404 remove os dados, mantendo apenas a confirmação fixa do DELETE concluído. Não confundir esse GET404 com falha do DELETE204.

## Estado e falhas

Um painel por vez. Enquanto aberto, bloqueia cadastro, recarga comum e troca de tipo de ação; durante PUT/DELETE, também impede fechar, editar e enviar novamente. Cancelar fora do envio descarta a edição/checkbox sem escrita. Foco implementado no título do painel ao abrir e da seção ao fechar; ainda requer validação real em navegador.

Sucesso de PUT fecha o painel e consulta resumo. Falha de rede nessa recarga preserva nota/cadastro confirmado. Após DELETE, falha de rede no GET mantém a confirmação, mas não libera cadastro ou nova ação com snapshot antigo. Não calcular médias/quantidades no cliente.

400 permite corrigir a edição; na remoção, a confirmação continua consumida.409 e resultado incerto de rede/protocolo/408/5xx bloqueiam reenvio pelo painel antigo. “Fechar e consultar nota atual” descarta o alvo/edição/consentimento e faz GETs, nunca repete PUT/DELETE. Se encontrar nova geração, ela será mostrada com novo UUID/data e precisará de nova seleção/confirmacão. Se a consulta falhar, nenhum alvo antigo é elegível.

403 de PUT bloqueia edição até reabrir os detalhes, mas permite consultar e revisar a retirada própria após fechar/reconsultar.401/404 de mutação e403 de DELETE retiram acesso aos dados; helper invalida apenas o token usado em401. Mensagens fixas não ecoam nota rejeitada, ProblemDetail privado, SQL ou credenciais.404 de PUT não é usado como prova de ausência para cadastrar.

Mudança de Material/autor/conta/desmontagem limpa RAM, cancela tarefas e ignora respostas antigas. Cancelar a espera não garante rollback no servidor. Sem notas/cache/painel salvos em URL/storage/logs.

## Execução e teste

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Abra http://localhost:5173 com conta existente. Para operações manuais, use somente uma avaliação descartável identificada: PUT altera dado real e DELETE o apaga definitivamente, sem limpeza/restauração automática.

1. Abrir nota própria, editar/cancelar e conferir ausência de PUT; salvar0,00/5,00 e conferir UUID/data preservados e resumo atualizado.
2. Rejeitar três casas/fora do intervalo sem arredondar; nota equivalente não envia. Conferir vírgula/ponto, teclado e leitor de tela.
3. Abrir remoção/cancelar/enviar sem caixa marcada: nenhuma exclusão. Confirmar, conferir desaparecimento e totais da API, preservando notas alheias e Material.
4. Após remover, cadastrar outra nota permitida e conferir novo UUID/data. O cadastro é ação explícita, não restauração ou fallback automático.
5. Em ambiente descartável, mudar Material para privado após abrir confirmação: DELETE continua permitido, mas consultas seguintes retiram nota/resumo sem expor dados privados.
6. Simular conflito/resposta perdida/recriação em outra aba: não repetir mutação automaticamente; fechar, consultar nota atual e só então selecionar/confirmar outra tentativa, considerando que `/minha` pode atingir nova nota.
7. Sair/trocar conta/Material durante envio não deve restaurar alvo ou nota antiga. Conferir foco, layout desktop e320px.

`npm run verify` passou com **659 testes**, zero falhas/cancelados/ignorados, vue-tsc e build Vite aprovados. São47 novos sobre612:46 de contrato/modelo e1 HTTP sintético. Cobrem PUT mínimo/invariantes/precisão, DELETE204/semcorpo, confirmação consumida, ausência/recriação, estado privado, permissão própria, falhas/reconsulta e respostas antigas. Permanecem os testes anteriores, inclusive os501 valores em centésimos.

HTTP sintético usa Node/fetch local e dados em RAM, não Spring/PostgreSQL ou prova de locks/rollback/autorização real. Vite retornou200 no fallback de detalhes e módulos MaterialView/AvaliacoesSection compilados; servidor temporário encerrado. Navegador indisponível: visual/mobile/DOM/foco/entrada decimal/E2E com Spring pendentes. Nenhum PUT/DELETE real, Java/schema/dependência/Maven/Docker/backend iniciado/.env real/credenciais/dados reais/publicação/commit/push nesta entrega. Suite Maven registrada549 não reexecutada.

Próximo recomendado: denúncias, começando por cadastro e acompanhamento das próprias; moderação fica em entrega separada.
