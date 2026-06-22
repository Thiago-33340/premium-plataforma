# Módulo — Infraestrutura e deploy

## Objetivo

Garantir que GitHub, EasyPanel, Docker, banco e deploys tenham registro confiável e auditável.

## Arquivos principais

- `Dockerfile`
- `package.json`
- `DEPLOY-EASYPANEL.md`
- `project-state/services.json`
- `project-state/containers.json`
- `project-state/deploys.json`

## Status atual

`parcial / em andamento`

O código tem Dockerfile e estrutura de deploy. Em 2026-06-22 foi confirmado que produção roda no EasyPanel, projeto `mayaproject`, app `github`, com deploy da branch `main`.

## Pendências

- Registrar variáveis apenas por nome/finalidade.
- Criar checklist de rollback.
- Padronizar consulta de logs sem expor secrets.

## Informações confirmadas

- EasyPanel projeto: `mayaproject`
- EasyPanel app: `github`
- branch: `main`
- domínios: `premium.titanatende.com.br`, `pedido.titanatende.com.br`
- deploy manual: botão `Implantar`
- último deploy registrado: `project-state/deploys.json`

## Checklist mínimo de deploy

1. Confirmar branch.
2. Confirmar arquivos alterados.
3. Rodar validações.
4. Fazer deploy.
5. Validar health.
6. Validar tela crítica.
7. Registrar em `project-state/deploys.json`.

## Critério de pronto

- qualquer pessoa autorizada consegue entender o que está online;
- deploy tem histórico;
- rollback está documentado;
- variáveis são rastreáveis por nome, sem expor valor.
