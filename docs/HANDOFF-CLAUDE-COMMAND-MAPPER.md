# Handoff para Claude — Command Center, Mapper e Estoque Premium

Este arquivo resume o que foi feito pelo Codex e como o Claude deve atuar a partir de agora.

## Papel esperado do Claude

Claude deve atuar como arquiteto/revisor operacional do Titan, não como executor concorrente nos mesmos arquivos sem alinhamento.

Responsabilidades principais:

- Avaliar regras de negócio do estoque.
- Calcular impactos de produção, fichas técnicas, conversões e baixas.
- Apontar riscos, lacunas e casos de borda.
- Escrever critérios de aceite objetivos.
- Sugerir ordem de implementação.
- Revisar o resultado do Codex antes de deploy quando houver impacto operacional.

Claude não deve:

- Reimplementar em paralelo o mesmo arquivo que o Codex estiver editando.
- Expandir rotas legadas `/api/estoque/*` como se fossem o fluxo novo.
- Tratar setores como fixos globais; setores são configuração por cliente/tenant.
- Misturar ficha de cardápio (`ficha_itens`) com ficha de produção interna (`est_ficha_*`) sem decisão explícita.

## Estado atual do Command Center

Domínio correto:

- `https://tools.titanatende.com.br`

Rotas:

- `/login`
- `/command-center`
- `/mapper`

Domínios bloqueados para ferramentas:

- `https://premium.titanatende.com.br`
- `https://pedido.titanatende.com.br`

## Login real implantado

O Command Center/Mapper não abre mais com `admin_id` na URL.

Fluxo atual:

- E-mail autorizado no Titan Tools.
- Primeiro acesso cria senha própria.
- Senha forte obrigatória.
- Sessão por cookie HttpOnly.
- `GET /api/mapper/state` exige sessão com permissão `ver_project_state`.
- Aba **Acessos** permite autorizar novos e-mails.

Sócios autorizados:

- Thiago: `thiagoribeiro33340@gmail.com`
- Tassiano: `tassianoborges@hotmail.com`

## Fonte viva que o Claude deve consultar

Arquivos principais:

- `project-state/modules.json`
- `project-state/tasks.json`
- `project-state/risks.json`
- `project-state/routes.json`
- `project-state/test-matrix.json`
- `project-state/agent-workflow.json`
- `docs/DIARIO-ESTOQUE-PREMIUM-2026-06-22.md`
- `docs/GUIA-COMMAND-CENTER-GESTORES.md`

## Fronteiras técnicas obrigatórias

- Estoque novo/oficial: `/api/est/*` e tabelas `est_*`.
- Estoque legado: `/api/estoque/*`; manter compatibilidade, não expandir funcionalidade nova ali.
- Ficha de produção interna: `est_ficha_producao`, `est_ficha_porcao`, `est_ficha_porcao_item`.
- Ficha de cardápio/baixa por pedido: `ficha_itens`.
- Setores de contagem são dinâmicos por tenant.

## Objetivo do dia

Entregar o estoque da Premium pronto para uso real:

- gestor cadastra/edita produto;
- gestor cria/edita/exclui ficha técnica de produto produzido;
- gestor lança produção com baixa correta do bruto;
- colaborador acessa contagem simples pelo setor atribuído;
- gestor audita contagem;
- interface deve ser bonita, clara e responsiva;
- tudo deve ser validado com smoke/blindagem proporcional ao risco.

## Atualização — Estoque Premium em andamento

Implementação local concluída nesta etapa:

- `server-pg.js`
  - `/api/est/produtos` retorna setores do produto.
  - `/api/est/produtos` aceita filtro opcional por setor.
  - `/api/est/producao/produzidos` agrega setores e evita duplicar item produzido quando ele pertence a mais de um setor.
- `public/estoque.html`
  - lista de produtos mostra setores por card;
  - lista de produtos filtra por setor dinâmico;
  - aba de ficha técnica do produto aponta para editor avançado;
  - editor avançado permite porções, ingredientes, custo estimado, setores, instruções e exclusão de ficha.

Validações locais feitas:

- sintaxe de `server-pg.js`;
- parse do JavaScript de `public/estoque.html`;
- `npm run check:project-state`;
- `git diff --check`.

