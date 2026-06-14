-- ============================================================================
-- TITAN KHARDELA — MODELO COMPLETO DE RESTAURANTE (genérico, multi-tenant)
-- ----------------------------------------------------------------------------
-- Banco: titan_khardela | Schema: khardela
-- Idempotente (CREATE/ALTER IF NOT EXISTS) e ADITIVO — não quebra o que já roda.
-- Genérico: serve pizzaria, hamburgueria, qualquer restaurante.
-- Desenhado pra a edição da Fase 3 ser simples: o admin mexe em
-- categorias -> produtos -> grupos de opções -> opções, e em
-- fichas técnicas -> preparos -> insumos -> custos -> estoque.
-- Uma fonte da verdade. Disponibilidade vive em opcoes.status / produtos.status.
-- ============================================================================
SET search_path TO khardela, public;

-- ============================================================
-- BLOCO A — CATÁLOGO (o que o cliente vê e pede)
-- ============================================================

-- A.1 CATEGORIAS já existe (menu_categorias). Garantir colunas genéricas.
ALTER TABLE menu_categorias ADD COLUMN IF NOT EXISTS imagem_url TEXT;
ALTER TABLE menu_categorias ADD COLUMN IF NOT EXISTS icone VARCHAR(40);

-- A.2 PRODUTOS — o item vendável que aparece numa categoria.
--   Ex: "Pizza Grande", "Coca-Cola 2L", "X-Burguer", "Copo".
--   tipo_montagem: SIMPLES (vende direto) | MONTAVEL (tem grupos de opções).
--   regra_preco: como o preço final é formado a partir das opções escolhidas.
CREATE TABLE IF NOT EXISTS produtos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria_id   INT REFERENCES menu_categorias(id),
  nome           TEXT NOT NULL,
  descricao      TEXT,
  tipo_montagem  VARCHAR(20) NOT NULL DEFAULT 'SIMPLES',  -- SIMPLES | MONTAVEL
  preco_base     NUMERIC(10,2) NOT NULL DEFAULT 0,        -- usado em SIMPLES; em MONTAVEL some das opções
  regra_preco    VARCHAR(20) NOT NULL DEFAULT 'SOMA',     -- SOMA | MAIOR | MEDIA | FIXO
  gratuito       BOOLEAN NOT NULL DEFAULT FALSE,          -- cortesia (ex: copos)
  imagem_url     TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'ATIVO',    -- ATIVO | EM_FALTA | OCULTO
  status_ts      TIMESTAMPTZ, status_by VARCHAR(20), status_motivo TEXT,
  codigo_externo VARCHAR(60),                             -- Saipos/DD/iFood (mapeamento, não fonte)
  ordem          INT DEFAULT 999,
  meta           JSONB NOT NULL DEFAULT '{}',
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prod_cat ON produtos(tenant_id, categoria_id, ordem);
CREATE INDEX IF NOT EXISTS idx_prod_status ON produtos(tenant_id, status) WHERE status <> 'OCULTO';

-- A.3 GRUPOS DE OPÇÕES — os "passos" de escolha de um produto montável.
--   Ex (Pizza Grande): "Estilo de borda" (1..1), "Sabores" (2..2, repete),
--   "Recheio da borda" (depende do estilo), "Adicionais" (0..N), "Extras".
--   min/max controlam quantas escolhas; condicao liga um grupo a outro.
CREATE TABLE IF NOT EXISTS opcao_grupos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id       UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  nome             TEXT NOT NULL,
  ordem            INT NOT NULL DEFAULT 1,
  min_escolhas     INT NOT NULL DEFAULT 0,
  max_escolhas     INT NOT NULL DEFAULT 1,
  permite_repeticao BOOLEAN NOT NULL DEFAULT FALSE,        -- repetir a mesma opção (2x mesmo sabor)
  regra_preco      VARCHAR(20) NOT NULL DEFAULT 'SOMA',    -- SOMA | MAIOR | MEDIA  (contribuição no preço)
  condicao         JSONB NOT NULL DEFAULT '{}',            -- {mostrar_se:{grupo:'Estilo de borda', diferente_de:'Sem borda'}}
  meta             JSONB NOT NULL DEFAULT '{}',
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grupo_prod ON opcao_grupos(produto_id, ordem);

