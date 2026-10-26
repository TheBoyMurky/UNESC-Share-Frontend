# Revisão individual de Material pela equipe

**Atualização posterior em25/10/2026:** usuário escolheu manter autoaprovação de ambos os perfis. Publicação/bloqueio já integrados em [DECISOES_MATERIAL_FRONTEND.md](DECISOES_MATERIAL_FRONTEND.md). O texto abaixo registra a entrega anterior somente de leitura e sua pergunta então pendente.

Entrega de25/10/2026, em `/moderacao/materiais/:id`. Prepara a leitura individual sem definir a política de autoaprovação nem acrescentar publicação/bloqueio. A escolha foi solicitada ao usuário e ainda está pendente; nenhuma alternativa foi aplicada por padrão.

## Estrutura e código completo

Caminhos relativos a `/home/murky/Desenvolvimento/UNESC-Share-Frontend`:

```text
src/features/moderacao/material-revisao-model.ts   # Composição do leitor e escopo conta/perfil
src/features/moderacao/MaterialRevisaoView.vue     # Wrapper da rota de equipe, review=true
src/features/moderacao/MateriaisPendentesView.vue  # Links para a revisão individual
src/features/material/MaterialView.vue            # Modo de revisão e leitura compartilhada
src/features/material/material-model.ts          # Exporta fábrica de estado vazio
src/router/index.ts                              # Rota com requiresAuth/requiresModeration
tests/material-revisao.test.mjs                   # Escopo, leitura, download/cópia e respostas antigas
tests/material-revisao-http.test.mjs              # fetch/Bearer/GET sintético
tests/auth-navigation.test.mjs                    # Guardas da rota individual
```

Código completo nesses arquivos. Reutiliza o service/model/view de Material, parser de DTO, quatro consultas acadêmicas, download limitado de metainfo e ações explícitas de Magnet. Sem dependências, variáveis, entidades/schema, Java, DTOs ou endpoints novos. O catálogo permanece BitTorrent, sem hospedagem de conteúdo acadêmico.

## Tela e acesso

A fila agora abre a rota de revisão em vez do detalhe comum. As duas rotas continuam distintas: `/materiais/:id` conserva os fluxos existentes do usuário; `/moderacao/materiais/:id` requer equipe e fixa o modo `review=true` por um wrapper Vue próprio. Isso evita reaproveitar uma instância comum ao alternar entre os dois tipos de rota, sem duplicar todo o template.

O modo de revisão mostra título/descrição/dataCadastro/estado/visualizações, vínculos acadêmicos e listas independentes de Torrent/Magnet. Informa quando o próprio revisor é autor e quando o registro não está mais PENDENTE. PUBLICADO/BLOQUEADO/REMOVIDO continuam legíveis à equipe conforme a API, sem converter ou restaurar estado. Recarregar revisão faz nova consulta e descarta o snapshot anterior.

Não mostra edição/remoção do autor, cadastro de denúncia ou formulários de comentários/avaliações, mesmo se o revisor for autor ou o Material estiver PUBLICADO. Não há botões de publicar/bloquear. A rota comum preserva suas ações próprias anteriores, sem impersonação de autor pela equipe.

Guardas reutilizam `canModerate`/perfil de `/usuarios/me`. Anônimo vai ao login; autenticado sem equipe vai à conta com aviso. O modelo também exige UUID/perfil válidos antes de cada operação. Backend continua a autoridade: o GET normal `/materiais/{id}` permite leitura conforme estado/autor/equipe, e não foi transformado em endpoint exclusivo de moderador. A restrição da rota de revisão é uma conveniência de interface, sem alterar a política da API.

## Composição, privacidade e mecanismos

`createMaterialRevisaoModel` compõe `createMaterialModel` com services e ações protegidos pelo contexto UUID/perfil e por uma geração de consulta. Recarregar, trocar Material/conta/perfil ou sair descarta o leitor anterior, aborta suas tarefas e limpa metadados, nomes, URIs e estados de download/cópia. Uma resposta403 antiga de um leitor substituído não pode limpar a consulta nova, mesmo se conta e Material forem os mesmos.

401/403 em detalhe, nomes ou download retiram toda a representação da revisão, sem causa privada.401 invalida somente o token usado pelo helper;403 não revoga sessão nem inventa outro perfil. Retry é explícito e revalida o contexto. Falha de rede/404 apenas nos nomes pode mostrar erro acadêmico sem esconder metadados autorizados;404 do detalhe não mantém Material anterior. Dados ficam somente em RAM, sem cache persistente/URL/log de conteúdo.

