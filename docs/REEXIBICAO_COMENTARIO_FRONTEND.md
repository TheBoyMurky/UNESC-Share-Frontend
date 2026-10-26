# Reexibição de comentários pela equipe

Validação posterior em26/10/2026: [roteiro opcional com Spring HTTP real/PostgreSQL](../../UNESC-Share-Backend/docs/VALIDACAO_INTEGRADA_COMENTARIOS.md),551 testes backend e2 cenários integrados aprovados;1044 testes frontend repetidos com sucesso. Essa verificação complementa os testes sintéticos descritos abaixo, sem substituir Vue/DOM/navegador.

Entrega de 26/10/2026 na revisão `/moderacao/materiais/:id`. Comentário OCULTO de Material PUBLICADO oferece **Reexibir comentário**, com motivo e confirmação explícita. A API existente continua responsável por autorização, transição e auditoria.

## Estrutura e código completo

Arquivos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/moderacao-comentario-service.ts   # POSTs fixos e metadados das duas decisões
src/features/moderacao/comentario-decisao-model.ts       # Ciclo compartilhado de ocultação/reexibição
src/features/moderacao/ComentarioDecisaoPanel.vue        # Formulário com confirmação específica
src/features/moderacao/ComentariosModeracaoSection.vue   # Seleção e estado observado do Material
src/features/material/MaterialView.vue                 # Repassa estado validado à seção
src/features/moderacao/comentario-ocultacao-model.ts     # Exportações de compatibilidade
src/features/moderacao/ComentarioOcultacaoPanel.vue      # Adaptador para o painel compartilhado
tests/comentario-reexibicao.test.mjs                    # 22 testes de contrato/modelo
tests/comentario-reexibicao-http.test.mjs               # 1 teste HTTP sintético
```

O código completo está nesses arquivos. A extração do ciclo evita duplicar seleção, confirmação, tratamento de erros e cancelamento. A interface anterior de ocultação permanece disponível; suas regressões continuam executadas. Lista/histórico, cliente Bearer e estilos são reutilizados, sem novas dependências, rotas, variáveis, Java ou schema.

## Contrato e disponibilidade

Relativo à base `/api/v1`:

```http
POST /materiais/{materialId}/comentarios/{comentarioId}/reexibicao
Authorization: Bearer <token>
Content-Type: application/json

