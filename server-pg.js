/* ============================================================
   Premium Pizzas — servidor de PRODUÇÃO (CONVERGIDO com Khardela)
   Fonte única: banco titan_khardela, schema khardela.
   - cardápio  -> menu_items / menu_categorias  (fallback: data/cardapio.json)
   - clientes  -> customers
   - pedidos   -> orders  (status canônico Saipos/Khardela, rótulos no painel)
   - config    -> tenants.config
   Mantém /loja e /gestor funcionando (mesmas respostas de antes).
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const TENANT = db.TENANT;

const ROOT = __dirname;
const CARDAPIO_FILE = path.join(ROOT, 'data', 'cardapio.json');
const PORT = process.env.PORT || 8080;
const WA_SECRET = process.env.WA_SECRET || 'premium-pizzas-wa-2026';

const soPhone = s => String(s || '').replace(/\D/g, '');
const validWA = p => { p = soPhone(p); return p.length === 12 || p.length === 13; };
const waToken = phone => crypto.createHmac('sha256', WA_SECRET).update(soPhone(phone)).digest('hex').slice(0, 16);
const money = n => Math.round(Number(n) * 100) / 100;
function json(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(b); }
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); }); }

/* status canônico (orders.status_atual) <-> rótulos do painel atual */
const CANON_TO_UI = { CONFIRMED: 'RECEBIDO', PRODUCING: 'EM_PREPARO', READY_TO_DELIVER: 'PRONTO', DISPATCHED: 'EM_ROTA', CONCLUDED: 'ENTREGUE', CANCELLED: 'CANCELADO' };
const UI_TO_CANON = { RECEBIDO: 'CONFIRMED', EM_PREPARO: 'PRODUCING', PRONTO: 'READY_TO_DELIVER', EM_ROTA: 'DISPATCHED', ENTREGUE: 'CONCLUDED', CANCELADO: 'CANCELLED' };
const TS_COL = { PRODUCING: 'confirmado_em', READY_TO_DELIVER: 'pronto_em', DISPATCHED: 'despachado_em', CONCLUDED: 'entregue_em', CANCELLED: 'cancelado_em' };

function calcItem(it) {
  let total = 0;
  if (it.tipo === 'montavel') {
    // modelo novo: SOMA dos preços de todas as seleções (estilo, sabores, recheios, adicionais, extras)
    for (const s of (it.selecoes || [])) total += Number(s.preco || 0);
    total += Number(it.preco_base || 0);
  } else if (it.tipo === 'pizza') {
    const s = it.sabores || [];
    for (const x of s) total += Number(x.preco_meia || x.preco || 0);
    if (s.length === 1) total = Number(s[0].preco_meia) * 2;
    if (it.borda && it.borda.preco) total += Number(it.borda.preco);
    for (const a of (it.adicionais || [])) total += Number(a.preco || 0);
  } else { total = Number(it.preco || 0); }
  return money(total * (it.quantidade || 1));
}

/* ---------- CARDÁPIO: monta a partir de menu_items (fallback json) ---------- */
let cardapioCacheFonte = 'desconhecida';
async function montarCardapio() {
  try {
    const r = await db.q(
      `SELECT mi.id, mi.tipo, mi.codigo_saipos, mi.nome, mi.descricao,
              mi.preco_metade, mi.preco_inteira, mi.preco_simples, mi.ingredientes, mi.status, mi.ordem
         FROM menu_items mi
        WHERE mi.tenant_id=$1 AND mi.status <> 'OCULTO'`, [TENANT]);
    const rows = r.rows;
    const sabores = rows.filter(x => x.tipo === 'sabor');
    if (sabores.length >= 20) {
      cardapioCacheFonte = 'menu_items (khardela)';
      const isDoce = ing => !(Array.isArray(ing) ? ing : []).map(s => String(s).toLowerCase()).includes('molho premium');
      const cod = x => x.codigo_saipos || x.id;
      return {
        marca: 'Premium Pizzas', slogan: 'COM AMOR', tenant: TENANT,
        cores: { preto: '#0D0D0D', laranja: '#F97316', branco: '#FFFFFF' },
        sabores: sabores.map(x => ({ codigo: cod(x), nome: x.nome, descricao: x.descricao || '', preco_meia: Number(x.preco_metade), preco_inteira: Number(x.preco_inteira), ingredientes: x.ingredientes || [], doce: isDoce(x.ingredientes), ordem: x.ordem, status: x.status })).sort((a, b) => a.ordem - b.ordem),
        bebidas: rows.filter(x => x.tipo === 'bebida').map(x => ({ codigo: cod(x), nome: x.nome, descricao: x.descricao || '', preco: Number(x.preco_simples), ordem: x.ordem, status: x.status })).sort((a, b) => a.ordem - b.ordem),
        adicionais: rows.filter(x => x.tipo === 'adicional' || x.tipo === 'extra').map(x => ({ codigo: cod(x), tipo: x.tipo, nome: x.nome, descricao: x.descricao || '', preco: Number(x.preco_simples), ordem: x.ordem })).sort((a, b) => a.ordem - b.ordem),
        bordas: rows.filter(x => x.tipo === 'borda').map(x => ({ nome: x.nome, preco: Number(x.preco_metade || x.preco_simples || 9.9) }))
      };
    }
  } catch (e) { console.log('[cardapio] erro lendo menu_items, usando fallback:', e.code || e.message); }
  // fallback: arquivo estático (garante loja no ar enquanto menu_items não está completo)
  cardapioCacheFonte = 'fallback data/cardapio.json';
  const base = JSON.parse(fs.readFileSync(CARDAPIO_FILE, 'utf8'));
  // se o DB tem bordas e o json não, mistura (bordas raramente vêm no import inicial)
  return base;
}