Download exige clique e reutiliza GET Bearer, stream1..2MiB, MIME/tamanho verificados, nomeUUID.torrent e Blob URL temporária. É somente metainfo, nunca PDF/EPUB/MP4/ZIP ou conteúdo acadêmico. Cópia de Magnet é explícita, com fallback manual apenas enquanto o contexto permanece válido; abertura do cliente depende de clique em URI validada. Nenhuma consulta automática a trackers/peers/conteúdo.

Resposta de download que chega depois de perda de escopo não é entregue ao navegador. Resposta de cópia antiga não reapresenta URI em fallback. Copiar/salvar já iniciado por uma ação autorizada não pode ser desfeito pela aplicação. O parser de URI/MIME não comprova disponibilidade ou licença do conteúdo.

Como antes, perfil `/me` e roles de JWT emitido podem divergir após mudança externa no banco. Não foram adicionados polling de perfil, refresh ou revogação imediata. A view observa mudanças disponíveis na sessão, e a API verifica cada requisição. Não há ETag/versão de Material: recarregar obtém dados atuais, sem garantir uma futura decisão sobre a mesma versão.

## Decisão pendente: autoaprovação

Foi apresentada a seguinte escolha, **ainda sem resposta**:

| Opção | Impacto |
| --- | --- |
| Proibir para MODERADOR e ADMINISTRADOR — recomendação | Um membro não publica o próprio Material; precisa de outro membro da equipe para essa aprovação |
| Permitir somente para ADMINISTRADOR | Mantém conveniência de um administrador único no protótipo; moderadores não publicam os próprios |
| Manter a regra atual para ambos | Equipe pode publicar os próprios materiais, sem revisão independente |

A API atual permite autoaprovação de ambos. Esta entrega não endurece a regra no frontend isoladamente nem altera o backend sem a escolha. A questão trata de **publicação**; não assumir automaticamente a mesma restrição para bloqueio. As regras de conflito de interesse de Denuncia também não foram copiadas para Material.

Contratos existentes conferidos para a próxima entrega: POST `/materiais/{id}/publicacao` e `/bloqueio`, sem DTO de motivo. Publicar exige PENDENTE e mecanismo; bloqueio não aceita REMOVIDO e pode ser repetido. Há lock transacional, mas não ETag/histórico/motivo de decisão ou garantia de revisão da última versão. A interface de leitura não inventa esses recursos.

## Execução e validação

```bash
cd /home/murky/Desenvolvimento/UNESC-Share-Frontend
npm run dev
# Em outro terminal:
npm run verify
```

Com conta da equipe já existente, abra Moderação e Revisar material. Não reativar bootstrap ou pedir credenciais administrativas para testes. Se não houver registros, use os testes sintéticos; não modificar o catálogo real apenas para demonstrar a tela.

1. Conferir metadados/nomes/estado/URI/hash/torrents e o aviso de autoria própria. Nenhum POST/PUT/DELETE deve ocorrer, inclusive em Material próprio.
2. Alternar revisão e detalhe comum: a revisão não deve herdar formulários/ações do autor ou interações; o detalhe comum mantém os fluxos anteriores.
3. Recarregar e conferir estado atual quando o Material deixou PENDENTE. A tela não muda nem restaura esse estado.
4. Consultar nomes e testar erro/retry;401/403 devem retirar todos os dados da revisão. Sem perfil de equipe, a URL direta não deve abrir leitura nessa rota, mesmo para o autor.
5. Testar download/cópia apenas com metainfo e URIs autorizados. Não abrir cliente BitTorrent automaticamente. Conferir saída/troca de Material/conta/perfil durante operações pendentes.
6. Verificar teclado, leitor de tela, desktop/320px e navegação entre wrappers/rotas em navegador real.

`npm run verify` passou com **796 testes**, zero falhas/cancelados/ignorados, vue-tsc e build Vite aprovados. São37 novos sobre759:33 de composição/modelo,3 guardas e1 HTTP sintético. Permanecem os testes anteriores de leitura normal, download/Clipboard, fila e fluxos de usuário.

HTTP sintético usa Node/fetch local e dados em RAM; guardas usam Router em memória. Não são Spring/PostgreSQL, DOM, prova de autorização real ou validação da troca efetiva de instâncias Vue em navegador. Vite retornou200 no fallback da rota e nos módulos de wrapper/leitura/fila compilados; servidor temporário encerrado. Navegador indisponível: visual/mobile/DOM/teclado/Clipboard/download real/E2E com Spring pendentes. Nenhum acesso autenticado ao backend real, publicação/bloqueio/dado real alterado, Java/schema/dependência/Maven/Docker/.env real/credenciais/publicação de site/commit/push. Suite Maven registrada549 não reexecutada.

Próxima entrega depende da escolha de autoaprovação para implementar a política de publicação no backend e integrar ações explícitas no frontend. Até lá, a revisão permanece somente de leitura e a regra existente da API permanece inalterada.