{"motivo":"Justificativa para tornar o comentário ativo novamente"}
```

Envia somente motivo, obrigatório após trim, até1000 caracteres e sem U+0000. Valida UUIDs/motivo antes do HTTP e projeta a resposta nos seis campos do comentário. Exige par de IDs, estado ATIVO e autor/data original preservados; campos extras são descartados. O backend registra OCULTO→ATIVO e motivo no histórico, na mesma transação. Não cria eventos diretamente nem altera o Material.

O botão existe somente para OCULTO da página carregada quando o estado observado do Material é PUBLICADO. Esse estado vem do detalhe já validado pelo leitor da revisão; não há GET adicional por comentário, nomes, perfis ou prefetch de histórico. Sem estado conhecido, ou em PENDENTE/BLOQUEADO/REMOVIDO, não prepara reexibição. A consulta da equipe e a ocultação de ATIVO continuam disponíveis em qualquer estado do Material.

MODERADOR e ADMINISTRADOR podem moderar comentário próprio. Não aplicar conflito de Denuncia a comentários. REMOVIDO não é restaurado nem tem texto exibido. Histórico não serve para inferir o estado vigente ou iniciar uma decisão.

## Formulário e concorrência

Não há ação escolhida por padrão. Um painel por vez; trocar ocultação/reexibição exige cancelar, descartar motivo/confirmação e consultar lista nova20/página0. Abrir conserva só o comentário selecionado e descarta os demais textos da página. Motivo e texto usam interpolação Vue, sem HTML confiável.

Motivo editado ou envio tentado consome a confirmação específica da ação. Em voo bloqueia edição, reenvio, troca, cancelamento e consultas internas. Mudança observada de Material/estado/conta/perfil reinicia a seção; modelo também confere estado do Material na assinatura do contexto, antes do POST e ao receber respostas. Dispose/contexto cancelam e ignoram respostas antigas; abortar não garante rollback.

O estado do Material pode mudar no servidor após a leitura. Não há polling, ETag, fixação de versão nem consulta extra que elimine essa janela; o POST é revalidado pelo backend e pode retornar409. Nesse caso, descarte a ação e recarregue também a revisão para conferir o Material antes de outra escolha. A reexibição não publica um Material privado e não garante que ele continuará publicado depois da decisão.

Sucesso confirmado fecha o painel, descarta alvo/motivo e faz GET da lista20/0, sem fabricar evento ou estado otimista. Aviso de sucesso permanece se esse GET falhar por rede; falhas de acesso retiram os dados e o aviso. Histórico pode ser consultado explicitamente depois. Consulta comum permanece PUBLICADO/ATIVO.

## Erros e privacidade

- 400: motivo preservado, confirmação consumida, revisão antes de outra tentativa explícita.
- 401/403/404 no POST: retiram todos os dados da seção e bloqueiam decisões até nova carga.403 não encerra sessão;401 usa o helper do token efetivamente enviado.
- 409: descarta alvo/texto/motivo e exige nova consulta/seleção/confirmação; não trocar automaticamente a ação.
- Rede, protocolo,408,5xx ou DTO incompatível: resultado incerto, a reexibição pode ter ocorrido. Descarta e exige nova consulta, sem retry automático ou atribuição de evento à tentativa perdida.

Lista/histórico vazios não comprovam que a operação falhou. Histórico continua sem texto do comentário, inclusive após remoção lógica de alvo já selecionado. Dados e motivo ficam em RAM, sem URL, storage ou logs privados; mensagens não reproduzem corpos privados de erro. Texto livre do motivo não é anonimizado automaticamente.

## Executar e testar

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com backend/PostgreSQL já configurados, use conta existente da equipe e mantenha o bootstrap administrativo desativado. Em `http://localhost:5173`: Moderação → revisar Material PUBLICADO → Comentários → comentário OCULTO → Reexibir comentário. Confirmação manual persiste estado e histórico; use conteúdo destinado a testes.

Roteiro manual:

1. Em PUBLICADO, conferir que ATIVO oferece ocultação e OCULTO oferece reexibição; em Material privado, OCULTO oferece só histórico e orientação para recarregar a revisão.
2. Conferir seleção/texto, motivo obrigatório/limite1000, checkbox específico e edição consumindo confirmação. Trocar ação exige cancelar e nova consulta.
3. Confirmar: um POST específico seguido de GET da lista. Conferir ATIVO e, em consulta explícita, evento OCULTO→ATIVO; verificar também visibilidade na consulta comum do Material publicado.
4. Mudar estado do Material em outra aba antes de confirmar; conferir conflito, descarte e necessidade de recarregar a revisão, sem repetição automática.
5. Conferir perda de conexão,401/403/404, troca de conta/Material/estado, saída durante envio, teclado/foco e largura320px.

## Verificação executada

`npm run verify`: **1044 testes**, zero falhas/cancelados/ignorados, TypeScript/build aprovados. São23 novos sobre1021:22 service/modelo e1 HTTP sintético. As1021 regressões passaram após a extração do ciclo compartilhado.

Testes cobrem transição/resposta, Material PUBLICADO obrigatório, comentário próprio dos dois perfis, seleção conhecida, confirmação, bloqueio durante envio, falhas, descarte e respostas antigas. HTTP Node em RAM confere Bearer/JSON, conflito de Material simulado, perda após gravação, histórico e401/403. Não executa Spring/PostgreSQL nem comprova autorização, locks ou rollback reais. Maven completo549/focado materiais20 permanecem históricos, não reexecutados.

Vite retornou200 na rota de revisão e módulos de seção/painel compartilhado/Material compilados; servidor temporário encerrado. Inventário sem navegador: visual/mobile/DOM/teclado/foco/E2E com Spring pendentes. Sem Java/schema/dependências/Docker/backend iniciado/`.env` real/credenciais/dados reais/deploy/operações Git.

Próximo recomendado: validação integrada dos fluxos de comentários e moderação com o backend real, incluindo roteiro de navegador quando disponível, antes de ampliar funcionalidades.