/* ---------- pedido (orders) -> formato que o painel/loja esperam ---------- */
function orderToFront(o) {
  const tipoUI = o.mode === 'TABLE' ? 'MESA' : o.mode; // DELIVERY | TAKEOUT | MESA
  return {
    id: o.id, numero: o.display_id || o.id, criado_em: o.criado_em,
    status: CANON_TO_UI[o.status_atual] || 'RECEBIDO',
    canal: o.origem, origem_whatsapp: !!(o.metadata && o.metadata.origem_whatsapp),
    cliente: { telefone: o.customer_phone, nome: (o.metadata && o.metadata.cliente_nome) || 'Cliente' },
    tipo: tipoUI, endereco: o.endereco, pagamento: o.pagamento,
    itens: o.items, subtotal: Number(o.subtotal), taxa_entrega: Number(o.taxa_entrega || 0),
    total: Number(o.total), observacao: o.observacoes || '',
    historico: o.historico_status || [], impresso: !!(o.metadata && o.metadata.impresso)
  };
}

async function api(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean);
  const sub = seg[1];
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }

  if (sub === 'health') return json(res, 200, { ok: true, ts: new Date().toISOString() });

  if (sub === '_diag') {
    const out = { tenant: TENANT, cardapio_fonte: cardapioCacheFonte, tabelas: {} };
    const q1 = async (label, sql, p) => { try { const r = await db.q(sql, p); out.tabelas[label] = r.rows[0].n; } catch (e) { out.tabelas[label] = 'ERRO: ' + (e.code || e.message); } };
    await q1('tenants', 'SELECT count(*) n FROM tenants');
    await q1('rbac_contacts', 'SELECT count(*) n FROM rbac_contacts WHERE tenant_id=$1', [TENANT]);
    await q1('menu_categorias', 'SELECT count(*) n FROM menu_categorias WHERE tenant_id=$1', [TENANT]);
    await q1('menu_items_total', 'SELECT count(*) n FROM menu_items WHERE tenant_id=$1', [TENANT]);
    await q1('menu_items_sabor', `SELECT count(*) n FROM menu_items WHERE tenant_id=$1 AND tipo='sabor'`, [TENANT]);
    await q1('menu_items_borda', `SELECT count(*) n FROM menu_items WHERE tenant_id=$1 AND tipo='borda'`, [TENANT]);
    await q1('customers', 'SELECT count(*) n FROM customers WHERE tenant_id=$1', [TENANT]);
    await q1('orders', 'SELECT count(*) n FROM orders WHERE tenant_id=$1', [TENANT]);
    await q1('mesas', 'SELECT count(*) n FROM mesas WHERE tenant_id=$1', [TENANT]);
    await q1('produtos', 'SELECT count(*) n FROM produtos WHERE tenant_id=$1', [TENANT]);
    await q1('opcao_grupos', 'SELECT count(*) n FROM opcao_grupos WHERE tenant_id=$1', [TENANT]);
    await q1('opcoes', 'SELECT count(*) n FROM opcoes WHERE tenant_id=$1', [TENANT]);
    await q1('preparos', 'SELECT count(*) n FROM preparos WHERE tenant_id=$1', [TENANT]);
    await q1('preparo_itens', 'SELECT count(*) n FROM preparo_itens WHERE tenant_id=$1', [TENANT]);
    await q1('insumo_custos', 'SELECT count(*) n FROM insumo_custos WHERE tenant_id=$1', [TENANT]);
    await q1('ficha_itens', 'SELECT count(*) n FROM ficha_itens WHERE tenant_id=$1', [TENANT]);
    // introspeccao das tabelas legadas (p/ popular fichas tecnicas com seguranca)
    out.colunas = {};
    for (const t of ['manual_montagem', 'estoque_itens_definicao']) {
      try { const r = await db.q('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position', ['khardela', t]); out.colunas[t] = r.rows.map(x => x.column_name); }
      catch (e) { out.colunas[t] = 'ERRO: ' + (e.code || e.message); }
    }
    return json(res, 200, out);
  }

  if (sub === 'cardapio' && req.method === 'GET') return json(res, 200, await montarCardapio());

  // catalogo: modelo novo (produtos -> grupos -> opcoes). Fonte para a UI da Fase 1/3.
  if (sub === 'catalogo' && req.method === 'GET') {
    try {
      const cats = await db.q('SELECT id, codigo, nome, ordem FROM menu_categorias WHERE tenant_id=$1 AND ativa IS NOT FALSE ORDER BY ordem, nome', [TENANT]);
      const prods = await db.q('SELECT id, categoria_id, nome, descricao, tipo_montagem, preco_base, regra_preco, gratuito, status, codigo_externo, ordem FROM produtos WHERE tenant_id=$1 AND status<>$2 ORDER BY ordem, nome', [TENANT, 'OCULTO']);
      const grupos = await db.q('SELECT id, produto_id, nome, ordem, min_escolhas, max_escolhas, permite_repeticao, regra_preco, condicao FROM opcao_grupos WHERE tenant_id=$1 ORDER BY ordem', [TENANT]);
      const opcoes = await db.q('SELECT id, grupo_id, nome, descricao, preco, status, ingredientes, codigo_externo, ordem FROM opcoes WHERE tenant_id=$1 ORDER BY ordem', [TENANT]);
      const opByGrupo = {}; for (const o of opcoes.rows) (opByGrupo[o.grupo_id] = opByGrupo[o.grupo_id] || []).push({ id: o.id, nome: o.nome, descricao: o.descricao || '', preco: Number(o.preco), status: o.status, ingredientes: o.ingredientes || [], codigo: o.codigo_externo || null, ordem: o.ordem });
      const grByProd = {}; for (const g of grupos.rows) (grByProd[g.produto_id] = grByProd[g.produto_id] || []).push({ id: g.id, nome: g.nome, min: g.min_escolhas, max: g.max_escolhas, repete: g.permite_repeticao, regra: g.regra_preco, condicao: g.condicao || {}, opcoes: opByGrupo[g.id] || [] });
      const prodByCat = {}; for (const p of prods.rows) (prodByCat[p.categoria_id] = prodByCat[p.categoria_id] || []).push({ id: p.id, nome: p.nome, descricao: p.descricao || '', tipo: p.tipo_montagem, preco_base: Number(p.preco_base), regra: p.regra_preco, gratuito: p.gratuito, status: p.status, codigo: p.codigo_externo || null, grupos: grByProd[p.id] || [] });
      const categorias = cats.rows.map(c => ({ id: c.id, codigo: c.codigo, nome: c.nome, produtos: prodByCat[c.id] || [] })).filter(c => c.produtos.length);
      return json(res, 200, { tenant: TENANT, categorias });
    } catch (e) { return json(res, 200, { tenant: TENANT, categorias: [], aviso: 'modelo novo ainda nao populado: ' + (e.code || e.message) }); }
  }

  if (sub === 'auth' && req.method === 'POST') {
    const b = await readBody(req);
    const phone = soPhone(b.telefone), senha = soPhone(b.senha);
    if (!validWA(phone)) return json(res, 400, { erro: 'Informe um número de WhatsApp válido com DDD (ex: 5517999999999).' });
    if (phone !== senha) return json(res, 401, { erro: 'A senha é o seu próprio número de celular.' });
    let r = await db.q('SELECT phone, nome FROM customers WHERE tenant_id=$1 AND phone=$2', [TENANT, phone]);
    let cli = r.rows[0];
    if (!cli) { r = await db.q('INSERT INTO customers(tenant_id, phone, nome) VALUES($1,$2,$3) RETURNING phone, nome', [TENANT, phone, b.nome || '']); cli = r.rows[0]; }
    else if (b.nome && !cli.nome) { await db.q('UPDATE customers SET nome=$3 WHERE tenant_id=$1 AND phone=$2', [TENANT, phone, b.nome]); cli.nome = b.nome; }
    return json(res, 200, { ok: true, cliente: { telefone: cli.phone, nome: cli.nome || '' }, origem_whatsapp: !!(b.wa && b.wa === waToken(phone)) });
  }

  if (sub === 'wa-link' && req.method === 'GET') {
    const phone = soPhone(url.searchParams.get('telefone'));
    if (!validWA(phone)) return json(res, 400, { erro: 'numero invalido' });
    return json(res, 200, { telefone: phone, token: waToken(phone), link: `/loja?tel=${phone}&wa=${waToken(phone)}` });
  }

  if (sub === 'pedidos' && req.method === 'POST') {
    const b = await readBody(req);
    const phone = soPhone(b.cliente && b.cliente.telefone);
    if (!validWA(phone)) return json(res, 400, { erro: 'cliente sem WhatsApp válido' });
    const itens = Array.isArray(b.itens) ? b.itens : [];
    if (!itens.length) return json(res, 400, { erro: 'pedido sem itens' });
    for (const it of itens) it.total = calcItem(it);
    const subtotal = money(itens.reduce((s, it) => s + it.total, 0));
    const modeIn = (b.tipo === 'DELIVERY') ? 'DELIVERY' : (b.tipo === 'MESA' ? 'TABLE' : 'TAKEOUT');
    const taxa = modeIn === 'DELIVERY' ? money(b.taxa_entrega || 0) : 0;
    const total = money(subtotal + taxa);
    // cliente
    const cr = await db.q(`INSERT INTO customers(tenant_id, phone, nome) VALUES($1,$2,$3)
      ON CONFLICT (tenant_id, phone) DO UPDATE SET nome=COALESCE(NULLIF(customers.nome,''), EXCLUDED.nome)
      RETURNING id, nome`, [TENANT, phone, (b.cliente && b.cliente.nome) || '']);
    const customerId = cr.rows[0].id, nomeCli = cr.rows[0].nome || (b.cliente && b.cliente.nome) || 'Cliente';
    // número curto
    const seqR = await db.q(`SELECT nextval('web_pedido_seq') AS n`);
    const numero = String(seqR.rows[0].n);
    const id = 'web:' + numero;
    const wa_ok = !!(b.wa && b.wa === waToken(phone));
    const hist = [{ status: 'CONFIRMED', em: new Date().toISOString() }];
    const meta = { origem_whatsapp: wa_ok, cliente_nome: nomeCli, impresso: false, obs_cozinha: b.obs_cozinha || '' };
    const r = await db.q(
      `INSERT INTO orders (id, tenant_id, customer_id, customer_phone, display_id, origem, mode, status_atual,
        subtotal, taxa_entrega, desconto, total, items, endereco, pagamento, observacoes, historico_status, metadata, confirmado_em)
       VALUES ($1,$2,$3,$4,$5,'WEB',$6,'CONFIRMED',$7,$8,0,$9,$10,$11,$12,$13,$14,$15,NOW()) RETURNING *`,
      [id, TENANT, customerId, phone, numero, modeIn, subtotal, taxa, total,
       JSON.stringify(itens), modeIn === 'DELIVERY' ? JSON.stringify(b.endereco || {}) : null,
       JSON.stringify(b.pagamento || { forma: 'DIN' }), b.observacao || '', JSON.stringify(hist), JSON.stringify(meta)]);
    return json(res, 201, { ok: true, pedido: orderToFront(r.rows[0]) });
  }

  if (sub === 'pedidos' && req.method === 'GET' && !seg[2]) {
    const desde = url.searchParams.get('desde');
    const r = desde
      ? await db.q('SELECT * FROM orders WHERE tenant_id=$1 AND criado_em > $2 ORDER BY criado_em DESC LIMIT 300', [TENANT, desde])
      : await db.q('SELECT * FROM orders WHERE tenant_id=$1 ORDER BY criado_em DESC LIMIT 300', [TENANT]);
    return json(res, 200, { pedidos: r.rows.map(orderToFront), agora: new Date().toISOString() });
  }

  if (sub === 'meus-pedidos' && req.method === 'GET') {
    const phone = soPhone(url.searchParams.get('telefone'));
    const r = await db.q('SELECT * FROM orders WHERE tenant_id=$1 AND customer_phone=$2 ORDER BY criado_em DESC LIMIT 20', [TENANT, phone]);
    return json(res, 200, { pedidos: r.rows.map(orderToFront) });
  }

  if (sub === 'pedidos' && seg[2] && req.method === 'GET') {
    const r = await db.q('SELECT * FROM orders WHERE tenant_id=$1 AND (id=$2 OR display_id=$2)', [TENANT, seg[2]]);
    return r.rows[0] ? json(res, 200, orderToFront(r.rows[0])) : json(res, 404, { erro: 'nao encontrado' });
  }

  if (sub === 'pedidos' && seg[2] && req.method === 'PATCH') {
    const b = await readBody(req);
    const cur = await db.q('SELECT * FROM orders WHERE tenant_id=$1 AND (id=$2 OR display_id=$2)', [TENANT, seg[2]]);
    if (!cur.rows[0]) return json(res, 404, { erro: 'nao encontrado' });
    const o = cur.rows[0];
    if (b.status && UI_TO_CANON[b.status]) {
      const canon = UI_TO_CANON[b.status];
      const hist = (o.historico_status || []).concat([{ status: canon, em: new Date().toISOString() }]);
      const tcol = TS_COL[canon];
      const setTs = tcol ? `, ${tcol}=NOW()` : '';
      await db.q(`UPDATE orders SET status_atual=$2, historico_status=$3 ${setTs} WHERE id=$1`, [o.id, canon, JSON.stringify(hist)]);
    }
    if (typeof b.impresso === 'boolean') {
      await db.q(`UPDATE orders SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{impresso}', $2::jsonb) WHERE id=$1`, [o.id, JSON.stringify(b.impresso)]);
    }
    const r = await db.q('SELECT * FROM orders WHERE id=$1', [o.id]);
    return json(res, 200, { ok: true, pedido: orderToFront(r.rows[0]) });
  }

  // disponibilidade fonte-unica: grava status em opcoes/produtos (a verdade no Postgres)
  if (sub === 'disponibilidade' && req.method === 'POST') {
    const b = await readBody(req);
    const st = String(b.status || '').toUpperCase();
    if (!['ATIVO', 'EM_FALTA', 'OCULTO'].includes(st)) return json(res, 400, { erro: 'status invalido' });
    const quem = (b.por || 'operador').slice(0, 20);
    const tabela = b.tipo === 'produto' ? 'produtos' : 'opcoes';
    try {
      const r = await db.q(`UPDATE ${tabela} SET status=$3, status_ts=NOW(), status_by=$4, status_motivo=$5 WHERE tenant_id=$1 AND id=$2 RETURNING id, nome, status`, [TENANT, b.id, st, quem, b.motivo || null]);
      if (!r.rows[0]) return json(res, 404, { erro: 'nao encontrado' });
      return json(res, 200, { ok: true, item: r.rows[0] });
    } catch (e) { return json(res, 500, { erro: e.code || e.message }); }
  }

  if (sub === 'config' && req.method === 'GET') {
    const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
    const cfg = (r.rows[0] && r.rows[0].config) || {};
    return json(res, 200, { printer_ip: cfg.printer_ip || '', printer_porta: cfg.printer_porta || '8008', ...cfg });
  }
  if (sub === 'config' && req.method === 'POST') {
    const b = await readBody(req);
    const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
    const merged = { ...((r.rows[0] && r.rows[0].config) || {}), ...b };
    await db.q('UPDATE tenants SET config=$2 WHERE id=$1', [TENANT, JSON.stringify(merged)]);
    return json(res, 200, merged);
  }

  return json(res, 404, { erro: 'rota nao encontrada' });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(res, fp) { fs.readFile(fp, (e, buf) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); res.end(buf); }); }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let p = url.pathname;
    if (p === '/') { res.writeHead(302, { Location: '/loja' }); return res.end(); }
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p === '/loja' || p === '/loja/') return serveStatic(res, path.join(ROOT, 'public/loja/index.html'));
    if (p === '/loja2' || p === '/loja2/') return serveStatic(res, path.join(ROOT, 'public/loja2.html'));
    if (p === '/disponibilidade' || p === '/disponibilidade/') return serveStatic(res, path.join(ROOT, 'public/disponibilidade.html'));
    if (p === '/gestor' || p === '/gestor/') return serveStatic(res, path.join(ROOT, 'public/gestor/index.html'));
    const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
    const fp = path.join(ROOT, 'public', safe);
    if (fp.startsWith(path.join(ROOT, 'public'))) return serveStatic(res, fp);
    res.writeHead(404); res.end('404');
  } catch (e) { console.error(e); json(res, 500, { erro: 'erro interno' }); }
});

db.init().finally(() => {
  server.listen(PORT, () => console.log(`Premium Plataforma (convergida/khardela) na porta ${PORT} | migracoes=${db.state.migrationsOk}`));
});
