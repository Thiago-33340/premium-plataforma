# Módulo — Produção e fichas técnicas

## Objetivo

Permitir cadastrar fichas técnicas de itens produzidos, definir porções/rendimentos, consumir insumos e gerar entrada/movimento do produto produzido.

## Arquivos principais

- `public/admin.html`
- `public/estoque.html`
- `server-pg.js`
- `estoque-v2.sql`

## Rotas principais

Grupo em `project-state/routes.json`:

```text
producao-fichas
```

Principais rotas:

- `GET /api/est/producao/produzidos`
- `GET /api/est/producao/ficha`
- `PUT /api/est/producao/ficha`
- `DELETE /api/est/producao/ficha/:id`
- `POST /api/est/producao/run`
- `GET /api/est/producoes`

## Tabelas principais

- `est_ficha_producao`
- `est_ficha_porcao`
- `est_ficha_porcao_item`
- `est_producao_run`
- `est_producao_receita`

## Status atual

`em_andamento`

O módulo tem estrutura real de ficha multi-porção e produção, mas ainda precisa de contratos, auditoria de custo e validação forte de baixa de insumos.

## Pendências

- Completar fichas pendentes.
- Documentar o comportamento exato de `POST /api/est/producao/run`.
- Garantir transação produção → baixa de insumo → entrada do produzido.
- Validar conversões g/KG/ml/L.
- Definir relatório de produção.

## Critério de pronto

- ficha pode ser criada, editada e excluída;
- ficha suporta múltiplas porções;
- ingredientes são consumidos corretamente;
- custo/rendimento é exibido;
- produção é transacional;
- histórico aparece para gestor.

## Mapa operacional

Ver:

- `project-state/module-route-table-map.json`
- `project-state/api-contracts-critical.json`
- `project-state/test-matrix.json`
