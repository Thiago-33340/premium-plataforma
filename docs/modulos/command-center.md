# Módulo — Titan Command Center

## Objetivo

Criar uma central visual e operacional para Thiago controlar o Titan: módulos, status, riscos, tarefas, deploys, containers, decisões, próximos passos e divisão de trabalho entre Codex, Claude e Thiago.

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
- `project-state/agent-workflow.json`

## Telas iniciais

### Visão geral

- progresso geral;
- módulos online;
- módulos em andamento;
- módulos bloqueados;
- riscos críticos;
- próximos passos.

### Estoque

- módulos críticos do estoque;
- contratos de API;
- testes obrigatórios;
- riscos do estoque;
- divisão Codex/Claude para produtos, fichas, produção, contagem e permissões.

### Agentes

- papéis oficiais de Thiago, Codex e Claude;
- fluxo do briefing ao deploy;
- prompt copiável para reposicionar o Claude como revisor/arquiteto;
- critérios de pronto.

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

### Acessos

- login por e-mail e senha para ferramentas Titan;
- primeiro acesso por e-mail previamente autorizado;
- senha forte obrigatória;
- sessão persistente opcional por “Manter conectado”;
- autorização de novos e-mails e permissões por gestor com `gerenciar_usuarios`.

## Status atual

`em_andamento`

A primeira versão visual foi criada como **Titan Mapper** e evoluiu para **Titan Command Center**:

- página oficial: `/command-center`;
- atalho/compatibilidade: `/mapper`;
- atalho de login: `/login`;
- arquivo: `public/mapper.html`;
- API read-only: `GET /api/mapper/state`;
- API de autenticação: `/api/titan/auth/*`;
- acesso: restrito a sessão Titan Tools com permissão adequada e a host técnico autorizado;
- fonte: arquivos permitidos de `project-state/`.

## Separação de domínio

O Command Center e o Mapper são ferramentas internas de criação/governança do Titan, não telas do cliente Premium.

- Não devem aparecer em `premium.titanatende.com.br`.
- Não devem aparecer em `pedido.titanatende.com.br`.
- Devem rodar em um host técnico, configurável por `TITAN_TOOLS_HOSTS`.
- Enquanto um domínio definitivo não existir, o host técnico padrão do EasyPanel pode ser usado.
- Domínio definitivo: `tools.titanatende.com.br`.

## Login das ferramentas Titan

O Command Center/Mapper não deve mais abrir `project-state` por `admin_id` na URL.

Fluxo atual:

- o usuário entra em `/command-center`, `/mapper` ou `/login`;
- se não houver sessão, a tela mostra login por e-mail/senha;
- “Primeiro acesso” aceita somente e-mail autorizado em `titan_tool_users`;
- após validar senha forte, o sistema grava `senha_hash` com `crypt/pgcrypto`;
- “Manter conectado” vem desmarcado por padrão; quando marcado, a sessão do dispositivo dura até 30 dias;
- usuários com `gerenciar_usuarios` veem a aba **Acessos** e podem autorizar novos e-mails.

Bootstrap inicial:

- usar `TITAN_TOOL_BOOTSTRAP_EMAILS=email1,email2` para autorizar sócios com acesso total no boot; ou
- usar um usuário já autorizado com `acesso_total`/`gerenciar_usuarios` para liberar novos e-mails pela aba **Acessos**.

Em 2026-06-22, o host técnico temporário em produção ficou como:

- `https://mayaproject-github.yrbgh5.easypanel.host`

Observação operacional: no EasyPanel, esse host precisa apontar para `http://mayaproject_github:8080/`. Ele chegou a estar em `:80`, o que causava `502` somente no domínio técnico. `premium.titanatende.com.br` e `pedido.titanatende.com.br` já apontavam corretamente para `:8080`.

Também em 2026-06-22, foi configurado o domínio definitivo:

- Cloudflare: `tools.titanatende.com.br` como registro `A` para `2.24.97.168`, `DNS only`, TTL automático.
- EasyPanel: `https://tools.titanatende.com.br/` apontando para `http://mayaproject_github:8080/`.
- Backend: `tools.titanatende.com.br` incluído na lista padrão de hosts técnicos autorizados.

Esta versão não substitui o trabalho do estoque. Ela existe para Thiago acompanhar progresso, riscos, tarefas, deploys, fronteiras críticas e divisão de responsabilidades enquanto outras ferramentas atuam nos módulos.

## Regra operacional entre agentes

- Thiago define prioridade e aprova fluxo operacional.
- Codex implementa código, interface, testes, documentação, PR e deploy.
- Claude avalia regra, calcula impacto, aponta lacunas, revisa e recomenda a melhor ordem de execução.
- O briefing para Claude deve ser copiado da aba **Agentes** do Command Center.
- A aba **Estoque** deve orientar a próxima entrega do estoque usando contratos, riscos, testes e tarefas.

## Critério de pronto da primeira versão

- lê JSONs locais via API read-only;
- mostra módulos;
- mostra tarefas;
- mostra riscos;
- mostra deploys;
- mostra última blindagem/smoke;
- mostra última auditoria de permissões/RBAC;
- mostra workflow dos agentes;
- mostra briefing copiável para Claude;
- mostra visão dedicada do estoque;
- mostra aba de acessos para usuários com permissão;
- possui filtros por módulo/status/ferramenta;
- não expõe secrets;
- exige sessão Titan Tools para dados internos;
- exige host técnico autorizado;
- pode evoluir depois para ações graváveis auditadas.
