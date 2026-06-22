# Módulo — Contagem e auditoria

## Objetivo

Permitir que colaboradores façam contagens simples por setor e que o gestor audite, valide e controle divergências.

## Arquivos principais

- `public/estoque.html`
- `server-pg.js`
- `estoque-v2.sql`

## Rotas principais

Grupo em `project-state/routes.json`:

```text
contagem-auditoria
```

Principais rotas:

- `POST /api/est/contagem/iniciar`
- `PATCH /api/est/contagem/:id/item/:itemId`
- `POST /api/est/contagem/:id/encerrar`
- `GET /api/est/contagens`
- `GET /api/est/contagem/:id`
- `POST /api/est/contagem/:id/auditar`

## Tabelas principais

- `est_contagem`
- `est_contagem_item`
- `est_auditoria`
- `est_permissao`

## Status atual

`em_andamento`

O fluxo colaborador/gestor existe, mas precisa de contrato formal, política de correção e uma tela futura de divergências.

## Pendências

- Documentar quem pode contar cada setor.
- Definir regra para contagem em andamento.
- Definir reabertura/correção.
- Criar auditoria detalhada de divergência.
- Expor status no Command Center.

## Critério de pronto

- colaborador vê apenas início/contagem;
- contagem registra horário e responsável;
- autosave funciona;
- gestor audita;
- divergências ficam visíveis;
- histórico permanece consultável.

## Mapa operacional

Ver:

- `project-state/module-route-table-map.json`
- `project-state/api-contracts-critical.json`
- `project-state/test-matrix.json`
