# Titan Khardela — Mapa Operacional Crítico

Este documento aprofunda os três módulos que mais afetam a operação diária:

- Estoque v2.
- Produção e fichas técnicas.
- Contagem e auditoria.

A fonte estruturada está em:

- `project-state/module-route-table-map.json`
- `project-state/api-contracts-critical.json`
- `project-state/test-matrix.json`

## 1. Estoque v2

### Telas

| Tela | Arquivo | Papel |
| --- | --- | --- |
| Produtos/estoque | `public/estoque.html` | cadastro, edição, inativação, fornecedores, categorias, locais e conversões |
| Cockpit admin de estoque | `public/admin.html` | indicadores, setores, movimentos e ajustes rápidos |
| Movimento manual | `public/estoque.html` | entrada, saída, perda ou consumo |

### Rotas críticas

- `GET /api/est/dashboard`
- `GET /api/est/produtos`
- `GET /api/est/produto/:id`
- `POST /api/est/produto`
- `PATCH /api/est/produto/:id`
- `DELETE /api/est/produto/:id`
- `POST /api/est/movimento`

### Tabelas críticas

- `est_produto`
- `est_movimento`
- `est_produto_setor`
- `est_categoria`
- `est_fornecedor`
- `est_local_fisico`
- `est_conversao_categoria`

### Risco principal

Produto é entidade central: se ele for editado errado, pode quebrar contagem, produção, compras e relatórios.

### Testes mínimos

- criar produto;
- editar produto;
- inativar produto;
- vincular setor;
- registrar movimento;
- validar unidade/conversão.

## 2. Produção e fichas técnicas

### Telas

| Tela | Arquivo | Papel |
| --- | --- | --- |
| Fichas técnicas admin | `public/admin.html` | cria, edita e exclui ficha multi-porção |
| Produção operacional | `public/estoque.html` | lança produção, consulta ficha e histórico |

### Rotas críticas

- `GET /api/est/producao/produzidos`
- `GET /api/est/producao/ficha`
- `PUT /api/est/producao/ficha`
- `DELETE /api/est/producao/ficha/:id`
- `POST /api/est/producao/run`
- `GET /api/est/producoes`

### Tabelas críticas

- `est_ficha_producao`
- `est_ficha_porcao`
- `est_ficha_porcao_item`
- `est_producao_receita`
- `est_producao_run`
- `est_movimento`
- `est_produto`

### Risco principal

`POST /api/est/producao/run` altera estoque de insumos e do item produzido. Qualquer erro de conversão ou rendimento muda o saldo real.

### Testes mínimos

- salvar ficha com uma porção;
- salvar ficha com múltiplas porções;
- excluir ficha preservando histórico;
- lançar produção por porção/lotes;
- validar baixa de insumo;
- validar entrada do produzido;
- validar perda/merma.

## 3. Contagem e auditoria

### Telas

| Tela | Arquivo | Papel |
| --- | --- | --- |
| Contagem colaborador | `public/estoque.html` | inicia contagem, salva itens e encerra |
| Auditoria gestor | `public/estoque.html` | aprova, reprova ou solicita correção |
| Contagem geral admin | `public/admin.html` | configura contagem geral e setores |

### Rotas críticas

- `POST /api/est/contagem/iniciar`
- `PATCH /api/est/contagem/:id/item/:itemId`
- `POST /api/est/contagem/:id/encerrar`
- `GET /api/est/contagens`
- `GET /api/est/contagem/:id`
- `POST /api/est/contagem/:id/auditar`

### Tabelas críticas

- `est_contagem`
- `est_contagem_item`
- `est_auditoria`
- `est_produto`
- `est_movimento`

### Risco principal

A aprovação da contagem atualiza `estoque_atual` e grava movimento. Essa é uma ação de alto impacto e precisa de auditoria clara.

### Testes mínimos

- colaborador só conta setor permitido;
- contagem registra usuário e horário;
- autosave salva item;
- encerramento bloqueia obrigatórios pendentes;
- aprovação altera estoque;
- correção reabre contagem.

## Próxima etapa recomendada

Criar testes reais ou smoke scripts para os itens listados em `project-state/test-matrix.json`, começando por:

1. produção transacional;
2. contagem colaborador;
3. auditoria de contagem;
4. CRUD de produto.
