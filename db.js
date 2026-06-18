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
  "ALTER TABLE preparo_itens ADD COLUMN IF NOT EXISTS est_produto_id INT",
  "ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS peso_g NUMERIC(14,3)",
  "ALTER TABLE est_contagem_item ADD COLUMN IF NOT EXISTS geral BOOLEAN NOT NULL DEFAULT FALSE",
  "ALTER TABLE est_producao_run ADD COLUMN IF NOT EXISTS rendido NUMERIC(14,3)",
  "ALTER TABLE est_producao_run ADD COLUMN IF NOT EXISTS perda NUMERIC(14,3)"
];

const state = { migrationsOk: false, ultimoErro: null };

async function migrarFichasProducaoV2(client) {
  await client.query(`INSERT INTO est_ficha_producao (tenant_id,produto_id,descricao,unidade_consumo,tipo,ativo)
    SELECT DISTINCT r.tenant_id,r.produto_id,p.nome,p.unidade,'PRODUZIDO',TRUE
      FROM est_producao_receita r JOIN est_produto p ON p.id=r.produto_id
     WHERE r.tenant_id=$1 AND r.ativo
    ON CONFLICT (tenant_id,produto_id) DO NOTHING`, [TENANT]);
  await client.query(`INSERT INTO est_ficha_porcao (tenant_id,ficha_id,nome,rendimento,unidade,ordem,ativo)
    SELECT f.tenant_id,f.id,'Receita padrão',COALESCE(MAX(NULLIF(r.rendimento,0)),1),p.unidade,0,TRUE
      FROM est_ficha_producao f JOIN est_produto p ON p.id=f.produto_id
      JOIN est_producao_receita r ON r.tenant_id=f.tenant_id AND r.produto_id=f.produto_id AND r.ativo
     WHERE f.tenant_id=$1 AND NOT EXISTS (SELECT 1 FROM est_ficha_porcao x WHERE x.tenant_id=f.tenant_id AND x.ficha_id=f.id)
     GROUP BY f.tenant_id,f.id,p.unidade`, [TENANT]);
  await client.query(`INSERT INTO est_ficha_porcao_item (tenant_id,porcao_id,insumo_produto_id,quantidade,unidade,observacao,ordem)
    SELECT r.tenant_id,po.id,r.insumo_produto_id,r.quantidade_por_unidade,r.unidade,r.observacao,
           ROW_NUMBER() OVER (PARTITION BY po.id ORDER BY r.id)::int
      FROM est_producao_receita r
      JOIN est_ficha_producao f ON f.tenant_id=r.tenant_id AND f.produto_id=r.produto_id AND f.ativo
      JOIN est_ficha_porcao po ON po.tenant_id=f.tenant_id AND po.ficha_id=f.id AND po.ativo
     WHERE r.tenant_id=$1 AND r.ativo AND r.quantidade_por_unidade>0
    ON CONFLICT (tenant_id,porcao_id,insumo_produto_id) DO NOTHING`, [TENANT]);
}