O que o Claude deve revisar agora:

- Se a regra “quantidade de ingrediente corresponde à porção inteira” está clara para os itens produzidos da Premium.
- Quais fichas produzidas ainda precisam de ingredientes reais antes de operação.
- Quais itens do usuário devem ser tratados como ficha de produção e quais são apenas estoque comprado.
- Critérios de aceite para teste manual pós-deploy:
  - produto com vários setores aparece uma vez;
  - filtro por setor não esconde item indevidamente;
  - ficha com múltiplas porções salva;
  - excluir ficha desativa ficha e não apaga produto/histórico;
  - produção não lança sem porção com ingredientes.

O que o Claude não deve fazer:

- Criar outro editor paralelo de ficha.
- Voltar a usar `/api/est/produto/:id/ficha` como fluxo principal.
- Hardcodar setores da Premium; setores seguem dinâmicos por tenant.

## Como o Claude deve responder ao receber este handoff

Entregar ao Thiago/Codex:

1. Lacunas de regra do estoque que ainda impedem operação real.
2. Critérios de aceite para produto, ficha, produção, contagem e auditoria.
3. Riscos de cálculo/conversão.
4. Ordem recomendada para finalizar hoje.
5. Pontos que não devem ir para deploy sem validação.

## Atualização — Claude indisponível e passo 2 assumido pelo Codex

Data: 2026-06-22

Como o Claude não estava trabalhando no momento da entrega, o Codex assumiu temporariamente o papel do passo 2 do Command Center: arquitetura, cálculo, análise de lacunas e critérios de aceite do estoque.

Artefatos criados/atualizados:

- `project-state/stock-command-step2.json`
- `docs/COMMAND-STEP2-ESTOQUE-PREMIUM.md`
- `project-state/agent-workflow.json`
- `project-state/tasks.json`
- `project-state/modules.json`
- `project-state/test-matrix.json`
- `project-state/api-contracts-critical.json`

Achados principais:

- `POST /api/est/compra` tinha bug de runtime por usar usuário não definido.
- Rotas críticas precisavam resolver usuário real por login/apelido/UUID antes de gravar histórico.
- Smoke mutável anterior não cobria ficha avançada por porções nem produção transacional.
- Command/Mapper precisava exibir o passo 2 como fonte viva, não apenas como prompt para o Claude.

O Claude, ao voltar, deve:

- Ler `project-state/stock-command-step2.json` antes de sugerir qualquer mudança.
- Revisar cálculos e critérios, não reimplementar o mesmo editor.
- Usar o smoke mutável controlado como critério de aceite do fluxo produto → compra → ficha → produção.
- Apontar fichas reais da Premium que ainda precisam de ingredientes, mas sem alterar dados em produção sem autorização.

## Atualização — Validação pós-deploy e prontidão do estoque

Data: 2026-06-22

O Codex implantou o passo 2/estoque, rodou as blindagens e criou o artefato `project-state/stock-readiness.json`.

Resultado:

- Smoke read-only produção/tools: 18/18 OK.
- Smoke mutável controlado: OK.
- Catálogo Premium v4 bate com produção por setor e unidade.
- Itens produzidos: 30/30 existem; 27/30 têm ficha com ingrediente.

Correções reais feitas:

- Unidade de `Molho produzido`, `Bisnaga G de Nutella - Aberta` e `Bisnaga G de Doce de Leite - Aberta`.
- Fichas 1:1 seguras para `Lombo Fracionado` e itens abertos de Nutella, Doce de Leite e Chocolate.

O Claude deve focar somente nas 3 fichas que exigem receita real:

1. `Camarão`
2. `Molho produzido`
3. `Coco Ralado Floco`

Não inventar fórmulas. Se não houver composição real, responder com pergunta objetiva para Thiago.

## Atualização — Command com ações auditadas persistentes

Data: 2026-06-22

O Command Center agora permite, na aba **Execução**, registrar:

- tarefas;
- riscos;
- decisões;
- atualização de status/próximo passo de tarefa.

Essas ações:

