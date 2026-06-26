-- ============================================================
-- ESTOQUE v2 (Premium RP) — modelo completo do YAML, idempotente, multi-tenant.
-- Prefixo est_ para não colidir com as tabelas estoque_* legadas.
-- ============================================================
SET search_path TO khardela, public;

CREATE TABLE IF NOT EXISTS est_categoria (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, ordem INT DEFAULT 99, ativo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, nome)
);
-- Hierarquia Departamento > Categoria (a subcategoria fica em est_produto.subcategoria).
ALTER TABLE est_categoria ADD COLUMN IF NOT EXISTS departamento TEXT;
ALTER TABLE est_categoria ADD COLUMN IF NOT EXISTS controla_cmv BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE est_categoria ADD COLUMN IF NOT EXISTS controla_cv BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS est_fornecedor (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, tipo TEXT, endereco TEXT, whatsapp VARCHAR(30),
  observacoes TEXT, ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, nome)
);
CREATE TABLE IF NOT EXISTS est_setor (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, ordem INT DEFAULT 99, ativo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, nome)
);
-- Local físico (ADENDO §3.1): onde o item fica guardado. Conceito separado de categoria/setor/tipo.
-- Aceita a realidade atual (estoques misturados) — não obriga organização perfeita.
CREATE TABLE IF NOT EXISTS est_local_fisico (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo_local TEXT,                       -- seco | refrigerado | congelado | produção | …
  aceita_pereciveis BOOLEAN NOT NULL DEFAULT TRUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, nome)
);
CREATE TABLE IF NOT EXISTS est_produto (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  departamento TEXT,
  categoria_id INT REFERENCES est_categoria(id),
  subcategoria TEXT,
  unidade TEXT,
  estoque_atual NUMERIC(14,3) NOT NULL DEFAULT 0,
  estoque_minimo NUMERIC(14,3),
  estoque_ideal NUMERIC(14,3),
  fornecedor_preferido_id INT REFERENCES est_fornecedor(id),
  ultimo_fornecedor_id INT REFERENCES est_fornecedor(id),
  marca_preferida TEXT, ultima_marca TEXT,
  ultimo_valor NUMERIC(14,4), maior_valor NUMERIC(14,4), menor_valor NUMERIC(14,4), medio_valor NUMERIC(14,4),
  pode_contar BOOLEAN NOT NULL DEFAULT TRUE,
  pode_comprar BOOLEAN NOT NULL DEFAULT TRUE,
  pode_produzir BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes TEXT,
  legado JSONB NOT NULL DEFAULT '{}',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, nome)
);
CREATE INDEX IF NOT EXISTS idx_est_prod_cat ON est_produto(tenant_id, categoria_id);
-- Sessão 1 (pendência): garantir colunas em tabelas que podem ter sido criadas por uma versão
-- anterior do schema (CREATE TABLE IF NOT EXISTS não adiciona colunas a uma tabela já existente).
-- Todas aditivas e idempotentes — seguras contra o banco real.
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS subcategoria TEXT;
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS departamento TEXT;
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS marca_preferida TEXT;
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS ultima_marca TEXT;
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS ultimo_valor NUMERIC(14,4);
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS maior_valor NUMERIC(14,4);
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS menor_valor NUMERIC(14,4);
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS medio_valor NUMERIC(14,4);
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS fornecedor_preferido_id INT REFERENCES est_fornecedor(id);
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS ultimo_fornecedor_id INT REFERENCES est_fornecedor(id);
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS peso_g NUMERIC(14,3);
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS unidade_base TEXT;
-- Conversão é PROPRIEDADE DO PRODUTO (1 unidade de compra deste produto = peso_g na unidade_base),
-- com origem/confiança/revisão. Nunca o fator de outro produto. (ADENDO §3.3)
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS conversao_origem TEXT;           -- NF | default_categoria | manual
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS conversao_confianca TEXT;        -- alta | media | baixa
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS conversao_precisa_revisao BOOLEAN NOT NULL DEFAULT FALSE;
-- Classificação por comportamento (ADENDO §3.1) e nome bruto da NF vs nome padronizado (§3.2).
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS tipo_item TEXT;   -- insumo|produzido internamente|semiacabado|embalagem|bebida|material de limpeza|higiene|utensílio|revenda|outro
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS nome_nf TEXT;     -- texto cru da nota, read-only depois de importado
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS local_fisico_id INT REFERENCES est_local_fisico(id);
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS controla_cmv BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS controla_cv BOOLEAN NOT NULL DEFAULT FALSE;
-- Sugestões de conversão POR CATEGORIA (substitui o preset global). Mostradas só em produtos da
-- categoria correspondente e sempre confirmáveis — nunca aplicadas automaticamente a outra categoria.
CREATE TABLE IF NOT EXISTS est_conversao_categoria (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria_ref TEXT NOT NULL,          -- casa com est_categoria.nome (ex.: 'Hortifruti')
  rotulo TEXT NOT NULL,                 -- ex.: 'Rúcula hidropônica', 'Manjericão (folha)'
  unidade_compra TEXT,                  -- ex.: 'MAÇO', 'FOLHA', 'TALO'
  unidade_base TEXT,                    -- 'g' | 'ml' | 'un'
  fator NUMERIC(14,3),                  -- pode ser NULL quando precisa_revisao (não inventar)
  confianca TEXT,                       -- alta | media | baixa
  precisa_revisao BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, categoria_ref, rotulo)
);
CREATE TABLE IF NOT EXISTS est_produto_setor (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id INT NOT NULL REFERENCES est_produto(id) ON DELETE CASCADE,
  setor_id INT NOT NULL REFERENCES est_setor(id) ON DELETE CASCADE,
  obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (tenant_id, produto_id, setor_id)
);
CREATE TABLE IF NOT EXISTS est_produto_fornecedor (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id INT NOT NULL REFERENCES est_produto(id) ON DELETE CASCADE,
  fornecedor_id INT NOT NULL REFERENCES est_fornecedor(id) ON DELETE CASCADE,
  preferencial BOOLEAN NOT NULL DEFAULT FALSE,
  marca TEXT, marca_parecida TEXT, status TEXT,
  ultimo_valor NUMERIC(14,4), menor_valor NUMERIC(14,4), maior_valor NUMERIC(14,4),
  frequencia NUMERIC(6,2), ultima_visita_em TIMESTAMPTZ,
  UNIQUE (tenant_id, produto_id, fornecedor_id)
);
-- Sessão 1 (pendência): garantir as colunas de valor (caso a tabela já existisse sem elas).
ALTER TABLE est_produto_fornecedor ADD COLUMN IF NOT EXISTS ultimo_valor NUMERIC(14,4);
ALTER TABLE est_produto_fornecedor ADD COLUMN IF NOT EXISTS menor_valor NUMERIC(14,4);
ALTER TABLE est_produto_fornecedor ADD COLUMN IF NOT EXISTS maior_valor NUMERIC(14,4);
CREATE TABLE IF NOT EXISTS est_movimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id INT REFERENCES est_produto(id),
  produto_nome TEXT,
  tipo VARCHAR(20) NOT NULL,
  qtd_antes NUMERIC(14,3), qtd_movimentada NUMERIC(14,3), qtd_depois NUMERIC(14,3),
  origem VARCHAR(30), usuario_id UUID, usuario_nome TEXT,
  motivo TEXT, observacao TEXT, ref TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_est_mov ON est_movimento(tenant_id, criado_em DESC);
