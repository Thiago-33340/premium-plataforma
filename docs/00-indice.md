# Titan Khardela — Índice Oficial

Este é o ponto de entrada oficial para qualquer pessoa, IA ou ferramenta trabalhar no Titan Khardela.

## Ordem de leitura

1. [01. Visão geral](./01-visao-geral.md)
2. [02. Módulos](./02-modulos.md)
3. [03. Fluxos](./03-fluxos.md)
4. [04. Banco de dados](./04-banco-de-dados.md)
5. [05. APIs e rotas](./05-apis-rotas.md)
6. [06. Infraestrutura](./06-infraestrutura.md)
7. [07. Pendências](./07-pendencias.md)
8. [08. Decisões técnicas](./08-decisoes-tecnicas.md)
9. [09. Logística interna](./09-logistica-interna.md)
10. [10. Operação](./10-operacao.md)
11. [11. Mapa operacional crítico](./11-mapa-operacional-critico.md)
12. [12. Blindagem e testes](./12-blindagem-testes.md)

## Fonte de verdade operacional

A pasta `project-state/` passa a ser a base operacional inicial do Titan.

A primeira visão visual dessa base evoluiu para o **Titan Command Center**. Ele deve rodar fora dos domínios operacionais de clientes. A rota `/command-center` é liberada apenas em host técnico autorizado; `/mapper` continua como atalho técnico e `/login` abre a mesma tela. Ele lê `project-state` via `GET /api/mapper/state`, aplica overlay das ações persistidas em `titan_command_actions` e exige sessão Titan Tools com permissão `ver_project_state` no host técnico do Titan.

Arquivos principais:

- `project-state/modules.json`
- `project-state/routes.json`
- `project-state/services.json`
- `project-state/containers.json`
- `project-state/databases.json`
- `project-state/tasks.json`
- `project-state/risks.json`
- `project-state/dependencies.json`
- `project-state/decisions.json`
- `project-state/roadmap.json`
- `project-state/weekly-focus.json`
- `project-state/health-checks.json`
- `project-state/rbac-audit.json`
- `project-state/module-route-table-map.json`
- `project-state/api-contracts-critical.json`
- `project-state/test-matrix.json`
- `project-state/local-agent-queue.json`
- `project-state/command-audit-log.json`

## Documentos de módulos

- [Estoque v2](./modulos/estoque-v2.md)
- [Produção e fichas técnicas](./modulos/producao-fichas.md)
- [Contagem e auditoria](./modulos/contagem-auditoria.md)
- [Infraestrutura e deploy](./modulos/infra-deploy.md)
- [Titan Command Center](./modulos/command-center.md)
- [Guia Titan Local Agent](./GUIA-TITAN-LOCAL-AGENT.md)

## Regra para próximas ferramentas

Antes de alterar código, a ferramenta deve:

1. Ler este índice.
2. Ler a visão geral.
3. Ler o documento do módulo afetado.
4. Conferir `project-state/modules.json`, `routes.json`, `databases.json` e `tasks.json`.
5. Executar mudança limitada.
6. Atualizar documentação ou estado operacional quando a mudança for relevante.
7. Aguardar aprovação de Thiago antes de commit, push ou deploy.