- gravam somente arquivos whitelistados de `project-state`;
- registram auditoria em `project-state/command-audit-log.json`;
- persistem o evento vivo em `titan_command_actions`;
- são reaplicadas por `GET /api/mapper/state` como overlay sobre o estado versionado.

Como o Claude deve usar isso:

- Ler a aba **Execução** e as tarefas/riscos antes de sugerir próximos passos.
- Tratar o Command como governança e trilha de decisão, não como executor automático de código.
- Não assumir que uma tarefa registrada no Command já foi implantada; deploy continua exigindo commit/push/deploy explícito.

## Atualização — Registro governado de deploy

Data: 2026-06-22

A aba **Deploys** do Command agora registra plano/resultado de deploy por ação auditada `create_deploy_record`.

O Claude deve interpretar assim:

- Um deploy registrado no Command é trilha de governança.
- Ele pode estar planejado, pronto, concluído ou falho.
- O registro não significa que EasyPanel foi acionado automaticamente.
- Deploy real continua exigindo commit/push/deploy explícito e smoke verde.
- Nenhum token/gatilho de deploy deve ser pedido, salvo ou copiado para documentação.

## Atualização — Aprovação humana de deploy

Data: 2026-06-22

O Command agora registra aprovação/validação humana de deploy por `approve_deploy_record`.

O Claude deve interpretar assim:

- A frase obrigatória é `AUTORIZO DEPLOY`.
- A aprovação pode marcar deploy como aprovado, validado, reprovado ou rollback necessário.
- Isso registra intenção humana, mas ainda não aciona EasyPanel automaticamente.
- Uma aprovação no Command não substitui smoke verde nem revisão de regressão.

## Atualização — Executor externo seguro de deploy

Data: 2026-06-22

O Command agora possui a ação `trigger_deploy_external`.

O Claude deve interpretar assim:

- O executor externo é opcional e depende de variável segura no ambiente do serviço.
- A variável esperada é `TITAN_DEPLOY_WEBHOOK_URL` ou `EASYPANEL_DEPLOY_WEBHOOK_URL`.
- O valor da URL/token nunca deve ser pedido, copiado, salvo, documentado ou incluído em prompt.
- Para acionar, o usuário precisa ter `acionar_deploy`.
- O deploy precisa estar aprovado/validado no Command.
- A frase obrigatória é `ACIONAR DEPLOY`.
- A ação registra resultado em `deploys.json`, `command-audit-log.json` e `titan_command_actions`.
- O Command é cockpit de governança e acionamento; código continua vindo de commit/push/deploy.

## Atualização — Relatório Claude aplicado pelo Codex

Data: 2026-06-22

O relatório `RELATORIO-PARA-CODEX.md` apontou três problemas: frescos ausentes, `ficha_itens=0` e risco de divergência Git/produção.

O Codex confirmou por diagnóstico read-only que produção tem `opcoes=309` e `ficha_itens=0`. Portanto:

- não é necessário recriar o cardápio;
- é necessário importar fichas técnicas de baixa por venda;
- o import deve ser idempotente e não sobrescrever edição do gestor.

Implementação preparada:

- `data/fichas-premium-cardapio-v1.json`;
- seed `estoque_insumos_frescos_v1`;
- import `fichas_premium_cardapio_v1`;
- deduplicação da baixa por nome em `server-pg.js`.

O Claude deve revisar depois do deploy:

1. se as 45 fichas importadas cobrem os sabores/adicionais/extras esperados;
2. se os insumos sem casamento direto precisam de alias melhor;
3. como modelar bordas combinadas sem multiplicar baixa;
4. se o motor de pedido deve passar sempre `opcao_id` para evitar fallback por nome.

## Atualização — Webhook seguro do Command configurado

Data: 2026-06-22

A variável `TITAN_DEPLOY_WEBHOOK_URL` foi configurada diretamente no ambiente do serviço EasyPanel.

Regras para Claude/Codex:

- não procurar nem solicitar o valor do webhook;
- não registrar token/webhook em Git, docs, project-state ou mensagens;
- usar o Command como cockpit/auditoria de deploy quando o Executor externo estiver ativo;
- se o botão de deploy externo ainda aparecer como não configurado, validar primeiro se o deploy atual já carregou a variável de ambiente.
