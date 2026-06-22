# Titan Khardela — Operação

Este documento define a rotina mínima para manter o Titan governável.

## Rotina diária recomendada

1. Abrir `project-state/weekly-focus.json`.
2. Verificar `project-state/tasks.json`.
3. Verificar riscos críticos em `project-state/risks.json`.
4. Escolher no máximo 3 prioridades do dia.
5. Atualizar status após mudanças relevantes.

## Rotina antes de alterar código

1. Ler o módulo afetado.
2. Conferir rotas e tabelas relacionadas.
3. Verificar riscos.
4. Criar plano curto.
5. Implementar mudança limitada.
6. Validar proporcionalmente ao risco.
7. Atualizar documentação se mudar comportamento.

## Rotina antes de deploy

1. Verificar branch.
2. Verificar status Git.
3. Rodar validações sintáticas.
4. Rodar smoke tests disponíveis.
5. Conferir variáveis por nome, sem expor valor.
6. Fazer deploy.
7. Validar `/api/health`.
8. Rodar smoke read-only e salvar em `project-state/health-checks.json`.
9. Registrar deploy em `project-state/deploys.json`.

## Regra de ouro

Nada importante deve ficar apenas na memória de Thiago, do Codex, do Claude ou de um chat. Se afeta operação, deve virar documentação ou estado.

## Registro operacional — RBAC e contagem

Em 2026-06-21 foi corrigido um problema de acesso na contagem do estoque Premium.

O sintoma era: colaboradores tinham permissão para acessar/fazer contagem, mas a API `GET /api/est/meus-itens?usuario_id=...` retornava zero itens.

A causa era mistura entre dois modelos de setor da base da Premium:

- Legado `estoque_itens_definicao`: usa IDs como `SET001`, `SET002`, `SET003`.
- Fluxo novo `/api/est/*`: usa `est_setor.id` numérico ou `est_setor.nome`.

Importante para o SaaS: setores de contagem não são fixos no Titan. Cada cliente/tenant deve criar seus próprios setores conforme a operação real. A Premium usa Borda, Montagem, Finalização, Recepção e Gerais; outros clientes podem usar qualquer organização.

Regra atual:

- O gestor cria/renomeia/desativa setores no painel de estoque.
- Produtos são vinculados aos setores do tenant.
- Colaboradores recebem `setores_permitidos` com `est_setor.id` do tenant ou `TUDO`.
- Novas atribuicoes de equipe devem oferecer apenas setores ativos; setores inativos podem aparecer apenas para preservar ou limpar vinculos antigos.
- IDs legados `SETxxx` não devem ser usados em novas configurações do fluxo `/api/est`.

De/para específico da Premium, validado em produção em 2026-06-21:

| Legado | Fluxo novo |
|---|---|
| `SET001` | `1` / Borda |
| `SET002` | `2` / Montagem |
| `SET003` | `3` / Finalização |
| `SET004` | `5` / Gerais |
| `SET005` | legado Caixas; avaliar antes de migrar |

Alterações aplicadas:

- Thiago Ribeiro: `perfil_principal` alterado para `GESTOR`, com `setores_permitidos: ["TUDO"]`.
- Evandro: desativado com `ativo=false`, preservando histórico/auditoria.
- Cristina: `setores_permitidos` de `SET002` para `["2"]`.
- Dany: `setores_permitidos` de `SET001` para `["1"]`.
- Geane: `setores_permitidos` de `SET003` para `["3"]`.
- Maria: `setores_permitidos` de `SET002` para `["2"]`.

Validação executada:

```bash
node scripts/rbac-audit.mjs --base-url=https://premium.titanatende.com.br --manager-id=57cd305a-a3ca-4a09-890b-b7fdac650ef5 --out=project-state/rbac-audit.json
```

Resultado final: Thiago, Cristina, Dany, Geane, Maria e Sophia passaram no auditor RBAC. O relatório atualizado fica em `project-state/rbac-audit.json`.