async function sincronizarCatalogoEstoqueV4(client) {
  const arquivo = path.join(__dirname, 'data', 'estoque-catalogo-premium-v4.json');
  const catalogo = JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, ''));
  const produzido = new Set(Object.values(catalogo.produzidos || {}).flat());
  const nomesCatalogo = Object.values(catalogo.setores || {}).flat().map(function (item) { return String(item[0]); });
  const nomesCatalogoLower = nomesCatalogo.map(function (nome) { return nome.toLowerCase(); });
  const ordemSetor = { Gerais: 10, Borda: 20, Finalização: 30, Montagem: 40, Recepção: 50 };
  await client.query('BEGIN');
  try {
    for (const nome of Object.keys(catalogo.setores || {})) {
      await client.query(`INSERT INTO est_setor (tenant_id,nome,ordem,ativo) VALUES ($1,$2,$3,TRUE)
        ON CONFLICT (tenant_id,nome) DO UPDATE SET ordem=EXCLUDED.ordem,ativo=TRUE`, [TENANT,nome,ordemSetor[nome] || 99]);
    }
    const cat = await client.query(`INSERT INTO est_categoria (tenant_id,nome,ordem,ativo) VALUES ($1,'Produtos produzidos internamente',3,TRUE)
      ON CONFLICT (tenant_id,nome) DO UPDATE SET ativo=TRUE RETURNING id`, [TENANT]);
    const catProduzido = cat.rows[0].id;
    for (const [antigo, novo, unidade] of catalogo.renomear || []) {
      const alvo = await client.query('SELECT id FROM est_produto WHERE tenant_id=$1 AND lower(nome)=lower($2)', [TENANT,novo]);
      if (alvo.rows[0]) await client.query('UPDATE est_produto SET ativo=FALSE,atualizado_em=NOW() WHERE tenant_id=$1 AND lower(nome)=lower($2) AND id<>$3', [TENANT,antigo,alvo.rows[0].id]);
      else await client.query('UPDATE est_produto SET nome=$3,unidade=$4,ativo=TRUE,atualizado_em=NOW() WHERE tenant_id=$1 AND lower(nome)=lower($2)', [TENANT,antigo,novo,unidade]);
    }
    for (const nome of catalogo.desativar || []) await client.query('UPDATE est_produto SET ativo=FALSE,atualizado_em=NOW() WHERE tenant_id=$1 AND lower(nome)=lower($2)', [TENANT,nome]);
    for (const [setor, itens] of Object.entries(catalogo.setores || {})) {
      const sid = (await client.query('SELECT id FROM est_setor WHERE tenant_id=$1 AND nome=$2',[TENANT,setor])).rows[0].id;
      for (const [nome, unidade] of itens) {
        const ehProduzido = produzido.has(nome);
        let pr = await client.query('SELECT id FROM est_produto WHERE tenant_id=$1 AND lower(nome)=lower($2) ORDER BY ativo DESC,id LIMIT 1',[TENANT,nome]);
        if (!pr.rows[0]) pr = ehProduzido
          ? await client.query(`INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo,legado)
              VALUES ($1::varchar,$2::text,$3::int,$4::text,TRUE,FALSE,TRUE,TRUE,$5::jsonb) RETURNING id`,[TENANT,nome,catProduzido,unidade,JSON.stringify({fonte:'catalogo-premium-v4'})])
          : await client.query(`INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo,legado)
              VALUES ($1::varchar,$2::text,NULL,$3::text,TRUE,TRUE,FALSE,TRUE,$4::jsonb) RETURNING id`,[TENANT,nome,unidade,JSON.stringify({fonte:'catalogo-premium-v4'})]);
        const pid = pr.rows[0].id;
        await client.query(`UPDATE est_produto SET nome=$3::text,unidade=$4::text,ativo=TRUE,pode_contar=TRUE,atualizado_em=NOW()
          WHERE tenant_id=$1::varchar AND id=$2::int`,[TENANT,pid,nome,unidade]);
        if (ehProduzido) await client.query(`UPDATE est_produto SET pode_produzir=TRUE,pode_comprar=FALSE,categoria_id=$3::int
          WHERE tenant_id=$1::varchar AND id=$2::int`,[TENANT,pid,catProduzido]);
        await client.query('UPDATE est_produto SET ativo=FALSE,atualizado_em=NOW() WHERE tenant_id=$1::varchar AND lower(nome)=lower($2::text) AND id<>$3::int',[TENANT,nome,pid]);
        await client.query('DELETE FROM est_produto_setor WHERE tenant_id=$1 AND produto_id=$2',[TENANT,pid]);
        await client.query('INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) VALUES ($1,$2,$3,FALSE)',[TENANT,pid,sid]);
      }
    }
    // O catálogo confirmado é a fonte operacional. Registros antigos permanecem no banco
    // para preservar movimentos e auditorias, mas não aparecem mais na operação.
    await client.query(`UPDATE est_produto SET ativo=FALSE,atualizado_em=NOW()
      WHERE tenant_id=$1::varchar AND ativo AND NOT(lower(nome)=ANY($2::text[]))`,[TENANT,nomesCatalogoLower]);
    await client.query(`UPDATE est_produto SET pode_produzir=FALSE,pode_comprar=TRUE,
        categoria_id=CASE WHEN categoria_id=$3::int THEN NULL ELSE categoria_id END
      WHERE tenant_id=$1::varchar AND ativo AND lower(nome)=ANY($2::text[])`,[TENANT,nomesCatalogoLower,catProduzido]);
    for (const [setor, nomes] of Object.entries(catalogo.produzidos || {})) {
      const sid=(await client.query('SELECT id FROM est_setor WHERE tenant_id=$1 AND nome=$2',[TENANT,setor])).rows[0].id;
      for (const nome of nomes) {
        const p=await client.query('SELECT id,unidade FROM est_produto WHERE tenant_id=$1 AND lower(nome)=lower($2) AND ativo ORDER BY id LIMIT 1',[TENANT,nome]);
        if(!p.rows[0]) continue;
        await client.query('UPDATE est_produto SET pode_produzir=TRUE,pode_comprar=FALSE,categoria_id=$3,atualizado_em=NOW() WHERE tenant_id=$1 AND id=$2',[TENANT,p.rows[0].id,catProduzido]);
        await client.query('INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) VALUES ($1,$2,$3,FALSE) ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING',[TENANT,p.rows[0].id,sid]);
        const f=await client.query(`INSERT INTO est_ficha_producao (tenant_id,produto_id,descricao,unidade_consumo,tipo,ativo)
          VALUES ($1,$2,$3,$4,'PRODUZIDO',TRUE) ON CONFLICT (tenant_id,produto_id) DO UPDATE SET ativo=TRUE,unidade_consumo=EXCLUDED.unidade_consumo RETURNING id`,[TENANT,p.rows[0].id,nome,p.rows[0].unidade]);
        await client.query(`INSERT INTO est_ficha_porcao (tenant_id,ficha_id,nome,rendimento,unidade,ordem,ativo)
          SELECT $1,$2,'Receita padrão',1,$3,0,TRUE WHERE NOT EXISTS (SELECT 1 FROM est_ficha_porcao WHERE tenant_id=$1 AND ficha_id=$2 AND ativo)`,[TENANT,f.rows[0].id,p.rows[0].unidade]);
      }
    }
    await client.query('COMMIT');
    return catalogo;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
}

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
        const mk = await pool.query("SELECT (config->>'setores_premium_v3') AS m FROM tenants WHERE id=$1", [TENANT]);
        if (!mk.rows[0] || !mk.rows[0].m) {
          const seedSet = fs.readFileSync(path.join(__dirname, 'seed-setores-premium.sql'), 'utf8');
          await pool.query(seedSet);
          await pool.query("UPDATE tenants SET config = COALESCE(config,'{}'::jsonb) || '{\"setores_premium_v3\":true}'::jsonb WHERE id=$1", [TENANT]);
          console.log('[db] layout de setores Premium aplicado (carga unica v3)');
        } else { console.log('[db] layout de setores ja aplicado - ignorado'); }
      } catch (est) { console.log('[db] seed-setores aviso:', est.code || est.message); }
      try {
        await migrarFichasProducaoV2(pool);
        const mk = await pool.query("SELECT (config->>'estoque_catalogo_premium_v4') AS m FROM tenants WHERE id=$1", [TENANT]);
        if (!mk.rows[0] || !mk.rows[0].m) {
          const syncClient = await pool.connect();
          let cat4; try { cat4 = await sincronizarCatalogoEstoqueV4(syncClient); } finally { syncClient.release(); }
          await pool.query("UPDATE tenants SET config=COALESCE(config,'{}'::jsonb)||'{\"estoque_catalogo_premium_v4\":true}'::jsonb WHERE id=$1", [TENANT]);
          const total = Object.values(cat4.setores || {}).reduce((n, itens) => n + itens.length, 0);
          console.log('[db] catalogo operacional Premium v4 aplicado - vinculos: ' + total);
        } else { console.log('[db] catalogo operacional Premium v4 ja aplicado - ignorado'); }
      } catch (ef4) { console.log('[db] catalogo/fichas v4 aviso:', ef4.code || '', ef4.message || ''); }
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
