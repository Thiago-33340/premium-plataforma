/* ============================================================
   Premium Pizzas — Plataforma de Pedidos (standalone)
   Backend: Node puro, ZERO dependências. Rode:  node server.js
   - App do cliente:        http://localhost:8080/loja
   - App do estabelecimento http://localhost:8080/gestor
   Persistência: ./data/db.json  (criado automaticamente)
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CARDAPIO_FILE = path.join(DATA_DIR, 'cardapio.json');
const PORT = process.env.PORT || 8080;
// Segredo p/ assinar o token do link de WhatsApp (troque em produção)
const WA_SECRET = process.env.WA_SECRET || 'premium-pizzas-wa-2026';

/* ---------- store simples em arquivo (sem libs) ---------- */
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { clientes: {}, pedidos: [], seq: 0, config: { printer_ip: '', printer_porta: '8008' } }; }
}
let DB = loadDB();
let saving = false, dirty = false;
function saveDB() {
  dirty = true;
  if (saving) return;
  saving = true;
  setImmediate(() => {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2)); }
    catch (e) { console.error('saveDB', e); }
    saving = false; if (dirty) { dirty = false; saveDB(); }
  });
}

/* ---------- helpers ---------- */
const STATUS = ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'EM_ROTA', 'ENTREGUE', 'CANCELADO'];
function soPhone(s) { return String(s || '').replace(/\D/g, ''); }
function validWhatsApp(p) { p = soPhone(p); return p.length === 12 || p.length === 13; } // 55 + DDD + numero
function waToken(phone) { return crypto.createHmac('sha256', WA_SECRET).update(soPhone(phone)).digest('hex').slice(0, 16); }
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}
function money(n) { return Math.round(Number(n) * 100) / 100; }

