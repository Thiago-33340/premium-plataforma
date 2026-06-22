# 🪨 Decisão arquitetural — Disponibilidade com fonte única (a rocha)

**Princípio:** UMA fonte da verdade. Estado nunca vive em dois lugares "soltos". Dados duráveis no Postgres; Redis é só cache derivado. Toda escrita passa por um contrato único. Assim, pausar/liberar um item em qualquer canal reflete em **todos**: Jéssica (WhatsApp), site do cliente, mesas e balcão do operador.

---

## 1. Onde mora cada coisa
- **Verdade (durável):** `menu_items.status` no Postgres (`titan_khardela` / schema `khardela`), com `status_ts`, `status_by`, `status_motivo`. Valores: `ATIVO | EM_FALTA | OCULTO`.
- **Cache (rápido, descartável):** Redis `estados:option:{tenant}` — uma **projeção** da verdade, reescrita a cada mudança. Serve o caminho quente do WhatsApp. Se o Redis cair/limpar, é reconstruído do Postgres — nunca se perde informação.
- **Dados do cardápio** (nomes, preços, ingredientes, categorias): `menu_items` / `menu_categorias` (canônico). O Saipos/DD são só códigos de mapeamento (`codigo_saipos`, `codigo_dd`), não fonte.

## 2. Contrato único de escrita — `setDisponibilidade`
Qualquer um que pause/libere um item executa SEMPRE os dois passos, nesta ordem, de forma atômica:
1. `UPDATE menu_items SET status=$novo, status_ts=NOW(), status_by=$quem, status_motivo=$motivo WHERE tenant_id=$t AND (id=$cod OR codigo_saipos=$cod OR codigo_dd=$cod)` — **a verdade**.
2. Reescreve a chave de cache Redis `estados:option:{tenant}` a partir do estado atual do Postgres — **o cache**.

Escritores que usam esse contrato (mesma semântica, documentada, sem lógica divergente):
- **Jéssica / Gestão Operacional v5** (WhatsApp).
- **Painel do operador** (pausa manual, "cardápio disponível").
- **Balcão / mesas** (herdam por leitura — não escrevem disponibilidade, só consultam).

> Cada sistema continua independente (se a plataforma cair, a Jéssica ainda pausa; se a Jéssica cair, o operador ainda pausa) — mas ambos seguem o mesmo contrato e gravam a mesma verdade.

## 3. Leitura
- **Site do cliente, mesas, balcão (plataforma):** leem `menu_items` (verdade) direto do Postgres — com índice, é rápido e sempre correto.
- **Jéssica (WhatsApp, alto volume):** pode ler o cache Redis `estados:option:{tenant}` — **garantidamente em sincronia** porque toda escrita reescreve o cache. (Evolução opcional: ler direto do Postgres se a latência permitir.)
- **Regra de exibição dos 3 estados** (igual em todos): `ATIVO` = normal e pedível; `EM_FALTA` = aparece, mas **bloqueado** ("indisponível hoje"), não pedível; `OCULTO` = não aparece.

## 4. Por que isso é "a rocha"
- **Sem divergência possível:** existe só uma verdade. O cache nunca é fonte; é reconstruível.
- **Durável:** sobrevive a queda de Redis, reinício de serviço, e a troca futura de Saipos/DD/iFood (que viram só códigos de mapeamento).
- **Multi-tenant:** tudo por `tenant_id` — escala pro 2º cliente sem reescrever.
- **Auditável:** `status_by` + `status_ts` + `status_motivo` registram quem pausou, quando e por quê.

## 5. Ordem de execução (fundação primeiro)
1. **Garantir `menu_items` populado no Postgres ao vivo** (os 35 sabores + bebidas + bordas/adicionais). Se faltar, aplicar o import do cardápio v4. *(Sem a verdade no banco, nada do resto se firma.)*
2. **Plataforma:** ler `status` de `menu_items`; apps tratam os 3 estados; operador pausando grava pelo contrato (Postgres + cache).
3. **Gestão Operacional v5:** adicionar o passo Postgres (escrever `menu_items.status`) ao lado do Redis — passando a seguir o contrato. Testar com cuidado (produção).
4. **Conferir o caminho de leitura da Jéssica** (cache sempre fresco) e a regra dos 3 estados.
5. **Documentar o contrato** no código dos dois lados pra nunca divergir.

## 6. Princípios gerais (valem pra todo o produto)
- Uma fonte da verdade por dado; cache é sempre derivável.
- Multi-tenant por `tenant_id` desde o início.
- Migrações aditivas e idempotentes (nada destrutivo no que está no ar).
- Operações de escrita idempotentes onde fizer sentido.
- Testar antes de subir; nada de "subir mal acabado pra ver funcionando".
- Separar dados (Postgres) de cache (Redis) de fila (Redis/queue) com fronteiras claras.
