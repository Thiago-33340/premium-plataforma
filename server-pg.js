/* ============================================================
   Premium Pizzas — servidor de PRODUÇÃO (Postgres)
   - Pool de conexões + índices => aguenta muitos pedidos/atendimentos juntos
   - Mesmos apps: /loja (cliente) e /gestor (estabelecimento)
   Variáveis: DATABASE_URL (ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE), PORT, WA_SECRET
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const ROOT = __dirname;
const CARDAPIO_FILE = path.join(ROOT, 'data', 'cardapio.json');
const PORT = process.env.PORT || 8080;
const WA_SECRET = process.env.WA_SECRET || 'premium-pizzas-wa-2026';

const STATUS = ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'EM_ROTA', 'ENTREGUE', 'CANCELADO'];
const soPhone = s => String(s || '').replace(/\D/g, '');
const validWA = p => { p = soPhone(p); return p.length === 12 || p.length === 13; };
const waToken = phone => crypto.createHmac('sha256', WA_SECRET).update(soPhone(phone)).digest('hex').slice(0, 16);
const money = n => Math.round(Number(n) * 100) / 100;
function json(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(b); }
function readBody(req) { return new Promise(resolve => { let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); }); }

function calcItem(it) {
  let total = 0;
  if (it.tipo === 'pizza') {
    const s = it.sabores || [];
    for (const x of s) total += Number(x.preco_meia || x.preco || 0);
    if (s.length === 1) total = Number(s[0].preco_meia) * 2;
    if (it.borda && it.borda.preco) total += Number(it.borda.preco);
    for (const a of (it.adicionais || [])) total += Number(a.preco || 0);
  } else { total = Number(it.preco || 0); }
  return money(total * (it.quantidade || 1));
}

async function getConfig() { const r = await db.q('SELECT data FROM premium.config WHERE id=1'); return r.rows[0] ? r.rows[0].data : {}; }

async function api(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean);
  const sub = seg[1];
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }

  if (sub === 'health') return json(res, 200, { ok: true, ts: new Date().toISOString() });

  if (sub === 'cardapio' && req.method === 'GET') {
    try { return json(res, 200, JSON.parse(fs.readFileSync(CARDAPIO_FILE, 'utf8'))); }
    catch { return json(res, 500, { erro: 'cardapio indisponivel' }); }
  }

  if (sub === 'auth' && req.method === 'POST') {
    const b = await readBody(req);
    const phone = soPhone(b.telefone), senha = soPhone(b.senha);
    if (!validWA(phone)) return json(res, 400, { erro: 'Informe um número de WhatsApp válido com DDD (ex: 5517999999999).' });
    if (phone !== senha) return json(res, 401, { erro: 'A senha é o seu próprio número de celular.' });
    let r = await db.q('SELECT * FROM premium.clientes WHERE telefone=$1', [phone]);
    let cli = r.rows[0];
    if (!cli) { r = await db.q('INSERT INTO premium.clientes(telefone,nome) VALUES($1,$2) RETURNING *', [phone, b.nome || '']); cli = r.rows[0]; }
    else if (b.nome && !cli.nome) { await db.q('UPDATE premium.clientes SET nome=$2 WHERE telefone=$1', [phone, b.nome]); cli.nome = b.nome; }
    return json(res, 200, { ok: true, cliente: cli, origem_whatsapp: !!(b.wa && b.wa === waToken(phone)) });
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
    const cfg = await getConfig();
    const taxa = b.tipo === 'DELIVERY' ? money(b.taxa_entrega != null ? b.taxa_entrega : (cfg.taxa_entrega_padrao || 0)) : 0;
    const total = money(subtotal + taxa);
    const id = crypto.randomUUID();
    const wa_ok = !!(b.wa && b.wa === waToken(phone));
    const nomeR = await db.q('SELECT nome FROM premium.clientes WHERE telefone=$1', [phone]);
    const cliente = { telefone: phone, nome: (b.cliente && b.cliente.nome) || (nomeR.rows[0] && nomeR.rows[0].nome) || 'Cliente' };
    const tipo = b.tipo === 'DELIVERY' ? 'DELIVERY' : 'TAKEOUT';
    const historico = [{ status: 'RECEBIDO', em: new Date().toISOString() }];
    const r = await db.q(
      `INSERT INTO premium.pedidos
       (id,status,canal,origem_whatsapp,cliente,tipo,endereco,pagamento,itens,subtotal,taxa_entrega,total,observacao,obs_cozinha,historico)
       VALUES ($1,'RECEBIDO','web',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [id, wa_ok, JSON.stringify(cliente), tipo,
       tipo === 'DELIVERY' ? JSON.stringify(b.endereco || {}) : null,
       JSON.stringify(b.pagamento || { forma: 'DIN' }), JSON.stringify(itens),
       subtotal, taxa, total, b.observacao || '', b.obs_cozinha || '', JSON.stringify(historico)]
    );
    if (b.endereco && b.endereco.rua) {
      await db.q(`UPDATE premium.clientes SET enderecos =
        (SELECT jsonb_agg(e) FROM (SELECT $2::jsonb AS e UNION ALL
          SELECT value FROM jsonb_array_elements(enderecos) LIMIT 4) s)
        WHERE telefone=$1`, [phone, JSON.stringify(b.endereco)]).catch(() => {});
    }
    return json(res, 201, { ok: true, pedido: r.rows[0] });
  }

  if (sub === 'pedidos' && req.method === 'GET' && !seg[2]) {
    const desde = url.searchParams.get('desde');
    const r = desde
      ? await db.q('SELECT * FROM premium.pedidos WHERE criado_em > $1 ORDER BY criado_em DESC LIMIT 300', [desde])
      : await db.q('SELECT * FROM premium.pedidos ORDER BY criado_em DESC LIMIT 300');
    return json(res, 200, { pedidos: r.rows, agora: new Date().toISOString() });
  }

  if (sub === 'meus-pedidos' && req.method === 'GET') {
    const phone = soPhone(url.searchParams.get('telefone'));
    const r = await db.q(`SELECT * FROM premium.pedidos WHERE cliente->>'telefone'=$1 ORDER BY criado_em DESC LIMIT 20`, [phone]);
    return json(res, 200, { pedidos: r.rows });
  }

  if (sub === 'pedidos' && seg[2] && req.method === 'GET') {
    const r = await db.q('SELECT * FROM premium.pedidos WHERE id=$1 OR numero::text=$2', [/^[0-9a-f-]{36}$/.test(seg[2]) ? seg[2] : '00000000-0000-0000-0000-000000000000', seg[2]]);
    return r.rows[0] ? json(res, 200, r.rows[0]) : json(res, 404, { erro: 'nao encontrado' });
  }

  if (sub === 'pedidos' && seg[2] && req.method === 'PATCH') {
    const b = await readBody(req);
    const idOk = /^[0-9a-f-]{36}$/.test(seg[2]);
    const cur = await db.q('SELECT * FROM premium.pedidos WHERE id=$1 OR numero::text=$2', [idOk ? seg[2] : '00000000-0000-0000-0000-000000000000', seg[2]]);
    if (!cur.rows[0]) return json(res, 404, { erro: 'nao encontrado' });
    const p = cur.rows[0];
    if (b.status && STATUS.includes(b.status)) {
      const hist = p.historico.concat([{ status: b.status, em: new Date().toISOString() }]);
      await db.q('UPDATE premium.pedidos SET status=$2, historico=$3 WHERE id=$1', [p.id, b.status, JSON.stringify(hist)]);
    }
    if (typeof b.impresso === 'boolean') await db.q('UPDATE premium.pedidos SET impresso=$2 WHERE id=$1', [p.id, b.impresso]);
    const r = await db.q('SELECT * FROM premium.pedidos WHERE id=$1', [p.id]);
    return json(res, 200, { ok: true, pedido: r.rows[0] });
  }

  if (sub === 'config' && req.method === 'GET') return json(res, 200, await getConfig());
  if (sub === 'config' && req.method === 'POST') {
    const b = await readBody(req);
    const cur = await getConfig();
    const merged = { ...cur, ...b };
    await db.q('UPDATE premium.config SET data=$1 WHERE id=1', [JSON.stringify(merged)]);
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
    if (p === '/gestor' || p === '/gestor/') return serveStatic(res, path.join(ROOT, 'public/gestor/index.html'));
    const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
    const fp = path.join(ROOT, 'public', safe);
    if (fp.startsWith(path.join(ROOT, 'public'))) return serveStatic(res, fp);
    res.writeHead(404); res.end('404');
  } catch (e) { console.error(e); json(res, 500, { erro: 'erro interno' }); }
});

db.init().then(() => {
  server.listen(PORT, () => console.log(`Premium Plataforma (Postgres) na porta ${PORT}`));
}).catch(e => { console.error('Falha ao iniciar DB:', e); process.exit(1); });
