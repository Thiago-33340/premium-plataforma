# 🔍 Auditoria de Duplicação — Khardela x Plataforma nova

**Pergunta:** o painel administrativo novo deve ser separado dos dashboards do Khardela ou unificado? Onde estamos repetindo?
**Veredito:** **UNIFICAR.** A plataforma nova reimplementou 6 coisas que o Khardela já tinha. Ela deve ser **parte do Khardela** (mesmo banco `titan_khardela`, schema `khardela`), com **um painel só e visões por papel (RBAC)** — não um produto à parte.

---

## O que já existe no Khardela (fonte canônica: banco `titan_khardela`, schema `khardela`)

- **RBAC:** tabela `rbac_contacts` com 5 perfis (`GESTOR, CHEFE_COZINHA, OPERADOR_ATENDIMENTO, ENTREGADOR, COLABORADOR`), `perfis_adicionais[]`, `setores_permitidos`, `apelido_login` (já feito pra login de painel). Seed real dos sócios/operadora. Matriz de permissões em `PLANO-Operacional-RBAC-v2.md`.
- **Cardápio canônico:** `menu_categorias`, `menu_items` (com `status`, `codigo_saipos`, `codigo_dd`, `ingredientes` JSONB, preços, promoção), `menu_promocoes`. Já populado com o cardápio v4 da Premium. Ligado ao `manual_montagem` (receitas → CMV).
- **Disponibilidade ATIVO/EM_FALTA/OCULTO:** é `menu_items.status` no Postgres (+ `status_by`, `status_motivo`). Já operado via WhatsApp (Gestão Operacional v4/v5). Redis é só cache.
- **Tenant/planos:** tabela `tenants` + sistema de feature-flags (ESSENCIAL/PRO/PREMIUM). Premium = PRO/TRIAL. Mesa/QR já catalogado como feature.
- **Dashboards/painéis (planejados/iniciados):** `dashboard.html` (MVP construído); Portal do Cliente PJ com `/configuracoes (cardápio, horários, equipe)`, `/pedidos`, `/plano`; e um **Painel Operacional web** (kanban + login RBAC + fila de alertas) já especificado em `ANALISE-Arquitetural-7-Decisoes.md` §7.
- **Estoque/CMV** e **gestão operacional** (alertas, solicitações, prazos, turno) — tabelas e workflows já existentes.

## As 6 duplicações (novo x existente)

| # | O novo criou | Já existia | Deve prevalecer |
|---|---|---|---|
| a | `premium.usuarios` (admin/operador/garcom) | `rbac_contacts` (5 perfis + apelido_login) | **rbac_contacts** (+ perfil GARCOM) |
| b | lê cardápio de `cardapio.json` estático | `menu_items` no Postgres (cardápio canônico) | **menu_items** |
| c | `premium.produtos.status` (3 estados) | `menu_items.status` (3 estados) + WhatsApp | **menu_items.status** |
| d | schema `premium` (banco `premium`) | schema `khardela` (banco `titan_khardela`), multi-tenant | **khardela** |
| e | `/admin` + `/gestor` novos | Portal `/configuracoes` + Painel Operacional planejados | **materializar os do Khardela** |
| f | `premium.config` (1 loja) | `tenants.config` + planos (multi-tenant) | **tenants/planos** |

## Recomendação concreta de conexão
- **Mesmo banco:** `titan_khardela` / schema `khardela`. Aposentar o schema `premium` separado.
- **Pedidos/clientes:** migrar pra `khardela.orders` / `khardela.customers` com `tenant_id='khardela:premiumpizzas:sjrp'`.
- **Usuários:** um cadastro só — `rbac_contacts` (+ `senha_hash`, login por `apelido_login`, novo perfil `GARCOM`).
- **Cardápio:** fonte única `menu_items` (loja e admin leem/escrevem aí). Categoria "Copos" = `menu_items` com flag `gratuito`. Aposentar `cardapio.json`.
- **Disponibilidade:** `/gestor` muda `menu_items.status` — mesma coluna do WhatsApp. Sincronizado por construção.
- **Genuinamente novo (criar no schema khardela, com tenant_id):** `mesas`, `comandas`, `caixa`, `entregadores`/roteirização, e os fluxos por coluna de mesa.

## Riscos de manter separado
1. Dois cadastros de usuário (painel vs WhatsApp) divergem.
2. Dois cardápios divergentes (preço/itens) — quebra a Jessica e o CMV.
3. Dois lugares pra marcar "em falta" — cliente pede item pausado pelo outro canal.
4. Dois bancos single vs multi-tenant — trava a escala SaaS (2º cliente exigiria clonar tudo).
5. Pedidos/clientes em silos — dashboard e fidelidade cegos pra metade da operação.
6. Planos/feature-flags ignorados — some o controle comercial (upsell, suspensão, limites).
