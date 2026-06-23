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
  "CREATE EXTENSION IF NOT EXISTS pgcrypto",
  "ALTER TABLE rbac_contacts ADD COLUMN IF NOT EXISTS senha_hash TEXT",
  `CREATE TABLE IF NOT EXISTS titan_tool_users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id),
     email TEXT NOT NULL,
     nome TEXT,
     senha_hash TEXT,
     permissoes TEXT[] NOT NULL DEFAULT ARRAY['command_center','mapper','ver_project_state']::TEXT[],
     ativo BOOLEAN NOT NULL DEFAULT TRUE,
     autorizado_por UUID,
     primeiro_acesso_em TIMESTAMPTZ,
     ultimo_login_em TIMESTAMPTZ,
     criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_titan_tool_users_email ON titan_tool_users(tenant_id, lower(email))",
  `CREATE TABLE IF NOT EXISTS titan_tool_sessions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id),
     user_id UUID NOT NULL REFERENCES titan_tool_users(id) ON DELETE CASCADE,
     token_hash TEXT NOT NULL UNIQUE,
     remember BOOLEAN NOT NULL DEFAULT FALSE,
     ip TEXT,
     user_agent TEXT,
     criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     visto_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     expira_em TIMESTAMPTZ NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS idx_titan_tool_sessions_user ON titan_tool_sessions(tenant_id, user_id, expira_em DESC)",
  `CREATE TABLE IF NOT EXISTS titan_command_actions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id VARCHAR(80) NOT NULL REFERENCES tenants(id),
     action TEXT NOT NULL,
     target_file TEXT,
     target_id TEXT,
     payload JSONB NOT NULL DEFAULT '{}'::jsonb,
     result JSONB NOT NULL DEFAULT '{}'::jsonb,
     usuario_id UUID,
     usuario_email TEXT,
     usuario_nome TEXT,
     criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  "CREATE INDEX IF NOT EXISTS idx_titan_command_actions_tenant ON titan_command_actions(tenant_id, criado_em DESC)",
  "CREATE INDEX IF NOT EXISTS idx_titan_command_actions_target ON titan_command_actions(tenant_id, target_file, target_id)",
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
  "ALTER TABLE ficha_itens ADD COLUMN IF NOT EXISTS base_medida TEXT",
  "ALTER TABLE ficha_itens ADD COLUMN IF NOT EXISTS fonte TEXT",
  "ALTER TABLE ficha_itens ADD COLUMN IF NOT EXISTS observacao TEXT",
  "ALTER TABLE ficha_itens ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb",
  "ALTER TABLE preparo_itens ADD COLUMN IF NOT EXISTS est_produto_id INT",
  "ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS peso_g NUMERIC(14,3)",
  "ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS unidade_base TEXT",
  "ALTER TABLE est_produto ADD COLUMN IF NOT EXISTS departamento TEXT",
  "ALTER TABLE est_contagem_item ADD COLUMN IF NOT EXISTS geral BOOLEAN NOT NULL DEFAULT FALSE",
  "ALTER TABLE est_producao_run ADD COLUMN IF NOT EXISTS rendido NUMERIC(14,3)",
  "ALTER TABLE est_producao_run ADD COLUMN IF NOT EXISTS perda NUMERIC(14,3)"
];

const state = { migrationsOk: false, ultimoErro: null };

function normSeed(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function uniqById(rows) {
  const out = [], seen = new Set();
  for (const r of rows || []) {
    const id = String(r && r.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}
function fichaPremiumAliases(nome, aliases) {
  const all = [nome].concat(Array.isArray(aliases) ? aliases : []);
  if (/^adicional\s*-/i.test(String(nome || ''))) all.push(String(nome).replace(/^adicional\s*-\s*/i, '').trim());
  const key = normSeed(nome);
  const extras = {
    'cinco queijos': ['5 Queijos'],
    'sexta santa': ['Sexta-Santa'],
    'prestigio': ['Prestigio'],
    'raffaello': ['Rafaello'],
    'heinz ketchup e maionese': ['Heinz Ketchup + Maionese 12un', 'Heinz Ketchup e Maionese  12 un']
  };
  if (extras[key]) all.push.apply(all, extras[key]);
  return Array.from(new Set(all.map(x => String(x || '').trim()).filter(Boolean)));
}
function componenteEstoqueAliases(nome) {
  const all = [nome];
  const key = normSeed(nome);
  const map = {
    'molho premium': ['Molho produzido'],
    'mussarela': ['Muçarela'],
    'mucarela': ['Muçarela'],
    'chips ao leite': ['Gota Chips ao Leite'],
    'chips branco': ['Gota Chips Branco'],
    'leite ninho': ['Leite em Pó'],
    'batata palha': ['Batata Palha'],
    'coco chips': ['Coco Ralado Floco'],
    'coco ralado': ['Coco Ralado'],
    'avela triturada': ['Avelã', 'Avelã 30g'],
    'massa preparada': ['Massa preparada', 'Massa para pizza'],
    'frango': ['Frango temperado'],
    'file mignon preparado': ['Mignon 240g', 'File Mignon'],
    'camarao preparado': ['Camarão'],
    'bacon cubos': ['Bacon em cubos 110g', 'Bacon'],
    'bacon em cubos': ['Bacon', 'Bacon Sadia (granel)', 'Bacon em cubos 110g'],
    'bacon fatiado': ['Bacon'],
    'calabresa ralada': ['Calabresa Reta', 'Calabresa picada 80g'],
    'calabresa': ['Calabresa Reta', 'Calabresa defumada Sadia 2,5kg'],
    'presunto picado': ['Presunto'],
    'tomate': ['Tomate salada', 'Tomate italiano'],
    'tomate cereja': ['Tomate sweet grape 180g'],
    'alho poro': ['Alho-poró (maço)'],
    'catupiry': ['Catupiry Aberto da Montagem', 'Requeijão Catupiry', 'Requeijão Scala 1,5kg'],
    'cheddar': ['Cheddar Aberto da Montagem', 'Requeijão Cheddar'],
    'azeite': ['Azeite Andorinha'],
    'limao siciliano': ['Limão taiti'],
    'azeitona': ['Azeitona Preta'],
    'lombo fatiado': ['Lombo Canadense', 'Lombo 150g'],
    'manteiga': ['Manteiga Sem Sal', 'Manteiga Italac c/ sal 500g', 'Manteiga Itambé c/ sal 500g'],
    'cebola': ['Cebola roxa'],
    'batata frita': ['Batata frita', 'Batata'],
    'ovo': ['Ovo branco grande (cx 60un)'],
    'morango': ['Morango (caixa)'],
    'morango em cubos': ['Morango em cubos', 'Morango (caixa)'],
    'brigadeiro de ninho': ['Brigadeiro de Ninho', 'Leite em Pó'],
    'chocolate ao leite': ['Chocolate ao Leite - Aberto Finalização', 'Chocolate ao Leite Bisnaga'],
    'chocolate branco': ['Chocolate Branco - Aberto Finalização', 'Chocolate Branco Bisnaga'],
    'nutella': ['Nutella'],
    'doce de leite': ['Doce de Leite'],
    'ketchup e maionese': ['Ketchup Heinz', 'Maionese Heinz'],
    'rucula picada': ['Rúcula'],
    'pimentao vermelho': ['Pimentão Vermelho'],
    'pimentao amarelo': ['Pimentão Amarelo'],
    'pimentao verde': ['Pimentão Verde'],
    'manjericao': ['Manjericão'],
    'uva': ['Uva']
  };
  if (map[key]) all.push.apply(all, map[key]);
  return Array.from(new Set(all.map(x => String(x || '').trim()).filter(Boolean)));
}

async function seedInsumosFrescosPremiumV1(client) {
  const mk = await client.query("SELECT (config->>'estoque_insumos_frescos_v1') AS m FROM tenants WHERE id=$1", [TENANT]);
  if (mk.rows[0] && mk.rows[0].m) {
    console.log('[db] insumos frescos Premium já aplicados - ignorado');
    return;
  }
  await client.query('BEGIN');
  try {
    await client.query(`INSERT INTO est_setor (tenant_id,nome,ordem,ativo) VALUES ($1,'Montagem',30,TRUE)
      ON CONFLICT (tenant_id,nome) DO UPDATE SET ativo=TRUE`, [TENANT]);
    await client.query(`INSERT INTO est_categoria (tenant_id,nome,departamento,ordem,ativo) VALUES ($1,'Hortifruti','Alimentos',10,TRUE)
      ON CONFLICT (tenant_id,nome) DO UPDATE SET departamento=COALESCE(est_categoria.departamento,EXCLUDED.departamento), ativo=TRUE`, [TENANT]);
    const cat = await client.query("SELECT id FROM est_categoria WHERE tenant_id=$1 AND nome='Hortifruti' LIMIT 1", [TENANT]);
    const setor = await client.query("SELECT id FROM est_setor WHERE tenant_id=$1 AND nome='Montagem' LIMIT 1", [TENANT]);
    const catId = cat.rows[0] ? cat.rows[0].id : null;
    const setorId = setor.rows[0] ? setor.rows[0].id : null;
    const itens = [
      ['Pimentão Verde', 'KG', 'g', 1000],
      ['Pimentão Vermelho', 'KG', 'g', 1000],
      ['Pimentão Amarelo', 'KG', 'g', 1000],
      ['Rúcula', 'MAÇO', 'g', 200],
      ['Manjericão', 'MAÇO', 'g', 50],
      ['Uva', 'KG', 'g', 1000]
    ];
    let n = 0;
    for (const [nome, unidade, base, peso] of itens) {
      const r = await client.query(`INSERT INTO est_produto
        (tenant_id,nome,categoria_id,tipo_item,unidade,unidade_base,peso_g,pode_contar,pode_comprar,pode_produzir,ativo,conversao_origem,conversao_confianca,conversao_precisa_revisao)
        VALUES ($1,$2,$3,'insumo',$4,$5,$6,TRUE,TRUE,FALSE,TRUE,'seed_frescos','media',FALSE)
        ON CONFLICT (tenant_id,nome) DO UPDATE SET ativo=TRUE,
          categoria_id=COALESCE(est_produto.categoria_id,EXCLUDED.categoria_id),
          unidade=COALESCE(est_produto.unidade,EXCLUDED.unidade),
          unidade_base=COALESCE(est_produto.unidade_base,EXCLUDED.unidade_base),
          peso_g=COALESCE(est_produto.peso_g,EXCLUDED.peso_g),
          pode_contar=TRUE,pode_comprar=TRUE,atualizado_em=NOW()
        RETURNING id`, [TENANT, nome, catId, unidade, base, peso]);
      const pid = r.rows[0] && r.rows[0].id;
      if (!pid) {
        console.error('[db] FALHA insumos frescos: produto sem id após upsert - ' + nome);
        continue;
      }
      if (setorId) await client.query(`INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio)
        VALUES ($1,$2,$3,FALSE) ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING`, [TENANT, pid, setorId]);
      n++;
    }
    await client.query("UPDATE tenants SET config=COALESCE(config,'{}'::jsonb)||'{\"estoque_insumos_frescos_v1\":true}'::jsonb WHERE id=$1", [TENANT]);
    await client.query('COMMIT');
    console.log('[db] insumos frescos Premium semeados (' + n + ' produtos, setor Montagem)');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function seedProdutosComplementaresFichasPremiumV1(client) {
  const mk = await client.query("SELECT (config->>'estoque_complementos_fichas_v3') AS m FROM tenants WHERE id=$1", [TENANT]);
  if (mk.rows[0] && mk.rows[0].m) {
    console.log('[db] complementos de fichas Premium já aplicados - ignorado');
    return;
  }
  await client.query('BEGIN');
  try {
    const categorias = [
      ['Produção interna', 'Produção interna', 50],
      ['Confeitaria', 'Alimentos', 17]
    ];
    for (const [nome, dep, ordem] of categorias) {
      await client.query(`INSERT INTO est_categoria (tenant_id,nome,departamento,ordem,ativo)
        VALUES ($1,$2,$3,$4,TRUE)
        ON CONFLICT (tenant_id,nome) DO UPDATE SET ativo=TRUE, departamento=COALESCE(est_categoria.departamento,EXCLUDED.departamento)`,
        [TENANT, nome, dep, ordem]);
    }
    const setores = [['Montagem', 40], ['Finalização', 30]];
    for (const [nome, ordem] of setores) {
      await client.query(`INSERT INTO est_setor (tenant_id,nome,ordem,ativo)
        VALUES ($1,$2,$3,TRUE) ON CONFLICT (tenant_id,nome) DO UPDATE SET ativo=TRUE`, [TENANT, nome, ordem]);
    }
    const catRows = (await client.query("SELECT id,nome FROM est_categoria WHERE tenant_id=$1 AND nome = ANY($2::text[])", [TENANT, categorias.map(c => c[0])])).rows;
    const setorRows = (await client.query("SELECT id,nome FROM est_setor WHERE tenant_id=$1 AND nome = ANY($2::text[])", [TENANT, setores.map(s => s[0])])).rows;
    const catId = Object.fromEntries(catRows.map(r => [r.nome, r.id]));
    const setorId = Object.fromEntries(setorRows.map(r => [r.nome, r.id]));
    const itens = [
      { nome: 'Massa preparada', unidade: 'g', base: 'g', peso: 1, categoria: 'Produção interna', setor: 'Montagem' },
      { nome: 'Brigadeiro de Ninho', unidade: 'g', base: 'g', peso: 1, categoria: 'Confeitaria', setor: 'Finalização' },
      { nome: 'Morango em cubos', unidade: 'g', base: 'g', peso: 1, categoria: 'Confeitaria', setor: 'Finalização' },
      { nome: 'Batata frita', unidade: 'g', base: 'g', peso: 1, categoria: 'Produção interna', setor: 'Montagem' }
    ];
    let n = 0;
    for (const item of itens) {
      const r = await client.query(`INSERT INTO est_produto
        (tenant_id,nome,categoria_id,tipo_item,unidade,unidade_base,peso_g,pode_contar,pode_comprar,pode_produzir,ativo,conversao_origem,conversao_confianca,conversao_precisa_revisao)
        VALUES ($1,$2,$3,'produzido internamente',$4,$5,$6,TRUE,FALSE,TRUE,TRUE,'seed_complementos_fichas','media',FALSE)
        ON CONFLICT (tenant_id,nome) DO UPDATE SET ativo=TRUE,
          categoria_id=COALESCE(est_produto.categoria_id,EXCLUDED.categoria_id),
          unidade=COALESCE(est_produto.unidade,EXCLUDED.unidade),
          unidade_base=COALESCE(est_produto.unidade_base,EXCLUDED.unidade_base),
          peso_g=COALESCE(est_produto.peso_g,EXCLUDED.peso_g),
          pode_contar=TRUE,pode_produzir=TRUE,atualizado_em=NOW()
        RETURNING id`, [TENANT, item.nome, catId[item.categoria] || null, item.unidade, item.base, item.peso]);
      const pid = r.rows[0] && r.rows[0].id;
      const sid = setorId[item.setor];
      if (pid && sid) await client.query(`INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio)
        VALUES ($1,$2,$3,FALSE) ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING`, [TENANT, pid, sid]);
      n++;
    }
    await client.query("UPDATE tenants SET config=COALESCE(config,'{}'::jsonb)||'{\"estoque_complementos_fichas_v3\":true}'::jsonb WHERE id=$1", [TENANT]);
    await client.query('COMMIT');
    console.log('[db] complementos de fichas Premium semeados (' + n + ' produtos)');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function importarFichasPremiumCardapioV1(client) {
  const arquivo = path.join(__dirname, 'data', 'fichas-premium-cardapio-v1.json');
  if (!fs.existsSync(arquivo)) return { ok: false, motivo: 'arquivo_ausente' };
  const mk = await client.query("SELECT (config->>'fichas_premium_cardapio_v1') AS m FROM tenants WHERE id=$1", [TENANT]);
  if (mk.rows[0] && mk.rows[0].m) {
    console.log('[db] fichas Premium cardápio v1 já aplicadas - ignorado');
    return { ok: true, ignorado: true };
  }
  const data = JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, ''));
  const fichas = Array.isArray(data.fichas) ? data.fichas : [];
  const opRows = (await client.query(`SELECT o.id,o.nome,g.nome AS grupo_nome,p.nome AS produto_nome
    FROM opcoes o JOIN opcao_grupos g ON g.id=o.grupo_id JOIN produtos p ON p.id=g.produto_id
    WHERE o.tenant_id=$1 AND o.status<>'OCULTO'`, [TENANT])).rows;
  const opByNorm = {};
  for (const o of opRows) (opByNorm[normSeed(o.nome)] || (opByNorm[normSeed(o.nome)] = [])).push(o);
  const estRows = (await client.query('SELECT id,nome FROM est_produto WHERE tenant_id=$1 AND ativo', [TENANT])).rows;
  const estByNorm = {};
  for (const p of estRows) if (!estByNorm[normSeed(p.nome)]) estByNorm[normSeed(p.nome)] = p;
  const resolveEst = (nome) => {
    for (const alias of componenteEstoqueAliases(nome)) {
      const hit = estByNorm[normSeed(alias)];
      if (hit) return hit.id;
    }
    return null;
  };
  const semOpcao = [], semInsumo = new Set();
  let alvosInseridos = 0, linhasInseridas = 0, alvosIgnorados = 0;
  await client.query('BEGIN');
  try {
    for (const ficha of fichas) {
      const ops = uniqById(fichaPremiumAliases(ficha.nome, ficha.aliases).flatMap(a => opByNorm[normSeed(a)] || []));
      if (!ops.length) {
        semOpcao.push(ficha.nome);
        continue;
      }
      for (const op of ops) {
        const ja = await client.query('SELECT COUNT(*)::int AS n FROM ficha_itens WHERE tenant_id=$1 AND opcao_id=$2', [TENANT, op.id]);
        if (ja.rows[0].n > 0) {
          alvosIgnorados++;
          continue;
        }
        let ordem = 0;
        for (const item of (ficha.itens || [])) {
          const qtd = item.equivalente_g != null ? Number(item.equivalente_g) : Number(item.quantidade);
          const unidade = item.equivalente_g != null ? 'g' : String(item.unidade || '').trim();
          if (!(qtd > 0)) continue;
          const estId = resolveEst(item.componente);
          if (!estId) semInsumo.add(item.componente);
          const obs = [item.observacao, item.confianca ? 'confiança: ' + item.confianca : null].filter(Boolean).join(' | ') || null;
          await client.query(`INSERT INTO ficha_itens
            (tenant_id,opcao_id,insumo_nome,est_produto_id,quantidade,unidade,base_medida,fonte,meta)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
            [TENANT, op.id, item.componente, estId, qtd, unidade || null, '1 porção = 1/2 pizza grande ou 1 pizza pequena', item.fonte || null,
             JSON.stringify({ importado_de: data.versao || 'premium-cardapio-v1', ficha: ficha.nome, grupo: ficha.grupo, chave: ficha.chave, tipo: item.tipo || null, receita_ref: item.receita_ref || null, ordem: ordem++ })]);
          linhasInseridas++;
        }
        alvosInseridos++;
      }
    }
    await client.query('UPDATE tenants SET config=COALESCE(config,\'{}\'::jsonb)||jsonb_build_object(\'fichas_premium_cardapio_v1\',true,\'fichas_premium_cardapio_v1_resumo\',jsonb_build_object(\'alvos_inseridos\',$2,\'linhas_inseridas\',$3,\'alvos_ignorados\',$4,\'sem_opcao\',$5::jsonb,\'sem_insumo\',$6::jsonb)) WHERE id=$1',
      [TENANT, alvosInseridos, linhasInseridas, alvosIgnorados, JSON.stringify(semOpcao), JSON.stringify(Array.from(semInsumo).slice(0, 80))]);
    await client.query('COMMIT');
    console.log('[db] fichas Premium cardápio v1 importadas - alvos: ' + alvosInseridos + ', linhas: ' + linhasInseridas + ', ignorados: ' + alvosIgnorados + ', sem opção: ' + semOpcao.length + ', sem insumo direto: ' + semInsumo.size);
    if (semOpcao.length) console.log('[db] fichas Premium sem opção no cardápio: ' + semOpcao.slice(0, 20).join(', '));
    if (semInsumo.size) console.log('[db] fichas Premium sem insumo direto no estoque: ' + Array.from(semInsumo).slice(0, 20).join(', '));
    return { ok: true, alvosInseridos, linhasInseridas, alvosIgnorados, semOpcao, semInsumo: Array.from(semInsumo) };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function migrarFichasProducaoV2(client) {
  await client.query(`INSERT INTO est_ficha_producao (tenant_id,produto_id,descricao,unidade_consumo,tipo,ativo)
    SELECT DISTINCT r.tenant_id,r.produto_id,p.nome,p.unidade,'PRODUZIDO',TRUE
      FROM est_producao_receita r JOIN est_produto p ON p.id=r.produto_id
     WHERE r.tenant_id=$1::varchar AND r.ativo
    ON CONFLICT (tenant_id,produto_id) DO NOTHING`, [TENANT]);
  await client.query(`INSERT INTO est_ficha_porcao (tenant_id,ficha_id,nome,rendimento,unidade,ordem,ativo)
    SELECT f.tenant_id,f.id,'Receita padrão',COALESCE(MAX(NULLIF(r.rendimento,0)),1),p.unidade,0,TRUE
      FROM est_ficha_producao f JOIN est_produto p ON p.id=f.produto_id
      JOIN est_producao_receita r ON r.tenant_id=f.tenant_id AND r.produto_id=f.produto_id AND r.ativo
     WHERE f.tenant_id=$1::varchar AND NOT EXISTS (SELECT 1 FROM est_ficha_porcao x WHERE x.tenant_id=f.tenant_id AND x.ficha_id=f.id)
     GROUP BY f.tenant_id,f.id,p.unidade`, [TENANT]);
  await client.query(`INSERT INTO est_ficha_porcao_item (tenant_id,porcao_id,insumo_produto_id,quantidade,unidade,observacao,ordem)
    SELECT r.tenant_id,po.id,r.insumo_produto_id,r.quantidade_por_unidade,r.unidade,r.observacao,
           ROW_NUMBER() OVER (PARTITION BY po.id ORDER BY r.id)::int
      FROM est_producao_receita r
      JOIN est_ficha_producao f ON f.tenant_id=r.tenant_id AND f.produto_id=r.produto_id AND f.ativo
      JOIN est_ficha_porcao po ON po.tenant_id=f.tenant_id AND po.ficha_id=f.id AND po.ativo
     WHERE r.tenant_id=$1::varchar AND r.ativo AND r.quantidade_por_unidade>0
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
      await client.query(`INSERT INTO est_setor (tenant_id,nome,ordem,ativo) VALUES ($1::varchar,$2,$3,TRUE)
        ON CONFLICT (tenant_id,nome) DO UPDATE SET ordem=EXCLUDED.ordem,ativo=TRUE`, [TENANT,nome,ordemSetor[nome] || 99]);
    }
    const cat = await client.query(`INSERT INTO est_categoria (tenant_id,nome,ordem,ativo) VALUES ($1::varchar,'Produtos produzidos internamente',3,TRUE)
      ON CONFLICT (tenant_id,nome) DO UPDATE SET ativo=TRUE RETURNING id`, [TENANT]);
    const catProduzido = cat.rows[0].id;
    for (const [antigo, novo, unidade] of catalogo.renomear || []) {
      const alvo = await client.query('SELECT id FROM est_produto WHERE tenant_id=$1::varchar AND lower(nome)=lower($2)', [TENANT,novo]);
      if (alvo.rows[0]) await client.query('UPDATE est_produto SET ativo=FALSE,atualizado_em=NOW() WHERE tenant_id=$1::varchar AND lower(nome)=lower($2) AND id<>$3', [TENANT,antigo,alvo.rows[0].id]);
      else await client.query('UPDATE est_produto SET nome=$3,unidade=$4,ativo=TRUE,atualizado_em=NOW() WHERE tenant_id=$1::varchar AND lower(nome)=lower($2)', [TENANT,antigo,novo,unidade]);
    }
    for (const nome of catalogo.desativar || []) await client.query('UPDATE est_produto SET ativo=FALSE,atualizado_em=NOW() WHERE tenant_id=$1::varchar AND lower(nome)=lower($2)', [TENANT,nome]);
    for (const [setor, itens] of Object.entries(catalogo.setores || {})) {
      const sid = (await client.query('SELECT id FROM est_setor WHERE tenant_id=$1::varchar AND nome=$2',[TENANT,setor])).rows[0].id;
      for (const [nome, unidade] of itens) {
        const ehProduzido = produzido.has(nome);
        let pr = await client.query('SELECT id FROM est_produto WHERE tenant_id=$1::varchar AND lower(nome)=lower($2) ORDER BY ativo DESC,id LIMIT 1',[TENANT,nome]);
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
        await client.query('DELETE FROM est_produto_setor WHERE tenant_id=$1::varchar AND produto_id=$2',[TENANT,pid]);
        await client.query('INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) VALUES ($1::varchar,$2,$3,FALSE)',[TENANT,pid,sid]);
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
      const sid=(await client.query('SELECT id FROM est_setor WHERE tenant_id=$1::varchar AND nome=$2',[TENANT,setor])).rows[0].id;
      for (const nome of nomes) {
        const p=await client.query('SELECT id,unidade FROM est_produto WHERE tenant_id=$1::varchar AND lower(nome)=lower($2) AND ativo ORDER BY id LIMIT 1',[TENANT,nome]);
        if(!p.rows[0]) continue;
        await client.query('UPDATE est_produto SET pode_produzir=TRUE,pode_comprar=FALSE,categoria_id=$3,atualizado_em=NOW() WHERE tenant_id=$1::varchar AND id=$2',[TENANT,p.rows[0].id,catProduzido]);
        await client.query('INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) VALUES ($1::varchar,$2,$3,FALSE) ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING',[TENANT,p.rows[0].id,sid]);
        const f=await client.query(`INSERT INTO est_ficha_producao (tenant_id,produto_id,descricao,unidade_consumo,tipo,ativo)
          VALUES ($1::varchar,$2,$3,$4,'PRODUZIDO',TRUE) ON CONFLICT (tenant_id,produto_id) DO UPDATE SET ativo=TRUE,unidade_consumo=EXCLUDED.unidade_consumo RETURNING id`,[TENANT,p.rows[0].id,nome,p.rows[0].unidade]);
        await client.query(`INSERT INTO est_ficha_porcao (tenant_id,ficha_id,nome,rendimento,unidade,ordem,ativo)
          SELECT $1::varchar,$2,'Receita padrão',1,$3,0,TRUE WHERE NOT EXISTS (SELECT 1 FROM est_ficha_porcao WHERE tenant_id=$1::varchar AND ficha_id=$2 AND ativo)`,[TENANT,f.rows[0].id,p.rows[0].unidade]);
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
        const emails = String(process.env.TITAN_TOOL_BOOTSTRAP_EMAILS || '')
          .split(',')
          .map(function (e) { return e.trim().toLowerCase(); })
          .filter(function (e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); });
        for (const email of emails) {
          await pool.query(`INSERT INTO titan_tool_users (tenant_id,email,nome,permissoes,ativo)
            SELECT $1::varchar,$2,$3,ARRAY['acesso_total','command_center','mapper','ver_project_state','editar_project_state','acionar_deploy','gerenciar_usuarios']::TEXT[],TRUE
            WHERE NOT EXISTS (SELECT 1 FROM titan_tool_users WHERE tenant_id=$1::varchar AND lower(email)=lower($2))`,
            [TENANT, email, email.split('@')[0]]);
          await pool.query(`UPDATE titan_tool_users
              SET ativo=TRUE,
                  permissoes=ARRAY['acesso_total','command_center','mapper','ver_project_state','editar_project_state','acionar_deploy','gerenciar_usuarios']::TEXT[],
                  atualizado_em=NOW()
            WHERE tenant_id=$1::varchar AND lower(email)=lower($2)`,
            [TENANT, email]);
        }
        if (emails.length) console.log('[db] titan tools bootstrap emails autorizados: ' + emails.length);
      } catch (et) { console.log('[db] titan tools bootstrap aviso:', et.code || et.message); }
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
          if (fs.existsSync(path.join(__dirname, 'data', 'fichas-premium-cardapio-v1.json'))) {
            console.log('[db] seed fase3 legado adiado: import Premium v1 será usado após estoque/catalogo');
          } else {
            const seed3 = fs.readFileSync(path.join(__dirname, 'seed-fase3.sql'), 'utf8');
            await pool.query(seed3);
            console.log('[db] seed fase3 (fichas tecnicas) aplicado');
          }
        } else {
          console.log('[db] fichas ja populadas (' + rf.rows[0].n + ') - seed fase3 ignorado');
        }
      } catch (es3) { console.error('[db] seed-fase3 aviso:', es3.stack || es3.message); }
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
        // Sugestões de conversão POR CATEGORIA (maço/talo/folha de hortifruti). Só semeia se vazio —
        // depois editável pelo gestor. Genérico: vive no banco por tenant. Baixa confiança entra com
        // precisa_revisao=true (alho-poró: NF diz "maço", default é por talo limpo — gestor confirma).
        const rc = await pool.query('SELECT COUNT(*)::int AS n FROM est_conversao_categoria WHERE tenant_id=$1', [TENANT]);
        if (rc.rows[0].n === 0) {
          const defaults = [
            ['Hortifruti', 'Rúcula hidropônica', 'MAÇO', 'g', 200, 'media', false],
            ['Hortifruti', 'Rúcula de terra', 'MAÇO', 'g', 250, 'media', false],
            ['Hortifruti', 'Manjericão (folha)', 'FOLHA', 'g', 1.25, 'media', false],
            ['Hortifruti', 'Alho-poró (talo limpo)', 'TALO', 'g', 105, 'baixa', true]
          ];
          for (const [cat, rotulo, uc, ub, fator, conf, rev] of defaults)
            await pool.query(`INSERT INTO est_conversao_categoria (tenant_id,categoria_ref,rotulo,unidade_compra,unidade_base,fator,confianca,precisa_revisao)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id,categoria_ref,rotulo) DO NOTHING`, [TENANT, cat, rotulo, uc, ub, fator, conf, rev]);
          console.log('[db] sugestões de conversão por categoria semeadas (' + defaults.length + ')');
        } else { console.log('[db] conversões por categoria já populadas (' + rc.rows[0].n + ') - seed ignorado'); }
      } catch (ec) { console.log('[db] conversões por categoria aviso:', ec.code || ec.message); }
      try {
        // Biblioteca de categorias sugeridas de restaurante (ADENDO §3 / SEED §2). Pré-ativadas para
        // o tenant, EDITÁVEIS e EXCLUÍVEIS. Guardada por flag p/ que exclusões NÃO ressuscitem no boot.
        const mk = await pool.query("SELECT (config->>'estoque_categorias_lib_v1') AS m FROM tenants WHERE id=$1", [TENANT]);
        if (!mk.rows[0] || !mk.rows[0].m) {
          const lib = [
            ['Alimentos', 'Hortifruti', 10], ['Alimentos', 'Laticínios', 11], ['Alimentos', 'Proteínas', 12],
            ['Alimentos', 'Secos e mercearia', 13], ['Alimentos', 'Óleos e gorduras', 14], ['Alimentos', 'Molhos e condimentos', 15],
            ['Alimentos', 'Temperos e condimentos', 16], ['Alimentos', 'Confeitaria', 17], ['Alimentos', 'Conservas', 18],
            ['Bebidas', 'Refrigerantes', 20], ['Bebidas', 'Gelo', 21],
            ['Embalagens', 'Embalagens de delivery', 30], ['Embalagens', 'Descartáveis', 31],
            ['Limpeza e higiene', 'Produtos de limpeza', 40], ['Limpeza e higiene', 'Higiene operacional', 41],
            ['Produção interna', 'Massas (produção)', 50], ['Produção interna', 'Molhos (produção)', 51], ['Produção interna', 'Recheios (produção)', 52]
          ];
          for (const [dep, nome, ordem] of lib)
            await pool.query(`INSERT INTO est_categoria (tenant_id, nome, departamento, ordem, ativo) VALUES ($1,$2,$3,$4,TRUE)
              ON CONFLICT (tenant_id, nome) DO UPDATE SET departamento=COALESCE(est_categoria.departamento, EXCLUDED.departamento)`, [TENANT, nome, dep, ordem]);
          await pool.query("UPDATE tenants SET config=COALESCE(config,'{}'::jsonb)||'{\"estoque_categorias_lib_v1\":true}'::jsonb WHERE id=$1", [TENANT]);
          console.log('[db] biblioteca de categorias sugeridas aplicada (carga única, ' + lib.length + ')');
        } else { console.log('[db] biblioteca de categorias já aplicada - ignorada'); }
      } catch (ecl) { console.log('[db] categorias sugeridas aviso:', ecl.code || ecl.message); }
      try {
        // Seed real da Premium a partir das NFs (dados reais, não adivinhação). Guardado por flag —
        // roda uma vez; não clobbera edições do gestor depois. ALTA: fator preenchido. BAIXA:
        // precisa_revisao=true e fator em branco quando a NF não suporta. Idempotente (ON CONFLICT).
        const mk = await pool.query("SELECT (config->>'estoque_seed_nfs_v1') AS m FROM tenants WHERE id=$1", [TENANT]);
        if (!mk.rows[0] || !mk.rows[0].m) {
          const seedNF = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'seed-premium-nfs-v1.json'), 'utf8').replace(/^﻿/, ''));
          const fornId = {};
          for (const f of seedNF.fornecedores) {
            const r = await pool.query(`INSERT INTO est_fornecedor (tenant_id,nome,tipo) VALUES ($1,$2,$3)
              ON CONFLICT (tenant_id,nome) DO UPDATE SET tipo=COALESCE(est_fornecedor.tipo,EXCLUDED.tipo) RETURNING id`, [TENANT, f.nome, f.tipo || null]);
            fornId[f.nome] = r.rows[0].id;
          }
          let n = 0;
          for (const p of seedNF.produtos) {
            const cat = await pool.query('SELECT id FROM est_categoria WHERE tenant_id=$1 AND nome=$2', [TENANT, p.categoria]);
            const catId = cat.rows[0] ? cat.rows[0].id : null;
            const fid = p.forn ? (fornId[p.forn] || null) : null;
            const pr = await pool.query(`INSERT INTO est_produto
              (tenant_id,nome,nome_nf,categoria_id,subcategoria,tipo_item,unidade,unidade_base,peso_g,ultimo_valor,
               fornecedor_preferido_id,ultimo_fornecedor_id,conversao_origem,conversao_confianca,conversao_precisa_revisao,pode_comprar,ativo)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,'NF',$12,$13,TRUE,TRUE)
              ON CONFLICT (tenant_id,nome) DO UPDATE SET nome_nf=EXCLUDED.nome_nf, categoria_id=EXCLUDED.categoria_id,
                subcategoria=EXCLUDED.subcategoria, tipo_item=EXCLUDED.tipo_item, unidade=EXCLUDED.unidade, unidade_base=EXCLUDED.unidade_base,
                peso_g=EXCLUDED.peso_g, ultimo_valor=EXCLUDED.ultimo_valor, fornecedor_preferido_id=EXCLUDED.fornecedor_preferido_id,
                ultimo_fornecedor_id=EXCLUDED.ultimo_fornecedor_id, conversao_origem='NF', conversao_confianca=EXCLUDED.conversao_confianca,
                conversao_precisa_revisao=EXCLUDED.conversao_precisa_revisao, atualizado_em=NOW()
              RETURNING id`,
              [TENANT, p.nome, p.nome_nf || null, catId, p.sub || null, p.tipo || null, p.unidade || null, p.base || null,
               p.fator != null ? p.fator : null, p.ultimo != null ? p.ultimo : null, fid, p.conf || null, !!p.rev]);
            const pid = pr.rows[0].id; n++;
            for (const pv of (p.precos || [])) {
              const pfid = fornId[pv.forn]; if (!pfid) continue;
              await pool.query(`INSERT INTO est_produto_fornecedor (tenant_id,produto_id,fornecedor_id,ultimo_valor,menor_valor,maior_valor)
                VALUES ($1,$2,$3,$4,$4,$4) ON CONFLICT (tenant_id,produto_id,fornecedor_id) DO UPDATE SET ultimo_valor=EXCLUDED.ultimo_valor,
                  menor_valor=LEAST(est_produto_fornecedor.menor_valor,EXCLUDED.menor_valor), maior_valor=GREATEST(est_produto_fornecedor.maior_valor,EXCLUDED.maior_valor)`,
                [TENANT, pid, pfid, pv.valor]);
            }
          }
          await pool.query("UPDATE tenants SET config=COALESCE(config,'{}'::jsonb)||'{\"estoque_seed_nfs_v1\":true}'::jsonb WHERE id=$1", [TENANT]);
          console.log('[db] seed real Premium NFs aplicado (' + n + ' produtos, ' + seedNF.fornecedores.length + ' fornecedores)');
        } else { console.log('[db] seed Premium NFs já aplicado - ignorado'); }
      } catch (enf) { console.log('[db] seed Premium NFs aviso:', enf.code || enf.message); }
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
        const freshClient = await pool.connect();
        try { await seedInsumosFrescosPremiumV1(freshClient); } finally { freshClient.release(); }
      } catch (eif) { console.error('[db] FALHA insumos frescos Premium:', eif.stack || eif.message); }
      try {
        const compClient = await pool.connect();
        try { await seedProdutosComplementaresFichasPremiumV1(compClient); } finally { compClient.release(); }
      } catch (ecp) { console.error('[db] FALHA complementos fichas Premium:', ecp.stack || ecp.message); }
      try {
        const fichaClient = await pool.connect();
        try { await importarFichasPremiumCardapioV1(fichaClient); } finally { fichaClient.release(); }
      } catch (efp) { console.error('[db] FALHA fichas Premium cardápio v1:', efp.stack || efp.message); }
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
