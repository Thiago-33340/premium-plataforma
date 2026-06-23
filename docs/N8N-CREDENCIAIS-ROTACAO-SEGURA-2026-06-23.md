# n8n — migração de credenciais, rotação segura e queue mode

Data: 2026-06-23  
Autor: Codex  
Escopo: Titan Khardela / Jessica / Premium Pizzas

## Objetivo

Remover tokens e senhas hardcoded dos workflows sem quebrar integrações renováveis, sem perder credenciais existentes e sem deixar a Jessica fora do ar.

## Regra principal

Não trocar tudo de uma vez. Cada credencial deve passar por quatro passos:

1. Criar credencial/variável nova.
2. Alterar apenas um workflow ou um node para usar a credencial nova.
3. Testar em execução controlada.
4. Só depois rotacionar/revogar o valor antigo.

## Onde estão os riscos hoje

Foram encontrados valores sensíveis inline em workflows relacionados a:

- Meta Graph API / WhatsApp Cloud API.
- Saipos.
- Delivery Direto.
- Health Check.
- Rotinas pré-turno/início de turno.
- Gestão operacional.
- Workflows dev antigos de cadastro/atualização de webhooks.

Os valores não são registrados neste documento.

## Estratégia por integração

### Meta / WhatsApp Cloud API

Tipo recomendado no n8n:

- Credencial HTTP Header Auth, ou variável de ambiente no serviço n8n.

Nome sugerido:

- `META_WABA_PREMIUM_SJRP`

Variáveis sugeridas:

- `META_PREMIUM_PHONE_NUMBER_ID`
- `META_PREMIUM_ACCESS_TOKEN`
- `META_PREMIUM_VERIFY_TOKEN`

Migração segura:

1. Criar novo token permanente de System User no Meta Business.
2. Criar credencial nova no n8n sem apagar a antiga.
3. Trocar primeiro o Health Check ou workflow menos crítico.
4. Validar chamada `GET /{phone-number-id}`.
5. Trocar envio da Jessica.
6. Observar status no webhook Meta.
7. Revogar token antigo somente depois da validação.

Observação:

- Mensagens proativas fora da janela de 24h precisam de template aprovado. Credencial correta não resolve erro de reengajamento.

### Saipos

Tipo recomendado:

- Variáveis de ambiente ou credencial HTTP/body protegida.

Variáveis sugeridas:

- `SAIPOS_PREMIUM_ID_PARTNER`
- `SAIPOS_PREMIUM_SECRET`
- `SAIPOS_PREMIUM_STORE_ID`

Migração segura:

1. Criar variáveis no ambiente n8n.
2. Trocar apenas o node de autenticação em clone/staging ou em fluxo novo.
3. Rodar teste pinado sem criar pedido real.
4. Rodar um pedido controlado em homologação/sandbox.
5. Só depois trocar o fluxo principal.

Importante:

- Credenciais Saipos podem ser renováveis. Nunca revogar a antiga antes de confirmar que o novo token autentica e cria pedido.

### Delivery Direto

Tipo recomendado:

- Variáveis de ambiente para client id/secret/store id/username/password.

Variáveis sugeridas:

- `DD_PREMIUM_CLIENT_ID`
- `DD_PREMIUM_CLIENT_SECRET`
- `DD_PREMIUM_STORE_ID`
- `DD_PREMIUM_USERNAME`
- `DD_PREMIUM_PASSWORD`

Migração segura:

1. Criar variáveis novas.
2. Atualizar primeiro workflow dev de autenticação/listagem.
3. Confirmar `GET /admin-api/v1/webhooks`.
4. Atualizar receiver e cadastro de webhooks.
5. Rotacionar segredo antigo.

Obrigatório:

- O receiver precisa validar `X-DeliveryDireto-Signature` e bloquear payload inválido.

## Como evitar quebrar credenciais renováveis

Credencial renovável normalmente tem duas camadas:

- segredo fixo de aplicação;
- token curto gerado por autenticação.

O que deve ser guardado em credencial/variável:

- segredo fixo;
- client id;
- usuário técnico;
- senha técnica;
- store id;
- phone number id.

O que não deve ser salvo como fixo:

- access token curto quando ele é renovado por workflow;
- resposta completa de auth;
- token temporário em logs.

Padrão correto:

1. Workflow lê segredo fixo seguro.
2. Workflow autentica.
3. Workflow usa token curto só naquela execução.
4. Se cachear token, usar Redis com TTL menor que a expiração real.

## Plano de rotação sem downtime

1. Inventariar todos os workflows que usam a credencial antiga.
2. Criar credencial nova com nome versionado, exemplo `SAIPOS_PREMIUM_V2`.
3. Trocar um workflow canário.
4. Testar.
5. Trocar workflows restantes.
6. Manter antiga por 24h apenas como rollback.
7. Revogar antiga.
8. Registrar no Command: data, workflow, responsável e resultado.

## Queue mode no n8n

Queue mode é viável, mas não deve ser ativado sem confirmar o banco atual do n8n.

Pré-requisitos:

- n8n usando Postgres como banco principal.
- Redis dedicado para BullMQ/fila.
- `N8N_ENCRYPTION_KEY` fixo e igual no main e nos workers.
- Backup antes de qualquer mudança se hoje estiver usando SQLite.

Variáveis principais:

```txt
EXECUTIONS_MODE=queue
QUEUE_BULL_REDIS_HOST=titan-bullmq-redis
QUEUE_BULL_REDIS_PORT=6379
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=titan-postgres
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=n8n_db
DB_POSTGRESDB_USER=n8n_user
DB_POSTGRESDB_PASSWORD=<configurar no EasyPanel, não registrar no repo>
N8N_ENCRYPTION_KEY=<mesma chave em todos os serviços, não registrar no repo>
```

Workers:

```txt
n8n worker --concurrency=5
```

Recomendação inicial:

- 1 main.
- 2 workers ativos.
- 1 worker standby com concurrency 1 ou parado para emergência.

Bloqueio atual:

- Antes de executar no EasyPanel, confirmar se o n8n já usa Postgres ou se ainda usa SQLite.
- Confirmar/definir `N8N_ENCRYPTION_KEY`.
- Fazer backup do banco/volume atual do n8n.

Sem essas três confirmações, ativar queue mode pode derrubar credenciais ou ocultar workflows existentes.
