> ⚠️ **SUPERADO / ARQUIVADO** (2026-06-19). Não seguir este documento. O plano canônico
> vigente é `docs-titan/PLAN-ESTOQUE.md` (6 itens). Mantido só como referência histórica.

# Plano Técnico — App de Estoque Premium RP (Titan)

> Baseado 100% na especificação `especificacao_estoque_premium_titan.yaml` (2166 linhas, lida por completo) + na base atual `premium.titanatende.com.br/estoque`. Nada aqui é codado ainda — é o plano para você aprovar.

## 0. Validação do YAML e inconsistências que já detectei (avisando, conforme a regra)
Escopo entendido: 15 módulos, 23 tabelas sugeridas, 93 produtos, 9 categorias, 12 fornecedores, critérios de aceite. Regras inegociáveis confirmadas: lista de compras inteligente central; mapa comparativo de **todos** os fornecedores; contagem aceita **0**; fornecedor é **cadastro único** + visitas históricas; tudo registra usuário/data/hora/antes-depois/histórico; Jéssica lê o banco respeitando permissões.

Pontos de atenção nos dados (não vou simplificar sem avisar — estou avisando):
- Vários produtos têm `media/menor/maior_quantidade_a_comprar` absurdos (ex.: Bacon maior = -19419; Calabresa -12349; Muçarela -14837). É lixo de cálculo do histórico. **Importo como legado mas NÃO uso esses agregados em nenhuma lógica.** Campos confiáveis: nome, categoria, unidade, ideal, fornecedor, última contagem.
- A planilha tem **quantidades, não preços**. Então `último/maior/menor/médio valor pago` começam **vazios** e são preenchidos a partir de Compras e Visitas. O "maior valor já pago" aparece assim que houver a 1ª compra.
- Setores no YAML = Borda/Montagem/Finalização/Recepção (a base atual usa Borda/Montagem/Finalização/Geral/Caixas). Alinho para os do YAML, editáveis.
- 93 produtos únicos (1 legado fora da última aba). Importo os 93.

## 1. Tabelas — criar/ajustar (sobre o schema `khardela` existente, multi-tenant)
**Ajustar (já existem):**
- `estoque_itens_definicao` → base de **products**: + subcategoria, estoque_atual, marca_preferida, última_marca, último/maior/menor/médio_valor, fornecedor_preferido/último, pode_ser_contado/comprado/produzido, observacoes, ativo. (já tem nome/unidade/mín/ideal/setor/categoria/custo)
- `estoque_contagens` + `estoque_itens` → **stock_counts / stock_count_items**: + status_auditoria, obrigatório por item, status_item (contado/pendente/ignorado).
- `estoque_movimentos` → **inventory_movements**: + quantidade_antes e quantidade_depois (hoje só grava a movimentada).
- `rbac_contacts` → **users**: já tem PIN/perfil/setores; ligo a permissões granulares.

**Criar:** `categories` (9 obrigatórias, editáveis) · `units` · `suppliers` (cadastro único) · `product_suppliers` (produto×fornecedor: preferencial/alternativo, marca, valores, frequência, última visita) · `supplier_visits` + `supplier_visit_items` · `count_audits` · `purchases` + `purchase_items` · `produced_items` + `production_recipes` + `production_runs` · `shopping_lists` + `shopping_list_items` · `user_permissions` · `notifications` · `whatsapp_messages` · `titan_order_events` + `integration_logs` · `auto_lists_schedules`. → cobre as 23 do YAML.

Toda `inventory_movement` grava: data_hora, produto, qtd_antes, qtd_movimentada, qtd_depois, origem, usuário, motivo, observação. **Nenhum histórico é apagado em updates.**

