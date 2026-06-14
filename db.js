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
  "CREATE SEQUENCE IF NOT EXISTS web_pedido_seq START 1"
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
