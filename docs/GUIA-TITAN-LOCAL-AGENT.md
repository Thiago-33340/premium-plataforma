# Guia — Titan Local Agent

O **Titan Local Agent** é a ponte segura entre o Command Center e o PC local do Thiago.

Ele permite comandar pelo `tools.titanatende.com.br/command-center` e fazer o PC local buscar tarefas aprovadas.

## O que a V1 faz

Ações permitidas:

- `codex_handoff`: cria um arquivo `.md` no inbox local para abrir/colar no Codex.
- `claude_handoff`: cria um arquivo `.md` no inbox local para abrir/colar no Claude Code.
- `git_status`: executa `git status --short` e `git rev-parse --short HEAD`.
- `project_checks`: executa `node --check server-pg.js` e `node scripts/check-project-state.mjs`.
- `open_command_center`: abre o Command Center no navegador padrão.

## O que a V1 não faz

- Não executa comando livre vindo do navegador.
- Não lê `.env`, chaves, certificados, bancos locais ou arquivos sensíveis.
- Não faz commit.
- Não faz push.
- Não faz deploy.
- Não apaga arquivos.
- Não altera código automaticamente.

Essas ações podem virar V2/V3, mas precisam de confirmação humana e permissões próprias.

## Variáveis no EasyPanel

Configure no serviço do Titan:

```txt
TITAN_LOCAL_AGENT_TOKEN_SHA256=<hash-do-token>
```

Alternativa menos ideal:

```txt
TITAN_LOCAL_AGENT_TOKEN=<token-bruto>
```

Preferir `TITAN_LOCAL_AGENT_TOKEN_SHA256`, porque o servidor só guarda o verificador, não o token bruto.

## Gerar token no PC

No PowerShell, dentro da pasta do projeto:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copie o token gerado e guarde localmente.

Para gerar o hash que vai no EasyPanel:

```powershell
node -e "const t=process.argv[1]; console.log(require('crypto').createHash('sha256').update(t).digest('hex'))" "COLE_O_TOKEN_AQUI"
```

## Rodar no PC

No PowerShell:

```powershell
$env:TITAN_COMMAND_URL="https://tools.titanatende.com.br"
$env:TITAN_LOCAL_AGENT_ID="thiago-windows-codex"
$env:TITAN_WORKSPACE="C:\Users\Thiago Ribeiro\Titan\workspace\premium-plataforma-setores"
$env:TITAN_LOCAL_AGENT_TOKEN="COLE_O_TOKEN_AQUI"

npm run local-agent -- --once
```

Para deixar rodando:

```powershell
npm run local-agent
```

## Onde os handoffs ficam

Codex:

```txt
.agents/titan-local-agent/codex/
```

Claude Code:

```txt
.agents/titan-local-agent/claude-code/
```

## Fluxo pelo Command

1. Abra `https://tools.titanatende.com.br/command-center`.
2. Entre na aba **Agentes**.
3. Use o card **Codex Local / PC Thiago**.
4. Escolha o agente local.
5. Escolha a ação.
6. Escreva título e briefing.
7. Clique em **Enviar para agente local**.
8. O script no PC busca a tarefa, executa a ação permitida e devolve o status.

## Segurança

- O token nunca deve ir para Git, docs, prints ou chat.
- Se desconfiar que o token vazou, gere outro e troque o hash no EasyPanel.
- Não rode o agente fora do workspace do Titan.
- A V1 é propositalmente limitada para evitar abrir uma porta remota perigosa no PC.