/* ---------- cálculo de pedido (server-side, fonte da verdade) ---------- */
function calcItem(it) {
  let total = 0;
  if (it.tipo === 'pizza') {
    const sabores = it.sabores || [];
    for (const s of sabores) total += Number(s.preco_meia || s.preco || 0);
    if (sabores.length === 1) total = Number(sabores[0].preco_meia) * 2; // inteira de 1 sabor
    if (it.borda && it.borda.preco) total += Number(it.borda.preco);
    for (const a of (it.adicionais || [])) total += Number(a.preco || 0);
  } else {
    total = Number(it.preco || 0);
  }
  total = money(total * (it.quantidade || 1));
  return total;
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const sub = seg[1];

  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }

  // cardápio
  if (sub === 'cardapio' && req.method === 'GET') {
    try { return json(res, 200, JSON.parse(fs.readFileSync(CARDAPIO_FILE, 'utf8'))); }
    catch { return json(res, 500, { erro: 'cardapio indisponivel' }); }
  }

  // login mínimo: telefone = login = senha, precisa ser WhatsApp válido
  if (sub === 'auth' && req.method === 'POST') {
    const b = await readBody(req);
    const phone = soPhone(b.telefone);
    const senha = soPhone(b.senha);
    if (!validWhatsApp(phone)) return json(res, 400, { erro: 'Informe um número de WhatsApp válido com DDD (ex: 5517999999999).' });
    if (phone !== senha) return json(res, 401, { erro: 'A senha é o seu próprio número de celular.' });
    let cli = DB.clientes[phone];
    if (!cli) { cli = { telefone: phone, nome: b.nome || '', criado_em: new Date().toISOString(), enderecos: [] }; DB.clientes[phone] = cli; saveDB(); }
    if (b.nome && !cli.nome) { cli.nome = b.nome; saveDB(); }
    const wa_ok = b.wa && b.wa === waToken(phone);
    return json(res, 200, { ok: true, cliente: cli, origem_whatsapp: !!wa_ok });
  }

  // emite token de WhatsApp para um número (usado para montar o link enviado pelo bot)
  if (sub === 'wa-link' && req.method === 'GET') {
    const phone = soPhone(url.searchParams.get('telefone'));
    if (!validWhatsApp(phone)) return json(res, 400, { erro: 'numero invalido' });
    return json(res, 200, { telefone: phone, token: waToken(phone), link: `/loja?tel=${phone}&wa=${waToken(phone)}` });
  }

  // criar pedido
  if (sub === 'pedidos' && req.method === 'POST') {
    const b = await readBody(req);
    const phone = soPhone(b.cliente && b.cliente.telefone);
    if (!validWhatsApp(phone)) return json(res, 400, { erro: 'cliente sem WhatsApp válido' });
    const itens = Array.isArray(b.itens) ? b.itens : [];
    if (!itens.length) return json(res, 400, { erro: 'pedido sem itens' });
    for (const it of itens) it.total = calcItem(it);
    const subtotal = money(itens.reduce((s, it) => s + it.total, 0));
    const taxa = b.tipo === 'DELIVERY' ? money(b.taxa_entrega || 0) : 0;
    const total = money(subtotal + taxa);
    DB.seq += 1;
    const wa_ok = b.wa && b.wa === waToken(phone);
    const pedido = {
      id: crypto.randomUUID(), numero: DB.seq,
      criado_em: new Date().toISOString(), status: 'RECEBIDO',
      canal: 'web', origem_whatsapp: !!wa_ok,
      cliente: { telefone: phone, nome: (b.cliente && b.cliente.nome) || DB.clientes[phone]?.nome || 'Cliente' },
      tipo: b.tipo === 'DELIVERY' ? 'DELIVERY' : 'TAKEOUT',
      endereco: b.tipo === 'DELIVERY' ? (b.endereco || {}) : null,
      pagamento: b.pagamento || { forma: 'DIN' },
      itens, subtotal, taxa_entrega: taxa, total,
      observacao: b.observacao || '',
      historico: [{ status: 'RECEBIDO', em: new Date().toISOString() }],
      impresso: false
    };
    DB.pedidos.unshift(pedido);
    // memoriza endereço do cliente
    if (pedido.endereco && pedido.endereco.rua) {
      const c = DB.clientes[phone]; c.enderecos = c.enderecos || [];
      c.enderecos = [pedido.endereco, ...c.enderecos.filter(e => JSON.stringify(e) !== JSON.stringify(pedido.endereco))].slice(0, 5);
    }
    saveDB();
    return json(res, 201, { ok: true, pedido });
  }

  // listar pedidos (gestor) — opcional ?desde=ISO p/ polling
  if (sub === 'pedidos' && req.method === 'GET' && !seg[2]) {
    const desde = url.searchParams.get('desde');
    let lista = DB.pedidos;
    if (desde) lista = lista.filter(p => p.criado_em > desde);
    return json(res, 200, { pedidos: lista, agora: new Date().toISOString() });
  }

  // detalhe / pedido por telefone (cliente acompanha)
  if (sub === 'meus-pedidos' && req.method === 'GET') {
    const phone = soPhone(url.searchParams.get('telefone'));
    return json(res, 200, { pedidos: DB.pedidos.filter(p => p.cliente.telefone === phone).slice(0, 20) });
  }

  // detalhe por id
  if (sub === 'pedidos' && seg[2] && req.method === 'GET') {
    const p = DB.pedidos.find(x => x.id === seg[2] || String(x.numero) === seg[2]);
    return p ? json(res, 200, p) : json(res, 404, { erro: 'nao encontrado' });
  }

  // atualizar status / marcar impresso
  if (sub === 'pedidos' && seg[2] && req.method === 'PATCH') {
    const b = await readBody(req);
    const p = DB.pedidos.find(x => x.id === seg[2] || String(x.numero) === seg[2]);
    if (!p) return json(res, 404, { erro: 'nao encontrado' });
    if (b.status && STATUS.includes(b.status)) { p.status = b.status; p.historico.push({ status: b.status, em: new Date().toISOString() }); }
    if (typeof b.impresso === 'boolean') p.impresso = b.impresso;
    saveDB();
    return json(res, 200, { ok: true, pedido: p });
  }

  // config da impressora
  if (sub === 'config' && req.method === 'GET') return json(res, 200, DB.config);
  if (sub === 'config' && req.method === 'POST') { const b = await readBody(req); DB.config = { ...DB.config, ...b }; saveDB(); return json(res, 200, DB.config); }

  return json(res, 404, { erro: 'rota nao encontrada' });
}

/* ---------- estáticos ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

/* ---------- router ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let p = url.pathname;
  if (p === '/') { res.writeHead(302, { Location: '/loja' }); return res.end(); }
  if (p.startsWith('/api/')) return api(req, res, url);
  // apps
  if (p === '/loja' || p === '/loja/') return serveStatic(res, path.join(ROOT, 'public/loja/index.html'));
  if (p === '/gestor' || p === '/gestor/') return serveStatic(res, path.join(ROOT, 'public/gestor/index.html'));
  // arquivos dentro de public
  const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
  const fp = path.join(ROOT, 'public', safe);
  if (fp.startsWith(path.join(ROOT, 'public'))) return serveStatic(res, fp);
  res.writeHead(404); res.end('404');
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🍕  Premium Pizzas — Plataforma de Pedidos');
  console.log('  ------------------------------------------');
  console.log(`  Cliente:        http://localhost:${PORT}/loja`);
  console.log(`  Estabelecimento http://localhost:${PORT}/gestor`);
  console.log(`  Dados em:       ${DB_FILE}`);
  console.log('');
});