CREATE TABLE IF NOT EXISTS est_contagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  setor_id INT REFERENCES est_setor(id), setor_nome TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'EM_ANDAMENTO',
  status_auditoria VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO',
  usuario_id UUID, usuario_nome TEXT,
  iniciada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), encerrada_em TIMESTAMPTZ,
  itens_contados INT DEFAULT 0, obrigatorios_pendentes INT DEFAULT 0,
  observacoes TEXT
);
CREATE TABLE IF NOT EXISTS est_contagem_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contagem_id UUID NOT NULL REFERENCES est_contagem(id) ON DELETE CASCADE,
  produto_id INT REFERENCES est_produto(id), produto_nome TEXT, unidade TEXT,
  quantidade NUMERIC(14,3),                 -- NULL=não contado; 0 é válido
  obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  observacao TEXT
);
CREATE INDEX IF NOT EXISTS idx_est_cont_item ON est_contagem_item(contagem_id);
CREATE TABLE IF NOT EXISTS est_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contagem_id UUID NOT NULL REFERENCES est_contagem(id) ON DELETE CASCADE,
  gestor_id UUID, gestor_nome TEXT, acao VARCHAR(30), observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS est_visita (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fornecedor_id INT REFERENCES est_fornecedor(id),
  usuario_id UUID, usuario_nome TEXT,
  iniciada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), finalizada_em TIMESTAMPTZ,
  tempo_seg INT, status VARCHAR(20) NOT NULL DEFAULT 'EM_ANDAMENTO', observacoes TEXT
);
CREATE TABLE IF NOT EXISTS est_visita_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visita_id UUID NOT NULL REFERENCES est_visita(id) ON DELETE CASCADE,
  produto_id INT REFERENCES est_produto(id),
  status VARCHAR(30), marca_encontrada TEXT, marca_parecida TEXT,
  valor_unitario NUMERIC(14,4), valor_total NUMERIC(14,4), quantidade NUMERIC(14,3),
  comprou BOOLEAN DEFAULT FALSE, observacao TEXT
);
CREATE TABLE IF NOT EXISTS est_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fornecedor_id INT REFERENCES est_fornecedor(id),
  usuario_id UUID, usuario_nome TEXT, origem VARCHAR(20) DEFAULT 'MANUAL',
  status VARCHAR(20) NOT NULL DEFAULT 'CONFERINDO', total NUMERIC(14,2),
  data_compra DATE DEFAULT CURRENT_DATE, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS est_compra_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  compra_id UUID NOT NULL REFERENCES est_compra(id) ON DELETE CASCADE,
  produto_id INT REFERENCES est_produto(id), marca TEXT,
  quantidade NUMERIC(14,3), unidade TEXT, valor_unitario NUMERIC(14,4), valor_total NUMERIC(14,4)
);
ALTER TABLE est_compra_item ADD COLUMN IF NOT EXISTS texto_original TEXT;
ALTER TABLE est_compra_item ADD COLUMN IF NOT EXISTS match_score NUMERIC(5,4);
ALTER TABLE est_compra_item ADD COLUMN IF NOT EXISTS match_status TEXT;
CREATE TABLE IF NOT EXISTS est_producao_receita (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id INT NOT NULL REFERENCES est_produto(id) ON DELETE CASCADE,
  insumo_produto_id INT NOT NULL REFERENCES est_produto(id),
  quantidade_por_unidade NUMERIC(14,4), unidade TEXT, rendimento NUMERIC(14,3),
  ativo BOOLEAN NOT NULL DEFAULT TRUE, observacao TEXT
);
-- Ficha de produção v2: uma ficha pode ter várias porções, cada uma com seus insumos.
-- A tabela antiga acima é mantida para compatibilidade e migração dos dados já cadastrados.
CREATE TABLE IF NOT EXISTS est_ficha_producao (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id INT NOT NULL REFERENCES est_produto(id) ON DELETE CASCADE,
  descricao TEXT,
  unidade_consumo TEXT,
  tipo VARCHAR(30) NOT NULL DEFAULT 'PRODUZIDO',
  instrucoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, produto_id)
);
CREATE TABLE IF NOT EXISTS est_ficha_porcao (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ficha_id INT NOT NULL REFERENCES est_ficha_producao(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  rendimento NUMERIC(14,4) NOT NULL DEFAULT 1,
  unidade TEXT,
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS est_ficha_porcao_item (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  porcao_id INT NOT NULL REFERENCES est_ficha_porcao(id) ON DELETE CASCADE,
  insumo_produto_id INT NOT NULL REFERENCES est_produto(id),
  quantidade NUMERIC(14,4) NOT NULL,
  unidade TEXT,
  observacao TEXT,
  ordem INT NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, porcao_id, insumo_produto_id)
);
CREATE INDEX IF NOT EXISTS idx_est_ficha_produto ON est_ficha_producao(tenant_id, produto_id, ativo);
CREATE INDEX IF NOT EXISTS idx_est_ficha_porcao ON est_ficha_porcao(tenant_id, ficha_id, ativo);
CREATE INDEX IF NOT EXISTS idx_est_ficha_item ON est_ficha_porcao_item(tenant_id, porcao_id);
CREATE TABLE IF NOT EXISTS est_producao_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id INT REFERENCES est_produto(id), quantidade NUMERIC(14,3),
  usuario_id UUID, usuario_nome TEXT, observacao TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS est_lista_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id UUID, usuario_nome TEXT, status VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
  origem VARCHAR(20) DEFAULT 'MANUAL', estimativa NUMERIC(14,2), meta JSONB NOT NULL DEFAULT '{}',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS est_lista_compra_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lista_id UUID NOT NULL REFERENCES est_lista_compra(id) ON DELETE CASCADE,
  produto_id INT REFERENCES est_produto(id), texto_original TEXT,
  quantidade NUMERIC(14,3), unidade TEXT, fornecedor_id INT REFERENCES est_fornecedor(id),
  confianca NUMERIC(5,2), status VARCHAR(20) DEFAULT 'OK'
);
CREATE TABLE IF NOT EXISTS est_permissao (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL, permissao VARCHAR(60) NOT NULL,
  UNIQUE (tenant_id, usuario_id, permissao)
);
CREATE TABLE IF NOT EXISTS est_notificacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  para_usuario_id UUID, tipo VARCHAR(40), titulo TEXT, corpo TEXT,
  lida BOOLEAN NOT NULL DEFAULT FALSE, ref TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS est_whatsapp_msg (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  telefone VARCHAR(30), direcao VARCHAR(10), texto TEXT, interpretado JSONB,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS est_titan_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  evento VARCHAR(40), payload JSONB, processado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS est_integracao_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo VARCHAR(40), detalhe JSONB, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS est_lista_auto (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  periodicidade VARCHAR(20), ativo BOOLEAN NOT NULL DEFAULT FALSE, config JSONB NOT NULL DEFAULT '{}'
);

-- correção idempotente: itens importados como 'Outros' (sem categoria oficial) -> Materiais de escritório
UPDATE est_produto SET categoria_id = (SELECT id FROM est_categoria WHERE tenant_id=est_produto.tenant_id AND nome='Materiais de escritório')
WHERE categoria_id IS NULL AND (legado->>'categoria_original')='Outros';