-- A.4 OPÇÕES — as escolhas dentro de um grupo.
--   Ex: cada um dos 35 sabores; cada estilo/recheio de borda; cada adicional;
--   copo simples/gelo/limão (gratuito). DISPONIBILIDADE mora em status (fonte única).
CREATE TABLE IF NOT EXISTS opcoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grupo_id       UUID NOT NULL REFERENCES opcao_grupos(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  descricao      TEXT,
  preco          NUMERIC(10,2) NOT NULL DEFAULT 0,         -- delta de preço da opção
  status         VARCHAR(20) NOT NULL DEFAULT 'ATIVO',     -- ATIVO | EM_FALTA | OCULTO (a Jéssica/operador mexem aqui)
  status_ts      TIMESTAMPTZ, status_by VARCHAR(20), status_motivo TEXT,
  ingredientes   JSONB NOT NULL DEFAULT '[]',              -- p/ sabor: ["mussarela","calabresa"] (pausa por ingrediente + CMV)
  codigo_externo VARCHAR(60),                              -- Saipos/DD/iFood
  imagem_url     TEXT,
  ordem          INT DEFAULT 999,
  meta           JSONB NOT NULL DEFAULT '{}',
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_opcao_grupo ON opcoes(grupo_id, ordem);
CREATE INDEX IF NOT EXISTS idx_opcao_status ON opcoes(tenant_id, status) WHERE status <> 'OCULTO';
CREATE INDEX IF NOT EXISTS idx_opcao_ingredientes ON opcoes USING GIN(ingredientes);
CREATE INDEX IF NOT EXISTS idx_opcao_codext ON opcoes(tenant_id, codigo_externo);

-- A.5 PROMOÇÕES (menu_promocoes existe) + CUPONS de desconto.
CREATE TABLE IF NOT EXISTS cupons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  codigo         VARCHAR(40) NOT NULL,
  tipo           VARCHAR(20) NOT NULL DEFAULT 'ENTREGA_GRATIS', -- ENTREGA_GRATIS | PERCENTUAL | VALOR
  valor          NUMERIC(10,2) DEFAULT 0,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  validade       DATE,
  usos           INT NOT NULL DEFAULT 0,
  max_usos       INT,
  meta           JSONB NOT NULL DEFAULT '{}',
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, codigo)
);

-- ============================================================
-- BLOCO B — PRODUÇÃO (fichas técnicas, preparos)
-- ============================================================

-- B.1 INSUMOS = estoque_itens_definicao (existe). Garantir colunas de custo/unidade.
ALTER TABLE estoque_itens_definicao ADD COLUMN IF NOT EXISTS unidade_uso     VARCHAR(20);
ALTER TABLE estoque_itens_definicao ADD COLUMN IF NOT EXISTS unidade_compra  VARCHAR(20);
ALTER TABLE estoque_itens_definicao ADD COLUMN IF NOT EXISTS custo_compra    NUMERIC(12,4);
ALTER TABLE estoque_itens_definicao ADD COLUMN IF NOT EXISTS custo_por_uso   NUMERIC(12,6); -- custo na unidade de receita

-- B.2 PREPAROS BASE — sub-receitas (massa, molho) que rendem X e são feitas de insumos.
CREATE TABLE IF NOT EXISTS preparos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome                TEXT NOT NULL,
  rendimento          NUMERIC(12,3),
  unidade_rendimento  VARCHAR(20),
  fonte               TEXT,
  meta                JSONB NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, nome)
);
CREATE TABLE IF NOT EXISTS preparo_itens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  preparo_id    UUID NOT NULL REFERENCES preparos(id) ON DELETE CASCADE,
  insumo_nome   TEXT NOT NULL,
  insumo_id     VARCHAR(40),
  quantidade    NUMERIC(12,4),
  unidade       VARCHAR(20)
);

-- B.3 FICHA TÉCNICA / RECEITA = manual_montagem (existe: pizza×ingrediente).
--   Generalizar pra apontar pra opcao/produto/preparo (sem quebrar o que existe).
ALTER TABLE manual_montagem ADD COLUMN IF NOT EXISTS opcao_id   UUID;
ALTER TABLE manual_montagem ADD COLUMN IF NOT EXISTS produto_id UUID;
ALTER TABLE manual_montagem ADD COLUMN IF NOT EXISTS preparo_id UUID;
ALTER TABLE manual_montagem ADD COLUMN IF NOT EXISTS custo_linha NUMERIC(12,4);
CREATE INDEX IF NOT EXISTS idx_manual_opcao ON manual_montagem(tenant_id, opcao_id);

-- ============================================================
-- BLOCO C — COMPRAS / FORNECEDORES / CUSTO (CMV)
-- ============================================================
CREATE TABLE IF NOT EXISTS fornecedores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  cnpj        VARCHAR(20),
  contato     TEXT,
  meta        JSONB NOT NULL DEFAULT '{}',
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS insumo_custos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  insumo_nome TEXT NOT NULL,
  insumo_id   VARCHAR(40),
  fornecedor_id UUID REFERENCES fornecedores(id),
  custo       NUMERIC(12,4),
  unidade     VARCHAR(20),
  data        DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_insumocusto ON insumo_custos(tenant_id, insumo_nome, data DESC);

-- ============================================================
-- BLOCO D — VIEWS de apoio (cardápio público + CMV)
-- ============================================================
-- D.1 Cardápio montável (produto -> grupos -> opções) já filtrando OCULTO.
CREATE OR REPLACE VIEW v_catalogo AS
SELECT p.tenant_id, c.codigo AS categoria_codigo, c.nome AS categoria_nome, c.ordem AS categoria_ordem,
       p.id AS produto_id, p.nome AS produto_nome, p.tipo_montagem, p.regra_preco, p.preco_base,
       p.gratuito, p.status AS produto_status, p.ordem AS produto_ordem
FROM produtos p
JOIN menu_categorias c ON c.id = p.categoria_id
WHERE p.status <> 'OCULTO' AND c.ativa
ORDER BY c.ordem, p.ordem;

-- ============================================================
-- FIM. Próximo passo: popular (seed) a partir da planilha v4 real.
-- ============================================================