## 2. Telas — criar/ajustar
**Ajustar:** Login/permissões (modal próprio, sem prompt) · Contagem por setor (aceitar 0, obrigatoriedade configurável, status por item, multi-setor) · Dashboard "Estoque Premium RP" (10 indicadores + últimas compras + últimas contagens).
**Criar:** Produtos & Categorias (CRUD rico + filtros) · Fornecedores · Visita a Fornecedor (cronometrada) · Mapa Comparativo de Fornecedores · Lista de Compras Inteligente (autocomplete + colar lista + rota) · Auditoria de Contagem · Compras & Lançamentos (manual + conferência foto-nota) · Produção Interna (ficha técnica + lançamento) · Minha Conta (trocar senha) · Configurações (setores, itens obrigatórios por setor, permissões, integrações).

## 3. Ordem dos fluxos (o que primeiro)
- **Fase A — Fundação:** banco + importação dos 93 produtos + login/permissões reais + Produtos/Categorias/Fornecedores + Contagem (0 válido) + Auditoria + Dashboard. (ciclo operacional básico funcionando)
- **Fase B — Compras/Fornecedores:** Visita a Fornecedor + Mapa Comparativo + Compras/histórico de valores + movimentações antes/depois.
- **Fase C — Inteligência:** Lista de Compras Inteligente (autocomplete + colar) + Produção Interna + listas automáticas por período.
- **Fase D — Integração:** baixa automática Titan por pedido (via ficha técnica) + WhatsApp/Jéssica consultando o banco.
Cada fase = deploy real e testável no celular.

## 4. Dependências externas (preciso que você forneça)
- **PostgreSQL/tenant:** confirmar se uso o mesmo `titan_khardela` e qual `tenant_id`/loja é a unidade RP.
- **WhatsApp API:** número + provedor (Meta Cloud / Z-API?) + credenciais.
- **OCR/IA nota fiscal:** qual ferramenta, se quiser foto-nota já nesta entrega (senão, deixo plugável).
- **Integração Titan (baixa por pedido):** depende da **ficha técnica** dos produtos vendidos — que hoje está zerada. Preparo a estrutura; ligo quando a ficha existir.
- **Jéssica:** reuso o agente n8n atual, apontando a tool de consulta para os endpoints novos do estoque.
- **Identidade:** logos da pasta `Logo Premium` (preto/laranja/branco).

## 5. Reaproveitável da base atual
- Schema `khardela` + Pool/migrações (`db.js`) + server zero-framework (`server-pg.js`) — só adiciono rotas `/api/estoque/*`.
- Tabelas `estoque_itens_definicao / estoque_contagens / estoque_itens / estoque_movimentos` (estendo, não recrio).
- `rbac_contacts` + login PIN + `setores_permitidos` (base de usuários/permissões).
- `/api/admin/setores` + aba Estoque do admin (gestão de itens por setor).
- Tela `/estoque` atual (contagem) como ponto de partida + o **design system novo** (dark, modais próprios, mobile) do admin já reformulado.
- Deploy autônomo já montado (`deploy-premium.ps1` + webhook Easypanel).

## 6. Riscos
- **Dados históricos sujos** (agregados de compra absurdos) → mitigado importando só campos confiáveis.
- **Sem preços na planilha** → histórico de valor/CMV começa vazio.
- **Lista inteligente (NLP do colar)** → "mussarela 20kg" exige normalização + fuzzy match; faço com dicionário de sinônimos + confiança + correção manual (IA externa é opcional, melhora).
- **Baixa automática Titan** depende de ficha técnica hoje zerada → preparo a estrutura, ligo depois.
- **WhatsApp (Meta)** → disparo ativo exige template/opt-in; risco de bloqueio se mal configurado.
- **Multi-loja:** se a Premium tem várias lojas, estoque é por loja → confirmar isolamento da RP.
- **Escopo grande** → entrega em fases, nada estático.

## Decisões que preciso de você antes de começar
1. O estoque é da **unidade RP especificamente** (uma loja) ou compartilhado entre lojas? Define o isolamento por loja.
2. WhatsApp e OCR de nota: já nesta rodada, ou deixo plugável para depois?
3. Posso **recriar** a tela `/estoque` atual (mantendo os dados), ou ela precisa ficar intacta?
