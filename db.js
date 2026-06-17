/* ============================================================
   Camada Postgres CONVERGIDA com o Khardela + modelo completo.
   Conecta no banco titan_khardela, schema khardela (fonte unica).
   Roda migracoes base + aplica modelo-completo-v1.sql no boot.
   Tudo multi-tenant por tenant_id. Nao recria tabelas existentes.
   ============================================================ */
'use strict';
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const TENANT = process.env.TENANT_ID || 'khardela:premiumpizzas:sjrp';

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, max: 12, idleTimeoutMillis: 30000 }
    : {
        host: process.env.PGHOST || 'titan-postgres',
        port: +(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'titan_khardela',
        max: 12, idleTimeoutMillis: 30000
      }
);

pool.on('connect', function (c) { c.query('SET search_path TO khardela, public').catch(function () {}); });

const MIGRATIONS = [
  "SET search_path TO khardela, public",
  "ALTER TABLE rbac_contacts ADD COLUMN IF NOT EXISTS senha_hash TEXT",
  `CREATE TABLE IF NOT EXISTS mesas (
     id SERIAL PRIMARY KEY,
     tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id),
     numero INT NOT NULL,
     ativa BOOLEAN NOT NULL DEFAULT TRUE,
     criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (tenant_id, numero)
   )`,
  `CREATE TABLE IF NOT EXISTS comandas (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id),
     mesa_numero INT NOT NULL,
     nome_cliente TEXT NOT NULL,
     status VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
     aberta_por VARCHAR(20),
     aberta_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     fechada_em TIMESTAMPTZ
   )`,
  "CREATE INDEX IF NOT EXISTS idx_comandas_aberta ON comandas(tenant_id, status, mesa_numero)",
  `CREATE TABLE IF NOT EXISTS caixa (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id),
     aberto_por VARCHAR(20),
     aberto_por_nome TEXT,
     valor_abertura NUMERIC(10,2) NOT NULL DEFAULT 0,
     status VARCHAR(20) NOT NULL DEFAULT 'ABERTO',
     aberto_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     fechado_em TIMESTAMPTZ,
     valor_fechamento NUMERIC(10,2)
   )`,
  "CREATE INDEX IF NOT EXISTS idx_caixa_aberto ON caixa(tenant_id, status)",
  `CREATE TABLE IF NOT EXISTS entregadores (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id),
     nome TEXT NOT NULL,
     telefone VARCHAR(20),
     ativo BOOLEAN NOT NULL DEFAULT TRUE,
     ultima_lat NUMERIC(10,6),
     ultima_lng NUMERIC(10,6),
     ultima_atualizacao TIMESTAMPTZ
   )`,
  "CREATE SEQUENCE IF NOT EXISTS web_pedido_seq START 1",
  `CREATE TABLE IF NOT EXISTS comanda_itens (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id),
     comanda_id UUID NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
     nome TEXT NOT NULL,
     resumo TEXT,
     item JSONB NOT NULL DEFAULT '{}',
     quantidade INT NOT NULL DEFAULT 1,
     preco_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
     criado_por VARCHAR(40),
     criado_por_nome TEXT,
     status VARCHAR(20) NOT NULL DEFAULT 'PEDIDO',
     criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  "CREATE INDEX IF NOT EXISTS idx_comanda_itens ON comanda_itens(comanda_id, status)",
  "ALTER TABLE comandas ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(20)",
  "ALTER TABLE comandas ADD COLUMN IF NOT EXISTS total NUMERIC(10,2)",
  `INSERT INTO mesas (tenant_id, numero) SELECT '${TENANT}', g FROM generate_series(1,12) g ON CONFLICT (tenant_id, numero) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS estoque_movimentos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id),
     item_id VARCHAR(40),
     insumo_nome TEXT NOT NULL,
     setor_id VARCHAR(40),
     tipo VARCHAR(12) NOT NULL,
     quantidade NUMERIC(12,3) NOT NULL,
     unidade VARCHAR(20),
     motivo TEXT,
     origem VARCHAR(30),
     ref_pedido VARCHAR(80),
     por VARCHAR(40),
     por_nome TEXT,
     criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  "CREATE INDEX IF NOT EXISTS idx_estmov ON estoque_movimentos(tenant_id, criado_em DESC)",
  "CREATE INDEX IF NOT EXISTS idx_estmov_item ON estoque_movimentos(tenant_id, item_id, criado_em DESC)",
  "ALTER TABLE preparos ADD COLUMN IF NOT EXISTS modo_preparo TEXT",
  "ALTER TABLE ficha_itens ADD COLUMN IF NOT EXISTS est_produto_id INT",
  "ALTER TABLE preparo_itens ADD COLUMN IF NOT EXISTS est_produto_id INT"
];

const state = { migrationsOk: false, ultimoErro: null };

