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
- `project-state/command-audit-log.json`
- `titan_command_actions` no Postgres para ações vivas feitas pela tela

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
- Agent Bridge operacional em `project-state/agent-bridge.json`;
- Console IA do Command para enviar prompt e receber resposta sem sair da aba;
- ponte **Codex Local / PC Thiago** usando Titan Local Agent;
- registro auditado de relatórios de agente em `project-state/agent-reports.json`;
- formulário **Registrar relatório do Claude** na aba Agentes;
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

`operacional`

A primeira versão visual foi criada como **Titan Mapper** e evoluiu para **Titan Command Center**:

- página oficial: `/command-center`;
- atalho/compatibilidade: `/mapper`;
- atalho de login: `/login`;
- arquivo: `public/mapper.html`;
- API de leitura: `GET /api/mapper/state`;
- API de IA do Command: `POST /api/mapper/ai`;
- API do Titan Local Agent: `POST /api/mapper/local-agent/poll` e `POST /api/mapper/local-agent/report`;
- API de ações auditadas: `POST /api/mapper/action`;
- API de autenticação: `/api/titan/auth/*`;
- acesso: restrito a sessão Titan Tools com permissão adequada e a host técnico autorizado;
- fonte: arquivos permitidos de `project-state/` com overlay de `titan_command_actions`.

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

## Ações auditadas

A aba **Execução** permite, para usuários com `editar_project_state` ou `acesso_total`:

- criar tarefa;
- atualizar tarefa;
- criar risco;
- criar decisão.

A aba **Agentes** permite registrar relatório do Claude:

- missão ativa vem de `project-state/agent-bridge.json`;
- relatório é salvo em `project-state/agent-reports.json`;
- ação auditada: `create_agent_report`;
- o relatório não altera código, banco operacional ou deploy sozinho.

A mesma aba possui o **Console IA do Command**:

- seleciona uma missão ativa do Agent Bridge;
- envia um prompt para o provedor de IA configurado por variável de ambiente;
- retorna a resposta na própria tela;
- permite preencher o relatório do agente com a resposta;
- exige revisão humana antes de registrar o relatório.

Configuração segura:

- `TITAN_ANTHROPIC_API_KEY` ou `ANTHROPIC_API_KEY` para Claude/Anthropic;
- `TITAN_OPENAI_API_KEY` ou `OPENAI_API_KEY` para OpenAI;
- `TITAN_AI_PROVIDER=anthropic|openai|auto`;
- `TITAN_AI_MODEL` opcional para escolher o modelo.

Regras do Console IA:

- rota: `POST /api/mapper/ai`;
- exige host técnico e sessão Titan Tools;
- exige permissão `editar_project_state`;
- a chave nunca aparece na API nem na UI;
- prompts que parecem conter senha, token, chave ou certificado são bloqueados;
- o prompt completo não é salvo automaticamente;
- o envio gera auditoria com metadados em `command-audit-log.json` e `titan_command_actions`;
- a resposta só entra em `agent-reports.json` após clique humano em **Registrar relatório no Command**.

A aba **Agentes** também possui a ponte **Codex Local / PC Thiago**.

Ela permite:

- criar uma tarefa local aprovada no Command;
- escolher ação permitida;
- deixar o script `scripts/titan-local-agent.mjs` no PC buscar e executar essa ação;
- receber status/log de volta na fila local.

Ações permitidas na V1:

- `codex_handoff`;
- `claude_handoff`;
- `git_status`;
- `project_checks`;
- `open_command_center`.

Regras do Titan Local Agent:

- criação de tarefa usa `POST /api/mapper/action` com `action=create_local_agent_task`;
- busca usa `POST /api/mapper/local-agent/poll`;
- retorno usa `POST /api/mapper/local-agent/report`;
- `poll` e `report` exigem bearer token configurado por `TITAN_LOCAL_AGENT_TOKEN` ou `TITAN_LOCAL_AGENT_TOKEN_SHA256`;
- a V1 não executa comando livre enviado pelo navegador;
- commit, push, deploy, deletes e ações destrutivas ficam fora da V1;
- guia operacional: `docs/GUIA-TITAN-LOCAL-AGENT.md`.

A aba **Deploys** permite registrar plano/resultado de deploy:

- planejado;
- pronto para deploy;
- concluído;
- falhou.

Também permite registrar aprovação humana:

- aprovado para deploy;
- validado pós-deploy;
- reprovado;
- rollback necessário.

Para gravar aprovação, o usuário precisa digitar `AUTORIZO DEPLOY`.

Também existe a ação `trigger_deploy_external`, que aciona um executor externo de deploy somente quando:

- o usuário possui `acionar_deploy`;
- o deploy já tem aprovação humana;
- o status está `aprovado_para_deploy` ou `validado_pos_deploy`;
- a confirmação digitada é `ACIONAR DEPLOY`;
- a variável segura `TITAN_DEPLOY_WEBHOOK_URL` ou `EASYPANEL_DEPLOY_WEBHOOK_URL` está configurada no ambiente do serviço.

A URL do executor nunca é exposta em API, UI, documentação ou `project-state`.

Cada ação:

- grava somente arquivos permitidos de `project-state`;
- registra auditoria em `project-state/command-audit-log.json`;
- tenta persistir o mesmo evento em `titan_command_actions`;
- é reaplicada por `GET /api/mapper/state` como overlay sobre o estado versionado.

Limite consciente:

- o Command Center não altera código sozinho;
- o registro de deploy não aciona EasyPanel automaticamente;
- a aprovação humana não aciona EasyPanel automaticamente;
- o executor externo só aciona deploy se a variável segura existir no ambiente;
- Git continua sendo a trilha definitiva para código, documentação versionada e deploy;
- PR/commit/deploy acionados pelo Command dependem de confirmação humana e executor externo configurado.

## Regra operacional entre agentes

- Thiago define prioridade e aprova fluxo operacional.
- Codex implementa código, interface, testes, documentação, PR e deploy.
- Claude avalia regra, calcula impacto, aponta lacunas, revisa e recomenda a melhor ordem de execução.
- O briefing para Claude deve ser copiado da aba **Agentes** do Command Center ou lido em `project-state/agent-bridge.json`.
- O retorno do Claude deve ser registrado em **Agentes → Registrar relatório do Claude**.
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
- mostra missões ativas do Agent Bridge;
- permite registrar relatório do Claude como ação auditada do Command;
- mostra visão dedicada do estoque;
- mostra aba de acessos para usuários com permissão;
- permite criar tarefa, risco, decisão e atualizar tarefa com auditoria;
- permite registrar deploy planejado/concluído/falho sem acionar implantação automática;
- permite registrar aprovação/validação humana de deploy com frase obrigatória;
- permite acionar executor externo de deploy com permissão própria, frase obrigatória e variável segura;
- persiste ações vivas em `titan_command_actions`;
- possui filtros por módulo/status/ferramenta;
- não expõe secrets;
- exige sessão Titan Tools para dados internos;
- exige host técnico autorizado.
