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

`em_andamento`

A primeira versão visual foi criada como **Titan Mapper**:

- página: `/mapper`;
- arquivo: `public/mapper.html`;
- API read-only: `GET /api/mapper/state`;
- acesso: restrito a gestor por `admin_id`;
- fonte: arquivos permitidos de `project-state/`.

Esta versão não substitui o trabalho do estoque. Ela existe para Thiago acompanhar progresso, riscos, tarefas, deploys e fronteiras críticas enquanto outras ferramentas atuam nos módulos.

## Critério de pronto da primeira versão

- lê JSONs locais via API read-only;
- mostra módulos;
- mostra tarefas;
- mostra riscos;
- mostra deploys;
- mostra última blindagem/smoke;
- mostra última auditoria de permissões/RBAC;
- não expõe secrets;
- exige gestor;
- pode evoluir depois para GitHub/EasyPanel.
