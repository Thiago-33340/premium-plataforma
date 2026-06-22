# Módulo — Estoque operacional v2

## Objetivo

Controlar produtos, setores, entradas, saídas, movimentos, vínculos, contagem e base para produção.

## Arquivos principais

- `public/estoque.html`
- `public/admin.html`
- `server-pg.js`
- `db.js`
- `estoque-v2.sql`
- `data/estoque-catalogo-premium-v4.json`

## Rotas principais

Grupo em `project-state/routes.json`:

- `estoque-v2-cadastros-operacao`
- `estoque-legado`

Base nova:

```text
/api/est/*
```

Base legada:

```text
/api/estoque/*
```

## Tabelas principais

- `est_produto`
- `est_categoria`
- `est_fornecedor`
- `est_setor`
- `est_movimento`
- `est_produto_setor`
- `est_produto_fornecedor`
- `est_local_fisico`
- `est_conversao_categoria`

## Status atual

`em_andamento`

O módulo já tem base real e foi recentemente reformulado, mas ainda precisa de contratos de API, testes de unidade/conversão e documentação operacional.

## Pendências

- Documentar contratos das rotas.
- Criar teste de conversão de unidade.
- Validar comportamento de produto produzido vs insumo.
- Separar o que é oficial e o que é legado.
- Criar tela/relatório de auditoria futura no Command Center.

## Critério de pronto

O módulo só deve ser considerado estável quando:

- cadastrar produto corretamente;
- editar produto corretamente;
- vincular setores;
- registrar entrada/saída/movimento;
- conectar com produção;
- conectar com contagem;
- ter smoke test mínimo;
- estar documentado em rotas e banco.

## Mapa operacional

Ver:

- `project-state/module-route-table-map.json`
- `project-state/api-contracts-critical.json`
- `project-state/test-matrix.json`
