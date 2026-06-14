/* Camada Postgres — pool + schema + helpers.
   Conexão via DATABASE_URL (Easypanel injeta) ou variáveis PG*. */
'use strict';
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 }
    : {
        host: process.env.PGHOST || 'localhost',
        port: +(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'premium',
        max: 10, idleTimeoutMillis: 30000
      }
);

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS premium;
CREATE TABLE IF NOT EXISTS premium.clientes (
  telefone   VARCHAR(15) PRIMARY KEY,
  nome       TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enderecos  JSONB NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS premium.pedidos (
  id            UUID PRIMARY KEY,
  numero        BIGINT GENERATED ALWAYS AS IDENTITY,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        VARCHAR(20) NOT NULL DEFAULT 'RECEBIDO',
  canal         VARCHAR(20) NOT NULL DEFAULT 'web',
  origem_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  cliente       JSONB NOT NULL,
  tipo          VARCHAR(12) NOT NULL,
  endereco      JSONB,
  pagamento     JSONB NOT NULL DEFAULT '{}',
  itens         JSONB NOT NULL,
  subtotal      NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxa_entrega  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  observacao    TEXT DEFAULT '',
  obs_cozinha   TEXT DEFAULT '',
  historico     JSONB NOT NULL DEFAULT '[]',
  impresso      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON premium.pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado ON premium.pedidos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON premium.pedidos((cliente->>'telefone'));
CREATE TABLE IF NOT EXISTS premium.config (
  id   INT PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'
);
INSERT INTO premium.config (id, data)
  VALUES (1, '{"printer_ip":"","printer_porta":"8008","taxa_entrega_padrao":8,"raio_km":7}')
  ON CONFLICT (id) DO NOTHING;
`;

async function init(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try { await pool.query(SCHEMA); console.log('[db] schema pronto'); return; }
    catch (e) { console.log(`[db] aguardando Postgres (${i + 1}/${retries}): ${e.code || e.message}`); await new Promise(r => setTimeout(r, 3000)); }
  }
  throw new Error('Postgres indisponível após retries');
}

module.exports = { pool, init, q: (text, params) => pool.query(text, params) };
