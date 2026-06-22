# Command Center — passo 2 do estoque Premium

Data: 2026-06-22  
Status: concluído pelo Codex substituindo a função do Claude nesta etapa.

## O que é este passo

No fluxo oficial do Command Center, o passo 2 é **Arquitetura e cálculo**. Ele estava atribuído ao Claude: avaliar regra de negócio, cálculos de estoque, riscos, lacunas e critérios de aceite antes da implementação.

Como o Claude não estava atuando, o Codex assumiu este papel para não travar a entrega do estoque Premium.

## Fontes que o Claude vinha usando/deveria usar

- `project-state/agent-workflow.json`
- `project-state/tasks.json`
- `project-state/modules.json`
- `project-state/api-contracts-critical.json`
- `project-state/test-matrix.json`
- `project-state/routes.json`
- `docs/HANDOFF-CLAUDE-COMMAND-MAPPER.md`
- `docs/DIARIO-ESTOQUE-PREMIUM-2026-06-22.md`
- `public/estoque.html`
- `server-pg.js`
- `data/estoque-catalogo-premium-v4.json`
- `seed-setores-premium.sql`
- `seed-produzidos-rp.sql`

## Decisão operacional

O estoque oficial continua sendo:

- rotas: `/api/est/*`;
- tabelas: `est_*`;
- tela operacional: `public/estoque.html`;
- ficha de produção: `est_ficha_producao`, `est_ficha_porcao`, `est_ficha_porcao_item`;
- ficha de venda/cardápio: `ficha_itens`, separada da ficha de produção.

Setores continuam configuráveis por cliente. Premium tem seus setores atuais, mas o sistema não deve fixar esses nomes no código.

## Cálculos oficiais

Produção por porção:

- `entrada_produzido = lotes * rendimento_da_porcao`
- se o gestor informar rendimento real, `entrada_produzido = rendimento_real`;
- se rendimento real for menor que o esperado, a diferença vira perda/merma.

Baixa de insumos:

- `baixa = converter(quantidade_do_ingrediente, unidade_receita, unidade_estoque, peso_g) * lotes`
- `g` para `KG` divide por 1000;
- `ml` para `LITRO` divide por 1000;
- quando o bruto é contado por unidade e tem `peso_g`, gramas viram fração de unidade.

Compra manual:

- `estoque_depois = estoque_antes + quantidade_comprada`;
- se só houver total, `valor_unitario = valor_total / quantidade`;
- a compra deve gravar compra, itens, movimento e custo médio de forma transacional.

Contagem:

- iniciar contagem grava colaborador e horário automaticamente;
- colaborador só vê setor permitido;
- aprovar contagem substitui o saldo pelo valor contado e grava movimento de diferença.

## Achados da auditoria

1. `POST /api/est/compra` tinha um bug de runtime: usava `g.nome` sem definir `g`.
2. Algumas escritas aceitavam login/apelido para permissão, mas gravavam o texto recebido como `usuario_id`. Isso atrapalha teste remoto com `thiago`.
3. O smoke mutável antigo não cobria o fluxo oficial novo de ficha avançada por porção.
4. O Command tinha briefing para o Claude, mas não tinha artefato próprio do passo 2.

## Próximos passos técnicos

1. Corrigir compra manual e usuário efetivo nas rotas críticas.
2. Ampliar smoke mutável controlado para:
   - criar insumo de teste;
   - lançar compra de teste;
   - criar produzido de teste;
   - salvar ficha avançada;
   - lançar produção;
   - conferir baixa/entrada;
   - inativar dados de teste.
3. Fazer o Command/Mapper exibir este passo 2.
4. Rodar validações locais.
5. Deployar.
6. Rodar smoke read-only pós-deploy.
7. Rodar smoke mutável controlado apenas com confirmação explícita.

## Critério de pronto do estoque Premium

O estoque só deve ser chamado de pronto quando:

- cadastro de produto funcionar;
- compra/entrada funcionar;
- ficha avançada criar/editar/excluir;
- produção baixar insumos e dar entrada no produzido;
- contagem funcionar por setor/permissão;
- auditoria atualizar saldo apenas após aprovação;
- smoke read-only passar;
- smoke mutável controlado passar com produtos de teste;
- tudo estiver registrado no diário e no project-state.

## Resultado pós-deploy

Em 2026-06-22, o Codex implantou o commit `c121cb3`, rodou as validações em produção e criou `project-state/stock-readiness.json`.

Validações:

- Smoke read-only produção/tools: 18/18 OK.
- Smoke mutável controlado: OK.
- Catálogo Premium v4: setores e unidades sem divergência.
- Itens produzidos: 30/30 retornando na API.
- Fichas com ingrediente: 27/30.

Correções de dados reais:

- Unidades corrigidas conforme lista de Thiago:
  - `Molho produzido`: `KG`.
  - `Bisnaga G de Nutella - Aberta`: `UNIDADE`.
  - `Bisnaga G de Doce de Leite - Aberta`: `UNIDADE`.
- Fichas 1:1 criadas para vínculos seguros:
  - `Lombo Fracionado` ← `Lombo Canadense`.
  - `Bisnaga G de Nutella - Aberta` ← `Bisnaga G de Nutella`.
  - `Bisnaga P de Nutella - Aberta` ← `Bisnaga P de Nutella`.
  - `Bisnaga G de Doce de Leite - Aberta` ← `Bisnaga G de Doce de Leite`.
  - `Chocolate ao Leite - Aberto Finalização` ← `Chocolate ao Leite Bisnaga`.
  - `Chocolate Branco - Aberto Finalização` ← `Chocolate Branco Bisnaga`.

Pendências bloqueadas por dado operacional:

- `Camarão`
- `Molho produzido`
- `Coco Ralado Floco`

Essas fichas não devem ser preenchidas por suposição. Precisam de ingredientes, quantidades, unidade e rendimento confirmados pela operação.
