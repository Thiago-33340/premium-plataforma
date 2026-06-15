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

// Notifica supervisores (Thiago/Tassiano) no WhatsApp da Jessica ao fechar contagem. Best-effort.
async function notificarContagem(resumo) {
  try {
    const cfgr = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
    const cfg = (cfgr.rows[0] && cfgr.rows[0].config) || {};
    const url = process.env.WEBHOOK_CONTAGEM || cfg.webhook_contagem;
    if (!url) { console.log('[estoque] webhook_contagem nao configurado - notificacao pulada'); return; }
    const sup = await db.q(`SELECT nome, phone FROM rbac_contacts WHERE tenant_id=$1 AND ativo AND LOWER(apelido_login) IN ('thiago','tassiano')`, [TENANT]);
    const telefones = sup.rows.map(r => String(r.phone || '').replace(/\D/g, '')).filter(p => p.length >= 12);
    const texto = `📦 *Contagem de estoque finalizada*\n👤 ${resumo.colaborador}\n🏷️ Setor: ${resumo.setor} · Turno: ${resumo.turno}\n📊 ${resumo.total} itens · ⚠️ ${resumo.abaixo} abaixo do mínimo · 🔴 ${resumo.zerados} zerados\n🆔 ${resumo.contagem_id}`;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ resumo, texto, telefones }) }).catch(() => {});
    clearTimeout(t);
    console.log('[estoque] notificacao de contagem enviada p/ ' + telefones.length + ' supervisor(es)');
  } catch (e) { console.log('[estoque] notificacao aviso:', e.message); }
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
    await q1('estoque_def', 'SELECT count(*) n FROM estoque_itens_definicao WHERE tenant_id=$1', [TENANT]);
    await q1('estoque_contagens', 'SELECT count(*) n FROM estoque_contagens WHERE tenant_id=$1', [TENANT]);
    try { const r = await db.q('SELECT setor_id, setor_nome, count(*)::int n FROM estoque_itens_definicao WHERE tenant_id=$1 GROUP BY setor_id, setor_nome ORDER BY setor_nome', [TENANT]); out.setores = r.rows; } catch (e) { out.setores = 'ERRO: ' + (e.code || e.message); }
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

  // ===================== ESTOQUE (contagem de fim de turno, Postgres fonte unica) =====================
  if (sub === 'estoque' && seg[2] === 'login' && req.method === 'POST') {
    const b = await readBody(req);
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const alvo = norm(b.login);
    if (!alvo) return json(res, 400, { erro: 'informe o login' });
    const r = await db.q('SELECT id, nome, apelido_login, perfil_principal, setores_permitidos, pin_hash FROM rbac_contacts WHERE tenant_id=$1 AND ativo', [TENANT]);
    const col = r.rows.find(x => norm(x.apelido_login) === alvo || norm(x.nome) === alvo || norm(x.nome).split(' ')[0] === alvo);
    if (!col) return json(res, 404, { ok: false, erro: 'Colaborador nao encontrado ou inativo.' });
    // validacao de PIN (6 digitos). Se o colaborador tem pin_hash, exige e valida via bcrypt.
    const pin = String(b.pin || '').replace(/\D/g, '');
    if (col.pin_hash) {
      if (!pin) return json(res, 200, { ok: false, precisa_pin: true, nome: col.nome });
      const v = await db.q('SELECT (pin_hash = crypt($2, pin_hash)) AS ok FROM rbac_contacts WHERE id=$1', [col.id, pin]);
      if (!v.rows[0] || !v.rows[0].ok) return json(res, 401, { ok: false, erro: 'PIN incorreto.' });
    }
    const setoresPerm = col.setores_permitidos || [];
    const veTudo = col.perfil_principal === 'GESTOR' || setoresPerm.map(s => String(s).toUpperCase()).includes('TUDO');
    let setores;
    if (veTudo) {
      const s = await db.q('SELECT setor_id, setor_nome, count(*)::int itens FROM estoque_itens_definicao WHERE tenant_id=$1 AND ativo AND exige_contagem GROUP BY setor_id, setor_nome ORDER BY setor_nome', [TENANT]);
      setores = s.rows;
    } else {
      const s = await db.q('SELECT setor_id, setor_nome, count(*)::int itens FROM estoque_itens_definicao WHERE tenant_id=$1 AND ativo AND exige_contagem AND setor_id = ANY($2) GROUP BY setor_id, setor_nome ORDER BY setor_nome', [TENANT, setoresPerm]);
      setores = s.rows;
    }
    return json(res, 200, { ok: true, colaborador: { id: col.id, nome: col.nome, perfil: col.perfil_principal, ve_tudo: veTudo }, setores });
  }

  if (sub === 'estoque' && seg[2] === 'itens' && req.method === 'GET') {
    const setor = url.searchParams.get('setor');
    const r = setor
      ? await db.q('SELECT id, setor_id, setor_nome, categoria, nome, unidade, estoque_minimo, estoque_ideal FROM estoque_itens_definicao WHERE tenant_id=$1 AND ativo AND exige_contagem AND setor_id=$2 ORDER BY ordem, nome', [TENANT, setor])
      : await db.q('SELECT id, setor_id, setor_nome, categoria, nome, unidade, estoque_minimo, estoque_ideal FROM estoque_itens_definicao WHERE tenant_id=$1 AND ativo AND exige_contagem ORDER BY setor_nome, ordem, nome', [TENANT]);
    return json(res, 200, { itens: r.rows });
  }

  if (sub === 'estoque' && seg[2] === 'contagem' && req.method === 'POST') {
    const b = await readBody(req);
    const itens = Array.isArray(b.itens) ? b.itens : [];
    if (!b.colaborador_id || !b.setor_id || !itens.length) return json(res, 400, { erro: 'dados incompletos' });
    const situ = (q, min) => { const qn = Number(q); if (qn <= 0) return 'Zerado'; if (min != null && qn < Number(min)) return 'Abaixo do minimo'; return 'Ok'; };
    let abaixo = 0, zerados = 0;
    for (const it of itens) { const s = situ(it.quantidade_contada, it.estoque_minimo); if (s === 'Abaixo do minimo') abaixo++; if (s === 'Zerado') zerados++; it._situacao = s; }
    const now = new Date();
    const cid = 'CTG' + now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const cliente = await db.pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('SET search_path TO khardela, public');
      await cliente.query(`INSERT INTO estoque_contagens (id, tenant_id, colaborador_id, colaborador_nome, setor_id, setor_nome, turno, total_itens, itens_abaixo_minimo, itens_zerados, iniciada_em, finalizada_em, observacao)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)`,
        [cid, TENANT, b.colaborador_id, b.colaborador_nome || '', b.setor_id, b.setor_nome || '', b.turno || 'Fechamento', itens.length, abaixo, zerados, b.iniciada_em || now.toISOString(), b.observacao || null]);
      for (const it of itens) {
        await cliente.query(`INSERT INTO estoque_itens (tenant_id, contagem_id, item_id, nome_item, categoria, setor_id, unidade, quantidade_contada, estoque_minimo, estoque_ideal, situacao, observacao)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [TENANT, cid, it.item_id, it.nome_item || '', it.categoria || null, b.setor_id, it.unidade || null, Number(it.quantidade_contada) || 0, Number(it.estoque_minimo) || 0, it.estoque_ideal != null ? Number(it.estoque_ideal) : null, it._situacao, it.observacao || null]);
      }
      await cliente.query('COMMIT');
    } catch (e) { await cliente.query('ROLLBACK'); cliente.release(); return json(res, 500, { erro: e.code || e.message }); }
    cliente.release();
    notificarContagem({ colaborador: b.colaborador_nome || '', setor: b.setor_nome || '', turno: b.turno || 'Fechamento', total: itens.length, abaixo, zerados, contagem_id: cid });
    return json(res, 201, { ok: true, contagem_id: cid, total: itens.length, abaixo_minimo: abaixo, zerados });
  }

  // importar a lista mestre de itens (de uma fonte externa: planilha/n8n) -> estoque_itens_definicao (upsert)
  if (sub === 'estoque' && seg[2] === 'importar-definicao' && req.method === 'POST') {
    const b = await readBody(req);
    const itens = Array.isArray(b.itens) ? b.itens : [];
    if (!itens.length) return json(res, 400, { erro: 'sem itens' });
    const cli = await db.pool.connect();
    let n = 0;
    try {
      await cli.query('BEGIN');
      await cli.query('SET search_path TO khardela, public');
      for (const it of itens) {
        const id = it.item_id || it.id; if (!id) continue;
        await cli.query(`INSERT INTO estoque_itens_definicao (id, tenant_id, setor_id, setor_nome, categoria, nome, unidade, estoque_minimo, estoque_ideal, exige_contagem, ordem, ativo, origem, observacao)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,TRUE,$11,$12)
          ON CONFLICT (id) DO UPDATE SET setor_id=EXCLUDED.setor_id, setor_nome=EXCLUDED.setor_nome, categoria=EXCLUDED.categoria, nome=EXCLUDED.nome, unidade=EXCLUDED.unidade, estoque_minimo=EXCLUDED.estoque_minimo, estoque_ideal=EXCLUDED.estoque_ideal, ordem=EXCLUDED.ordem, ativo=TRUE, updated_at=NOW()`,
          [id, TENANT, it.setor_id || 'SET000', it.setor_nome || it.sn || 'Geral', it.categoria || it.c || null, it.nome_item || it.nome || it.n || '', it.unidade || it.u || 'un', Number(it.estoque_minimo ?? it.mn) || 0, (it.estoque_ideal ?? it.id2) != null ? Number(it.estoque_ideal ?? it.id2) : null, Number(it.ordem ?? it.o) || 999, b.origem || 'import', it.observacao || null]);
        n++;
      }
      await cli.query('COMMIT');
    } catch (e) { await cli.query('ROLLBACK'); cli.release(); return json(res, 500, { erro: e.code || e.message }); }
    cli.release();
    const tot = await db.q('SELECT count(*)::int n FROM estoque_itens_definicao WHERE tenant_id=$1', [TENANT]);
    return json(res, 200, { ok: true, importados: n, total_definicao: tot.rows[0].n });
  }

  if (sub === 'estoque' && seg[2] === 'contagens' && req.method === 'GET') {
    const r = await db.q('SELECT id, colaborador_nome, setor_nome, turno, total_itens, itens_abaixo_minimo, itens_zerados, finalizada_em FROM estoque_contagens WHERE tenant_id=$1 ORDER BY finalizada_em DESC LIMIT 50', [TENANT]);
    return json(res, 200, { contagens: r.rows });
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

  // ===================== STAFF LOGIN (mesas/gestor) por apelido + PIN =====================
  if (sub === 'staff' && seg[2] === 'login' && req.method === 'POST') {
    const b = await readBody(req);
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const alvo = norm(b.login);
    if (!alvo) return json(res, 400, { erro: 'informe o login' });
    const r = await db.q('SELECT id, nome, apelido_login, perfil_principal, perfis_adicionais, pin_hash FROM rbac_contacts WHERE tenant_id=$1 AND ativo', [TENANT]);
    const col = r.rows.find(x => norm(x.apelido_login) === alvo || norm(x.nome).split(' ')[0] === alvo);
    if (!col) return json(res, 404, { ok: false, erro: 'Usuario nao encontrado.' });
    const pin = String(b.pin || '').replace(/\D/g, '');
    if (col.pin_hash) {
      if (!pin) return json(res, 200, { ok: false, precisa_pin: true, nome: col.nome });
      const v = await db.q('SELECT (pin_hash = crypt($2, pin_hash)) AS ok FROM rbac_contacts WHERE id=$1', [col.id, pin]);
      if (!v.rows[0] || !v.rows[0].ok) return json(res, 401, { ok: false, erro: 'PIN incorreto.' });
    }
    const perfis = [col.perfil_principal].concat(col.perfis_adicionais || []);
    const ehGarcom = perfis.includes('GARCOM');
    const ehGestor = perfis.some(p => ['GESTOR', 'CHEFE_COZINHA', 'OPERADOR_ATENDIMENTO'].includes(p));
    return json(res, 200, { ok: true, usuario: { id: col.id, nome: col.nome, perfil: col.perfil_principal,
      pode_mesas: ehGarcom || ehGestor, pode_gestor: ehGestor, so_mesas: ehGarcom && !ehGestor, pode_admin: perfis.includes('GESTOR') } });
  }

  // ===================== MESAS / COMANDAS =====================
  if (sub === 'mesas' && !seg[2] && req.method === 'GET') {
    const r = await db.q(`
      SELECT m.numero, m.ativa, c.id AS comanda_id, c.nome_cliente, c.aberta_em, c.aberta_por,
        COALESCE((SELECT SUM(ci.preco_unit*ci.quantidade) FROM comanda_itens ci WHERE ci.comanda_id=c.id AND ci.status='PEDIDO'),0) AS total,
        (SELECT COUNT(*) FROM comanda_itens ci WHERE ci.comanda_id=c.id AND ci.status='PEDIDO') AS qtd_itens
      FROM mesas m
      LEFT JOIN comandas c ON c.mesa_numero=m.numero AND c.tenant_id=m.tenant_id AND c.status='ABERTA'
      WHERE m.tenant_id=$1 AND m.ativa ORDER BY m.numero`, [TENANT]);
    return json(res, 200, { mesas: r.rows.map(m => ({ numero: m.numero, ocupada: !!m.comanda_id, comanda_id: m.comanda_id,
      nome_cliente: m.nome_cliente, aberta_em: m.aberta_em, total: Number(m.total), qtd_itens: Number(m.qtd_itens) })) });
  }
  if (sub === 'mesas' && seg[2] && seg[3] === 'abrir' && req.method === 'POST') {
    const b = await readBody(req); const numero = parseInt(seg[2], 10);
    const ex = await db.q(`SELECT id FROM comandas WHERE tenant_id=$1 AND mesa_numero=$2 AND status='ABERTA'`, [TENANT, numero]);
    if (ex.rows[0]) return json(res, 200, { ok: true, comanda_id: ex.rows[0].id, ja_aberta: true });
    const r = await db.q(`INSERT INTO comandas (tenant_id, mesa_numero, nome_cliente, status, aberta_por) VALUES ($1,$2,$3,'ABERTA',$4) RETURNING id`,
      [TENANT, numero, b.nome_cliente || ('Mesa ' + numero), (b.por_nome || b.por || 'equipe').slice(0, 20)]);
    return json(res, 201, { ok: true, comanda_id: r.rows[0].id });
  }
  if (sub === 'mesas' && seg[2] && !seg[3] && req.method === 'GET') {
    const numero = parseInt(seg[2], 10);
    const c = await db.q(`SELECT * FROM comandas WHERE tenant_id=$1 AND mesa_numero=$2 AND status='ABERTA'`, [TENANT, numero]);
    if (!c.rows[0]) return json(res, 200, { aberta: false, numero });
    const itens = await db.q(`SELECT id, nome, resumo, quantidade, preco_unit, criado_por_nome, criado_em FROM comanda_itens WHERE comanda_id=$1 AND status='PEDIDO' ORDER BY criado_em`, [c.rows[0].id]);
    const total = itens.rows.reduce((s, it) => s + Number(it.preco_unit) * it.quantidade, 0);
    return json(res, 200, { aberta: true, numero, comanda: c.rows[0], itens: itens.rows, total: money(total) });
  }
  if (sub === 'mesas' && seg[2] && seg[3] === 'item' && req.method === 'POST') {
    const b = await readBody(req); const numero = parseInt(seg[2], 10);
    const c = await db.q(`SELECT id FROM comandas WHERE tenant_id=$1 AND mesa_numero=$2 AND status='ABERTA'`, [TENANT, numero]);
    if (!c.rows[0]) return json(res, 400, { erro: 'mesa sem comanda aberta' });
    const r = await db.q(`INSERT INTO comanda_itens (tenant_id, comanda_id, nome, resumo, item, quantidade, preco_unit, criado_por, criado_por_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [TENANT, c.rows[0].id, b.nome || 'Item', b.resumo || '', JSON.stringify(b.item || {}), b.quantidade || 1, money(b.preco_unit || 0), (b.por || '').slice(0, 40), b.por_nome || '']);
    return json(res, 201, { ok: true, item_id: r.rows[0].id });
  }
  if (sub === 'mesas' && seg[2] && seg[3] === 'item' && seg[4] && req.method === 'DELETE') {
    await db.q(`UPDATE comanda_itens SET status='CANCELADO' WHERE id=$1 AND tenant_id=$2`, [seg[4], TENANT]);
    return json(res, 200, { ok: true });
  }
  if (sub === 'mesas' && seg[2] && seg[3] === 'fechar' && req.method === 'POST') {
    const b = await readBody(req); const numero = parseInt(seg[2], 10);
    const c = await db.q(`SELECT id FROM comandas WHERE tenant_id=$1 AND mesa_numero=$2 AND status='ABERTA'`, [TENANT, numero]);
    if (!c.rows[0]) return json(res, 400, { erro: 'mesa sem comanda aberta' });
    const tot = await db.q(`SELECT COALESCE(SUM(preco_unit*quantidade),0) t FROM comanda_itens WHERE comanda_id=$1 AND status='PEDIDO'`, [c.rows[0].id]);
    await db.q(`UPDATE comandas SET status='FECHADA', fechada_em=NOW(), forma_pagamento=$2, total=$3 WHERE id=$1`, [c.rows[0].id, b.forma_pagamento || 'DIN', money(Number(tot.rows[0].t))]);
    return json(res, 200, { ok: true, total: money(Number(tot.rows[0].t)) });
  }

  // ===================== CAIXA (operador) =====================
  if (sub === 'caixa' && !seg[2] && req.method === 'GET') {
    const r = await db.q(`SELECT * FROM caixa WHERE tenant_id=$1 AND status='ABERTO' ORDER BY aberto_em DESC LIMIT 1`, [TENANT]);
    return json(res, 200, { aberto: !!r.rows[0], caixa: r.rows[0] || null });
  }
  if (sub === 'caixa' && seg[2] === 'abrir' && req.method === 'POST') {
    const b = await readBody(req);
    const ex = await db.q(`SELECT id FROM caixa WHERE tenant_id=$1 AND status='ABERTO'`, [TENANT]);
    if (ex.rows[0]) return json(res, 200, { ok: true, ja_aberto: true, id: ex.rows[0].id });
    const r = await db.q(`INSERT INTO caixa (tenant_id, aberto_por, aberto_por_nome, valor_abertura, status) VALUES ($1,$2,$3,$4,'ABERTO') RETURNING id`,
      [TENANT, (b.por || '').slice(0, 20), b.por_nome || '', money(b.valor_abertura || 0)]);
    return json(res, 201, { ok: true, id: r.rows[0].id });
  }
  if (sub === 'caixa' && seg[2] === 'fechar' && req.method === 'POST') {
    const b = await readBody(req);
    const r = await db.q(`UPDATE caixa SET status='FECHADO', fechado_em=NOW(), valor_fechamento=$2 WHERE tenant_id=$1 AND status='ABERTO' RETURNING id`,
      [TENANT, money(b.valor_fechamento || 0)]);
    if (!r.rows[0]) return json(res, 400, { erro: 'nenhum caixa aberto' });
    return json(res, 200, { ok: true });
  }

  // ===================== ENTREGADORES =====================
  if (sub === 'entregadores' && !seg[2] && req.method === 'GET') {
    const r = await db.q('SELECT id, nome, telefone, ativo FROM entregadores WHERE tenant_id=$1 ORDER BY ativo DESC, nome', [TENANT]);
    return json(res, 200, { entregadores: r.rows });
  }
  if (sub === 'entregadores' && !seg[2] && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.nome) return json(res, 400, { erro: 'informe o nome' });
    const r = await db.q('INSERT INTO entregadores (tenant_id, nome, telefone, ativo) VALUES ($1,$2,$3,TRUE) RETURNING id', [TENANT, b.nome, b.telefone || null]);
    return json(res, 201, { ok: true, id: r.rows[0].id });
  }
  if (sub === 'entregadores' && seg[2] && req.method === 'PATCH') {
    const b = await readBody(req);
    await db.q('UPDATE entregadores SET nome=COALESCE($2,nome), telefone=COALESCE($3,telefone), ativo=COALESCE($4,ativo) WHERE id=$1 AND tenant_id=$5',
      [seg[2], b.nome ?? null, b.telefone ?? null, typeof b.ativo === 'boolean' ? b.ativo : null, TENANT]);
    return json(res, 200, { ok: true });
  }

  // ===================== ADMIN (so GESTOR) =====================
  if (sub === 'admin') {
    const body = (req.method !== 'GET') ? await readBody(req) : {};
    const adminId = (req.method === 'GET') ? url.searchParams.get('admin_id') : body.admin_id;
    const g = await db.q(`SELECT 1 FROM rbac_contacts WHERE id=$1 AND tenant_id=$2 AND ativo AND ('GESTOR'=perfil_principal OR 'GESTOR'=ANY(COALESCE(perfis_adicionais,'{}')))`, [adminId, TENANT]);
    if (!g.rows[0]) return json(res, 403, { erro: 'acesso restrito ao gestor' });

    if (seg[2] === 'usuarios' && req.method === 'GET') {
      const r = await db.q(`SELECT id, nome, apelido_login, perfil_principal, perfis_adicionais, setores_permitidos, ativo, (pin_hash IS NOT NULL) AS tem_pin FROM rbac_contacts WHERE tenant_id=$1 ORDER BY ativo DESC, nome`, [TENANT]);
      return json(res, 200, { usuarios: r.rows });
    }
    if (seg[2] === 'usuario' && !seg[3] && req.method === 'POST') {
      const ph = '+' + Date.now();
      const r = await db.q(`INSERT INTO rbac_contacts (tenant_id, phone, nome, apelido_login, perfil_principal, setores_permitidos, ativo, pin_hash, pin_changed_at)
        VALUES ($1,$2,$3,$4,$5,$6,TRUE, CASE WHEN $7<>'' THEN crypt($7, gen_salt('bf',8)) ELSE NULL END, NOW()) RETURNING id`,
        [TENANT, body.phone || ph, body.nome || '', String(body.apelido_login || '').toLowerCase(), body.perfil_principal || 'COLABORADOR', body.setores_permitidos || [], String(body.pin || '').replace(/\D/g, '')]);
      return json(res, 201, { ok: true, id: r.rows[0].id });
    }
    if (seg[2] === 'usuario' && seg[3] && seg[4] === 'pin' && req.method === 'POST') {
      const pin = String(body.pin || '').replace(/\D/g, ''); if (pin.length < 4) return json(res, 400, { erro: 'PIN curto' });
      await db.q(`UPDATE rbac_contacts SET pin_hash=crypt($2, gen_salt('bf',8)), pin_changed_at=NOW(), pin_must_change=FALSE WHERE id=$1 AND tenant_id=$3`, [seg[3], pin, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'usuario' && seg[3] && req.method === 'PATCH') {
      await db.q(`UPDATE rbac_contacts SET perfil_principal=COALESCE($2,perfil_principal), setores_permitidos=COALESCE($3,setores_permitidos), apelido_login=COALESCE($4,apelido_login), ativo=COALESCE($5,ativo) WHERE id=$1 AND tenant_id=$6`,
        [seg[3], body.perfil_principal ?? null, body.setores_permitidos ?? null, body.apelido_login ? String(body.apelido_login).toLowerCase() : null, typeof body.ativo === 'boolean' ? body.ativo : null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'estoque-itens' && req.method === 'GET') {
      const r = await db.q(`SELECT id, setor_id, setor_nome, categoria, nome, unidade, estoque_minimo, estoque_ideal, ordem, ativo, exige_contagem FROM estoque_itens_definicao WHERE tenant_id=$1 ORDER BY setor_nome, ordem, nome`, [TENANT]);
      return json(res, 200, { itens: r.rows });
    }
    if (seg[2] === 'estoque-item' && !seg[3] && req.method === 'POST') {
      const id = body.id || ('ITM' + Date.now());
      await db.q(`INSERT INTO estoque_itens_definicao (id, tenant_id, setor_id, setor_nome, categoria, nome, unidade, estoque_minimo, estoque_ideal, exige_contagem, ordem, ativo, origem)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,TRUE),$11,TRUE,'admin')
        ON CONFLICT (id) DO UPDATE SET setor_id=EXCLUDED.setor_id, setor_nome=EXCLUDED.setor_nome, categoria=EXCLUDED.categoria, nome=EXCLUDED.nome, unidade=EXCLUDED.unidade, estoque_minimo=EXCLUDED.estoque_minimo, estoque_ideal=EXCLUDED.estoque_ideal, exige_contagem=EXCLUDED.exige_contagem, ordem=EXCLUDED.ordem, updated_at=NOW()`,
        [id, TENANT, body.setor_id || 'SET000', body.setor_nome || 'Geral', body.categoria || null, body.nome || '', body.unidade || 'un', Number(body.estoque_minimo) || 0, body.estoque_ideal != null ? Number(body.estoque_ideal) : null, typeof body.exige_contagem === 'boolean' ? body.exige_contagem : null, Number(body.ordem) || 999]);
      return json(res, 200, { ok: true, id });
    }
    if (seg[2] === 'estoque-item' && seg[3] && req.method === 'DELETE') {
      await db.q(`UPDATE estoque_itens_definicao SET ativo=FALSE WHERE id=$1 AND tenant_id=$2`, [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'preco' && req.method === 'POST') {
      if (body.tipo === 'produto') await db.q('UPDATE produtos SET preco_base=$2 WHERE id=$1 AND tenant_id=$3', [body.id, money(body.preco), TENANT]);
      else await db.q('UPDATE opcoes SET preco=$2 WHERE id=$1 AND tenant_id=$3', [body.id, money(body.preco), TENANT]);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { erro: 'rota admin nao encontrada' });
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
    if (p === '/loja' || p === '/loja/') return serveStatic(res, path.join(ROOT, 'public/loja2.html'));
    if (p === '/loja-antiga' || p === '/loja-antiga/') return serveStatic(res, path.join(ROOT, 'public/loja/index.html'));
    if (p === '/loja2' || p === '/loja2/') return serveStatic(res, path.join(ROOT, 'public/loja2.html'));
    if (p === '/disponibilidade' || p === '/disponibilidade/') return serveStatic(res, path.join(ROOT, 'public/disponibilidade.html'));
    if (p === '/estoque' || p === '/estoque/') return serveStatic(res, path.join(ROOT, 'public/estoque.html'));
    if (p === '/mesas' || p === '/mesas/') return serveStatic(res, path.join(ROOT, 'public/mesas.html'));
    if (p === '/admin' || p === '/admin/') return serveStatic(res, path.join(ROOT, 'public/admin.html'));
    if (p === '/caixa' || p === '/caixa/') return serveStatic(res, path.join(ROOT, 'public/caixa.html'));
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
