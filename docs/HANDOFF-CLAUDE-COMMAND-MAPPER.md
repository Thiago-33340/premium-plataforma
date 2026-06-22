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
