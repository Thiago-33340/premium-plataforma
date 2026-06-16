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
CREATE TABLE IF NOT EXISTS est_produto (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
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
CREATE TABLE IF NOT EXISTS est_producao_receita (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  produto_id INT NOT NULL REFERENCES est_produto(id) ON DELETE CASCADE,
  insumo_produto_id INT NOT NULL REFERENCES est_produto(id),
  quantidade_por_unidade NUMERIC(14,4), unidade TEXT, rendimento NUMERIC(14,3),
  ativo BOOLEAN NOT NULL DEFAULT TRUE, observacao TEXT
);
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
