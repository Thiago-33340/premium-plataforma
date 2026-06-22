# Titan Khardela — Infraestrutura

## Serviço principal

Serviço confirmado:

```text
EasyPanel projeto: mayaproject
EasyPanel app: github
```

Características:

- entrada: `server-pg.js`
- runtime: Node.js
- Dockerfile: `Dockerfile`
- porta exposta: `8080`
- banco inferido: PostgreSQL
- deploy real: GitHub `main` -> EasyPanel -> app `mayaproject/github`
- domínios confirmados: `premium.titanatende.com.br`, `pedido.titanatende.com.br`

## Arquivos relevantes

- `package.json`
- `Dockerfile`
- `DEPLOY-EASYPANEL.md`
- `server-pg.js`
- `db.js`

## EasyPanel

Fonte operacional confirmada em 2026-06-22:

- projeto: `mayaproject`
- app: `github`
- branch de produção: `main`
- deploy manual: botão `Implantar`
- último deploy registrado: `project-state/deploys.json`
- URLs públicas: `https://premium.titanatende.com.br`, `https://pedido.titanatende.com.br`

Ainda falta documentar:

- nomes de variáveis de ambiente por finalidade, nunca por valor;
- estratégia de rollback;
- rotina para consultar logs sem expor secrets.

## Regra de segurança

Não registrar valores de:

- senhas;
- tokens;
- `DATABASE_URL`;
- chaves;
- certificados;
- secrets de API.

Documentar apenas o nome da variável e sua finalidade.