async function init(retries) {
  retries = retries || 8;
  for (let i = 0; i < retries; i++) {
    try {
      for (const sql of MIGRATIONS) await pool.query(sql);
      try {
        const modelo = fs.readFileSync(path.join(__dirname, 'modelo-completo-v1.sql'), 'utf8');
        await pool.query(modelo);
        console.log('[db] modelo completo de restaurante aplicado');
      } catch (em) { console.log('[db] modelo-completo aviso:', em.code || em.message); }
      try {
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM produtos WHERE tenant_id=$1', [TENANT]);
        if (r.rows[0].n === 0) {
          const seed = fs.readFileSync(path.join(__dirname, 'seed-cardapio.sql'), 'utf8');
          await pool.query(seed);
          const r2 = await pool.query('SELECT COUNT(*)::int AS n FROM produtos WHERE tenant_id=$1', [TENANT]);
          console.log('[db] seed do cardapio (modelo novo) aplicado - produtos: ' + r2.rows[0].n);
        } else {
          console.log('[db] produtos ja populados (' + r.rows[0].n + ') - seed ignorado');
        }
      } catch (es) { console.log('[db] seed-cardapio aviso:', es.code || es.message); }
      try {
        const rp = await pool.query('SELECT COUNT(*)::int AS n FROM preparos WHERE tenant_id=$1', [TENANT]);
        if (rp.rows[0].n === 0) {
          const seed2 = fs.readFileSync(path.join(__dirname, 'seed-fase2.sql'), 'utf8');
          await pool.query(seed2);
          console.log('[db] seed fase2 (pizza pequena + preparos + insumos) aplicado');
        } else {
          console.log('[db] preparos ja populados (' + rp.rows[0].n + ') - seed fase2 ignorado');
        }
      } catch (es2) { console.log('[db] seed-fase2 aviso:', es2.code || es2.message); }
      try {
        const rf = await pool.query('SELECT COUNT(*)::int AS n FROM ficha_itens WHERE tenant_id=$1', [TENANT]);
        if (rf.rows[0].n === 0) {
          const seed3 = fs.readFileSync(path.join(__dirname, 'seed-fase3.sql'), 'utf8');
          await pool.query(seed3);
          console.log('[db] seed fase3 (fichas tecnicas) aplicado');
        } else {
          console.log('[db] fichas ja populadas (' + rf.rows[0].n + ') - seed fase3 ignorado');
        }
      } catch (es3) { console.log('[db] seed-fase3 aviso:', es3.code || es3.message); }
      try {
        const seed4 = fs.readFileSync(path.join(__dirname, 'seed-fase4-pizzagrande.sql'), 'utf8');
        await pool.query(seed4);
        console.log('[db] seed fase4 (pizza grande 4 bordas) aplicado/verificado');
      } catch (es4) { console.log('[db] seed-fase4 aviso:', es4.code || es4.message); }
      try {
        const estv2 = fs.readFileSync(path.join(__dirname, 'estoque-v2.sql'), 'utf8');
        await pool.query(estv2);
        console.log('[db] estoque v2 (schema) aplicado/verificado');
        const rep = await pool.query('SELECT COUNT(*)::int AS n FROM est_produto WHERE tenant_id=$1', [TENANT]);
        if (rep.rows[0].n === 0) {
          const seedE = fs.readFileSync(path.join(__dirname, 'seed-estoque-rp.sql'), 'utf8');
          await pool.query(seedE);
          const r2 = await pool.query('SELECT COUNT(*)::int AS n FROM est_produto WHERE tenant_id=$1', [TENANT]);
          console.log('[db] seed estoque RP aplicado - produtos: ' + r2.rows[0].n);
        } else {
          console.log('[db] est_produto ja populado (' + rep.rows[0].n + ') - seed estoque ignorado');
        }
      } catch (ee) { console.log('[db] estoque-v2 aviso:', ee.code || ee.message); }
      try {
        const seedProd = fs.readFileSync(path.join(__dirname, 'seed-produzidos-rp.sql'), 'utf8');
        await pool.query(seedProd);
        const rpd = await pool.query("SELECT COUNT(*)::int AS n FROM est_produto p JOIN est_categoria c ON c.id=p.categoria_id WHERE p.tenant_id=$1 AND c.nome='Produtos produzidos internamente'", [TENANT]);
        console.log('[db] seed produzidos (idempotente) aplicado - produzidos: ' + rpd.rows[0].n);
      } catch (epd) { console.log('[db] seed-produzidos aviso:', epd.code || epd.message); }
      try {
        const seedp = fs.readFileSync(path.join(__dirname, 'seed-pins.sql'), 'utf8');
        await pool.query(seedp);
        console.log('[db] seed de PINs (idempotente) aplicado');
        // Força troca de PIN no 1º login p/ gestores+Sophia — uma única vez (marcador em tenants.config).
        const mk = await pool.query("SELECT (config->>'pin_reset_gestores_v1') AS m FROM tenants WHERE id=$1", [TENANT]);
        if (!mk.rows[0] || !mk.rows[0].m) {
          await pool.query("UPDATE rbac_contacts SET pin_must_change=TRUE WHERE tenant_id=$1 AND LOWER(apelido_login) IN ('thiago','tassiano','eva','sophia')", [TENANT]);
          await pool.query("UPDATE tenants SET config = COALESCE(config,'{}'::jsonb) || '{\"pin_reset_gestores_v1\":true}'::jsonb WHERE id=$1", [TENANT]);
          console.log('[db] troca de PIN forcada p/ gestores+sophia (uma vez)');
        }
      } catch (esp) { console.log('[db] seed-pins aviso:', esp.code || esp.message); }
      state.migrationsOk = true;
      console.log('[db] convergido com schema khardela - migracoes ok');
      return;
    } catch (e) {
      state.ultimoErro = e.code || e.message;
      console.log('[db] tentando migracoes (' + (i + 1) + '/' + retries + '): ' + state.ultimoErro);
      await new Promise(function (r) { setTimeout(r, 3000); });
    }
  }
  console.error('[db] ATENCAO: migracoes falharam. App sobe em modo degradado. Ultimo erro:', state.ultimoErro);
}

module.exports = { pool: pool, init: init, q: function (t, p) { return pool.query(t, p); }, TENANT: TENANT, state: state };
