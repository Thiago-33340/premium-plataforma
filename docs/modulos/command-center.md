# Módulo — Titan Command Center

## Objetivo

Criar uma central visual para Thiago controlar o Titan: módulos, status, riscos, tarefas, deploys, containers, decisões e próximos passos.

## Fonte de dados inicial

O Command Center deve ler:

- `project-state/modules.json`
- `project-state/tasks.json`
- `project-state/risks.json`
- `project-state/services.json`
- `project-state/containers.json`
- `project-state/deploys.json`
- `project-state/decisions.json`
- `project-state/roadmap.json`
- `project-state/weekly-focus.json`
- `project-state/health-checks.json`
- `project-state/rbac-audit.json`

## Telas iniciais

### Visão geral

- progresso geral;
- módulos online;
- módulos em andamento;
- módulos bloqueados;
- riscos críticos;
- próximos passos.

### Módulos

- nome;
- status;
- progresso;
- responsável;
- ambiente;
- container;
- rotas;
- pendências.

### Logística

- tarefas por status;
- prioridades;
- bloqueios;
- próximo passo.

### Infraestrutura

- serviços;
- containers;
- deploys;
- último deploy;
- health check.

### Decisões

- data;
- decisão;
- motivo;
- impacto;
- módulos afetados.

## Status atual

`planejado`

Ainda não deve ser implementado visualmente antes de validar a base `project-state`.

## Critério de pronto da primeira versão

- lê JSONs locais;
- mostra módulos;
- mostra tarefas;
- mostra riscos;
- mostra deploys;
- mostra última blindagem/smoke;
- mostra última auditoria de permissões/RBAC;
- não depende de banco nem rede na primeira versão;
- pode evoluir depois para GitHub/EasyPanel.
