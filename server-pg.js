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

const PUBLIC_CLIENT_HOSTS = new Set(['premium.titanatende.com.br', 'pedido.titanatende.com.br']);
const DEFAULT_TOOLS_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  'tools.titanatende.com.br',
  'mayaproject-github.yrbgh5.easypanel.host'
];
const TITAN_TOOLS_HOSTS = new Set([
  ...DEFAULT_TOOLS_HOSTS,
  ...String(process.env.TITAN_TOOLS_HOSTS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
]);

function reqHost(req) {
  const raw = String(req.headers.host || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) return raw.slice(1, raw.indexOf(']'));
  return raw.split(':')[0];
}
function hostNaLista(host, set) {
  if (set.has(host)) return true;
  for (const item of set) {
    if (item.startsWith('*.') && host.endsWith(item.slice(1))) return true;
  }
  return false;
}
function hostFerramentasPermitido(req) {
  const host = reqHost(req);
  if (!host) return false;
  if (hostNaLista(host, PUBLIC_CLIENT_HOSTS)) return false;
  return hostNaLista(host, TITAN_TOOLS_HOSTS);
}
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}

const soPhone = s => String(s || '').replace(/\D/g, '');
const validWA = p => { p = soPhone(p); return p.length === 12 || p.length === 13; };
const waToken = phone => crypto.createHmac('sha256', WA_SECRET).update(soPhone(phone)).digest('hex').slice(0, 16);
const money = n => Math.round(Number(n) * 100) / 100;
function json(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(b); }
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); }); }

const PROJECT_STATE_FILES = [
  'modules.json', 'routes.json', 'services.json', 'containers.json', 'databases.json',
  'tasks.json', 'risks.json', 'dependencies.json', 'decisions.json', 'roadmap.json',
  'weekly-focus.json', 'deploys.json', 'incidents.json', 'health-checks.json',
  'rbac-audit.json', 'people.json', 'module-route-table-map.json', 'api-contracts-critical.json',
  'test-matrix.json', 'agent-workflow.json'
];
async function gestorBasico(uid) {
  if (!uid) return null;
  try {
    const r = await db.q(`SELECT id, nome, perfil_principal, perfis_adicionais
      FROM rbac_contacts
      WHERE id=$1 AND tenant_id=$2 AND ativo
        AND ('GESTOR'=perfil_principal OR 'GERENTE'=perfil_principal
          OR 'GESTOR'=ANY(COALESCE(perfis_adicionais,'{}'))
          OR 'GERENTE'=ANY(COALESCE(perfis_adicionais,'{}')))`, [uid, TENANT]);
    return r.rows[0] || null;
  } catch (e) { return null; }
}
function lerProjectStateSeguro() {
  const base = path.join(ROOT, 'project-state');
  const out = {};
  for (const file of PROJECT_STATE_FILES) {
    try {
      const full = path.join(base, file);
      if (!full.startsWith(base)) continue;
      out[file] = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      out[file] = { erro: e.message };
    }
  }
  return out;
}

/* ===== Permissões do Estoque (configuráveis por usuário) ===== */
const EST_PERMS = ['acessar_estoque_premium_rp', 'acessar_produtos', 'acessar_categorias', 'acessar_fornecedores', 'acessar_visitas', 'acessar_mapa_comparativo_fornecedores', 'acessar_lista_compras_inteligente', 'acessar_contagem', 'acessar_auditoria', 'acessar_producao_interna', 'acessar_lancamentos', 'acessar_configuracoes', 'ver_valores', 'ver_maior_valor_pago', 'editar_produtos', 'editar_categorias', 'registrar_compra', 'registrar_visita', 'fazer_contagem', 'auditar_contagem', 'aprovar_contagem', 'reprovar_contagem', 'exportar_dados', 'criar_usuarios', 'editar_permissoes'];
const EST_PERMS_COLAB = ['acessar_estoque_premium_rp', 'acessar_contagem', 'fazer_contagem'];
async function estPermsEfetivas(uid) {
  if (!uid) return { user: null, perms: [], gestor: false };
  let u; try { u = (await db.q(`SELECT id, nome, perfil_principal, perfis_adicionais FROM rbac_contacts WHERE id=$1 AND tenant_id=$2 AND ativo`, [uid, TENANT])).rows[0]; } catch (e) { return { user: null, perms: [], gestor: false }; }
  if (!u) return { user: null, perms: [], gestor: false };
  const perfis = [u.perfil_principal].concat(u.perfis_adicionais || []).map(x => String(x || '').toUpperCase());
  const gestor = perfis.includes('GESTOR') || perfis.includes('GERENTE');
  if (gestor) return { user: u, perms: EST_PERMS.slice(), gestor: true };
  let ex = []; try { ex = (await db.q(`SELECT permissao FROM est_permissao WHERE tenant_id=$1 AND usuario_id=$2`, [TENANT, uid])).rows; } catch (e) {}
  if (ex.some(r => r.permissao === '__configured__')) return { user: u, perms: ex.map(r => r.permissao).filter(p => p !== '__configured__'), gestor: false };
  return { user: u, perms: EST_PERMS_COLAB.slice(), gestor: false };
}
async function estPode(uid, perm) { const e = await estPermsEfetivas(uid); return e.gestor || e.perms.includes(perm); }
// Converte uma quantidade de receita para a UNIDADE DE CONTAGEM do insumo bruto.
// Se a unidade da receita for de massa/volume (g/kg/ml/l) e o bruto tiver peso_g (gramas por unidade), converte; senão usa o número direto.
function estToGramas(qtd, unidade) {
  const u = String(unidade || '').toLowerCase().trim();
  if (u === 'kg' || u === 'kgs' || u === 'kilo' || u === 'quilo' || u === 'l' || u === 'lt' || u === 'litro' || u === 'litros') return qtd * 1000;
  if (u === 'g' || u === 'gr' || u === 'grama' || u === 'gramas' || u === 'ml') return qtd * 1;
  return null;
}
function estBaixaEmUnidades(qtdReceita, unidadeReceita, pesoG, unidadeEstoque) {
  const qtd = Number(qtdReceita) || 0;
  const ur = estNorm(unidadeReceita).toUpperCase(), ue = estNorm(unidadeEstoque).toUpperCase();
  const massaG = estToGramas(qtd, unidadeReceita);
  if ((ue === 'KG' || ue.startsWith('QUILOGRAMA')) && massaG != null) return massaG / 1000;
  if ((ue === 'G' || ue.startsWith('GRAMA')) && massaG != null) return massaG;
  if ((ue === 'L' || ue === 'LITRO') && (ur === 'ML' || ur === 'MILILITRO')) return qtd / 1000;
  if ((ue === 'ML' || ue === 'MILILITRO') && (ur === 'L' || ur === 'LITRO')) return qtd * 1000;
  if (massaG != null && Number(pesoG) > 0) return massaG / Number(pesoG);
  return qtd;
}
function estCustoReceita(qtd, unidadeReceita, produto) {
  const unidades = estBaixaEmUnidades(qtd, unidadeReceita, produto.peso_g, produto.unidade);
  const custo = Number(produto.medio_valor != null ? produto.medio_valor : produto.ultimo_valor);
  return Number.isFinite(custo) ? unidades * custo : null;
}

/* ===== Contagem Geral (periódica, genérica por tenant) =====
   Os itens do setor "Gerais" (sem dono fixo) são divididos entre os setores
   participantes no dia da contagem geral, de forma equilibrada pela carga:
   quem tem menos itens fixos recebe mais, nivelando os totais sem sobrecarregar.
   O que já pertence a um setor permanece no setor (não entra na divisão). */
const GERAL_DEFAULTS = { ativo: false, dia: 1, escopo: 'gerais', setores_participantes: ['Borda', 'Montagem', 'Finalização'], forcar_data: null };
function estHojeISO() {
  const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
async function estGeralCfg() {
  const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
  const c = (r.rows[0] && r.rows[0].config && r.rows[0].config.contagem_geral) || {};
  return Object.assign({}, GERAL_DEFAULTS, c);
}
function estGeralAtivaHoje(cfg) {
  if (cfg && cfg.forcar_data === estHojeISO()) return true;
  if (!cfg || !cfg.ativo) return false;
  return new Date().getDay() === Number(cfg.dia);
}
// Calcula quais produtos do "Gerais" cada setor participante conta na geral.
async function estDivisaoGeral(cfg) {
  cfg = cfg || await estGeralCfg();
  const parts = (cfg.setores_participantes || []).filter(Boolean);
  const ger = (await db.q(
    `SELECT p.id, p.nome, p.unidade FROM est_produto p
       JOIN est_produto_setor ps ON ps.produto_id=p.id AND ps.tenant_id=p.tenant_id
       JOIN est_setor s ON s.id=ps.setor_id
      WHERE p.tenant_id=$1 AND p.ativo AND p.pode_contar AND s.nome='Gerais'
      ORDER BY p.nome`, [TENANT])).rows;
  if (!parts.length || !ger.length) return { gerais: ger.length, participantes: parts, fixos: {}, alvo: {}, porSetor: {} };
  const fixos = {};
  for (const sn of parts) {
    const r = await db.q(
      `SELECT count(*)::int n FROM est_produto_setor ps
         JOIN est_setor s ON s.id=ps.setor_id JOIN est_produto p ON p.id=ps.produto_id
        WHERE ps.tenant_id=$1 AND s.nome=$2 AND p.ativo AND p.pode_contar AND s.nome<>'Gerais'`, [TENANT, sn]);
    fixos[sn] = r.rows[0].n;
  }
  const G = ger.length;
  const sumF = parts.reduce((a, s) => a + fixos[s], 0);
  const T = (sumF + G) / parts.length; // total alvo por setor após a divisão
  const ideal = parts.map(s => Math.max(0, T - fixos[s]));
  const isum = ideal.reduce((a, b) => a + b, 0) || 1;
  const counts = parts.map((s, i) => Math.round(ideal[i] / isum * G));
  // ajuste fino de arredondamento para somar exatamente G
  let diff = G - counts.reduce((a, b) => a + b, 0), guard = 0;
  while (diff !== 0 && guard++ < 5000) {
    // dá/tira do setor que ficará com menor/maior total, mantendo igualdade
    const totals = parts.map((s, i) => fixos[s] + counts[i]);
    if (diff > 0) { const j = totals.indexOf(Math.min(...totals)); counts[j]++; diff--; }
    else { const cand = parts.map((s, i) => counts[i] > 0 ? fixos[s] + counts[i] : Infinity); const j = cand.indexOf(Math.max(...cand.filter(x => x !== Infinity))); counts[(j < 0 ? 0 : j)]--; diff++; }
  }
  const porSetor = {}; let k = 0;
  parts.forEach((s, i) => { porSetor[s] = ger.slice(k, k + counts[i]).map(x => x.id); k += counts[i]; });
  const alvo = {}; parts.forEach((s, i) => { alvo[s] = fixos[s] + counts[i]; });
  return { gerais: G, participantes: parts, fixos, counts: Object.fromEntries(parts.map((s, i) => [s, counts[i]])), alvo, porSetor };
}

/* ===== Tema white-label da loja (storefront por tenant) ===== */
const TEMA_DEFAULTS = { marca: 'Premium Pizzas', dominio: '', modo: 'escuro', cor_primaria: '#F97316', cor_primaria_texto: '#160a02', fonte: 'Sora', logo_url: '/logo.png', layout_card: 'lista', mostrar_busca: true, mostrar_descricao: true, mostrar_preco_a_partir: true, mostrar_destaques: false, mostrar_avaliacoes: false, texto_funcionamento: '' };
const FONTES_OK = ['Sora', 'Inter', 'Archivo', 'Nunito', 'Baloo 2', 'Jost', 'Cormorant Garamond', 'Poppins', 'Montserrat', 'Roboto'];
function temaSanitize(input, base) {
  const t = Object.assign({}, base || TEMA_DEFAULTS);
  if (!input || typeof input !== 'object') return t;
  const hex = v => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim())) ? v.trim() : null;
  if (typeof input.marca === 'string') t.marca = input.marca.slice(0, 60);
  if (typeof input.dominio === 'string') t.dominio = input.dominio.replace(/[^a-z0-9.\-:/]/gi, '').slice(0, 80);
  if (input.modo === 'claro' || input.modo === 'escuro') t.modo = input.modo;
  if (hex(input.cor_primaria)) t.cor_primaria = hex(input.cor_primaria);
  if (hex(input.cor_primaria_texto)) t.cor_primaria_texto = hex(input.cor_primaria_texto);
  if (FONTES_OK.includes(input.fonte)) t.fonte = input.fonte;
  if (typeof input.logo_url === 'string') { const mx = input.logo_url.startsWith('data:image/') ? 800000 : 300; t.logo_url = input.logo_url.slice(0, mx); }
  if (input.layout_card === 'grade' || input.layout_card === 'lista') t.layout_card = input.layout_card;
  for (const k of ['mostrar_busca', 'mostrar_descricao', 'mostrar_preco_a_partir', 'mostrar_destaques', 'mostrar_avaliacoes']) if (typeof input[k] === 'boolean') t[k] = input[k];
  if (typeof input.texto_funcionamento === 'string') t.texto_funcionamento = input.texto_funcionamento.slice(0, 80);
  return t;
}

/* ===== Observações do pedido + Impressão (config simples por tenant) ===== */
const OBS_DEFAULTS = { permite_pedido: true, permite_item: true, rotulo_pedido: 'Observações do pedido', rotulo_item: 'Alguma observação?' };
const IMPRESSAO_DEFAULTS = { largura: '80mm', cabecalho: '', mostrar_precos: true, mostrar_cliente: true, mostrar_obs_item: true, mostrar_obs_pedido: true, obs_pedido_pos: 'rodape', copias: 1 };
function obsSanitize(input, base) {
  const o = Object.assign({}, base || OBS_DEFAULTS);
  if (!input || typeof input !== 'object') return o;
  for (const k of ['permite_pedido', 'permite_item']) if (typeof input[k] === 'boolean') o[k] = input[k];
  if (typeof input.rotulo_pedido === 'string') o.rotulo_pedido = input.rotulo_pedido.slice(0, 60);
  if (typeof input.rotulo_item === 'string') o.rotulo_item = input.rotulo_item.slice(0, 60);
  return o;
}
function impressaoSanitize(input, base) {
  const i = Object.assign({}, base || IMPRESSAO_DEFAULTS);
  if (!input || typeof input !== 'object') return i;
  if (input.largura === '58mm' || input.largura === '80mm') i.largura = input.largura;
  if (typeof input.cabecalho === 'string') i.cabecalho = input.cabecalho.slice(0, 120);
  for (const k of ['mostrar_precos', 'mostrar_cliente', 'mostrar_obs_item', 'mostrar_obs_pedido']) if (typeof input[k] === 'boolean') i[k] = input[k];
  if (input.obs_pedido_pos === 'topo' || input.obs_pedido_pos === 'rodape') i.obs_pedido_pos = input.obs_pedido_pos;
  const c = parseInt(input.copias, 10); if (c >= 1 && c <= 3) i.copias = c;
  return i;
}

/* ===== Helpers compartilhados (matching, movimento, Jéssica) ===== */
function estNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function estLev(a, b) { if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1); for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) { const cost = a[i - 1] === b[j - 1] ? 0 : 1; cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost); } [prev, cur] = [cur, prev]; } return prev[n]; }
function estSim(a, b) { if (!a || !b) return 0; return 1 - estLev(a, b) / Math.max(a.length, b.length); }
async function estAchaProduto(texto, minScore) {
  minScore = minScore == null ? 0.5 : minScore;
  const prods = (await db.q(`SELECT id, nome, unidade, estoque_atual FROM est_produto WHERE tenant_id=$1 AND ativo`, [TENANT])).rows;
  const nin = estNorm(texto); if (!nin) return null; const inToks = nin.split(' ').filter(Boolean);
  let best = null, bestS = 0;
  for (const p of prods) {
    const n = estNorm(p.nome); const toks = n.split(' ').filter(Boolean); let s = 0;
    if (n === nin) s = 1; else if (n.includes(nin) || nin.includes(n)) s = 0.9;
    else {
      const inter = inToks.filter(t => t.length > 2 && toks.includes(t)).length; const denom = Math.max(toks.length, inToks.length) || 1; s = inter / denom;
      let fz = 0, fzLen = 0; { const sv = estSim(nin, n); if (sv > fz) { fz = sv; fzLen = Math.min(nin.length, n.length); } }
      for (const t of inToks) { if (t.length < 4) continue; for (const ct of toks) { if (ct.length < 4) continue; const sv = estSim(t, ct); if (sv > fz) { fz = sv; fzLen = Math.min(t.length, ct.length); } } }
      const gate = fzLen >= 6 ? 0.72 : 0.86; if (fz >= gate && fz * 0.95 > s) s = fz * 0.95;
    }
    if (s > bestS) { bestS = s; best = p; }
  }
  return bestS >= minScore ? best : null;
}
async function estLancaMov(tipo, user, produto, qtd, motivo, origem, observacao) {
  const antes = Number(produto.estoque_atual); const depois = (tipo === 'ENTRADA') ? antes + qtd : antes - qtd;
  await db.q('UPDATE est_produto SET estoque_atual=$2, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$3', [produto.id, depois, TENANT]);
  await db.q(`INSERT INTO est_movimento (tenant_id, produto_id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, motivo, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [TENANT, produto.id, produto.nome, tipo, antes, qtd, depois, origem || 'MANUAL', user.id, user.nome, motivo || null, observacao || null]);
  return { antes, depois };
}
async function estJessica(uid, pergunta) {
  const e = await estPermsEfetivas(uid);
  if (!e.user) return { erro: 'usuário inválido' };
  const verValores = e.gestor || e.perms.includes('ver_valores');
  const snap = {};
  const ag = await db.q(`SELECT
    (SELECT count(*)::int FROM est_produto WHERE tenant_id=$1 AND ativo) AS produtos_ativos,
    (SELECT count(*)::int FROM est_produto WHERE tenant_id=$1 AND ativo AND estoque_atual<=0) AS zerados,
    (SELECT count(*)::int FROM est_produto WHERE tenant_id=$1 AND ativo AND estoque_minimo IS NOT NULL AND estoque_atual<estoque_minimo) AS abaixo_minimo,
    (SELECT count(*)::int FROM est_contagem WHERE tenant_id=$1 AND status_auditoria='AGUARDANDO') AS contagens_aguardando_auditoria`, [TENANT]);
  snap.totais = ag.rows[0];
  snap.abaixo_minimo = (await db.q(`SELECT nome, estoque_atual, estoque_minimo, unidade FROM est_produto WHERE tenant_id=$1 AND ativo AND estoque_minimo IS NOT NULL AND estoque_atual<estoque_minimo ORDER BY nome LIMIT 40`, [TENANT])).rows;
  snap.atividade_hoje = (await db.q(`SELECT tipo, produto_nome, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_nome, motivo, criado_em FROM est_movimento WHERE tenant_id=$1 AND criado_em::date=CURRENT_DATE ORDER BY criado_em DESC LIMIT 60`, [TENANT])).rows;
  snap.compras_hoje = (await db.q(`SELECT c.usuario_nome, f.nome AS fornecedor, c.total, c.status, c.criado_em FROM est_compra c LEFT JOIN est_fornecedor f ON f.id=c.fornecedor_id WHERE c.tenant_id=$1 AND c.criado_em::date=CURRENT_DATE ORDER BY c.criado_em DESC`, [TENANT])).rows;
  snap.contagens_recentes = (await db.q(`SELECT setor_nome, usuario_nome, status, status_auditoria, encerrada_em FROM est_contagem WHERE tenant_id=$1 ORDER BY COALESCE(encerrada_em, iniciada_em) DESC LIMIT 15`, [TENANT])).rows;
  snap.visitas_recentes = (await db.q(`SELECT v.usuario_nome, f.nome AS fornecedor, v.finalizada_em, v.tempo_seg FROM est_visita v LEFT JOIN est_fornecedor f ON f.id=v.fornecedor_id WHERE v.tenant_id=$1 ORDER BY v.iniciada_em DESC LIMIT 15`, [TENANT])).rows;
  snap.perdas_semana = (await db.q(`SELECT produto_nome, qtd_movimentada, motivo, usuario_nome, criado_em FROM est_movimento WHERE tenant_id=$1 AND tipo IN ('PERDA','PERDA_LANCADA','CONSUMO') AND criado_em >= date_trunc('week', CURRENT_DATE) ORDER BY criado_em DESC LIMIT 40`, [TENANT])).rows;
  const prodAll = (await db.q(`SELECT id, nome FROM est_produto WHERE tenant_id=$1 AND ativo`, [TENANT])).rows;
  const pl = estNorm(pergunta);
  const mentioned = prodAll.filter(p => { const n = estNorm(p.nome); return pl.includes(n) || n.split(' ').some(t => t.length > 3 && pl.includes(t)); });
  if (mentioned.length) {
    const ids = mentioned.slice(0, 5).map(p => p.id);
    snap.fornecedores_do_produto = (await db.q(`SELECT p.nome AS produto, f.nome AS fornecedor, pf.ultimo_valor, pf.menor_valor, pf.maior_valor, pf.status, pf.marca FROM est_produto_fornecedor pf JOIN est_produto p ON p.id=pf.produto_id JOIN est_fornecedor f ON f.id=pf.fornecedor_id WHERE pf.tenant_id=$1 AND pf.produto_id = ANY($2) ORDER BY p.nome, pf.ultimo_valor NULLS LAST`, [TENANT, ids])).rows;
  }
  if (!verValores) {
    snap.compras_hoje = snap.compras_hoje.map(c => ({ usuario_nome: c.usuario_nome, fornecedor: c.fornecedor, status: c.status, criado_em: c.criado_em }));
    if (snap.fornecedores_do_produto) snap.fornecedores_do_produto = snap.fornecedores_do_produto.map(r => ({ produto: r.produto, fornecedor: r.fornecedor, status: r.status, marca: r.marca }));
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { resposta: null, dados: snap, aviso: 'IA não configurada; retornando dados brutos.' };
  try {
    const sys = `Você é a Jéssica, assistente operacional do estoque da Premium Pizzas (loja de Rio Preto). Responda em português do Brasil, curto e direto, à pergunta usando SOMENTE os dados do JSON (snapshot do banco oficial). Nunca invente: se não houver registro no snapshot, diga que não há registro. Hoje é ${new Date().toISOString().slice(0, 10)}. ${verValores ? '' : 'O usuário NÃO tem permissão de ver valores/preços — não revele valores monetários.'}`;
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 500, messages: [{ role: 'system', content: sys }, { role: 'user', content: 'PERGUNTA: ' + pergunta + '\n\nSNAPSHOT:\n' + JSON.stringify(snap) }] }) });
    const j = await r.json();
    if (!r.ok) return { resposta: null, dados: snap, aviso: 'IA falhou: ' + (j.error ? j.error.message : ('HTTP ' + r.status)) };
    return { resposta: j.choices[0].message.content, dados: snap };
  } catch (er) { return { resposta: null, dados: snap, aviso: 'Erro IA: ' + (er.message || er) }; }
}
async function estInterpretaWA(texto) {
  // Determinístico primeiro: "perda muçarela 500g motivo caiu no chão" / "consumo catupiry 3 un montagem"
  const t = String(texto || '').trim();
  const m = t.match(/^(perda|perca|consumo|consumi|entrada|baixa|gasto|quebra)\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-ZçÇ]+)?\s*(?:motivo\s+(.+)|porque\s+(.+)|\((.+)\))?\s*$/i);
  if (m) {
    const acaoRaw = m[1].toLowerCase();
    const acao = /entrada/.test(acaoRaw) ? 'entrada' : (/consum/.test(acaoRaw) ? 'consumo' : 'perda');
    return { acao, produto: m[2].trim(), quantidade: Number(m[3].replace(',', '.')), unidade: m[4] || null, motivo: (m[5] || m[6] || m[7] || null), via: 'regex' };
  }
  // IA como fallback (intenção + entidades)
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { acao: 'consulta', via: 'fallback' };
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0, max_tokens: 300, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Classifique a mensagem de um colaborador de pizzaria sobre o ESTOQUE. Responda APENAS JSON {"acao":"perda"|"consumo"|"entrada"|"consulta"|"ajuda","produto":string|null,"quantidade":number|null,"unidade":string|null,"motivo":string|null,"setor":string|null}. "perda" = item perdido/estragado/quebrado; "consumo" = usado na produção/uso interno; "entrada" = chegou/recebeu; "consulta" = pergunta sobre o estoque; "ajuda" = não entendeu. Use ponto decimal.' },
          { role: 'user', content: t }
        ]
      })
    });
    const j = await r.json();
    if (!r.ok) return { acao: 'consulta', via: 'fallback' };
    const o = JSON.parse(j.choices[0].message.content); o.via = 'ia'; return o;
  } catch (e) { return { acao: 'consulta', via: 'fallback' }; }
}
async function estMontaRota(inItens) {
  inItens = (inItens || []).filter(x => x && x.produto_id);
  if (!inItens.length) return { ir_primeiro_em: null, comprar_por_fornecedor: [], confirmar_antes: [], substitutos: [], nao_encontrados: [], estimativa_total: 0, alerta: null, itens_total: 0 };
  const ids = inItens.map(x => parseInt(x.produto_id, 10)).filter(Boolean);
  const pr = await db.q(`SELECT p.id, p.nome, p.unidade, p.estoque_atual, p.estoque_minimo, p.estoque_ideal, p.marca_preferida, p.ultimo_valor, p.menor_valor, p.maior_valor, p.fornecedor_preferido_id, fp.nome AS fornecedor_preferido
    FROM est_produto p LEFT JOIN est_fornecedor fp ON fp.id=p.fornecedor_preferido_id
    WHERE p.tenant_id=$1 AND p.id = ANY($2)`, [TENANT, ids]);
  const pmap = {}; for (const p of pr.rows) pmap[p.id] = p;
  const pf = await db.q(`SELECT pf.produto_id, pf.fornecedor_id, f.nome AS fornecedor, pf.preferencial, pf.marca, pf.marca_parecida, pf.status, pf.ultimo_valor, pf.menor_valor, pf.maior_valor, pf.frequencia
    FROM est_produto_fornecedor pf JOIN est_fornecedor f ON f.id=pf.fornecedor_id
    WHERE pf.tenant_id=$1 AND pf.produto_id = ANY($2)`, [TENANT, ids]);
  const pfByProd = {}; for (const r of pf.rows) (pfByProd[r.produto_id] = pfByProd[r.produto_id] || []).push(r);
  const itens = [], naoEncontrados = [], confirmar = [], substitutos = [];
  for (const inp of inItens) {
    const p = pmap[inp.produto_id]; if (!p) continue;
    const qtd = inp.quantidade != null && inp.quantidade !== '' ? Number(inp.quantidade) : null;
    const forns = (pfByProd[p.id] || []).slice();
    let escolhido = null;
    if (forns.length) {
      const comValor = forns.filter(f => f.ultimo_valor != null);
      escolhido = forns.find(f => f.preferencial) || (comValor.length ? comValor.reduce((a, bb) => Number(bb.ultimo_valor) < Number(a.ultimo_valor) ? bb : a) : null) || forns.reduce((a, bb) => Number(bb.frequencia || 0) > Number(a.frequencia || 0) ? bb : a);
    }
    const preco = escolhido && escolhido.ultimo_valor != null ? Number(escolhido.ultimo_valor) : (p.ultimo_valor != null ? Number(p.ultimo_valor) : null);
    const fornNome = escolhido ? escolhido.fornecedor : (p.fornecedor_preferido || null);
    const fornId = escolhido ? escolhido.fornecedor_id : (p.fornecedor_preferido_id || null);
    const estimativa = (preco != null && qtd != null) ? Number((preco * qtd).toFixed(2)) : null;
    const item = { produto_id: p.id, produto: p.nome, unidade: inp.unidade || p.unidade, quantidade: qtd, estoque_atual: Number(p.estoque_atual), estoque_minimo: p.estoque_minimo != null ? Number(p.estoque_minimo) : null, essencial: p.estoque_minimo != null && Number(p.estoque_atual) <= Number(p.estoque_minimo), fornecedor_id: fornId, fornecedor: fornNome, marca: escolhido ? escolhido.marca : p.marca_preferida, status_fornecedor: escolhido ? escolhido.status : null, preco_unit: preco, estimativa, frequencia: escolhido ? Number(escolhido.frequencia || 0) : null };
    if (!fornNome) naoEncontrados.push(item); else itens.push(item);
    if (escolhido && (/(confirm|parec|verific|incert)/i.test(escolhido.status || '') || (escolhido.marca_parecida && !escolhido.marca))) confirmar.push(item);
    const outros = forns.filter(f => !escolhido || f.fornecedor_id !== escolhido.fornecedor_id);
    if (outros.length) substitutos.push({ produto: p.nome, opcoes: outros.map(o => ({ fornecedor: o.fornecedor, preco: o.ultimo_valor != null ? Number(o.ultimo_valor) : null, marca: o.marca, marca_parecida: o.marca_parecida, status: o.status })) });
  }
  const porForn = {};
  for (const it of itens) { const k = it.fornecedor || '(sem fornecedor)'; (porForn[k] = porForn[k] || { fornecedor: it.fornecedor, fornecedor_id: it.fornecedor_id, itens: [], total: 0 }); porForn[k].itens.push(it); if (it.estimativa != null) porForn[k].total += it.estimativa; }
  const grupos = Object.values(porForn).map(g => { g.total = Number(g.total.toFixed(2)); return g; }).sort((a, b) => b.itens.length - a.itens.length || b.total - a.total);
  const irPrimeiro = grupos.length ? grupos[0].fornecedor : null;
  const estimativaTotal = Number(itens.reduce((s, it) => s + (it.estimativa || 0), 0).toFixed(2));
  let alerta = null;
  if (grupos.length > 1) {
    const principal = grupos[0].fornecedor; let custoTudoPrincipal = 0, possivel = true;
    for (const it of itens) {
      if (it.fornecedor === principal) { custoTudoPrincipal += it.estimativa || 0; continue; }
      const sub = substitutos.find(s => s.produto === it.produto);
      const noPrincipal = sub && sub.opcoes.find(o => o.fornecedor === principal && o.preco != null);
      if (noPrincipal && it.quantidade != null) custoTudoPrincipal += noPrincipal.preco * it.quantidade; else { possivel = false; break; }
    }
    if (possivel) { const aMais = Number((custoTudoPrincipal - estimativaTotal).toFixed(2)); if (aMais <= Math.max(8, estimativaTotal * 0.05)) alerta = `Não compensa dividir: comprar tudo em ${principal} custa só R$ ${aMais.toFixed(2)} a mais. Vá num lugar só.`; }
  }
  return { ir_primeiro_em: irPrimeiro, comprar_por_fornecedor: grupos, confirmar_antes: confirmar, substitutos, nao_encontrados: naoEncontrados, estimativa_total: estimativaTotal, alerta, itens_total: itens.length + naoEncontrados.length };
}
async function estItensReposicao(base) {
  const cond = base === 'minimo' ? `estoque_minimo IS NOT NULL AND estoque_atual < estoque_minimo` : `estoque_ideal IS NOT NULL AND estoque_atual < estoque_ideal`;
  const r = await db.q(`SELECT id, unidade, estoque_atual, estoque_minimo, estoque_ideal FROM est_produto WHERE tenant_id=$1 AND ativo AND pode_comprar AND (${cond}) ORDER BY nome`, [TENANT]);
  return r.rows.map(p => { const atual = Number(p.estoque_atual); const alvo = p.estoque_ideal != null ? Number(p.estoque_ideal) : (p.estoque_minimo != null ? Number(p.estoque_minimo) : 0); const q = Math.max(alvo - atual, 0); return { produto_id: p.id, quantidade: Number(q.toFixed(3)), unidade: p.unidade }; }).filter(x => x.quantidade > 0);
}
function estRotaTexto(rota, periodicidade) {
  const money = v => v != null ? 'R$ ' + Number(v).toFixed(2) : '—';
  let t = `📋 Lista de compras automática (${periodicidade})`;
  if (!rota.itens_total) return t + '\nNenhum item precisa de reposição agora. 👍';
  if (rota.ir_primeiro_em) t += `\n📍 Ir primeiro em: ${rota.ir_primeiro_em}`;
  for (const g of rota.comprar_por_fornecedor) {
    t += `\n\n*${g.fornecedor || 'Sem fornecedor'}*${g.total ? ' (' + money(g.total) + ')' : ''}`;
    for (const it of g.itens) t += `\n• ${it.produto} — ${it.quantidade != null ? it.quantidade : '?'} ${it.unidade || ''}${it.essencial ? ' (essencial)' : ''}`;
  }
  if (rota.nao_encontrados.length) { t += `\n\nSem fornecedor definido:`; for (const it of rota.nao_encontrados) t += `\n• ${it.produto} — ${it.quantidade} ${it.unidade || ''}`; }
  if (rota.confirmar_antes && rota.confirmar_antes.length) t += `\n\n⚠️ Confirmar antes: ` + rota.confirmar_antes.map(i => i.produto).join(', ');
  t += `\n\n💰 Estimativa total: ${money(rota.estimativa_total)}`;
  if (rota.alerta) t += `\n⚠️ ${rota.alerta}`;
  return t;
}

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

// ===== Baixa automática de estoque por pedido (ficha técnica -> est_produto) =====
// Explode ficha do produto + de todas as opções escolhidas, explode preparos (sub-receitas),
// agrega por insumo, baixa no est_produto com histórico antes/depois. Idempotente por pedido.
async function estBaixaPedido(orderRef, itens, opts) {
  opts = opts || {};
  const out = { ref: orderRef ? String(orderRef) : null, ja_processado: false, simulado: !!opts.simular, baixados: [], nao_mapeados: [], itens_processados: 0 };
  itens = Array.isArray(itens) ? itens : [];
  if (!itens.length) return out;
  if (orderRef && !opts.force && !opts.simular) {
    const ja = await db.q(`SELECT 1 FROM est_movimento WHERE tenant_id=$1 AND ref=$2 AND origem='PEDIDO' LIMIT 1`, [TENANT, String(orderRef)]);
    if (ja.rows[0]) { out.ja_processado = true; return out; }
  }
  const prodRows = (await db.q(`SELECT id, nome, unidade, estoque_atual FROM est_produto WHERE tenant_id=$1 AND ativo`, [TENANT])).rows;
  const prodByNome = {}, prodById = {}; for (const p of prodRows) { prodByNome[estNorm(p.nome)] = p; prodById[p.id] = p; }
  const prepRows = (await db.q(`SELECT id, nome, rendimento FROM preparos WHERE tenant_id=$1`, [TENANT])).rows;
  const prepByNome = {}; for (const p of prepRows) prepByNome[estNorm(p.nome)] = p;
  const consumo = {}, semMap = {};
  const addConsumo = (p, q) => { if (!(q > 0)) return; (consumo[p.id] || (consumo[p.id] = { produto: p, qtd: 0 })).qtd += q; };
  async function resolve(nome, qtd, depth, estId) {
    if (!(qtd > 0) || depth > 3) return;
    if (estId && prodById[estId]) { addConsumo(prodById[estId], qtd); return; }
    if (!nome) return;
    const n = estNorm(nome);
    if (prodByNome[n]) { addConsumo(prodByNome[n], qtd); return; }
    let hit = null; for (const p of prodRows) { const pn = estNorm(p.nome); if (pn && (n.includes(pn) || pn.includes(n))) { hit = p; break; } }
    if (hit) { addConsumo(hit, qtd); return; }
    if (prepByNome[n]) {
      const prep = prepByNome[n]; const rend = Number(prep.rendimento) > 0 ? Number(prep.rendimento) : 1;
      const pit = (await db.q(`SELECT insumo_nome, est_produto_id, quantidade FROM preparo_itens WHERE tenant_id=$1 AND preparo_id=$2`, [TENANT, prep.id])).rows;
      for (const x of pit) await resolve(x.insumo_nome, (Number(x.quantidade) || 0) * qtd / rend, depth + 1, x.est_produto_id);
      return;
    }
    semMap[nome] = (semMap[nome] || 0) + qtd;
  }
  async function fichasDoItem(item, Q) {
    const prodId = item.produto_id || item.id;
    let frows = [];
    if (prodId && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(prodId))) frows = (await db.q(`SELECT insumo_nome, est_produto_id, quantidade FROM ficha_itens WHERE tenant_id=$1 AND produto_id=$2`, [TENANT, prodId])).rows;
    else if (item.nome) frows = (await db.q(`SELECT fi.insumo_nome, fi.est_produto_id, fi.quantidade FROM ficha_itens fi JOIN produtos p ON p.id=fi.produto_id WHERE fi.tenant_id=$1 AND lower(p.nome)=lower($2)`, [TENANT, item.nome])).rows;
    for (const r of frows) await resolve(r.insumo_nome, (Number(r.quantidade) || 0) * Q, 0, r.est_produto_id);
    const sels = [].concat(item.selecoes || [], item.sabores || [], item.adicionais || [], (item.borda ? [item.borda] : []));
    for (const s of sels) {
      const nm = s && (s.nome || s.opcao || s.label); if (!nm) continue;
      const fr = (await db.q(`SELECT fi.insumo_nome, fi.est_produto_id, fi.quantidade FROM ficha_itens fi JOIN opcoes o ON o.id=fi.opcao_id WHERE fi.tenant_id=$1 AND lower(o.nome)=lower($2)`, [TENANT, nm])).rows;
      for (const r of fr) await resolve(r.insumo_nome, (Number(r.quantidade) || 0) * Q, 0, r.est_produto_id);
    }
  }
  for (const it of itens) { out.itens_processados++; await fichasDoItem(it, Number(it.quantidade) || 1); }
  for (const k of Object.keys(consumo)) {
    const c = consumo[k]; const qtd = Number(c.qtd.toFixed(4)); if (!(qtd > 0)) continue;
    const antes = Number(c.produto.estoque_atual), depois = Number((antes - qtd).toFixed(4));
    if (!opts.simular) {
      await db.q('UPDATE est_produto SET estoque_atual=$2, atualizado_em=NOW() WHERE id=$1', [c.produto.id, depois]);
      await db.q(`INSERT INTO est_movimento (tenant_id, produto_id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_nome, motivo, ref) VALUES ($1,$2,$3,'SAIDA',$4,$5,$6,'PEDIDO',$7,$8,$9)`, [TENANT, c.produto.id, c.produto.nome, antes, qtd, depois, 'Titan (automático)', 'Baixa por pedido', String(orderRef || '')]);
    }
    out.baixados.push({ produto: c.produto.nome, qtd, antes, depois, unidade: c.produto.unidade });
  }
  out.nao_mapeados = Object.keys(semMap).map(nome => ({ insumo: nome, qtd: Number(semMap[nome].toFixed(4)) }));
  return out;
}
// Gated por config (tenants.config.baixa_estoque_auto). Best-effort no fluxo de criação de pedido.
async function baixaEstoqueSeLigado(itens, ref) {
  try {
    const cfgr = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
    const cfg = (cfgr.rows[0] && cfgr.rows[0].config) || {};
    if (!cfg.baixa_estoque_auto) return;
    const r = await estBaixaPedido(ref, itens, {});
    console.log('[estoque] baixa pedido ' + ref + ': ' + r.baixados.length + ' insumo(s), ' + r.nao_mapeados.length + ' nao mapeado(s)' + (r.ja_processado ? ' (ja processado)' : ''));
  } catch (e) { console.log('[estoque] baixa aviso:', e.message); }
}

async function api(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean);
  const sub = seg[1];
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }

  if (sub === 'health') return json(res, 200, { ok: true, ts: new Date().toISOString() });

  if (sub === 'mapper' && seg[2] === 'state' && req.method === 'GET') {
    if (!hostFerramentasPermitido(req)) {
      return json(res, 404, { erro: 'ferramenta interna disponível apenas no domínio técnico do Titan' });
    }
    const adminId = url.searchParams.get('admin_id') || url.searchParams.get('usuario_id');
    const gestor = await gestorBasico(adminId);
    if (!gestor) return json(res, 403, { erro: 'acesso restrito ao gestor' });
    return json(res, 200, {
      ok: true,
      tenant: TENANT,
      generated_at: new Date().toISOString(),
      usuario: { id: gestor.id, nome: gestor.nome, perfil_principal: gestor.perfil_principal },
      files: lerProjectStateSeguro()
    });
  }

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

  // retrato do sistema p/ a Jessica responder gestores sobre a operacao/infra.
  if (sub === 'sistema' && req.method === 'GET') {
    const area = (url.searchParams.get('area') || 'resumo').toLowerCase();
    const out = { tenant: TENANT, gerado_em: new Date().toISOString() };
    const one = async (sql, p) => { try { const r = await db.q(sql, p); return r.rows; } catch (e) { return []; } };
    const num = async (sql, p) => { try { const r = await db.q(sql, p); return Number(r.rows[0].n); } catch (e) { return null; } };
    const hoje = new Date().toISOString().slice(0, 10);
    if (area === 'resumo' || area === 'estoque') {
      out.estoque = {
        itens_cadastrados: await num('SELECT count(*)::int n FROM est_produto WHERE tenant_id=$1 AND ativo', [TENANT]),
        zerados: await num('SELECT count(*)::int n FROM est_produto WHERE tenant_id=$1 AND ativo AND estoque_atual<=0', [TENANT]),
        abaixo_minimo: await num('SELECT count(*)::int n FROM est_produto WHERE tenant_id=$1 AND ativo AND estoque_minimo IS NOT NULL AND estoque_atual<estoque_minimo', [TENANT]),
        setores: await one('SELECT s.nome AS setor_nome, count(ps.produto_id)::int itens FROM est_setor s LEFT JOIN est_produto_setor ps ON ps.setor_id=s.id AND ps.tenant_id=s.tenant_id WHERE s.tenant_id=$1 AND s.ativo GROUP BY s.nome ORDER BY s.nome', [TENANT]),
        contagens_hoje: await num(`SELECT count(*)::int n FROM est_contagem WHERE tenant_id=$1 AND DATE(encerrada_em)=$2`, [TENANT, hoje]),
        movimentos_recentes: await one('SELECT produto_nome AS insumo_nome, tipo, qtd_movimentada AS quantidade, origem, usuario_nome, criado_em FROM est_movimento WHERE tenant_id=$1 ORDER BY criado_em DESC LIMIT 8', [TENANT])
      };
    }
    if (area === 'resumo' || area === 'contagens') out.ultimas_contagens = await one("SELECT usuario_nome AS colaborador_nome, setor_nome, itens_contados AS total_itens, status_auditoria, encerrada_em AS finalizada_em FROM est_contagem WHERE tenant_id=$1 AND status<>'EM_ANDAMENTO' ORDER BY COALESCE(encerrada_em, iniciada_em) DESC LIMIT 5", [TENANT]);
    if (area === 'resumo' || area === 'mesas') {
      const ms = await one(`SELECT m.numero, (c.id IS NOT NULL) AS ocupada FROM mesas m LEFT JOIN comandas c ON c.mesa_numero=m.numero AND c.tenant_id=m.tenant_id AND c.status='ABERTA' WHERE m.tenant_id=$1 AND m.ativa ORDER BY m.numero`, [TENANT]);
      out.mesas = { total: ms.length, ocupadas: ms.filter(x => x.ocupada).length };
    }
    if (area === 'resumo' || area === 'pedidos') {
      const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const rh = await one(`SELECT count(*)::int n, COALESCE(SUM(total),0)::numeric s FROM orders WHERE tenant_id=$1 AND DATE(criado_em)=$2`, [TENANT, hoje]);
      const nHoje = rh[0] ? Number(rh[0].n) : 0, sHoje = rh[0] ? Number(rh[0].s) : 0;
      out.pedidos = {
        hoje: nHoje,
        receita_hoje: sHoje,
        ticket_medio: nHoje > 0 ? sHoje / nHoje : 0,
        ontem: await num(`SELECT count(*)::int n FROM orders WHERE tenant_id=$1 AND DATE(criado_em)=$2`, [TENANT, ontem]),
        em_aberto: await num(`SELECT count(*)::int n FROM orders WHERE tenant_id=$1 AND status_atual NOT IN ('CONCLUDED','CANCELLED')`, [TENANT]),
        total: await num('SELECT count(*)::int n FROM orders WHERE tenant_id=$1', [TENANT])
      };
    }
    if (area === 'resumo' || area === 'cardapio') {
      out.cardapio = { produtos: await num('SELECT count(*)::int n FROM produtos WHERE tenant_id=$1', [TENANT]),
        opcoes: await num('SELECT count(*)::int n FROM opcoes WHERE tenant_id=$1', [TENANT]),
        em_falta: await num(`SELECT count(*)::int n FROM opcoes WHERE tenant_id=$1 AND status='EM_FALTA'`, [TENANT]) };
    }
    if (area === 'resumo' || area === 'equipe') out.equipe = await one('SELECT perfil_principal, count(*)::int n FROM rbac_contacts WHERE tenant_id=$1 AND ativo GROUP BY perfil_principal', [TENANT]);
    if (area === 'resumo' || area === 'config') {
      const c = await one('SELECT config FROM tenants WHERE id=$1', [TENANT]);
      const cfg = (c[0] && c[0].config) || {};
      out.config = { destino_pedido: cfg.destino_pedido || 'SAIPOS', baixa_estoque_auto: !!cfg.baixa_estoque_auto };
    }
    return json(res, 200, out);
  }

  // estoque v2 — verificação/resumo (Fase A)
  if (sub === 'est' && seg[2] === 'resumo' && req.method === 'GET') {
    const n = async (s) => { try { const r = await db.q(s, [TENANT]); return Number(r.rows[0].n); } catch (e) { return 'ERRO:' + (e.code || e.message); } };
    const one = async (s) => { try { const r = await db.q(s, [TENANT]); return r.rows; } catch (e) { return []; } };
    return json(res, 200, {
      produtos: await n('SELECT count(*)::int n FROM est_produto WHERE tenant_id=$1'),
      categorias: await n('SELECT count(*)::int n FROM est_categoria WHERE tenant_id=$1'),
      fornecedores: await n('SELECT count(*)::int n FROM est_fornecedor WHERE tenant_id=$1'),
      setores: await n('SELECT count(*)::int n FROM est_setor WHERE tenant_id=$1'),
      por_categoria: await one('SELECT c.nome, count(*)::int itens FROM est_produto p JOIN est_categoria c ON c.id=p.categoria_id WHERE p.tenant_id=$1 GROUP BY c.nome ORDER BY c.nome')
    });
  }

  if (sub === 'est' && seg[2] === 'categorias' && req.method === 'GET') {
    const r = await db.q('SELECT id, nome, departamento, ordem, ativo FROM est_categoria WHERE tenant_id=$1 ORDER BY departamento NULLS LAST, ordem, nome', [TENANT]);
    return json(res, 200, { categorias: r.rows });
  }
  if (sub === 'est' && seg[2] === 'fornecedores' && req.method === 'GET') {
    const r = await db.q('SELECT id, nome, tipo, endereco, whatsapp, observacoes, ativo FROM est_fornecedor WHERE tenant_id=$1 ORDER BY nome', [TENANT]);
    return json(res, 200, { fornecedores: r.rows });
  }
  if (sub === 'est' && seg[2] === 'setores' && req.method === 'GET') {
    const r = await db.q('SELECT id, nome, ordem, ativo FROM est_setor WHERE tenant_id=$1 ORDER BY ordem, nome', [TENANT]);
    return json(res, 200, { setores: r.rows });
  }
  if (sub === 'est' && seg[2] === 'locais' && req.method === 'GET') {
    const r = await db.q('SELECT id, nome, tipo_local, aceita_pereciveis, ativo FROM est_local_fisico WHERE tenant_id=$1 ORDER BY ativo DESC, nome', [TENANT]);
    return json(res, 200, { locais: r.rows });
  }
  if (sub === 'est' && seg[2] === 'conversoes' && req.method === 'GET') {
    const cat = url.searchParams.get('categoria') || '';
    const r = await db.q(`SELECT id, categoria_ref, rotulo, unidade_compra, unidade_base, fator, confianca, precisa_revisao, ativo
      FROM est_conversao_categoria WHERE tenant_id=$1 AND ($2='' OR categoria_ref=$2)
      ORDER BY categoria_ref, ativo DESC, rotulo`, [TENANT, cat]);
    return json(res, 200, { conversoes: r.rows });
  }
  if (sub === 'est' && seg[2] === 'produtos' && req.method === 'GET') {
    const busca = (url.searchParams.get('busca') || '').toLowerCase();
    const cat = url.searchParams.get('categoria') || '';
    const forn = url.searchParams.get('fornecedor') || '';
    const r = await db.q(`SELECT p.id, p.nome, p.unidade, p.unidade_base, p.estoque_atual, p.estoque_minimo, p.estoque_ideal, p.peso_g,
        p.pode_contar, p.pode_comprar, p.pode_produzir, p.ativo,
        p.ultimo_valor, p.maior_valor, p.menor_valor, p.medio_valor, p.observacoes,
        p.marca_preferida, p.ultima_marca, p.categoria_id, p.fornecedor_preferido_id, p.ultimo_fornecedor_id,
        p.conversao_origem, p.conversao_confianca, p.conversao_precisa_revisao, p.tipo_item, p.nome_nf,
        p.local_fisico_id, l.nome AS local_fisico,
        c.nome AS categoria, f.nome AS fornecedor, uf.nome AS ultimo_fornecedor
      FROM est_produto p
      LEFT JOIN est_categoria c ON c.id=p.categoria_id
      LEFT JOIN est_fornecedor f ON f.id=p.fornecedor_preferido_id
      LEFT JOIN est_fornecedor uf ON uf.id=p.ultimo_fornecedor_id
      LEFT JOIN est_local_fisico l ON l.id=p.local_fisico_id
      WHERE p.tenant_id=$1
        AND ($2='' OR lower(p.nome) LIKE '%'||$2||'%')
        AND ($3='' OR c.nome=$3)
        AND ($4='' OR f.nome=$4)
      ORDER BY p.ativo DESC, c.ordem, p.nome`, [TENANT, busca, cat, forn]);
    return json(res, 200, { produtos: r.rows });
  }
  if (sub === 'est' && seg[2] === 'produto' && seg[3] && !seg[4] && req.method === 'GET') {
    const pid = parseInt(seg[3], 10);
    if (!pid) return json(res, 400, { erro: 'produto inválido' });
    const pr = await db.q(`SELECT p.*, c.nome AS categoria, f.nome AS fornecedor, uf.nome AS ultimo_fornecedor,
        l.nome AS local_fisico, mv.nome AS melhor_fornecedor, mv.menor_valor AS melhor_valor
      FROM est_produto p
      LEFT JOIN est_categoria c ON c.id=p.categoria_id
      LEFT JOIN est_fornecedor f ON f.id=p.fornecedor_preferido_id
      LEFT JOIN est_fornecedor uf ON uf.id=p.ultimo_fornecedor_id
      LEFT JOIN est_local_fisico l ON l.id=p.local_fisico_id
      LEFT JOIN LATERAL (
        SELECT fz.nome, pf.menor_valor
          FROM est_produto_fornecedor pf JOIN est_fornecedor fz ON fz.id=pf.fornecedor_id
         WHERE pf.tenant_id=p.tenant_id AND pf.produto_id=p.id AND pf.menor_valor IS NOT NULL
         ORDER BY pf.menor_valor ASC LIMIT 1
      ) mv ON TRUE
      WHERE p.id=$1 AND p.tenant_id=$2`, [pid, TENANT]);
    if (!pr.rows[0]) return json(res, 404, { erro: 'Produto não encontrado.' });
    const setores = await db.q(`SELECT s.id, s.nome, ps.obrigatorio
      FROM est_produto_setor ps JOIN est_setor s ON s.id=ps.setor_id
      WHERE ps.tenant_id=$1 AND ps.produto_id=$2 ORDER BY s.ordem,s.nome`, [TENANT, pid]);
    const ficha = await db.q(`SELECT r.id, r.insumo_produto_id, i.nome AS insumo, i.unidade AS insumo_unidade,
        r.quantidade_por_unidade, r.unidade, r.rendimento, r.observacao
      FROM est_producao_receita r JOIN est_produto i ON i.id=r.insumo_produto_id
      WHERE r.tenant_id=$1 AND r.produto_id=$2 AND r.ativo ORDER BY i.nome`, [TENANT, pid]);
    return json(res, 200, { produto: pr.rows[0], setores: setores.rows, ficha: ficha.rows });
  }
  if (sub === 'est' && seg[2] === 'dashboard' && req.method === 'GET') {
    const n = async (s) => { try { const r = await db.q(s, [TENANT]); return Number(r.rows[0].n); } catch (e) { return 0; } };
    const one = async (s) => { try { const r = await db.q(s, [TENANT]); return r.rows; } catch (e) { return []; } };
    return json(res, 200, {
      produtos_ativos: await n('SELECT count(*)::int n FROM est_produto WHERE tenant_id=$1 AND ativo'),
      zerados: await n('SELECT count(*)::int n FROM est_produto WHERE tenant_id=$1 AND ativo AND estoque_atual=0'),
      abaixo_minimo: await n('SELECT count(*)::int n FROM est_produto WHERE tenant_id=$1 AND ativo AND estoque_minimo IS NOT NULL AND estoque_atual < estoque_minimo'),
      abaixo_ideal: await n('SELECT count(*)::int n FROM est_produto WHERE tenant_id=$1 AND ativo AND estoque_ideal IS NOT NULL AND estoque_atual < estoque_ideal'),
      sem_fornecedor: await n('SELECT count(*)::int n FROM est_produto WHERE tenant_id=$1 AND ativo AND fornecedor_preferido_id IS NULL'),
      contagens_aguardando: await n("SELECT count(*)::int n FROM est_contagem WHERE tenant_id=$1 AND status_auditoria='AGUARDANDO' AND status<>'EM_ANDAMENTO'"),
      fornecedores: await n('SELECT count(*)::int n FROM est_fornecedor WHERE tenant_id=$1 AND ativo'),
      ultimas_contagens: await one('SELECT setor_nome, usuario_nome, status, status_auditoria, encerrada_em FROM est_contagem WHERE tenant_id=$1 ORDER BY iniciada_em DESC LIMIT 5'),
      ultimas_compras: await one('SELECT c.criado_em, c.usuario_nome, c.total, f.nome AS fornecedor FROM est_compra c LEFT JOIN est_fornecedor f ON f.id=c.fornecedor_id WHERE c.tenant_id=$1 ORDER BY c.criado_em DESC LIMIT 5')
    });
  }
  if (sub === 'est' && seg[2] === 'meus-itens' && req.method === 'GET') {
    const uid = url.searchParams.get('usuario_id');
    const u = uid ? (await db.q('SELECT setores_permitidos, perfil_principal, perfis_adicionais FROM rbac_contacts WHERE id=$1 AND tenant_id=$2 AND ativo', [uid, TENANT])).rows[0] : null;
    if (!u) return json(res, 403, { erro: 'usuário inválido' });
    const perfis = [u.perfil_principal].concat(u.perfis_adicionais || []).map(x => String(x || '').toUpperCase());
    const gestor = perfis.includes('GESTOR') || perfis.includes('GERENTE');
    const setp = (u.setores_permitidos || []).map(x => String(x));
    const tudo = gestor || setp.includes('TUDO');
    const r = tudo
      ? await db.q(`SELECT DISTINCT p.id, p.nome, p.unidade, p.estoque_atual, s.nome AS setor FROM est_produto p JOIN est_produto_setor ps ON ps.produto_id=p.id AND ps.tenant_id=p.tenant_id JOIN est_setor s ON s.id=ps.setor_id WHERE p.tenant_id=$1 AND p.ativo AND p.pode_contar ORDER BY s.nome, p.nome`, [TENANT])
      : await db.q(`SELECT DISTINCT p.id, p.nome, p.unidade, p.estoque_atual, s.nome AS setor FROM est_produto p JOIN est_produto_setor ps ON ps.produto_id=p.id AND ps.tenant_id=p.tenant_id JOIN est_setor s ON s.id=ps.setor_id WHERE p.tenant_id=$1 AND p.ativo AND p.pode_contar AND (s.id::text = ANY($2) OR s.nome = ANY($2)) ORDER BY s.nome, p.nome`, [TENANT, setp]);
    return json(res, 200, { itens: r.rows, todos: tudo, setores: setp });
  }
  if (sub === 'est' && seg[2] === 'movimentos' && req.method === 'GET') {
    const lim = Math.min(parseInt(url.searchParams.get('limit'), 10) || 30, 100);
    const r = await db.q(`SELECT id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_nome, motivo, criado_em
      FROM est_movimento WHERE tenant_id=$1 ORDER BY criado_em DESC LIMIT $2`, [TENANT, lim]);
    return json(res, 200, { movimentos: r.rows });
  }
  // Vínculos: produtos com setores + ligação bruto->produzido (para conferência sem erro)
  if (sub === 'est' && seg[2] === 'vinculos' && req.method === 'GET') {
    const setores = (await db.q('SELECT id, nome FROM est_setor WHERE tenant_id=$1 AND ativo ORDER BY ordem, nome', [TENANT])).rows;
    const prods = (await db.q(`SELECT p.id, p.nome, p.unidade, p.peso_g, p.pode_produzir, c.nome AS categoria,
        COALESCE((SELECT array_agg(ps.setor_id) FROM est_produto_setor ps WHERE ps.produto_id=p.id AND ps.tenant_id=p.tenant_id),'{}') AS setores
      FROM est_produto p LEFT JOIN est_categoria c ON c.id=p.categoria_id
      WHERE p.tenant_id=$1 AND p.ativo ORDER BY c.ordem, p.nome`, [TENANT])).rows;
    const receitas = (await db.q(`SELECT r.produto_id, r.insumo_produto_id AS bruto_id, b.nome AS bruto_nome, r.quantidade_por_unidade AS qpu, r.unidade
      FROM est_producao_receita r JOIN est_produto b ON b.id=r.insumo_produto_id WHERE r.tenant_id=$1 AND r.ativo`, [TENANT])).rows;
    return json(res, 200, { setores, produtos: prods, receitas });
  }
  if (sub === 'est' && seg[2] === 'produto' && seg[3] && seg[4] === 'setores' && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'editar_produtos'))) return json(res, 403, { erro: 'Sem permissão.' });
    const pid = parseInt(seg[3], 10); const setores = Array.isArray(b.setores) ? b.setores.map(x => parseInt(x, 10)).filter(Boolean) : [];
    await db.q('DELETE FROM est_produto_setor WHERE tenant_id=$1 AND produto_id=$2', [TENANT, pid]);
    for (const sid of setores) await db.q('INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio) VALUES ($1,$2,$3,FALSE) ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING', [TENANT, pid, sid]);
    return json(res, 200, { ok: true, setores });
  }
  if (sub === 'est' && seg[2] === 'produto' && seg[3] && seg[4] === 'peso' && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'editar_produtos'))) return json(res, 403, { erro: 'Sem permissão.' });
    const pid = parseInt(seg[3], 10);
    const pg = b.peso_g != null && b.peso_g !== '' ? Number(b.peso_g) : null;
    await db.q('UPDATE est_produto SET peso_g=$2, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$3', [pid, pg, TENANT]);
    return json(res, 200, { ok: true, peso_g: pg });
  }
  if (sub === 'est' && seg[2] === 'produto' && seg[3] && seg[4] === 'bruto' && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'editar_produtos'))) return json(res, 403, { erro: 'Sem permissão.' });
    const pid = parseInt(seg[3], 10);
    if (!b.insumo_produto_id) { await db.q('UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id=$1 AND produto_id=$2', [TENANT, pid]); return json(res, 200, { ok: true, desligado: true }); }
    const bid = parseInt(b.insumo_produto_id, 10);
    const qpu = b.quantidade_por_unidade != null && b.quantidade_por_unidade !== '' ? Number(b.quantidade_por_unidade) : null;
    const ex = await db.q('SELECT id FROM est_producao_receita WHERE tenant_id=$1 AND produto_id=$2 AND insumo_produto_id=$3', [TENANT, pid, bid]);
    if (ex.rows[0]) await db.q('UPDATE est_producao_receita SET quantidade_por_unidade=$2, unidade=$3, ativo=TRUE WHERE id=$1', [ex.rows[0].id, qpu, b.unidade || null]);
    else await db.q('INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo) VALUES ($1,$2,$3,$4,$5,1,TRUE)', [TENANT, pid, bid, qpu, b.unidade || null]);
    return json(res, 200, { ok: true });
  }

  // Grava a ficha inteira de uma vez. Evita telas dizendo "salvo" após uma falha parcial.
  if (sub === 'est' && seg[2] === 'produto' && seg[3] && seg[4] === 'ficha' && req.method === 'PUT') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'editar_produtos'))) return json(res, 403, { erro: 'Sem permissão para editar fichas.' });
    const pid = parseInt(seg[3], 10); const rendimento = Number(String(b.rendimento == null ? 1 : b.rendimento).replace(',', '.'));
    if (!pid || !(rendimento > 0)) return json(res, 400, { erro: 'Informe um rendimento maior que zero.' });
    const itens = Array.isArray(b.itens) ? b.itens : [];
    const vistos = new Set(); const limpos = [];
    for (const item of itens) {
      const iid = parseInt(item.insumo_produto_id, 10);
      const qtd = Number(String(item.quantidade == null ? '' : item.quantidade).replace(',', '.'));
      if (!iid || iid === pid) return json(res, 400, { erro: 'Escolha um ingrediente válido, diferente do produto final.' });
      if (!(qtd > 0)) return json(res, 400, { erro: 'Toda linha da ficha precisa de quantidade maior que zero.' });
      if (vistos.has(iid)) return json(res, 400, { erro: 'O mesmo ingrediente aparece mais de uma vez na ficha.' });
      vistos.add(iid); limpos.push({ iid, qtd, unidade: String(item.unidade || '').trim() || null, observacao: String(item.observacao || '').trim() || null });
    }
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const existe = await client.query('SELECT id,nome,unidade FROM est_produto WHERE id=$1 AND tenant_id=$2', [pid, TENANT]);
      if (!existe.rows[0]) { await client.query('ROLLBACK'); return json(res, 404, { erro: 'Produto não encontrado.' }); }
      await client.query('UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id=$1 AND produto_id=$2', [TENANT, pid]);
      for (const item of limpos) {
        const ex = await client.query('SELECT id FROM est_producao_receita WHERE tenant_id=$1 AND produto_id=$2 AND insumo_produto_id=$3', [TENANT, pid, item.iid]);
        if (ex.rows[0]) await client.query(`UPDATE est_producao_receita SET quantidade_por_unidade=$2,unidade=$3,rendimento=$4,observacao=$5,ativo=TRUE WHERE id=$1`, [ex.rows[0].id, item.qtd, item.unidade, rendimento, item.observacao]);
        else await client.query(`INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,observacao,ativo) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`, [TENANT, pid, item.iid, item.qtd, item.unidade, rendimento, item.observacao]);
      }
      const ficha=await client.query(`INSERT INTO est_ficha_producao (tenant_id,produto_id,descricao,unidade_consumo,tipo,ativo)
        VALUES ($1,$2,$3,$4,'PRODUZIDO',TRUE) ON CONFLICT (tenant_id,produto_id) DO UPDATE SET ativo=TRUE,atualizado_em=NOW() RETURNING id`,[TENANT,pid,existe.rows[0].nome,existe.rows[0].unidade]);
      let porcao=await client.query('SELECT id FROM est_ficha_porcao WHERE tenant_id=$1 AND ficha_id=$2 AND ativo ORDER BY ordem,id LIMIT 1',[TENANT,ficha.rows[0].id]);
      if(!porcao.rows[0])porcao=await client.query('INSERT INTO est_ficha_porcao (tenant_id,ficha_id,nome,rendimento,unidade,ordem,ativo) VALUES ($1,$2,\'Receita padrão\',$3,$4,0,TRUE) RETURNING id',[TENANT,ficha.rows[0].id,rendimento,existe.rows[0].unidade]);
      else await client.query('UPDATE est_ficha_porcao SET rendimento=$2,unidade=$3,atualizado_em=NOW() WHERE id=$1',[porcao.rows[0].id,rendimento,existe.rows[0].unidade]);
      await client.query('DELETE FROM est_ficha_porcao_item WHERE tenant_id=$1 AND porcao_id=$2',[TENANT,porcao.rows[0].id]);
      for(let i=0;i<limpos.length;i++)await client.query('INSERT INTO est_ficha_porcao_item (tenant_id,porcao_id,insumo_produto_id,quantidade,unidade,observacao,ordem) VALUES ($1,$2,$3,$4,$5,$6,$7)',[TENANT,porcao.rows[0].id,limpos[i].iid,limpos[i].qtd,limpos[i].unidade,limpos[i].observacao,i]);
      await client.query('UPDATE est_produto SET pode_produzir=TRUE, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$2', [pid, TENANT]);
      await client.query('COMMIT');
      return json(res, 200, { ok: true, itens: limpos.length, rendimento });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      return json(res, 400, { erro: e.code || e.message });
    } finally { client.release(); }
  }

  // Fichas de venda: liga produtos/opções do cardápio aos insumos reais do estoque.
  if (sub === 'est' && seg[2] === 'fichas-cardapio' && req.method === 'GET') {
    const uid = url.searchParams.get('usuario_id');
    if (!(await estPode(uid, 'acessar_produtos'))) return json(res, 403, { erro: 'Sem permissão para consultar fichas.' });
    const cats = await db.q('SELECT id,nome,ordem FROM menu_categorias WHERE tenant_id=$1 AND ativa ORDER BY ordem,nome',[TENANT]);
    const prods = await db.q('SELECT id,categoria_id,nome,status FROM produtos WHERE tenant_id=$1 ORDER BY ordem,nome',[TENANT]);
    const grupos = await db.q('SELECT id,produto_id,nome FROM opcao_grupos WHERE tenant_id=$1 ORDER BY ordem,nome',[TENANT]);
    const opcoes = await db.q('SELECT o.id,o.grupo_id,o.nome,o.status FROM opcoes o JOIN opcao_grupos g ON g.id=o.grupo_id WHERE o.tenant_id=$1 ORDER BY o.ordem,o.nome',[TENANT]);
    const resumo = await db.q('SELECT opcao_id,produto_id,count(*)::int n FROM ficha_itens WHERE tenant_id=$1 GROUP BY opcao_id,produto_id',[TENANT]);
    return json(res,200,{categorias:cats.rows,produtos:prods.rows,grupos:grupos.rows,opcoes:opcoes.rows,resumo:resumo.rows});
  }
  if (sub === 'est' && seg[2] === 'ficha-cardapio' && req.method === 'GET') {
    const uid=url.searchParams.get('usuario_id'), tipo=url.searchParams.get('tipo'), id=url.searchParams.get('id');
    if (!(await estPode(uid,'acessar_produtos'))) return json(res,403,{erro:'Sem permissão para consultar fichas.'});
    if (!id || !['produto','opcao'].includes(tipo)) return json(res,400,{erro:'Alvo da ficha inválido.'});
    const col=tipo==='produto'?'produto_id':'opcao_id';
    const r=await db.q(`SELECT f.id,f.est_produto_id,e.nome AS insumo_nome,f.quantidade,f.unidade,f.observacao FROM ficha_itens f LEFT JOIN est_produto e ON e.id=f.est_produto_id WHERE f.tenant_id=$1 AND f.${col}=$2 ORDER BY f.id`,[TENANT,id]);
    return json(res,200,{itens:r.rows});
  }
  if (sub === 'est' && seg[2] === 'ficha-cardapio' && req.method === 'PUT') {
    const b=await readBody(req);
    if (!(await estPode(b.usuario_id,'editar_produtos'))) return json(res,403,{erro:'Sem permissão para editar fichas.'});
    const tipo=b.tipo, alvo=String(b.id||'');
    if (!alvo || !['produto','opcao'].includes(tipo)) return json(res,400,{erro:'Alvo da ficha inválido.'});
    const itens=Array.isArray(b.itens)?b.itens:[], vistos=new Set(), limpos=[];
    for(const item of itens){ const iid=parseInt(item.est_produto_id,10), qtd=Number(String(item.quantidade==null?'':item.quantidade).replace(',','.'));
      if(!iid||!(qtd>0)) return json(res,400,{erro:'Escolha o insumo e informe uma quantidade maior que zero em todas as linhas.'});
      if(vistos.has(iid)) return json(res,400,{erro:'O mesmo insumo aparece mais de uma vez.'}); vistos.add(iid);
      limpos.push({iid,qtd,unidade:String(item.unidade||'').trim()||null,observacao:String(item.observacao||'').trim()||null}); }
    const client=await db.pool.connect();
    try{ await client.query('BEGIN');
      const alvoOk=tipo==='produto'
        ? await client.query('SELECT id FROM produtos WHERE id=$1 AND tenant_id=$2',[alvo,TENANT])
        : await client.query('SELECT o.id FROM opcoes o JOIN opcao_grupos g ON g.id=o.grupo_id WHERE o.id=$1 AND o.tenant_id=$2 AND g.tenant_id=$2',[alvo,TENANT]);
      if(!alvoOk.rows[0]){ await client.query('ROLLBACK'); return json(res,404,{erro:'Item do cardápio não encontrado.'}); }
      const col=tipo==='produto'?'produto_id':'opcao_id'; await client.query(`DELETE FROM ficha_itens WHERE tenant_id=$1 AND ${col}=$2`,[TENANT,alvo]);
      for(const item of limpos){ const ins=await client.query('SELECT nome FROM est_produto WHERE id=$1 AND tenant_id=$2 AND ativo',[item.iid,TENANT]);
        if(!ins.rows[0]) throw new Error('Um dos insumos não existe ou está inativo.');
        await client.query(`INSERT INTO ficha_itens (tenant_id,${col},insumo_nome,est_produto_id,quantidade,unidade,observacao) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[TENANT,alvo,ins.rows[0].nome,item.iid,item.qtd,item.unidade,item.observacao]); }
      await client.query('COMMIT'); return json(res,200,{ok:true,itens:limpos.length});
    }catch(e){ try{await client.query('ROLLBACK')}catch(_){} return json(res,400,{erro:e.code||e.message}); }finally{client.release();}
  }

  // estoque v2 — escritas (CRUD) com checagem de gestor/gerente
  if (sub === 'est' && ['produto', 'fornecedor', 'categoria', 'conversao', 'local'].includes(seg[2]) && req.method !== 'GET') {
    const b = await readBody(req);
    const permNeeded = seg[2] === 'categoria' ? 'editar_categorias' : 'editar_produtos';
    if (!(await estPode(b.usuario_id, permNeeded))) return json(res, 403, { erro: 'Sem permissão para editar.' });

    // PRODUTO
    if (seg[2] === 'produto' && !seg[3] && req.method === 'POST') {
      const nome = String(b.nome || '').trim(); if (!nome) return json(res, 400, { erro: 'informe o nome' });
      try {
        const r = await db.q(`INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, estoque_minimo, estoque_ideal,
          fornecedor_preferido_id, pode_contar, pode_comprar, pode_produzir, observacoes, ativo, subcategoria, marca_preferida, peso_g, unidade_base,
          conversao_origem, conversao_confianca, conversao_precisa_revisao, tipo_item, nome_nf, local_fisico_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
          [TENANT, nome, b.categoria_id || null, String(b.unidade || '').trim() || null,
           b.estoque_minimo !== '' && b.estoque_minimo != null ? Number(b.estoque_minimo) : null, b.estoque_ideal !== '' && b.estoque_ideal != null ? Number(b.estoque_ideal) : null,
           b.fornecedor_preferido_id || null, b.pode_contar !== false, b.pode_comprar !== false, !!b.pode_produzir, b.observacoes || null,
           String(b.subcategoria || '').trim() || null, String(b.marca_preferida || '').trim() || null, b.peso_g !== '' && b.peso_g != null ? Number(b.peso_g) : null,
           String(b.unidade_base || '').trim() || null,
           String(b.conversao_origem || '').trim() || null, String(b.conversao_confianca || '').trim() || null, !!b.conversao_precisa_revisao,
           String(b.tipo_item || '').trim() || null, String(b.nome_nf || '').trim() || null, b.local_fisico_id || null]);
        const pid = r.rows[0].id;
        const setores = Array.isArray(b.setores) ? b.setores.map(Number).filter(Boolean) : [];
        for (const sid of setores) await db.q('INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) VALUES ($1,$2,$3,FALSE) ON CONFLICT DO NOTHING', [TENANT,pid,sid]);
        return json(res, 201, { ok: true, id: pid });
      } catch (e) { return json(res, 400, { erro: e.code === '23505' ? 'Já existe um produto com esse nome.' : (e.code || e.message) }); }
    }
    if (seg[2] === 'produto' && seg[3] && req.method === 'PATCH') {
      const nome = String(b.nome || '').trim(); if (!nome) return json(res, 400, { erro: 'Informe o nome.' });
      try {
        const r = await db.q(`UPDATE est_produto SET nome=$2,categoria_id=$3,unidade=$4,estoque_minimo=$5,estoque_ideal=$6,
          fornecedor_preferido_id=$7,pode_contar=$8,pode_comprar=$9,pode_produzir=$10,observacoes=$11,
          subcategoria=$12,marca_preferida=$13,peso_g=$14,ativo=$15,unidade_base=$17,
          conversao_origem=$18,conversao_confianca=$19,conversao_precisa_revisao=$20,tipo_item=$21,local_fisico_id=$22,atualizado_em=NOW()
          WHERE id=$1 AND tenant_id=$16 RETURNING id`, [seg[3],nome,b.categoria_id||null,String(b.unidade||'').trim()||null,
          b.estoque_minimo!==''&&b.estoque_minimo!=null?Number(b.estoque_minimo):null,b.estoque_ideal!==''&&b.estoque_ideal!=null?Number(b.estoque_ideal):null,
          b.fornecedor_preferido_id||null,b.pode_contar!==false,b.pode_comprar!==false,!!b.pode_produzir,b.observacoes||null,
          String(b.subcategoria||'').trim()||null,String(b.marca_preferida||'').trim()||null,b.peso_g!==''&&b.peso_g!=null?Number(b.peso_g):null,b.ativo!==false,TENANT,
          String(b.unidade_base||'').trim()||null,
          String(b.conversao_origem||'').trim()||null,String(b.conversao_confianca||'').trim()||null,!!b.conversao_precisa_revisao,
          String(b.tipo_item||'').trim()||null,b.local_fisico_id||null]);
        if (!r.rows[0]) return json(res, 404, { erro: 'Produto não encontrado.' });
        if (Array.isArray(b.setores)) {
          await db.q('DELETE FROM est_produto_setor WHERE tenant_id=$1 AND produto_id=$2',[TENANT,seg[3]]);
          for (const sid of b.setores.map(Number).filter(Boolean)) await db.q('INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) VALUES ($1,$2,$3,FALSE) ON CONFLICT DO NOTHING',[TENANT,seg[3],sid]);
        }
        return json(res, 200, { ok: true });
      } catch(e) { return json(res,400,{erro:e.code==='23505'?'Já existe um produto com esse nome.':(e.code||e.message)}); }
    }
    if (seg[2] === 'produto' && seg[3] && req.method === 'DELETE') {
      await db.q('UPDATE est_produto SET ativo=FALSE, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }

    // FORNECEDOR
    if (seg[2] === 'fornecedor' && !seg[3] && req.method === 'POST') {
      const nome = String(b.nome || '').trim(); if (!nome) return json(res, 400, { erro: 'informe o nome' });
      try {
        const r = await db.q(`INSERT INTO est_fornecedor (tenant_id, nome, tipo, endereco, whatsapp, observacoes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [TENANT, nome, b.tipo || null, b.endereco || null, b.whatsapp || null, b.observacoes || null]);
        return json(res, 201, { ok: true, id: r.rows[0].id });
      } catch (e) { return json(res, 400, { erro: e.code === '23505' ? 'Fornecedor já cadastrado.' : (e.code || e.message) }); }
    }
    if (seg[2] === 'fornecedor' && seg[3] && req.method === 'PATCH') {
      await db.q(`UPDATE est_fornecedor SET nome=COALESCE($2,nome), tipo=COALESCE($3,tipo), endereco=COALESCE($4,endereco),
        whatsapp=COALESCE($5,whatsapp), observacoes=COALESCE($6,observacoes), ativo=COALESCE($7,ativo) WHERE id=$1 AND tenant_id=$8`,
        [seg[3], b.nome ? String(b.nome).trim() : null, b.tipo ?? null, b.endereco ?? null, b.whatsapp ?? null, b.observacoes ?? null,
         typeof b.ativo === 'boolean' ? b.ativo : null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'fornecedor' && seg[3] && req.method === 'DELETE') {
      await db.q('UPDATE est_fornecedor SET ativo=FALSE WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }

    // CATEGORIA
    if (seg[2] === 'categoria' && !seg[3] && req.method === 'POST') {
      const nome = String(b.nome || '').trim(); if (!nome) return json(res, 400, { erro: 'informe o nome' });
      try { const r = await db.q('INSERT INTO est_categoria (tenant_id, nome, departamento, ordem) VALUES ($1,$2,$3,$4) RETURNING id', [TENANT, nome, String(b.departamento || '').trim() || null, Number(b.ordem) || 50]); return json(res, 201, { ok: true, id: r.rows[0].id }); }
      catch (e) { return json(res, 400, { erro: e.code === '23505' ? 'Categoria já existe.' : (e.code || e.message) }); }
    }
    if (seg[2] === 'categoria' && seg[3] && req.method === 'PATCH') {
      await db.q('UPDATE est_categoria SET nome=COALESCE($2,nome), departamento=COALESCE($3,departamento), ordem=COALESCE($4,ordem), ativo=COALESCE($5,ativo) WHERE id=$1 AND tenant_id=$6',
        [seg[3], b.nome ? String(b.nome).trim() : null, b.departamento != null ? String(b.departamento).trim() : null, b.ordem != null ? Number(b.ordem) : null, typeof b.ativo === 'boolean' ? b.ativo : null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'categoria' && seg[3] && req.method === 'DELETE') {
      const usados = await db.q('SELECT COUNT(*)::int n FROM est_produto WHERE tenant_id=$1 AND categoria_id=$2', [TENANT, seg[3]]);
      if (usados.rows[0].n > 0) { await db.q('UPDATE est_categoria SET ativo=FALSE WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]); return json(res, 200, { ok: true, inativado: true, em_uso: usados.rows[0].n }); }
      await db.q('DELETE FROM est_categoria WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }

    // SUGESTÃO DE CONVERSÃO POR CATEGORIA (hortifruti etc.) — confirmável, com confiança/revisão.
    if (seg[2] === 'conversao' && !seg[3] && req.method === 'POST') {
      const rotulo = String(b.rotulo || '').trim(); const categoria = String(b.categoria_ref || '').trim();
      const revisao = !!b.precisa_revisao;
      const fator = b.fator != null && b.fator !== '' ? Number(String(b.fator).replace(',', '.')) : null;
      if (!categoria) return json(res, 400, { erro: 'Informe a categoria da sugestão.' });
      if (!rotulo) return json(res, 400, { erro: 'Informe o rótulo da conversão.' });
      if (!revisao && !(fator > 0)) return json(res, 400, { erro: 'Informe um fator maior que zero (ou marque "precisa revisão").' });
      try {
        const r = await db.q(`INSERT INTO est_conversao_categoria (tenant_id, categoria_ref, rotulo, unidade_compra, unidade_base, fator, confianca, precisa_revisao)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [TENANT, categoria, rotulo, String(b.unidade_compra || '').trim().toUpperCase() || null, String(b.unidade_base || '').trim() || null,
           fator, String(b.confianca || '').trim() || null, revisao]);
        return json(res, 201, { ok: true, id: r.rows[0].id });
      } catch (e) { return json(res, 400, { erro: e.code === '23505' ? 'Já existe uma sugestão com esse rótulo nessa categoria.' : (e.code || e.message) }); }
    }
    if (seg[2] === 'conversao' && seg[3] && req.method === 'PATCH') {
      const fator = b.fator != null && b.fator !== '' ? Number(String(b.fator).replace(',', '.')) : null;
      if (b.fator != null && b.fator !== '' && !(fator > 0)) return json(res, 400, { erro: 'Informe um fator maior que zero.' });
      try {
        await db.q(`UPDATE est_conversao_categoria SET categoria_ref=COALESCE($2,categoria_ref), rotulo=COALESCE($3,rotulo),
          unidade_compra=COALESCE($4,unidade_compra), unidade_base=COALESCE($5,unidade_base), fator=COALESCE($6,fator),
          confianca=COALESCE($7,confianca), precisa_revisao=COALESCE($8,precisa_revisao), ativo=COALESCE($9,ativo) WHERE id=$1 AND tenant_id=$10`,
          [seg[3], b.categoria_ref ? String(b.categoria_ref).trim() : null, b.rotulo ? String(b.rotulo).trim() : null,
           b.unidade_compra != null ? String(b.unidade_compra).trim().toUpperCase() : null, b.unidade_base != null ? String(b.unidade_base).trim() : null,
           fator, b.confianca != null ? String(b.confianca).trim() : null, typeof b.precisa_revisao === 'boolean' ? b.precisa_revisao : null,
           typeof b.ativo === 'boolean' ? b.ativo : null, TENANT]);
        return json(res, 200, { ok: true });
      } catch (e) { return json(res, 400, { erro: e.code === '23505' ? 'Já existe uma sugestão com esse rótulo nessa categoria.' : (e.code || e.message) }); }
    }
    if (seg[2] === 'conversao' && seg[3] && req.method === 'DELETE') {
      await db.q('DELETE FROM est_conversao_categoria WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }

    // LOCAL FÍSICO (onde o item fica guardado)
    if (seg[2] === 'local' && !seg[3] && req.method === 'POST') {
      const nome = String(b.nome || '').trim(); if (!nome) return json(res, 400, { erro: 'Informe o nome do local.' });
      try {
        const r = await db.q(`INSERT INTO est_local_fisico (tenant_id, nome, tipo_local, aceita_pereciveis) VALUES ($1,$2,$3,$4) RETURNING id`,
          [TENANT, nome, String(b.tipo_local || '').trim() || null, b.aceita_pereciveis !== false]);
        return json(res, 201, { ok: true, id: r.rows[0].id });
      } catch (e) { return json(res, 400, { erro: e.code === '23505' ? 'Já existe um local com esse nome.' : (e.code || e.message) }); }
    }
    if (seg[2] === 'local' && seg[3] && req.method === 'PATCH') {
      await db.q(`UPDATE est_local_fisico SET nome=COALESCE($2,nome), tipo_local=COALESCE($3,tipo_local),
        aceita_pereciveis=COALESCE($4,aceita_pereciveis), ativo=COALESCE($5,ativo) WHERE id=$1 AND tenant_id=$6`,
        [seg[3], b.nome ? String(b.nome).trim() : null, b.tipo_local != null ? String(b.tipo_local).trim() : null,
         typeof b.aceita_pereciveis === 'boolean' ? b.aceita_pereciveis : null, typeof b.ativo === 'boolean' ? b.ativo : null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'local' && seg[3] && req.method === 'DELETE') {
      const usados = await db.q('SELECT COUNT(*)::int n FROM est_produto WHERE tenant_id=$1 AND local_fisico_id=$2', [TENANT, seg[3]]);
      if (usados.rows[0].n > 0) { await db.q('UPDATE est_local_fisico SET ativo=FALSE WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]); return json(res, 200, { ok: true, inativado: true }); }
      await db.q('DELETE FROM est_local_fisico WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { erro: 'rota est nao encontrada' });
  }

  // ===== CONTAGEM POR SETOR + AUDITORIA =====
  const estGestor = async (uid) => { if (!uid) return null; try { const r = await db.q(`SELECT id, nome FROM rbac_contacts WHERE id=$1 AND tenant_id=$2 AND ativo AND ('GESTOR'=perfil_principal OR 'GERENTE'=perfil_principal OR 'GESTOR'=ANY(COALESCE(perfis_adicionais,'{}')) OR 'GERENTE'=ANY(COALESCE(perfis_adicionais,'{}')))`, [uid, TENANT]); return r.rows[0] || null; } catch (e) { return null; } };

  if (sub === 'est' && seg[2] === 'contagem' && seg[3] === 'iniciar' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.usuario_id || !b.setor_id) return json(res, 400, { erro: 'informe usuario_id e setor_id' });
    if (!(await estPode(b.usuario_id, 'fazer_contagem'))) return json(res, 403, { erro: 'Sem permissão para fazer contagem.' });
    const u = await db.q('SELECT id, nome, setores_permitidos, perfil_principal, perfis_adicionais FROM rbac_contacts WHERE id=$1 AND tenant_id=$2 AND ativo', [b.usuario_id, TENANT]);
    if (!u.rows[0]) return json(res, 403, { erro: 'usuário inválido' });
    const s = await db.q('SELECT id, nome FROM est_setor WHERE id=$1 AND tenant_id=$2', [b.setor_id, TENANT]);
    if (!s.rows[0]) return json(res, 400, { erro: 'setor inválido' });
    const perfis = [u.rows[0].perfil_principal].concat(u.rows[0].perfis_adicionais || []).map(x => String(x || '').toUpperCase());
    const gestor = perfis.includes('GESTOR') || perfis.includes('GERENTE');
    const permitidos = (u.rows[0].setores_permitidos || []).map(String);
    if (!gestor && !permitidos.includes('TUDO') && !permitidos.includes(String(s.rows[0].id)) && !permitidos.includes(s.rows[0].nome))
      return json(res, 403, { erro: 'Este setor não está atribuído ao colaborador.' });
    const aberta = await db.q(`SELECT id, setor_nome, usuario_nome, iniciada_em FROM est_contagem
      WHERE tenant_id=$1 AND setor_id=$2 AND usuario_id=$3 AND status='EM_ANDAMENTO' ORDER BY iniciada_em DESC LIMIT 1`,
      [TENANT, s.rows[0].id, b.usuario_id]);
    if (aberta.rows[0]) {
      const ai = await db.q('SELECT id, produto_id, produto_nome, unidade, obrigatorio, quantidade, status, observacao, geral FROM est_contagem_item WHERE contagem_id=$1 ORDER BY geral, produto_nome', [aberta.rows[0].id]);
      return json(res, 200, { contagem: aberta.rows[0], itens: ai.rows, retomada: true });
    }
    const itens = await db.q(`SELECT ps.produto_id, ps.obrigatorio, p.nome, p.unidade
      FROM est_produto_setor ps JOIN est_produto p ON p.id=ps.produto_id
      WHERE ps.tenant_id=$1 AND ps.setor_id=$2 AND p.ativo AND p.pode_contar ORDER BY p.nome`, [TENANT, b.setor_id]);
    if (!itens.rows.length) return json(res, 400, { erro: 'Este setor não tem itens. Configure os itens do setor primeiro.' });
    const c = await db.q(`INSERT INTO est_contagem (tenant_id, setor_id, setor_nome, usuario_id, usuario_nome, status, status_auditoria)
      VALUES ($1,$2,$3,$4,$5,'EM_ANDAMENTO','AGUARDANDO') RETURNING id, setor_nome, usuario_nome, iniciada_em`, [TENANT, s.rows[0].id, s.rows[0].nome, b.usuario_id, u.rows[0].nome]);
    const cid = c.rows[0].id;
    for (const it of itens.rows)
      await db.q(`INSERT INTO est_contagem_item (tenant_id, contagem_id, produto_id, produto_nome, unidade, obrigatorio, status, geral) VALUES ($1,$2,$3,$4,$5,$6,'PENDENTE',FALSE)`,
        [TENANT, cid, it.produto_id, it.nome, it.unidade, it.obrigatorio]);
    // Contagem geral: no dia configurado, anexa a fatia do "Gerais" deste setor
    const gcfg = await estGeralCfg();
    let geralInfo = null;
    if (estGeralAtivaHoje(gcfg) && (gcfg.setores_participantes || []).includes(s.rows[0].nome)) {
      const div = await estDivisaoGeral(gcfg);
      const ids = div.porSetor[s.rows[0].nome] || [];
      if (ids.length) {
        const gp = await db.q(`SELECT id, nome, unidade FROM est_produto WHERE tenant_id=$1 AND id = ANY($2::int[]) AND ativo AND pode_contar`, [TENANT, ids]);
        for (const it of gp.rows)
          await db.q(`INSERT INTO est_contagem_item (tenant_id, contagem_id, produto_id, produto_nome, unidade, obrigatorio, status, geral) VALUES ($1,$2,$3,$4,$5,FALSE,'PENDENTE',TRUE)`,
            [TENANT, cid, it.id, it.nome, it.unidade]);
        geralInfo = { itens: gp.rows.length };
      }
    }
    const out = await db.q('SELECT id, produto_id, produto_nome, unidade, obrigatorio, quantidade, status, observacao, geral FROM est_contagem_item WHERE contagem_id=$1 ORDER BY geral, produto_nome', [cid]);
    return json(res, 201, { contagem: c.rows[0], itens: out.rows, geral: geralInfo });
  }
  // ===== Contagem Geral: config + status + disparo (gestor) =====
  if (sub === 'est' && seg[2] === 'contagem-geral' && (!seg[3] || seg[3] === 'status') && req.method === 'GET') {
    if (!await estPode(url.searchParams.get('usuario_id'), 'acessar_configuracoes')) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    const cfg = await estGeralCfg();
    const div = await estDivisaoGeral(cfg);
    return json(res, 200, { config: cfg, ativa_hoje: estGeralAtivaHoje(cfg), hoje: estHojeISO(), divisao: div });
  }
  if (sub === 'est' && seg[2] === 'contagem-geral' && (!seg[3] || seg[3] === 'config') && req.method === 'POST') {
    const b = await readBody(req);
    if (!await estPode(b.usuario_id, 'acessar_configuracoes')) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    const cur = await estGeralCfg();
    const nv = Object.assign({}, cur);
    if (typeof b.ativo === 'boolean') nv.ativo = b.ativo;
    if (b.dia != null && Number(b.dia) >= 0 && Number(b.dia) <= 6) nv.dia = Number(b.dia);
    if (Array.isArray(b.setores_participantes)) nv.setores_participantes = b.setores_participantes.map(String).filter(Boolean);
    const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
    const conf = Object.assign({}, r.rows[0] && r.rows[0].config); conf.contagem_geral = nv;
    await db.q('UPDATE tenants SET config=$2 WHERE id=$1', [TENANT, conf]);
    const div = await estDivisaoGeral(nv);
    return json(res, 200, { ok: true, config: nv, ativa_hoje: estGeralAtivaHoje(nv), divisao: div });
  }
  if (sub === 'est' && seg[2] === 'contagem-geral' && (seg[3] === 'iniciar-agora' || seg[3] === 'parar') && req.method === 'POST') {
    const b = await readBody(req);
    if (!await estPode(b.usuario_id, 'acessar_configuracoes')) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
    const conf = Object.assign({}, r.rows[0] && r.rows[0].config);
    const cg = Object.assign({}, GERAL_DEFAULTS, conf.contagem_geral);
    cg.forcar_data = seg[3] === 'iniciar-agora' ? estHojeISO() : null;
    conf.contagem_geral = cg;
    await db.q('UPDATE tenants SET config=$2 WHERE id=$1', [TENANT, conf]);
    return json(res, 200, { ok: true, ativa_hoje: estGeralAtivaHoje(cg) });
  }
  if (sub === 'est' && seg[2] === 'contagem' && seg[3] && seg[4] === 'item' && seg[5] && req.method === 'PATCH') {
    const b = await readBody(req); const cid = seg[3], iid = seg[5];
    const e = await estPermsEfetivas(b.usuario_id);
    if (!e.user || (!e.gestor && !e.perms.includes('fazer_contagem'))) return json(res, 403, { erro: 'Sem permissão para fazer contagem.' });
    const c = await db.q('SELECT usuario_id, status FROM est_contagem WHERE id=$1 AND tenant_id=$2', [cid, TENANT]);
    if (!c.rows[0]) return json(res, 404, { erro: 'Contagem não encontrada.' });
    if (!e.gestor && String(c.rows[0].usuario_id) !== String(b.usuario_id)) return json(res, 403, { erro: 'Esta contagem pertence a outro colaborador.' });
    if (c.rows[0].status !== 'EM_ANDAMENTO') return json(res, 409, { erro: 'Esta contagem já foi encerrada.' });
    const q = (b.quantidade === '' || b.quantidade == null) ? null : Number(b.quantidade);
    if (q != null && (!Number.isFinite(q) || q < 0)) return json(res, 400, { erro: 'Informe uma quantidade válida.' });
    const st = b.status === 'IGNORADO' ? 'IGNORADO' : (q == null ? 'PENDENTE' : 'CONTADO');
    const up = await db.q(`UPDATE est_contagem_item SET quantidade=$1, status=$2, observacao=$3
      WHERE id=$4 AND contagem_id=$5 AND tenant_id=$6 RETURNING id, quantidade, status`,
      [st === 'CONTADO' ? q : null, st, b.observacao || null, iid, cid, TENANT]);
    if (!up.rows[0]) return json(res, 404, { erro: 'Item da contagem não encontrado.' });
    return json(res, 200, { ok: true, item: up.rows[0] });
  }
  if (sub === 'est' && seg[2] === 'contagem' && seg[3] && seg[4] === 'encerrar' && req.method === 'POST') {
    const b = await readBody(req); const cid = seg[3];
    const e = await estPermsEfetivas(b.usuario_id);
    if (!e.user || (!e.gestor && !e.perms.includes('fazer_contagem'))) return json(res, 403, { erro: 'Sem permissão para encerrar contagem.' });
    const owner = await db.q('SELECT usuario_id, status FROM est_contagem WHERE id=$1 AND tenant_id=$2', [cid, TENANT]);
    if (!owner.rows[0]) return json(res, 404, { erro: 'Contagem não encontrada.' });
    if (!e.gestor && String(owner.rows[0].usuario_id) !== String(b.usuario_id)) return json(res, 403, { erro: 'Esta contagem pertence a outro colaborador.' });
    if (owner.rows[0].status !== 'EM_ANDAMENTO') return json(res, 409, { erro: 'Esta contagem já foi encerrada.' });
    for (const it of (Array.isArray(b.itens) ? b.itens : [])) {
      const q = (it.quantidade === '' || it.quantidade == null) ? null : Number(it.quantidade);
      const st = it.status === 'IGNORADO' ? 'IGNORADO' : (q != null && !Number.isNaN(q) ? 'CONTADO' : 'PENDENTE');
      await db.q('UPDATE est_contagem_item SET quantidade=$2, status=$3, observacao=$4 WHERE id=$1 AND tenant_id=$5', [it.id, st === 'PENDENTE' ? null : q, st, it.observacao || null, TENANT]);
    }
    const pend = await db.q(`SELECT count(*)::int n FROM est_contagem_item WHERE contagem_id=$1 AND obrigatorio AND status='PENDENTE'`, [cid]);
    if (pend.rows[0].n > 0) return json(res, 400, { erro: 'Faltam ' + pend.rows[0].n + ' item(ns) obrigatório(s) sem contagem.' });
    const cnt = await db.q(`SELECT count(*)::int n FROM est_contagem_item WHERE contagem_id=$1 AND status='CONTADO'`, [cid]);
    await db.q(`UPDATE est_contagem SET status='ENCERRADA', status_auditoria='AGUARDANDO', encerrada_em=NOW(), itens_contados=$2, obrigatorios_pendentes=0, observacoes=$3 WHERE id=$1 AND tenant_id=$4`, [cid, cnt.rows[0].n, b.observacoes || null, TENANT]);
    const c = await db.q('SELECT setor_nome, usuario_nome FROM est_contagem WHERE id=$1', [cid]);
    await db.q(`INSERT INTO est_notificacao (tenant_id, tipo, titulo, corpo, ref) VALUES ($1,'CONTAGEM_ENCERRADA',$2,$3,$4)`,
      [TENANT, 'Contagem encerrada — ' + (c.rows[0] ? c.rows[0].setor_nome : ''), (c.rows[0] ? c.rows[0].usuario_nome : '') + ' encerrou. ' + cnt.rows[0].n + ' itens contados.', cid]).catch(() => {});
    return json(res, 200, { ok: true, itens_contados: cnt.rows[0].n });
  }
  if (sub === 'est' && seg[2] === 'contagens' && req.method === 'GET') {
    const ag = url.searchParams.get('aguardando');
    const r = await db.q(`SELECT id, setor_nome, usuario_nome, status, status_auditoria, iniciada_em, encerrada_em, itens_contados
      FROM est_contagem WHERE tenant_id=$1 ${ag ? "AND status_auditoria='AGUARDANDO' AND status='ENCERRADA'" : ''} ORDER BY iniciada_em DESC LIMIT 50`, [TENANT]);
    return json(res, 200, { contagens: r.rows });
  }
  if (sub === 'est' && seg[2] === 'contagem' && seg[3] && !seg[4] && req.method === 'GET') {
    const c = await db.q('SELECT id, setor_nome, usuario_nome, status, status_auditoria, iniciada_em, encerrada_em, itens_contados, observacoes FROM est_contagem WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
    if (!c.rows[0]) return json(res, 404, { erro: 'não encontrada' });
    const it = await db.q('SELECT id, produto_id, produto_nome, unidade, obrigatorio, quantidade, status, observacao FROM est_contagem_item WHERE contagem_id=$1 ORDER BY produto_nome', [seg[3]]);
    return json(res, 200, { contagem: c.rows[0], itens: it.rows });
  }
  if (sub === 'est' && seg[2] === 'contagem' && seg[3] && seg[4] === 'auditar' && req.method === 'POST') {
    const b = await readBody(req); const cid = seg[3];
    if (!(await estPode(b.usuario_id, 'auditar_contagem'))) return json(res, 403, { erro: 'Sem permissão para auditar.' });
    const g = await estPermsEfetivas(b.usuario_id).then(e => e.user);
    const acao = b.acao;
    if (acao === 'aprovar') {
      const its = await db.q('SELECT produto_id, quantidade FROM est_contagem_item WHERE contagem_id=$1 AND quantidade IS NOT NULL AND produto_id IS NOT NULL', [cid]);
      for (const it of its.rows) {
        const cur = await db.q('SELECT estoque_atual FROM est_produto WHERE id=$1', [it.produto_id]);
        const antes = cur.rows[0] ? Number(cur.rows[0].estoque_atual) : 0, depois = Number(it.quantidade);
        await db.q('UPDATE est_produto SET estoque_atual=$2, atualizado_em=NOW() WHERE id=$1', [it.produto_id, depois]);
        await db.q(`INSERT INTO est_movimento (tenant_id, produto_id, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, ref)
          VALUES ($1,$2,'CONTAGEM',$3,$4,$5,'CONTAGEM',$6,$7,$8)`, [TENANT, it.produto_id, antes, depois - antes, depois, b.usuario_id, g.nome, cid]);
      }
      await db.q("UPDATE est_contagem SET status='APROVADA', status_auditoria='APROVADA' WHERE id=$1 AND tenant_id=$2", [cid, TENANT]);
    } else if (acao === 'reprovar') {
      await db.q("UPDATE est_contagem SET status='REPROVADA', status_auditoria='REPROVADA' WHERE id=$1 AND tenant_id=$2", [cid, TENANT]);
    } else if (acao === 'corrigir') {
      await db.q("UPDATE est_contagem SET status='EM_ANDAMENTO', status_auditoria='CORRECAO_SOLICITADA' WHERE id=$1 AND tenant_id=$2", [cid, TENANT]);
    } else return json(res, 400, { erro: 'ação inválida' });
    await db.q('INSERT INTO est_auditoria (tenant_id, contagem_id, gestor_id, gestor_nome, acao, observacao) VALUES ($1,$2,$3,$4,$5,$6)', [TENANT, cid, b.usuario_id, g.nome, acao, b.observacao || null]);
    return json(res, 200, { ok: true });
  }

  // ===== CONFIGURAÇÃO DE SETORES (itens por setor + obrigatoriedade) =====
  if (sub === 'est' && seg[2] === 'setor' && seg[3] && seg[4] === 'config' && req.method === 'GET') {
    const r = await db.q(`SELECT p.id AS produto_id, p.nome, c.nome AS categoria,
        (ps.id IS NOT NULL) AS no_setor, COALESCE(ps.obrigatorio,false) AS obrigatorio
      FROM est_produto p
      LEFT JOIN est_produto_setor ps ON ps.produto_id=p.id AND ps.setor_id=$2 AND ps.tenant_id=$1
      LEFT JOIN est_categoria c ON c.id=p.categoria_id
      WHERE p.tenant_id=$1 AND p.ativo AND p.pode_contar ORDER BY c.ordem, p.nome`, [TENANT, seg[3]]);
    return json(res, 200, { itens: r.rows });
  }
  if (sub === 'est' && seg[2] === 'setor' && seg[3] && seg[4] === 'config' && req.method === 'POST') {
    const b = await readBody(req); const g = await estGestor(b.usuario_id);
    if (!g) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    await db.q('DELETE FROM est_produto_setor WHERE tenant_id=$1 AND setor_id=$2', [TENANT, seg[3]]);
    for (const it of (Array.isArray(b.itens) ? b.itens : []))
      await db.q('INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, produto_id, setor_id) DO UPDATE SET obrigatorio=EXCLUDED.obrigatorio', [TENANT, it.produto_id, seg[3], !!it.obrigatorio]);
    return json(res, 200, { ok: true, total: (b.itens || []).length });
  }
  if (sub === 'est' && seg[2] === 'setor' && !seg[3] && req.method === 'POST') {
    const b = await readBody(req); const g = await estGestor(b.usuario_id);
    if (!g) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    const nome = String(b.nome || '').trim(); if (!nome) return json(res, 400, { erro: 'informe o nome' });
    try { const r = await db.q('INSERT INTO est_setor (tenant_id, nome, ordem) VALUES ($1,$2,$3) RETURNING id', [TENANT, nome, Number(b.ordem) || 50]); return json(res, 201, { ok: true, id: r.rows[0].id }); }
    catch (e) { return json(res, 400, { erro: e.code === '23505' ? 'Setor já existe.' : (e.code || e.message) }); }
  }
  if (sub === 'est' && seg[2] === 'setor' && seg[3] && !seg[4] && req.method === 'PATCH') {
    const b = await readBody(req); const g = await estGestor(b.usuario_id);
    if (!g) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    await db.q('UPDATE est_setor SET nome=COALESCE($2,nome), ativo=COALESCE($3,ativo), ordem=COALESCE($4,ordem) WHERE id=$1 AND tenant_id=$5', [seg[3], b.nome ? String(b.nome).trim() : null, typeof b.ativo === 'boolean' ? b.ativo : null, b.ordem != null && b.ordem !== '' ? Number(b.ordem) : null, TENANT]);
    return json(res, 200, { ok: true });
  }

  // ===== COMPRAS (foto-nota OCR + confirmação) =====
  if (sub === 'est' && seg[2] === 'compra' && seg[3] === 'foto' && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'registrar_compra'))) return json(res, 403, { erro: 'Sem permissão para registrar compra.' });
    const key = process.env.OPENAI_API_KEY;
    if (!key) return json(res, 400, { erro: 'OCR não configurado (defina OPENAI_API_KEY no Easypanel).' });
    if (!b.image) return json(res, 400, { erro: 'envie a imagem' });
    const dataUrl = String(b.image).startsWith('data:') ? b.image : ('data:image/jpeg;base64,' + b.image);
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: 'gpt-4o-mini', temperature: 0, max_tokens: 2000, response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Você lê uma nota ou cupom fiscal de compra de um restaurante e extrai os itens comprados. Responda APENAS um objeto JSON {"fornecedor": string|null, "data": "YYYY-MM-DD"|null, "itens": [{"produto": string, "marca": string|null, "quantidade": number, "unidade": string|null, "valor_unitario": number|null, "valor_total": number|null}]}. Use ponto como separador decimal. Não invente itens que não estejam na nota.' },
            { role: 'user', content: [{ type: 'text', text: 'Extraia os itens desta nota de compra.' }, { type: 'image_url', image_url: { url: dataUrl } }] }
          ]
        })
      });
      const j = await r.json();
      if (!r.ok) return json(res, 502, { erro: 'OCR falhou: ' + (j.error ? j.error.message : ('HTTP ' + r.status)) });
      let p = {}; try { p = JSON.parse(j.choices[0].message.content); } catch (e) { p = {}; }
      return json(res, 200, { fornecedor: p.fornecedor || null, data: p.data || null, itens: Array.isArray(p.itens) ? p.itens : [] });
    } catch (e) { return json(res, 502, { erro: 'Erro no OCR: ' + (e.message || e) }); }
  }
  if (sub === 'est' && seg[2] === 'compra' && !seg[3] && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'registrar_compra'))) return json(res, 403, { erro: 'Sem permissão para registrar compra.' });
    const itens = (Array.isArray(b.itens) ? b.itens : []).filter(it => it.produto_id);
    if (!itens.length) return json(res, 400, { erro: 'Selecione ao menos um produto.' });
    let total = 0;
    const c = await db.q(`INSERT INTO est_compra (tenant_id, fornecedor_id, usuario_id, usuario_nome, origem, status, data_compra)
      VALUES ($1,$2,$3,$4,$5,'CONFIRMADA',COALESCE($6,CURRENT_DATE)) RETURNING id`,
      [TENANT, b.fornecedor_id || null, b.usuario_id, g.nome, b.origem || 'MANUAL', b.data_compra || null]);
    const cid = c.rows[0].id;
    for (const it of itens) {
      const qtd = Number(it.quantidade) || 0;
      let vu = it.valor_unitario != null && it.valor_unitario !== '' ? Number(it.valor_unitario) : null;
      let vt = it.valor_total != null && it.valor_total !== '' ? Number(it.valor_total) : null;
      if (vu == null && vt != null && qtd) vu = vt / qtd;
      if (vt == null && vu != null) vt = vu * qtd;
      total += vt || 0;
      await db.q('INSERT INTO est_compra_item (tenant_id, compra_id, produto_id, marca, quantidade, unidade, valor_unitario, valor_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [TENANT, cid, it.produto_id, it.marca || null, qtd, it.unidade || null, vu, vt]);
      const cur = await db.q('SELECT estoque_atual FROM est_produto WHERE id=$1 AND tenant_id=$2', [it.produto_id, TENANT]);
      if (cur.rows[0]) {
        const antes = Number(cur.rows[0].estoque_atual), depois = antes + qtd;
        await db.q('UPDATE est_produto SET estoque_atual=$2, ultima_marca=COALESCE($3,ultima_marca), ultimo_fornecedor_id=COALESCE($4,ultimo_fornecedor_id), atualizado_em=NOW() WHERE id=$1', [it.produto_id, depois, it.marca || null, b.fornecedor_id || null]);
        await db.q(`INSERT INTO est_movimento (tenant_id, produto_id, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, ref, motivo)
          VALUES ($1,$2,'ENTRADA',$3,$4,$5,'COMPRA',$6,$7,$8,'Compra')`, [TENANT, it.produto_id, antes, qtd, depois, b.usuario_id, g.nome, cid]);
        if (vu != null && vu > 0) {
          await db.q(`UPDATE est_produto SET ultimo_valor=$2, maior_valor=GREATEST(COALESCE(maior_valor,0),$2), menor_valor=LEAST(COALESCE(menor_valor,$2),$2) WHERE id=$1`, [it.produto_id, vu]);
          await db.q(`UPDATE est_produto p SET medio_valor=(SELECT AVG(ci.valor_unitario) FROM est_compra_item ci JOIN est_compra cc ON cc.id=ci.compra_id WHERE ci.produto_id=p.id AND ci.valor_unitario IS NOT NULL AND cc.tenant_id=$1) WHERE p.id=$2`, [TENANT, it.produto_id]);
        }
      }
    }
    await db.q('UPDATE est_compra SET total=$2 WHERE id=$1', [cid, total]);
    return json(res, 201, { ok: true, id: cid, total });
  }
  if (sub === 'est' && seg[2] === 'compras' && req.method === 'GET') {
    const r = await db.q(`SELECT c.id, c.criado_em, c.data_compra, c.usuario_nome, c.total, f.nome AS fornecedor,
        (SELECT count(*)::int FROM est_compra_item ci WHERE ci.compra_id=c.id) AS itens
      FROM est_compra c LEFT JOIN est_fornecedor f ON f.id=c.fornecedor_id WHERE c.tenant_id=$1 ORDER BY c.criado_em DESC LIMIT 30`, [TENANT]);
    return json(res, 200, { compras: r.rows });
  }

  // ===== VISITA A FORNECEDOR + MAPA COMPARATIVO =====
  if (sub === 'est' && seg[2] === 'visita' && seg[3] === 'iniciar' && req.method === 'POST') {
    const b = await readBody(req); const g = (await estPermsEfetivas(b.usuario_id)).user;
    if (!(await estPode(b.usuario_id, 'registrar_visita')) || !g) return json(res, 403, { erro: 'Sem permissão para registrar visita.' });
    if (!b.fornecedor_id) return json(res, 400, { erro: 'informe o fornecedor' });
    const f = await db.q('SELECT id, nome FROM est_fornecedor WHERE id=$1 AND tenant_id=$2', [b.fornecedor_id, TENANT]);
    if (!f.rows[0]) return json(res, 400, { erro: 'fornecedor inválido' });
    const v = await db.q('INSERT INTO est_visita (tenant_id, fornecedor_id, usuario_id, usuario_nome) VALUES ($1,$2,$3,$4) RETURNING id, iniciada_em', [TENANT, b.fornecedor_id, b.usuario_id, g.nome]);
    const prods = await db.q(`SELECT DISTINCT p.id AS produto_id, p.nome, p.unidade, p.marca_preferida
      FROM est_produto p WHERE p.tenant_id=$1 AND p.ativo AND (p.fornecedor_preferido_id=$2
        OR p.id IN (SELECT produto_id FROM est_produto_fornecedor WHERE tenant_id=$1 AND fornecedor_id=$2)) ORDER BY p.nome`, [TENANT, b.fornecedor_id]);
    return json(res, 201, { visita: { id: v.rows[0].id, fornecedor_nome: f.rows[0].nome }, itens: prods.rows });
  }
  if (sub === 'est' && seg[2] === 'visita' && seg[3] && seg[4] === 'finalizar' && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'registrar_visita'))) return json(res, 403, { erro: 'Sem permissão para registrar visita.' });
    const vid = seg[3];
    const v = await db.q('SELECT fornecedor_id FROM est_visita WHERE id=$1 AND tenant_id=$2', [vid, TENANT]);
    if (!v.rows[0]) return json(res, 404, { erro: 'visita não encontrada' });
    const fornId = v.rows[0].fornecedor_id;
    for (const it of (Array.isArray(b.itens) ? b.itens : [])) {
      if (!it.produto_id || !it.status) continue;
      const vu = it.valor_unitario != null && it.valor_unitario !== '' ? Number(it.valor_unitario) : null;
      const qtd = it.quantidade != null && it.quantidade !== '' ? Number(it.quantidade) : null;
      await db.q(`INSERT INTO est_visita_item (tenant_id, visita_id, produto_id, status, marca_encontrada, marca_parecida, valor_unitario, valor_total, quantidade, comprou, observacao)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [TENANT, vid, it.produto_id, it.status, it.marca_encontrada || null, it.marca_parecida || null, vu, (vu != null && qtd != null ? vu * qtd : null), qtd, !!it.comprou, it.observacao || null]);
      await db.q(`INSERT INTO est_produto_fornecedor (tenant_id, produto_id, fornecedor_id, marca, marca_parecida, status, ultimo_valor, menor_valor, maior_valor, frequencia, ultima_visita_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7,1,NOW())
        ON CONFLICT (tenant_id, produto_id, fornecedor_id) DO UPDATE SET
          marca=COALESCE(EXCLUDED.marca, est_produto_fornecedor.marca),
          marca_parecida=COALESCE(EXCLUDED.marca_parecida, est_produto_fornecedor.marca_parecida),
          status=COALESCE(EXCLUDED.status, est_produto_fornecedor.status),
          ultimo_valor=COALESCE(EXCLUDED.ultimo_valor, est_produto_fornecedor.ultimo_valor),
          menor_valor=LEAST(est_produto_fornecedor.menor_valor, EXCLUDED.ultimo_valor),
          maior_valor=GREATEST(est_produto_fornecedor.maior_valor, EXCLUDED.ultimo_valor),
          frequencia=COALESCE(est_produto_fornecedor.frequencia,0)+1,
          ultima_visita_em=NOW()`,
        [TENANT, it.produto_id, fornId, it.marca_encontrada || null, it.marca_parecida || null, it.status, vu]);
    }
    const fin = await db.q(`UPDATE est_visita SET finalizada_em=NOW(), status='FINALIZADA', observacoes=$2, tempo_seg=EXTRACT(EPOCH FROM (NOW()-iniciada_em))::int WHERE id=$1 AND tenant_id=$3 RETURNING tempo_seg`, [vid, b.observacoes || null, TENANT]);
    return json(res, 200, { ok: true, tempo_seg: fin.rows[0] ? fin.rows[0].tempo_seg : null });
  }
  if (sub === 'est' && seg[2] === 'visitas' && req.method === 'GET') {
    const r = await db.q(`SELECT v.id, v.iniciada_em, v.finalizada_em, v.tempo_seg, v.status, v.usuario_nome, f.nome AS fornecedor,
      (SELECT count(*)::int FROM est_visita_item vi WHERE vi.visita_id=v.id) AS itens
      FROM est_visita v LEFT JOIN est_fornecedor f ON f.id=v.fornecedor_id WHERE v.tenant_id=$1 ORDER BY v.iniciada_em DESC LIMIT 30`, [TENANT]);
    return json(res, 200, { visitas: r.rows });
  }
  if (sub === 'est' && seg[2] === 'mapa' && req.method === 'GET') {
    const prod = url.searchParams.get('produto') || '';
    const r = await db.q(`SELECT p.id AS produto_id, p.nome AS produto, c.nome AS categoria,
        f.nome AS fornecedor, pf.status, pf.marca, pf.ultimo_valor, pf.menor_valor, pf.maior_valor, pf.frequencia, pf.ultima_visita_em
      FROM est_produto_fornecedor pf
      JOIN est_produto p ON p.id=pf.produto_id JOIN est_fornecedor f ON f.id=pf.fornecedor_id
      LEFT JOIN est_categoria c ON c.id=p.categoria_id
      WHERE pf.tenant_id=$1 AND ($2='' OR lower(p.nome) LIKE '%'||lower($2)||'%')
      ORDER BY p.nome, pf.ultimo_valor NULLS LAST`, [TENANT, prod]);
    const byP = {};
    for (const row of r.rows) { (byP[row.produto_id] = byP[row.produto_id] || { produto: row.produto, categoria: row.categoria, fornecedores: [] }).fornecedores.push(row); }
    const grupos = Object.values(byP).map(g => { const cv = g.fornecedores.filter(x => x.ultimo_valor != null); g.melhor_fornecedor = cv.length ? cv.reduce((a, b) => Number(b.ultimo_valor) < Number(a.ultimo_valor) ? b : a).fornecedor : null; return g; });
    return json(res, 200, { grupos });
  }

  // ---- Lista de Compras Inteligente (função central) ----
  if (sub === 'est' && seg[2] === 'lista' && seg[3] === 'interpretar' && req.method === 'POST') {
    const b = await readBody(req);
    const texto = String(b.texto || '');
    const prods = await db.q('SELECT id, nome, unidade, estoque_atual, estoque_minimo, estoque_ideal FROM est_produto WHERE tenant_id=$1 AND ativo', [TENANT]);
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const UNI = /(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos|quilo|quilos|g|gr|grs|gramas?|l|lt|lts|litros?|ml|un|und|unid|unidades?|cx|caixas?|pct|pacotes?|dz|duzias?|latas?|garrafas?|sacos?|fardos?|pc|pcs|pecas?|bdj|bandejas?|potes?)?\b/i;
    const cand = prods.rows.map(p => { const n = norm(p.nome); return { id: p.id, nome: p.nome, unidade: p.unidade, atual: Number(p.estoque_atual), ideal: p.estoque_ideal != null ? Number(p.estoque_ideal) : null, n, toks: n.split(' ').filter(Boolean) }; });
    const lev = (a, b) => { if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1); for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) { const cost = a[i - 1] === b[j - 1] ? 0 : 1; cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost); } [prev, cur] = [cur, prev]; } return prev[n]; };
    const sim = (a, b) => { if (!a || !b) return 0; return 1 - lev(a, b) / Math.max(a.length, b.length); };
    const linhas = texto.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean);
    const itens = linhas.map(raw => {
      let qtd = null, uni = null;
      const m = raw.match(UNI);
      if (m && m[1]) { qtd = Number(m[1].replace(',', '.')); uni = m[2] ? m[2].toLowerCase() : null; }
      let txt = raw.replace(/^[-*••\d\).\s]+/, ' ');
      if (m) txt = txt.replace(m[0], ' ');
      txt = txt.replace(/r\$\s*\d+[.,]?\d*/ig, ' ');
      const nin = norm(txt);
      const inToks = nin.split(' ').filter(Boolean);
      let best = null, bestS = 0;
      for (const c of cand) {
        let s = 0;
        if (c.n && c.n === nin) s = 1;
        else if (nin && c.n && (c.n.includes(nin) || nin.includes(c.n))) s = 0.9;
        else {
          const inter = inToks.filter(t => t.length > 2 && c.toks.includes(t)).length;
          const denom = Math.max(c.toks.length, inToks.length) || 1;
          s = inter / denom;
          if (s === 0) { const pf = inToks.filter(t => t.length > 3 && c.toks.some(ct => ct.startsWith(t) || t.startsWith(ct))).length; if (pf) s = 0.5 * pf / denom; }
          // fuzzy por caractere (ex: "mussarela" -> "muçarela"): melhor par token a token + string inteira.
          // Tokens curtos exigem similaridade alta p/ evitar falso positivo (coca vs coco).
          let fz = 0, fzLen = 0;
          { const sv = sim(nin, c.n); if (sv > fz) { fz = sv; fzLen = Math.min(nin.length, c.n.length); } }
          for (const t of inToks) { if (t.length < 4) continue; for (const ct of c.toks) { if (ct.length < 4) continue; const sv = sim(t, ct); if (sv > fz) { fz = sv; fzLen = Math.min(t.length, ct.length); } } }
          const gate = fzLen >= 6 ? 0.72 : 0.86;
          if (fz >= gate && fz * 0.95 > s) s = fz * 0.95;
        }
        if (s > bestS) { bestS = s; best = c; }
      }
      const matched = best && bestS >= 0.34;
      let qSug = qtd;
      if (qSug == null && matched && best.ideal != null) { const d = best.ideal - best.atual; qSug = d > 0 ? Number(d.toFixed(3)) : 0; }
      return { texto_original: raw, produto_id: matched ? best.id : null, produto: matched ? best.nome : null, quantidade: qSug, unidade: uni || (matched ? best.unidade : null), confianca: matched ? Math.round(bestS * 100) : 0 };
    });
    return json(res, 200, { itens });
  }
  if (sub === 'est' && seg[2] === 'lista' && seg[3] === 'gerar' && req.method === 'POST') {
    const b = await readBody(req);
    const inItens = Array.isArray(b.itens) ? b.itens.filter(x => x && x.produto_id) : [];
    if (!inItens.length) return json(res, 400, { erro: 'lista vazia' });
    const rota = await estMontaRota(inItens);
    return json(res, 200, rota);
  }

  // ---- Listas automáticas por período ----
  if (sub === 'est' && seg[2] === 'lista-auto' && seg[3] === 'preview' && req.method === 'GET') {
    const base = (url.searchParams.get('base') === 'minimo') ? 'minimo' : 'ideal';
    const itens = await estItensReposicao(base);
    const rota = await estMontaRota(itens);
    return json(res, 200, { base, rota });
  }
  if (sub === 'est' && seg[2] === 'lista-auto' && seg[3] === 'config' && req.method === 'GET') {
    const r = await db.q(`SELECT id, periodicidade, ativo, config FROM est_lista_auto WHERE tenant_id=$1 ORDER BY id LIMIT 1`, [TENANT]);
    return json(res, 200, { config: r.rows[0] || { periodicidade: 'semanal', ativo: false, config: { base: 'ideal', dia: 1, hora: 8 } } });
  }
  if (sub === 'est' && seg[2] === 'lista-auto' && seg[3] === 'config' && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'acessar_configuracoes'))) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    const per = ['diaria', 'semanal', 'mensal', 'trimestral'].includes(b.periodicidade) ? b.periodicidade : 'semanal';
    const cfg = { base: b.base === 'minimo' ? 'minimo' : 'ideal', dia: Number(b.dia) || 1, hora: Number(b.hora) || 8 };
    const ex = await db.q(`SELECT id FROM est_lista_auto WHERE tenant_id=$1 ORDER BY id LIMIT 1`, [TENANT]);
    if (ex.rows[0]) await db.q(`UPDATE est_lista_auto SET periodicidade=$2, ativo=$3, config=$4 WHERE id=$1`, [ex.rows[0].id, per, !!b.ativo, JSON.stringify(cfg)]);
    else await db.q(`INSERT INTO est_lista_auto (tenant_id, periodicidade, ativo, config) VALUES ($1,$2,$3,$4)`, [TENANT, per, !!b.ativo, JSON.stringify(cfg)]);
    return json(res, 200, { ok: true });
  }
  if (sub === 'est' && seg[2] === 'lista-auto' && seg[3] === 'run' && req.method === 'POST') {
    const b = await readBody(req);
    const expected = process.env.WA_INBOUND_TOKEN;
    const tok = b.token || req.headers['x-wa-token'];
    if (expected && tok !== expected) return json(res, 401, { erro: 'token inválido' });
    const cfgRow = (await db.q(`SELECT periodicidade, ativo, config FROM est_lista_auto WHERE tenant_id=$1 ORDER BY id LIMIT 1`, [TENANT])).rows[0];
    const forcar = !!b.forcar;
    if (!forcar && (!cfgRow || !cfgRow.ativo)) return json(res, 200, { due: false, motivo: 'lista automática desativada' });
    const per = (cfgRow && cfgRow.periodicidade) || 'semanal';
    const cfg = (cfgRow && cfgRow.config) || {};
    const now = new Date();
    let due = forcar;
    if (!due) {
      if (per === 'diaria') due = true;
      else if (per === 'semanal') due = now.getDay() === (Number(cfg.dia) || 1) % 7;
      else if (per === 'mensal') due = now.getDate() === (Number(cfg.dia) || 1);
      else if (per === 'trimestral') due = [0, 3, 6, 9].includes(now.getMonth()) && now.getDate() === (Number(cfg.dia) || 1);
    }
    if (!due) return json(res, 200, { due: false, motivo: 'hoje não é dia de gerar' });
    const base = cfg.base === 'minimo' ? 'minimo' : 'ideal';
    const itens = await estItensReposicao(base);
    const rota = await estMontaRota(itens);
    const texto = estRotaTexto(rota, per);
    // persiste a lista gerada
    let listaId = null;
    try {
      const lc = await db.q(`INSERT INTO est_lista_compra (tenant_id, status, origem, estimativa, meta) VALUES ($1,'GERADA','AUTO',$2,$3) RETURNING id`, [TENANT, rota.estimativa_total, JSON.stringify({ base, periodicidade: per })]);
      listaId = lc.rows[0].id;
      const todos = [].concat(...rota.comprar_por_fornecedor.map(g => g.itens), rota.nao_encontrados);
      for (const it of todos) await db.q(`INSERT INTO est_lista_compra_item (tenant_id, lista_id, produto_id, quantidade, unidade, fornecedor_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [TENANT, listaId, it.produto_id, it.quantidade, it.unidade || null, it.fornecedor_id || null, it.fornecedor ? 'OK' : 'SEM_FORNECEDOR']);
    } catch (e) {}
    const gestores = (await db.q(`SELECT DISTINCT regexp_replace(COALESCE(phone,''),'\\D','','g') AS tel FROM rbac_contacts WHERE tenant_id=$1 AND ativo AND COALESCE(phone,'')<>'' AND ('GESTOR'=perfil_principal OR 'GERENTE'=perfil_principal OR 'GESTOR'=ANY(COALESCE(perfis_adicionais,'{}')) OR 'GERENTE'=ANY(COALESCE(perfis_adicionais,'{}')))`, [TENANT])).rows.map(r => r.tel).filter(Boolean);
    return json(res, 200, { due: true, periodicidade: per, lista_id: listaId, estimativa_total: rota.estimativa_total, itens_total: rota.itens_total, texto, gestores });
  }

  // ---- Baixa automática de estoque por pedido (Saipos/DD/Titan via n8n) ----
  if (sub === 'est' && seg[2] === 'baixa-pedido' && req.method === 'POST') {
    const b = await readBody(req);
    const expected = process.env.WA_INBOUND_TOKEN;
    const tok = b.token || req.headers['x-wa-token'];
    if (expected && tok !== expected) return json(res, 401, { erro: 'token inválido' });
    let itens = Array.isArray(b.itens) ? b.itens : null;
    let ref = b.order_id || b.pedido_id || b.ref || null;
    if (!itens && ref) {
      const o = await db.q('SELECT id, items FROM orders WHERE tenant_id=$1 AND (id=$2 OR display_id=$2)', [TENANT, String(ref)]);
      if (!o.rows[0]) return json(res, 404, { erro: 'pedido não encontrado' });
      ref = o.rows[0].id; itens = o.rows[0].items || [];
    }
    if (!itens) return json(res, 400, { erro: 'envie itens ou order_id' });
    const out = await estBaixaPedido(ref, itens, { force: !!b.force, simular: !!b.simular });
    return json(res, 200, out);
  }

  // ---- Produção Interna (ficha técnica + baixa de insumos) ----
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'produzidos' && req.method === 'GET') {
    const prods = await db.q(`SELECT p.id,p.nome,p.unidade,p.estoque_atual,p.estoque_ideal,s.nome AS setor,
        f.id AS ficha_id,COUNT(DISTINCT po.id)::int AS porcoes,COUNT(pi.id)::int AS ingredientes
      FROM est_produto p
      LEFT JOIN est_produto_setor ps ON ps.tenant_id=p.tenant_id AND ps.produto_id=p.id
      LEFT JOIN est_setor s ON s.id=ps.setor_id
      LEFT JOIN est_ficha_producao f ON f.tenant_id=p.tenant_id AND f.produto_id=p.id AND f.ativo
      LEFT JOIN est_ficha_porcao po ON po.tenant_id=p.tenant_id AND po.ficha_id=f.id AND po.ativo
      LEFT JOIN est_ficha_porcao_item pi ON pi.tenant_id=p.tenant_id AND pi.porcao_id=po.id
      WHERE p.tenant_id=$1 AND p.ativo AND p.pode_produzir
      GROUP BY p.id,s.nome,f.id ORDER BY s.nome,p.nome`, [TENANT]);
    const insumos = await db.q(`SELECT id,nome,unidade,peso_g,medio_valor,ultimo_valor FROM est_produto WHERE tenant_id=$1 AND ativo ORDER BY nome`, [TENANT]);
    return json(res, 200, { produzidos: prods.rows, insumos: insumos.rows });
  }
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'ficha' && !seg[4] && req.method === 'GET') {
    const pid=parseInt(url.searchParams.get('produto_id'),10);
    const pr=await db.q(`SELECT p.id,p.nome,p.unidade,p.estoque_atual,p.peso_g,p.medio_valor,p.ultimo_valor,
        f.id AS ficha_id,f.descricao,f.unidade_consumo,f.tipo,f.instrucoes,f.ativo AS ficha_ativa
      FROM est_produto p LEFT JOIN est_ficha_producao f ON f.tenant_id=p.tenant_id AND f.produto_id=p.id AND f.ativo
      WHERE p.tenant_id=$1 AND p.id=$2`,[TENANT,pid]);
    if(!pr.rows[0]) return json(res,404,{erro:'Produto não encontrado.'});
    const setores=(await db.q(`SELECT s.id,s.nome FROM est_produto_setor ps JOIN est_setor s ON s.id=ps.setor_id WHERE ps.tenant_id=$1 AND ps.produto_id=$2 ORDER BY s.ordem,s.nome`,[TENANT,pid])).rows;
    let porcoes=[];
    if(pr.rows[0].ficha_id){
      const ps=(await db.q(`SELECT id,nome,rendimento,unidade,ordem FROM est_ficha_porcao WHERE tenant_id=$1 AND ficha_id=$2 AND ativo ORDER BY ordem,id`,[TENANT,pr.rows[0].ficha_id])).rows;
      const its=(await db.q(`SELECT i.id,i.porcao_id,i.insumo_produto_id,p.nome AS insumo,p.unidade AS insumo_unidade,p.peso_g,p.medio_valor,p.ultimo_valor,
          i.quantidade,i.unidade,i.observacao,i.ordem
        FROM est_ficha_porcao_item i JOIN est_produto p ON p.id=i.insumo_produto_id
        WHERE i.tenant_id=$1 AND i.porcao_id=ANY($2::int[]) ORDER BY i.ordem,i.id`,[TENANT,ps.map(x=>x.id)])).rows;
      porcoes=ps.map(po=>{const itens=its.filter(x=>x.porcao_id===po.id).map(x=>{const custo=estCustoReceita(Number(x.quantidade),x.unidade,x);return {...x,custo_item:custo};});return {...po,itens,custo_total:itens.reduce((n,x)=>n+(x.custo_item||0),0)};});
    }
    return json(res,200,{produto:pr.rows[0],setores,porcoes});
  }
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'ficha' && !seg[4] && req.method === 'PUT') {
    const b=await readBody(req);
    if(!(await estPode(b.usuario_id,'editar_produtos'))) return json(res,403,{erro:'Sem permissão para editar fichas.'});
    const pid=parseInt(b.produto_id,10), porcoes=Array.isArray(b.porcoes)?b.porcoes:[];
    if(!pid) return json(res,400,{erro:'Produto inválido.'});
    if(!porcoes.length) return json(res,400,{erro:'A ficha precisa ter pelo menos uma porção.'});
    const client=await db.pool.connect();
    try{await client.query('BEGIN');
      const prod=await client.query('SELECT id,nome,unidade FROM est_produto WHERE tenant_id=$1 AND id=$2 AND ativo',[TENANT,pid]);
      if(!prod.rows[0]){await client.query('ROLLBACK');return json(res,404,{erro:'Produto não encontrado.'});}
      const f=await client.query(`INSERT INTO est_ficha_producao (tenant_id,produto_id,descricao,unidade_consumo,tipo,instrucoes,ativo)
        VALUES ($1,$2,$3,$4,$5,$6,TRUE) ON CONFLICT (tenant_id,produto_id) DO UPDATE SET descricao=EXCLUDED.descricao,unidade_consumo=EXCLUDED.unidade_consumo,
        tipo=EXCLUDED.tipo,instrucoes=EXCLUDED.instrucoes,ativo=TRUE,atualizado_em=NOW() RETURNING id`,[TENANT,pid,String(b.descricao||prod.rows[0].nome).trim(),String(b.unidade_consumo||prod.rows[0].unidade).trim(),b.tipo==='INGREDIENTE_BENEFICIADO'?'INGREDIENTE_BENEFICIADO':'PRODUZIDO',String(b.instrucoes||'').trim()||null]);
      const fichaId=f.rows[0].id, mantidas=[];
      for(let idx=0;idx<porcoes.length;idx++){
        const po=porcoes[idx], nome=String(po.nome||('Porção '+(idx+1))).trim(), rend=Number(String(po.rendimento==null?'':po.rendimento).replace(',','.'));
        if(!(rend>0)) throw new Error('Toda porção precisa de rendimento maior que zero.');
        let porcaoId=parseInt(po.id,10);
        if(porcaoId){const own=await client.query('SELECT id FROM est_ficha_porcao WHERE id=$1 AND tenant_id=$2 AND ficha_id=$3',[porcaoId,TENANT,fichaId]);if(!own.rows[0])porcaoId=null;}
        if(porcaoId) await client.query('UPDATE est_ficha_porcao SET nome=$2,rendimento=$3,unidade=$4,ordem=$5,ativo=TRUE,atualizado_em=NOW() WHERE id=$1',[porcaoId,nome,rend,String(po.unidade||prod.rows[0].unidade).trim(),idx]);
        else porcaoId=(await client.query('INSERT INTO est_ficha_porcao (tenant_id,ficha_id,nome,rendimento,unidade,ordem,ativo) VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING id',[TENANT,fichaId,nome,rend,String(po.unidade||prod.rows[0].unidade).trim(),idx])).rows[0].id;
        mantidas.push(porcaoId); await client.query('DELETE FROM est_ficha_porcao_item WHERE tenant_id=$1 AND porcao_id=$2',[TENANT,porcaoId]);
        const vistos=new Set(), itens=Array.isArray(po.itens)?po.itens:[];
        for(let j=0;j<itens.length;j++){const it=itens[j],iid=parseInt(it.insumo_produto_id,10),q=Number(String(it.quantidade==null?'':it.quantidade).replace(',','.'));
          if(!iid||iid===pid||!(q>0)) throw new Error('Revise ingrediente e quantidade na porção “'+nome+'”.');
          if(vistos.has(iid)) throw new Error('Ingrediente repetido na porção “'+nome+'”.'); vistos.add(iid);
          const ie=await client.query('SELECT id FROM est_produto WHERE tenant_id=$1 AND id=$2 AND ativo',[TENANT,iid]);if(!ie.rows[0])throw new Error('Um ingrediente não existe ou está inativo.');
          await client.query(`INSERT INTO est_ficha_porcao_item (tenant_id,porcao_id,insumo_produto_id,quantidade,unidade,observacao,ordem) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[TENANT,porcaoId,iid,q,String(it.unidade||'').trim()||null,String(it.observacao||'').trim()||null,j]);
        }
      }
      await client.query('UPDATE est_ficha_porcao SET ativo=FALSE,atualizado_em=NOW() WHERE tenant_id=$1 AND ficha_id=$2 AND NOT(id=ANY($3::int[]))',[TENANT,fichaId,mantidas]);
      await client.query('UPDATE est_produto SET pode_produzir=TRUE,atualizado_em=NOW() WHERE tenant_id=$1 AND id=$2',[TENANT,pid]);
      // Espelho da primeira porção para compatibilidade com integrações antigas.
      await client.query('UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id=$1 AND produto_id=$2',[TENANT,pid]);
      const primeira=porcoes[0], primeiraId=mantidas[0];
      const itensPrimeira=await client.query('SELECT insumo_produto_id,quantidade,unidade,observacao FROM est_ficha_porcao_item WHERE tenant_id=$1 AND porcao_id=$2 ORDER BY ordem',[TENANT,primeiraId]);
      for(const it of itensPrimeira.rows){const ex=await client.query('SELECT id FROM est_producao_receita WHERE tenant_id=$1 AND produto_id=$2 AND insumo_produto_id=$3',[TENANT,pid,it.insumo_produto_id]);
        if(ex.rows[0])await client.query('UPDATE est_producao_receita SET quantidade_por_unidade=$2,unidade=$3,rendimento=$4,observacao=$5,ativo=TRUE WHERE id=$1',[ex.rows[0].id,it.quantidade,it.unidade,Number(primeira.rendimento),it.observacao]);
        else await client.query('INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,observacao,ativo) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)',[TENANT,pid,it.insumo_produto_id,it.quantidade,it.unidade,Number(primeira.rendimento),it.observacao]);}
      if(Array.isArray(b.setores)){await client.query('DELETE FROM est_produto_setor WHERE tenant_id=$1 AND produto_id=$2',[TENANT,pid]);for(const sid of b.setores.map(Number).filter(Boolean))await client.query('INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) VALUES ($1,$2,$3,FALSE) ON CONFLICT DO NOTHING',[TENANT,pid,sid]);}
      await client.query('COMMIT');return json(res,200,{ok:true,ficha_id:fichaId,porcoes:mantidas.length});
    }catch(e){try{await client.query('ROLLBACK')}catch(_){}return json(res,400,{erro:e.code||e.message});}finally{client.release();}
  }
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'ficha' && seg[4] && req.method === 'DELETE') {
    const b=await readBody(req);if(!(await estPode(b.usuario_id,'editar_produtos')))return json(res,403,{erro:'Sem permissão para excluir fichas.'});
    const pid=parseInt(seg[4],10),client=await db.pool.connect();try{await client.query('BEGIN');
      const f=await client.query('UPDATE est_ficha_producao SET ativo=FALSE,atualizado_em=NOW() WHERE tenant_id=$1 AND produto_id=$2 RETURNING id',[TENANT,pid]);
      if(f.rows[0])await client.query('UPDATE est_ficha_porcao SET ativo=FALSE,atualizado_em=NOW() WHERE tenant_id=$1 AND ficha_id=$2',[TENANT,f.rows[0].id]);
      await client.query('UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id=$1 AND produto_id=$2',[TENANT,pid]);
      await client.query('UPDATE est_produto SET pode_produzir=FALSE,atualizado_em=NOW() WHERE tenant_id=$1 AND id=$2',[TENANT,pid]);
      await client.query('COMMIT');return json(res,200,{ok:true});}catch(e){try{await client.query('ROLLBACK')}catch(_){}return json(res,400,{erro:e.code||e.message});}finally{client.release();}
  }
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'receita' && req.method === 'GET') {
    const pid = parseInt(url.searchParams.get('produto_id'), 10);
    const r = await db.q(`SELECT r.id, r.insumo_produto_id, i.nome AS insumo, i.estoque_atual AS insumo_estoque, r.quantidade_por_unidade, r.unidade, r.rendimento, r.observacao
      FROM est_producao_receita r JOIN est_produto i ON i.id=r.insumo_produto_id
      WHERE r.tenant_id=$1 AND r.produto_id=$2 AND r.ativo ORDER BY i.nome`, [TENANT, pid]);
    return json(res, 200, { itens: r.rows });
  }
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'receita' && !seg[4] && req.method === 'POST') {
    const b = await readBody(req); const g = await estGestor(b.usuario_id);
    if (!g) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    if (!b.produto_id || !b.insumo_produto_id) return json(res, 400, { erro: 'produto e insumo obrigatórios' });
    if (Number(b.produto_id) === Number(b.insumo_produto_id)) return json(res, 400, { erro: 'o insumo não pode ser o próprio produto' });
    const qpu = b.quantidade_por_unidade != null && b.quantidade_por_unidade !== '' ? Number(b.quantidade_por_unidade) : null;
    const rend = b.rendimento != null && b.rendimento !== '' ? Number(b.rendimento) : null;
    const ex = await db.q(`SELECT id FROM est_producao_receita WHERE tenant_id=$1 AND produto_id=$2 AND insumo_produto_id=$3`, [TENANT, b.produto_id, b.insumo_produto_id]);
    if (ex.rows[0]) await db.q(`UPDATE est_producao_receita SET quantidade_por_unidade=$2, unidade=$3, rendimento=$4, observacao=$5, ativo=TRUE WHERE id=$1`, [ex.rows[0].id, qpu, b.unidade || null, rend, b.observacao || null]);
    else await db.q(`INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [TENANT, b.produto_id, b.insumo_produto_id, qpu, b.unidade || null, rend, b.observacao || null]);
    return json(res, 200, { ok: true });
  }
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'receita' && seg[4] && req.method === 'DELETE') {
    const b = await readBody(req); const g = await estGestor(b.usuario_id);
    if (!g) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    await db.q(`UPDATE est_producao_receita SET ativo=FALSE WHERE id=$1 AND tenant_id=$2`, [parseInt(seg[4], 10), TENANT]);
    return json(res, 200, { ok: true });
  }
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'run' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.usuario_id) return json(res, 403, { erro: 'Faça login.' });
    if (!(await estPode(b.usuario_id, 'acessar_producao_interna'))) return json(res, 403, { erro: 'Sem permissão para lançar produção.' });
    const u = await db.q('SELECT nome FROM rbac_contacts WHERE id=$1 AND tenant_id=$2', [b.usuario_id, TENANT]);
    const uname = u.rows[0] ? u.rows[0].nome : null;
    const pid = parseInt(b.produto_id, 10); let qtd = Number(b.quantidade), porcao = null;
    if (b.porcao_id) {
      const lotes = Number(String(b.lotes == null ? 1 : b.lotes).replace(',', '.'));
      const po = await db.q(`SELECT po.id,po.nome,po.rendimento,po.unidade FROM est_ficha_porcao po
        JOIN est_ficha_producao f ON f.id=po.ficha_id AND f.tenant_id=po.tenant_id
        WHERE po.id=$1 AND po.tenant_id=$2 AND f.produto_id=$3 AND po.ativo AND f.ativo`, [parseInt(b.porcao_id,10),TENANT,pid]);
      if (!po.rows[0]) return json(res,400,{erro:'Porção da ficha não encontrada.'});
      if (!(lotes>0)) return json(res,400,{erro:'Informe a quantidade de porções/lotes.'});
      porcao=po.rows[0]; qtd=Number(porcao.rendimento)*lotes;
    }
    if (!pid || !(qtd > 0)) return json(res, 400, { erro: 'produto e quantidade (>0) obrigatórios' });
    // total realmente rendido após o processo (opcional). Se informado e menor que a base, a diferença é PERDA.
    const rendidoIn = (b.rendido === '' || b.rendido == null) ? null : Number(String(b.rendido).replace(',', '.'));
    const rendido = (rendidoIn != null && rendidoIn >= 0 && !Number.isNaN(rendidoIn)) ? rendidoIn : null;
    const entrada = rendido != null ? rendido : qtd;          // o que entra no estoque do produzido
    const perda = (rendido != null && qtd - rendido > 0) ? (qtd - rendido) : 0;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const p = await client.query('SELECT nome, estoque_atual FROM est_produto WHERE id=$1 AND tenant_id=$2 AND pode_produzir FOR UPDATE', [pid, TENANT]);
      if (!p.rows[0]) { await client.query('ROLLBACK'); return json(res, 404, { erro: 'produto produzido não encontrado' }); }
      const rec = porcao
      ? await client.query(`SELECT r.insumo_produto_id,i.nome AS insumo,i.estoque_atual,i.peso_g,i.unidade AS estoque_unidade,
          r.quantidade AS quantidade_por_unidade,r.unidade AS receita_unidade,$3::numeric AS rendimento
        FROM est_ficha_porcao_item r JOIN est_produto i ON i.id=r.insumo_produto_id
        WHERE r.tenant_id=$1 AND r.porcao_id=$2 ORDER BY r.ordem FOR UPDATE OF i`,[TENANT,porcao.id,porcao.rendimento])
      : await client.query(`SELECT r.insumo_produto_id,i.nome AS insumo,i.estoque_atual,i.peso_g,i.unidade AS estoque_unidade,
          r.quantidade_por_unidade,r.unidade AS receita_unidade,r.rendimento
        FROM est_producao_receita r JOIN est_produto i ON i.id=r.insumo_produto_id WHERE r.tenant_id=$1 AND r.produto_id=$2 AND r.ativo FOR UPDATE OF i`, [TENANT, pid]);
      if (!rec.rows.length) { await client.query('ROLLBACK'); return json(res,400,{erro:'Esta porção ainda não tem ingredientes. Complete a ficha antes de produzir.'}); }
      const run = await client.query(`INSERT INTO est_producao_run (tenant_id, produto_id, quantidade, rendido, perda, usuario_id, usuario_nome, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [TENANT, pid, qtd, rendido, perda || null, b.usuario_id, uname, b.observacao || null]);
      const runId = run.rows[0].id; const avisos = [];
      for (const r of rec.rows) {
      const qpu = r.quantidade_por_unidade != null ? Number(r.quantidade_por_unidade) : 0;
      const rend = r.rendimento != null && Number(r.rendimento) > 0 ? Number(r.rendimento) : 1;
      // por unidade produzida: converte g/kg/ml -> unidade de contagem do bruto via peso_g
      const baixa = estBaixaEmUnidades(qpu, r.receita_unidade, r.peso_g, r.estoque_unidade) * qtd / rend;
      if (!(baixa > 0)) continue;
      const antes = Number(r.estoque_atual), depois = antes - baixa;
      await client.query('UPDATE est_produto SET estoque_atual=$2, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$3', [r.insumo_produto_id, depois, TENANT]);
      await client.query(`INSERT INTO est_movimento (tenant_id, produto_id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, motivo, ref) VALUES ($1,$2,$3,'PRODUCAO_BAIXA',$4,$5,$6,'PRODUCAO',$7,$8,$9,$10)`, [TENANT, r.insumo_produto_id, r.insumo, antes, baixa, depois, b.usuario_id, uname, 'Produção de ' + p.rows[0].nome, runId]);
      if (depois < 0) avisos.push(r.insumo + ' ficou negativo (' + depois.toFixed(3) + ')');
    }
    const antesP = Number(p.rows[0].estoque_atual), depoisP = antesP + entrada;
    await client.query('UPDATE est_produto SET estoque_atual=$2, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$3', [pid, depoisP, TENANT]);
    await client.query(`INSERT INTO est_movimento (tenant_id, produto_id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, motivo, ref) VALUES ($1,$2,$3,'PRODUCAO_ENTRADA',$4,$5,$6,'PRODUCAO',$7,$8,$9,$10)`, [TENANT, pid, p.rows[0].nome, antesP, entrada, depoisP, b.usuario_id, uname, 'Produção interna', runId]);
    // Perda de produção (merma): diferença entre a base e o rendido real
    let perda_pct = null, alerta_perda = null;
    if (perda > 0) {
      perda_pct = qtd > 0 ? (perda / qtd * 100) : 0;
      await client.query(`INSERT INTO est_movimento (tenant_id, produto_id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, motivo, ref) VALUES ($1,$2,$3,'PERDA',$4,$5,$6,'PRODUCAO',$7,$8,$9,$10)`,
        [TENANT, pid, p.rows[0].nome, depoisP, perda, depoisP, b.usuario_id, uname, 'Merma de produção (' + perda_pct.toFixed(1) + '%)', runId]);
      // Alerta se a perda % ficar acima da média das últimas produções deste item
      try {
        const hist = await client.query(`SELECT AVG(perda / NULLIF(quantidade,0))::float AS media FROM est_producao_run WHERE tenant_id=$1 AND produto_id=$2 AND perda IS NOT NULL AND id<>$3`, [TENANT, pid, runId]);
        const media = hist.rows[0] && hist.rows[0].media != null ? hist.rows[0].media * 100 : null;
        if (media != null && perda_pct > media * 1.3 && perda_pct - media >= 5) {
          alerta_perda = 'Perda de ' + perda_pct.toFixed(1) + '% acima da média (' + media.toFixed(1) + '%) deste item.';
          avisos.push(alerta_perda);
        }
      } catch (e) {}
    }
      await client.query('COMMIT');
      return json(res, 200, { ok: true, avisos, insumos_baixados: rec.rows.length, produzido_depois: depoisP, rendido, perda: perda || 0, perda_pct, alerta_perda });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      return json(res, 400, { erro: e.code || e.message });
    } finally { client.release(); }
  }
  if (sub === 'est' && seg[2] === 'producoes' && req.method === 'GET') {
    const r = await db.q(`SELECT pr.id, pr.quantidade, pr.usuario_nome, pr.observacao, pr.criado_em, p.nome AS produto, p.unidade FROM est_producao_run pr JOIN est_produto p ON p.id=pr.produto_id WHERE pr.tenant_id=$1 ORDER BY pr.criado_em DESC LIMIT 30`, [TENANT]);
    return json(res, 200, { producoes: r.rows });
  }

  // ---- Permissões (configuráveis por usuário) ----
  if (sub === 'est' && seg[2] === 'usuarios' && req.method === 'GET') {
    if (!(await estPode(url.searchParams.get('usuario_id'), 'editar_permissoes'))) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    const r = await db.q(`SELECT id, nome, apelido_login, perfil_principal FROM rbac_contacts WHERE tenant_id=$1 AND ativo ORDER BY nome`, [TENANT]);
    return json(res, 200, { usuarios: r.rows, catalogo: EST_PERMS });
  }
  if (sub === 'est' && seg[2] === 'permissoes' && req.method === 'GET') {
    const alvo = url.searchParams.get('alvo_id') || url.searchParams.get('usuario_id');
    const e = await estPermsEfetivas(alvo);
    return json(res, 200, { perms: e.perms, gestor: !!e.gestor, catalogo: EST_PERMS });
  }
  if (sub === 'est' && seg[2] === 'permissoes' && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'editar_permissoes'))) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    if (!b.alvo_id) return json(res, 400, { erro: 'alvo_id obrigatório' });
    const alvoEh = await estPermsEfetivas(b.alvo_id);
    if (alvoEh.gestor) return json(res, 400, { erro: 'Gestores/gerentes já têm acesso total.' });
    const sel = Array.isArray(b.permissoes) ? b.permissoes.filter(p => EST_PERMS.includes(p)) : [];
    await db.q(`DELETE FROM est_permissao WHERE tenant_id=$1 AND usuario_id=$2`, [TENANT, b.alvo_id]);
    for (const p of sel.concat(['__configured__'])) await db.q(`INSERT INTO est_permissao (tenant_id, usuario_id, permissao) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, usuario_id, permissao) DO NOTHING`, [TENANT, b.alvo_id, p]);
    return json(res, 200, { ok: true, perms: sel });
  }

  // ---- Jéssica: consulta direta ao banco do estoque (respeita permissões) ----
  if (sub === 'est' && seg[2] === 'jessica' && req.method === 'POST') {
    const b = await readBody(req);
    const pergunta = String(b.pergunta || '').trim();
    if (!pergunta) return json(res, 400, { erro: 'envie a pergunta' });
    const out = await estJessica(b.usuario_id, pergunta);
    if (out.erro) return json(res, 403, out);
    return json(res, 200, out);
  }

  // ---- Lançar perda / consumo / entrada (in-app) ----
  if (sub === 'est' && seg[2] === 'movimento' && req.method === 'POST') {
    const b = await readBody(req);
    const e = await estPermsEfetivas(b.usuario_id);
    if (!e.user || !(e.gestor || e.perms.includes('acessar_lancamentos'))) return json(res, 403, { erro: 'Sem permissão para lançar movimento.' });
    const tipo = String(b.tipo || '').toUpperCase();
    if (!['PERDA', 'CONSUMO', 'ENTRADA'].includes(tipo)) return json(res, 400, { erro: 'tipo deve ser PERDA, CONSUMO ou ENTRADA' });
    const qtd = Number(String(b.quantidade).replace(',', '.'));
    if (!b.produto_id || !(qtd > 0)) return json(res, 400, { erro: 'informe produto e quantidade (>0)' });
    const p = (await db.q('SELECT id, nome, unidade, estoque_atual FROM est_produto WHERE id=$1 AND tenant_id=$2', [b.produto_id, TENANT])).rows[0];
    if (!p) return json(res, 404, { erro: 'produto não encontrado' });
    const mv = await estLancaMov(tipo, e.user, p, qtd, b.motivo || null, 'MANUAL', b.observacao || null);
    return json(res, 200, { ok: true, produto: p.nome, antes: mv.antes, depois: mv.depois, unidade: p.unidade });
  }

  // ---- WhatsApp: webhook de entrada (Jéssica recebe e lança) ----
  if (sub === 'est' && seg[2] === 'whatsapp' && seg[3] === 'inbound' && req.method === 'POST') {
    const b = await readBody(req);
    const expected = process.env.WA_INBOUND_TOKEN; // só exige token se explicitamente configurado no Easypanel
    const tok = b.token || req.headers['x-wa-token'];
    if (expected && tok !== expected) return json(res, 401, { erro: 'token inválido' });
    const telefone = soPhone(b.telefone || b.from || b.phone);
    const texto = String(b.texto || b.text || b.message || '').trim();
    if (!telefone || !texto) return json(res, 400, { erro: 'informe telefone e texto' });
    // identifica usuário pelo telefone (tolerante a 55 / 9º dígito)
    const cands = [telefone];
    if (telefone.length >= 12) { const sempais = telefone.replace(/^55/, ''); cands.push('55' + sempais, sempais); }
    const u = (await db.q(`SELECT id, nome FROM rbac_contacts WHERE tenant_id=$1 AND ativo AND regexp_replace(COALESCE(phone,''),'\\D','','g') = ANY($2) LIMIT 1`, [TENANT, cands])).rows[0];
    let resposta;
    const interp = await estInterpretaWA(texto);
    if (!u) {
      resposta = 'Olá! Seu número não está cadastrado no estoque da Premium RP. Peça ao gestor para cadastrar seu telefone.';
      await db.q(`INSERT INTO est_whatsapp_msg (tenant_id, telefone, direcao, texto, interpretado) VALUES ($1,$2,'IN',$3,$4)`, [TENANT, telefone, texto, JSON.stringify({ erro: 'nao_cadastrado', interp })]).catch(() => {});
      await db.q(`INSERT INTO est_whatsapp_msg (tenant_id, telefone, direcao, texto) VALUES ($1,$2,'OUT',$3)`, [TENANT, telefone, resposta]).catch(() => {});
      return json(res, 200, { resposta, usuario: null });
    }
    await db.q(`INSERT INTO est_whatsapp_msg (tenant_id, telefone, direcao, texto, interpretado) VALUES ($1,$2,'IN',$3,$4)`, [TENANT, telefone, texto, JSON.stringify(interp)]).catch(() => {});
    if (['perda', 'consumo', 'entrada'].includes(interp.acao)) {
      if (!(await estPode(u.id, 'acessar_lancamentos'))) {
        resposta = 'Você não tem permissão para lançar movimentações no estoque. Fale com o gestor.';
      } else if (!interp.produto || !(Number(interp.quantidade) > 0)) {
        resposta = 'Entendi que é um lançamento, mas faltou o produto ou a quantidade. Ex: "perda muçarela 2 peças motivo caiu no chão".';
      } else {
        const prod = await estAchaProduto(interp.produto, 0.5);
        if (!prod) {
          resposta = `Não encontrei o produto "${interp.produto}" no cadastro. Confira o nome e tente de novo.`;
        } else {
          const tipo = interp.acao.toUpperCase();
          const obs = interp.unidade ? ('informado: ' + interp.quantidade + ' ' + interp.unidade) : null;
          const mv = await estLancaMov(tipo, u, prod, Number(interp.quantidade), interp.motivo || null, 'WHATSAPP', obs);
          const rotulo = tipo === 'PERDA' ? 'Perda' : (tipo === 'CONSUMO' ? 'Consumo' : 'Entrada');
          resposta = `✅ ${rotulo} registrada: ${interp.quantidade} ${prod.unidade || ''} de ${prod.nome}.\nEstoque: ${mv.antes} → ${mv.depois}.${interp.motivo ? '\nMotivo: ' + interp.motivo : ''}\n(${u.nome})`;
        }
      }
    } else if (interp.acao === 'ajuda') {
      resposta = 'Sou a Jéssica do estoque. Você pode:\n• Lançar perda: "perda muçarela 2 peças motivo queimou"\n• Lançar consumo: "consumo catupiry 3 unidades montagem"\n• Perguntar: "quais produtos estão abaixo do mínimo?"';
    } else {
      const jr = await estJessica(u.id, texto);
      resposta = jr.resposta || jr.aviso || 'Não consegui consultar agora.';
    }
    await db.q(`INSERT INTO est_whatsapp_msg (tenant_id, telefone, direcao, texto) VALUES ($1,$2,'OUT',$3)`, [TENANT, telefone, resposta]).catch(() => {});
    return json(res, 200, { resposta, usuario: u.nome });
  }

  // tema white-label público (storefront lê para se vestir com a cara da loja)
  if (sub === 'tema' && req.method === 'GET') {
    const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
    const cfg = (r.rows[0] && r.rows[0].config) || {};
    return json(res, 200, { tema: temaSanitize(cfg.tema || {}, TEMA_DEFAULTS) });
  }
  // config pública da loja (tema + observações + impressão) p/ storefront e comanda
  if (sub === 'loja-config' && req.method === 'GET') {
    const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
    const cfg = (r.rows[0] && r.rows[0].config) || {};
    return json(res, 200, { tema: temaSanitize(cfg.tema || {}, TEMA_DEFAULTS), obs: obsSanitize(cfg.obs || {}, OBS_DEFAULTS), impressao: impressaoSanitize(cfg.impressao || {}, IMPRESSAO_DEFAULTS) });
  }

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
    baixaEstoqueSeLigado(itens, id);
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
    const r = await db.q('SELECT id, nome, apelido_login, perfil_principal, setores_permitidos, pin_hash, pin_must_change FROM rbac_contacts WHERE tenant_id=$1 AND ativo', [TENANT]);
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
    return json(res, 200, { ok: true, must_change: !!col.pin_must_change, colaborador: { id: col.id, nome: col.nome, login: col.apelido_login, perfil: col.perfil_principal, ve_tudo: veTudo }, setores });
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
  // movimentacao de estoque: ENTRADA (Jessica/nota), SAIDA (pedido), AJUSTE. Infra pronta p/ integrar.
  if (sub === 'estoque' && seg[2] === 'movimento' && req.method === 'POST') {
    const b = await readBody(req);
    const tipo = String(b.tipo || 'ENTRADA').toUpperCase();
    if (!['ENTRADA', 'SAIDA', 'AJUSTE'].includes(tipo)) return json(res, 400, { erro: 'tipo invalido' });
    if (!b.insumo_nome && !b.item_id) return json(res, 400, { erro: 'informe item' });
    const r = await db.q(`INSERT INTO estoque_movimentos (tenant_id, item_id, insumo_nome, setor_id, tipo, quantidade, unidade, motivo, origem, ref_pedido, por, por_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [TENANT, b.item_id || null, b.insumo_nome || b.nome || '', b.setor_id || null, tipo, Number(b.quantidade) || 0, b.unidade || null, b.motivo || null, b.origem || 'manual', b.ref_pedido || null, (b.por || '').slice(0, 40), b.por_nome || null]);
    return json(res, 201, { ok: true, id: r.rows[0].id });
  }
  if (sub === 'estoque' && seg[2] === 'movimentos' && req.method === 'GET') {
    const r = await db.q('SELECT id, item_id, insumo_nome, tipo, quantidade, unidade, motivo, origem, ref_pedido, por_nome, criado_em FROM estoque_movimentos WHERE tenant_id=$1 ORDER BY criado_em DESC LIMIT 100', [TENANT]);
    return json(res, 200, { movimentos: r.rows });
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
    const r = await db.q('SELECT id, nome, apelido_login, perfil_principal, perfis_adicionais, setores_permitidos, pin_hash, pin_must_change FROM rbac_contacts WHERE tenant_id=$1 AND ativo', [TENANT]);
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
    const ehGestor = perfis.some(p => ['GESTOR', 'GERENTE', 'CHEFE_COZINHA', 'OPERADOR_ATENDIMENTO'].includes(p));
    return json(res, 200, { ok: true, must_change: !!col.pin_must_change, usuario: { id: col.id, nome: col.nome, perfil: col.perfil_principal, login: col.apelido_login, setores_permitidos: col.setores_permitidos || [],
      pode_mesas: ehGarcom || ehGestor, pode_gestor: ehGestor, so_mesas: ehGarcom && !ehGestor, pode_admin: perfis.includes('GESTOR') } });
  }
  // trocar o proprio PIN (primeiro login obrigatorio): valida o atual, grava o novo.
  if (sub === 'staff' && seg[2] === 'trocar-pin' && req.method === 'POST') {
    const b = await readBody(req);
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const alvo = norm(b.login); const atual = String(b.pin_atual || '').replace(/\D/g, ''); const novo = String(b.pin_novo || b.novo_pin || '').replace(/\D/g, '');
    if (novo.length < 4) return json(res, 400, { erro: 'O novo PIN precisa ter ao menos 4 dígitos.' });
    const r = await db.q('SELECT id, apelido_login, nome, pin_hash FROM rbac_contacts WHERE tenant_id=$1 AND ativo', [TENANT]);
    const col = r.rows.find(x => norm(x.apelido_login) === alvo || norm(x.nome).split(' ')[0] === alvo);
    if (!col) return json(res, 404, { erro: 'usuario nao encontrado' });
    if (col.pin_hash) { const v = await db.q('SELECT (pin_hash = crypt($2, pin_hash)) AS ok FROM rbac_contacts WHERE id=$1', [col.id, atual]); if (!v.rows[0] || !v.rows[0].ok) return json(res, 401, { erro: 'PIN atual incorreto.' }); }
    await db.q(`UPDATE rbac_contacts SET pin_hash=crypt($2, gen_salt('bf',8)), pin_changed_at=NOW(), pin_must_change=FALSE WHERE id=$1`, [col.id, novo]);
    return json(res, 200, { ok: true });
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
    // Compatibilidade do admin antigo: a rota permanece, mas a fonte oficial agora é est_produto.
    if (seg[2] === 'estoque-itens' && req.method === 'GET') {
      const r = await db.q(`
        SELECT p.id::text AS id, sx.setor_id, sx.setor_nome, c.nome AS categoria, p.nome, p.unidade,
          p.estoque_minimo, p.estoque_ideal, COALESCE(c.ordem, 999) AS ordem, p.ativo,
          p.pode_contar AS exige_contagem, 'est_produto' AS origem
        FROM est_produto p
        LEFT JOIN est_categoria c ON c.id=p.categoria_id
        LEFT JOIN LATERAL (
          SELECT s.id::text AS setor_id, s.nome AS setor_nome
          FROM est_produto_setor ps
          JOIN est_setor s ON s.id=ps.setor_id AND s.tenant_id=ps.tenant_id
          WHERE ps.tenant_id=p.tenant_id AND ps.produto_id=p.id
          ORDER BY ps.obrigatorio DESC, s.ordem, s.nome
          LIMIT 1
        ) sx ON TRUE
        WHERE p.tenant_id=$1
        ORDER BY sx.setor_nome NULLS LAST, COALESCE(c.ordem,999), p.nome`, [TENANT]);
      return json(res, 200, { itens: r.rows, origem: 'est_produto' });
    }
    if (seg[2] === 'estoque-item' && !seg[3] && req.method === 'POST') {
      const nome = String(body.nome || '').trim();
      if (!nome) return json(res, 400, { erro: 'informe o nome' });
      let categoriaId = null;
      if (body.categoria) {
        const cat = await db.q('SELECT id FROM est_categoria WHERE tenant_id=$1 AND lower(nome)=lower($2) LIMIT 1', [TENANT, String(body.categoria).trim()]);
        categoriaId = cat.rows[0]?.id || null;
      }
      const minimo = body.estoque_minimo !== '' && body.estoque_minimo != null ? Number(body.estoque_minimo) : null;
      const ideal = body.estoque_ideal !== '' && body.estoque_ideal != null ? Number(body.estoque_ideal) : null;
      const exige = typeof body.exige_contagem === 'boolean' ? body.exige_contagem : true;
      let id = parseInt(body.id, 10);
      if (id) {
        const up = await db.q(`UPDATE est_produto SET nome=$2, categoria_id=COALESCE($3,categoria_id), unidade=$4,
            estoque_minimo=$5, estoque_ideal=$6, pode_contar=$7, ativo=TRUE, atualizado_em=NOW()
          WHERE id=$1 AND tenant_id=$8 RETURNING id`,
          [id, nome, categoriaId, String(body.unidade || '').trim() || null, minimo, ideal, exige, TENANT]);
        if (!up.rows[0]) return json(res, 404, { erro: 'Produto não encontrado.' });
      } else {
        const ins = await db.q(`INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, estoque_minimo, estoque_ideal, pode_contar, pode_comprar, pode_produzir, ativo)
          VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,FALSE,TRUE) RETURNING id`,
          [TENANT, nome, categoriaId, String(body.unidade || '').trim() || null, minimo, ideal, exige]);
        id = ins.rows[0].id;
      }
      const setorId = parseInt(body.setor_id, 10) || (body.setor_nome ? (await db.q('SELECT id FROM est_setor WHERE tenant_id=$1 AND lower(nome)=lower($2) AND ativo ORDER BY ordem,nome LIMIT 1', [TENANT, String(body.setor_nome).trim()])).rows[0]?.id : null);
      if (setorId) {
        await db.q('DELETE FROM est_produto_setor WHERE tenant_id=$1 AND produto_id=$2', [TENANT, id]);
        await db.q('INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio) VALUES ($1,$2,$3,FALSE) ON CONFLICT DO NOTHING', [TENANT, id, setorId]);
      }
      return json(res, 200, { ok: true, id, origem: 'est_produto' });
    }
    if (seg[2] === 'estoque-item' && seg[3] && req.method === 'DELETE') {
      const id = parseInt(seg[3], 10);
      if (!id) return json(res, 400, { erro: 'produto inválido' });
      await db.q('UPDATE est_produto SET ativo=FALSE, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$2', [id, TENANT]);
      return json(res, 200, { ok: true, origem: 'est_produto' });
    }
    if (seg[2] === 'preco' && req.method === 'POST') {
      if (body.tipo === 'produto') await db.q('UPDATE produtos SET preco_base=$2 WHERE id=$1 AND tenant_id=$3', [body.id, money(body.preco), TENANT]);
      else await db.q('UPDATE opcoes SET preco=$2 WHERE id=$1 AND tenant_id=$3', [body.id, money(body.preco), TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'config' && req.method === 'GET') {
      const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
      const cfg = (r.rows[0] && r.rows[0].config) || {};
      return json(res, 200, { destino_pedido: cfg.destino_pedido || 'SAIPOS', baixa_estoque_auto: !!cfg.baixa_estoque_auto, webhook_contagem: cfg.webhook_contagem || '', printer_ip: cfg.printer_ip || '' });
    }
    if (seg[2] === 'tema' && req.method === 'GET') {
      const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
      const cfg = (r.rows[0] && r.rows[0].config) || {};
      return json(res, 200, { tema: temaSanitize(cfg.tema || {}, TEMA_DEFAULTS), fontes: FONTES_OK });
    }
    if (seg[2] === 'tema' && req.method === 'POST') {
      const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
      const cur = (r.rows[0] && r.rows[0].config) || {};
      cur.tema = temaSanitize(body.tema || body, temaSanitize(cur.tema || {}, TEMA_DEFAULTS));
      await db.q('UPDATE tenants SET config=$2 WHERE id=$1', [TENANT, JSON.stringify(cur)]);
      return json(res, 200, { ok: true, tema: cur.tema });
    }
    if (seg[2] === 'impressao' && req.method === 'GET') {
      const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
      const cfg = (r.rows[0] && r.rows[0].config) || {};
      return json(res, 200, { obs: obsSanitize(cfg.obs || {}, OBS_DEFAULTS), impressao: impressaoSanitize(cfg.impressao || {}, IMPRESSAO_DEFAULTS) });
    }
    if (seg[2] === 'impressao' && req.method === 'POST') {
      const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
      const cur = (r.rows[0] && r.rows[0].config) || {};
      cur.obs = obsSanitize(body.obs || {}, obsSanitize(cur.obs || {}, OBS_DEFAULTS));
      cur.impressao = impressaoSanitize(body.impressao || {}, impressaoSanitize(cur.impressao || {}, IMPRESSAO_DEFAULTS));
      await db.q('UPDATE tenants SET config=$2 WHERE id=$1', [TENANT, JSON.stringify(cur)]);
      return json(res, 200, { ok: true, obs: cur.obs, impressao: cur.impressao });
    }

    // ===== RECEITAS: preparos (sub-receitas com modo de preparo) =====
    if (seg[2] === 'preparos' && req.method === 'GET') {
      const pr = await db.q('SELECT id, nome, rendimento, unidade_rendimento, modo_preparo FROM preparos WHERE tenant_id=$1 ORDER BY nome', [TENANT]);
      const it = await db.q('SELECT id, preparo_id, insumo_nome, est_produto_id, quantidade, unidade FROM preparo_itens WHERE tenant_id=$1', [TENANT]);
      const byP = {}; for (const x of it.rows) (byP[x.preparo_id] = byP[x.preparo_id] || []).push(x);
      return json(res, 200, { preparos: pr.rows.map(p => ({ ...p, itens: byP[p.id] || [] })) });
    }
    if (seg[2] === 'preparo' && !seg[3] && req.method === 'POST') {
      const nome = String(body.nome || '').trim(); if (!nome) return json(res, 400, { erro: 'informe o nome' });
      try { const r = await db.q(`INSERT INTO preparos (tenant_id, nome, rendimento, unidade_rendimento, modo_preparo) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, nome) DO UPDATE SET rendimento=EXCLUDED.rendimento, unidade_rendimento=EXCLUDED.unidade_rendimento, modo_preparo=EXCLUDED.modo_preparo RETURNING id`,
        [TENANT, nome, body.rendimento != null && body.rendimento !== '' ? Number(body.rendimento) : null, body.unidade_rendimento || null, body.modo_preparo || null]);
        return json(res, 200, { ok: true, id: r.rows[0].id }); } catch (e) { return json(res, 400, { erro: e.code || e.message }); }
    }
    if (seg[2] === 'preparo' && seg[3] && req.method === 'PATCH') {
      await db.q('UPDATE preparos SET nome=COALESCE($2,nome), rendimento=$3, unidade_rendimento=$4, modo_preparo=$5 WHERE id=$1 AND tenant_id=$6',
        [seg[3], body.nome ? String(body.nome).trim() : null, body.rendimento != null && body.rendimento !== '' ? Number(body.rendimento) : null, body.unidade_rendimento || null, body.modo_preparo ?? null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'preparo' && seg[3] && req.method === 'DELETE') {
      await db.q('DELETE FROM preparos WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'preparo-item' && !seg[3] && req.method === 'POST') {
      if (!body.preparo_id) return json(res, 400, { erro: 'preparo_id obrigatório' });
      const nome = String(body.insumo_nome || '').trim(); if (!nome) return json(res, 400, { erro: 'informe o insumo' });
      await db.q(`INSERT INTO preparo_itens (tenant_id, preparo_id, insumo_nome, est_produto_id, quantidade, unidade) VALUES ($1,$2,$3,$4,$5,$6)`,
        [TENANT, body.preparo_id, nome, body.est_produto_id || null, body.quantidade != null && body.quantidade !== '' ? Number(body.quantidade) : null, body.unidade || null]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'preparo-item' && seg[3] && req.method === 'DELETE') {
      await db.q('DELETE FROM preparo_itens WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }

    // ===== RECEITAS: ficha técnica por opção/produto do cardápio =====
    if (seg[2] === 'ficha-resumo' && req.method === 'GET') {
      const fo = await db.q(`SELECT opcao_id, produto_id, count(*)::int n FROM ficha_itens WHERE tenant_id=$1 GROUP BY opcao_id, produto_id`, [TENANT]);
      const porOpcao = {}, porProduto = {};
      for (const r of fo.rows) { if (r.opcao_id) porOpcao[r.opcao_id] = r.n; else if (r.produto_id) porProduto[r.produto_id] = r.n; }
      return json(res, 200, { porOpcao, porProduto });
    }
    if (seg[2] === 'ficha' && req.method === 'GET') {
      const op = url.searchParams.get('opcao_id'), pr = url.searchParams.get('produto_id');
      const r = op
        ? await db.q('SELECT id, insumo_nome, est_produto_id, quantidade, unidade, observacao FROM ficha_itens WHERE tenant_id=$1 AND opcao_id=$2 ORDER BY id', [TENANT, op])
        : await db.q('SELECT id, insumo_nome, est_produto_id, quantidade, unidade, observacao FROM ficha_itens WHERE tenant_id=$1 AND produto_id=$2 ORDER BY id', [TENANT, pr]);
      return json(res, 200, { itens: r.rows });
    }
    if (seg[2] === 'ficha-item' && !seg[3] && req.method === 'POST') {
      const nome = String(body.insumo_nome || '').trim(); if (!nome) return json(res, 400, { erro: 'informe o insumo' });
      if (!body.opcao_id && !body.produto_id) return json(res, 400, { erro: 'informe opcao_id ou produto_id' });
      await db.q(`INSERT INTO ficha_itens (tenant_id, opcao_id, produto_id, insumo_nome, est_produto_id, quantidade, unidade, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [TENANT, body.opcao_id || null, body.produto_id || null, nome, body.est_produto_id || null, body.quantidade != null && body.quantidade !== '' ? Number(body.quantidade) : null, body.unidade || null, body.observacao || null]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'ficha-item' && seg[3] && req.method === 'PATCH') {
      await db.q('UPDATE ficha_itens SET insumo_nome=COALESCE($2,insumo_nome), est_produto_id=$3, quantidade=$4, unidade=$5, observacao=$6 WHERE id=$1 AND tenant_id=$7',
        [seg[3], body.insumo_nome ? String(body.insumo_nome).trim() : null, body.est_produto_id || null, body.quantidade != null && body.quantidade !== '' ? Number(body.quantidade) : null, body.unidade || null, body.observacao ?? null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'ficha-item' && seg[3] && req.method === 'DELETE') {
      await db.q('DELETE FROM ficha_itens WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'config' && req.method === 'POST') {
      const r = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
      const cur = (r.rows[0] && r.rows[0].config) || {};
      const upd = { ...cur };
      if (body.destino_pedido) upd.destino_pedido = String(body.destino_pedido).toUpperCase() === 'NOSSO' ? 'NOSSO' : 'SAIPOS';
      if (typeof body.baixa_estoque_auto === 'boolean') upd.baixa_estoque_auto = body.baixa_estoque_auto;
      if (body.webhook_contagem != null) upd.webhook_contagem = body.webhook_contagem;
      await db.q('UPDATE tenants SET config=$2 WHERE id=$1', [TENANT, JSON.stringify(upd)]);
      return json(res, 200, { ok: true, config: { destino_pedido: upd.destino_pedido, baixa_estoque_auto: !!upd.baixa_estoque_auto } });
    }
    // ===== CRUD CARDÁPIO (categorias -> itens -> variações -> opções) =====
    const slugCod = (s) => (String(s || 'cat').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36) || 'cat');

    // catálogo completo p/ admin (mostra TODOS os itens, qualquer status)
    if (seg[2] === 'catalogo' && req.method === 'GET') {
      const cats = await db.q('SELECT id, codigo, nome, ordem FROM menu_categorias WHERE tenant_id=$1 AND ativa ORDER BY ordem, nome', [TENANT]);
      const prods = await db.q('SELECT id, categoria_id, nome, descricao, tipo_montagem, preco_base, regra_preco, status, ordem FROM produtos WHERE tenant_id=$1 ORDER BY ordem, nome', [TENANT]);
      const grupos = await db.q('SELECT id, produto_id, nome, ordem, min_escolhas, max_escolhas, permite_repeticao, regra_preco, condicao FROM opcao_grupos WHERE tenant_id=$1 ORDER BY ordem', [TENANT]);
      const opcoes = await db.q('SELECT id, grupo_id, nome, descricao, preco, status, ordem FROM opcoes WHERE tenant_id=$1 ORDER BY ordem', [TENANT]);
      const opByG = {}; for (const o of opcoes.rows) (opByG[o.grupo_id] = opByG[o.grupo_id] || []).push({ id: o.id, nome: o.nome, descricao: o.descricao || '', preco: Number(o.preco), status: o.status, ordem: o.ordem });
      const gByP = {}; for (const g of grupos.rows) (gByP[g.produto_id] = gByP[g.produto_id] || []).push({ id: g.id, nome: g.nome, min: g.min_escolhas, max: g.max_escolhas, repete: g.permite_repeticao, regra: g.regra_preco, condicao: g.condicao || {}, opcoes: opByG[g.id] || [] });
      const pByC = {}; for (const p of prods.rows) (pByC[p.categoria_id] = pByC[p.categoria_id] || []).push({ id: p.id, nome: p.nome, descricao: p.descricao || '', tipo: p.tipo_montagem, preco_base: Number(p.preco_base), regra: p.regra_preco, status: p.status, ordem: p.ordem, grupos: gByP[p.id] || [] });
      const categorias = cats.rows.map(c => ({ id: c.id, codigo: c.codigo, nome: c.nome, ordem: c.ordem, produtos: pByC[c.id] || [] }));
      return json(res, 200, { categorias });
    }

    // CATEGORIA
    if (seg[2] === 'categoria' && !seg[3] && req.method === 'POST') {
      const nome = String(body.nome || '').trim(); if (!nome) return json(res, 400, { erro: 'informe o nome' });
      const cod = slugCod(nome) + '_' + Date.now().toString(36).slice(-4);
      const r = await db.q('INSERT INTO menu_categorias (tenant_id, codigo, nome, ordem, ativa) VALUES ($1,$2,$3,$4,TRUE) RETURNING id', [TENANT, cod, nome, Number(body.ordem) || 50]);
      return json(res, 201, { ok: true, id: r.rows[0].id });
    }
    if (seg[2] === 'categoria' && seg[3] && req.method === 'PATCH') {
      await db.q('UPDATE menu_categorias SET nome=COALESCE($2,nome), ordem=COALESCE($3,ordem), ativa=COALESCE($4,ativa) WHERE id=$1 AND tenant_id=$5',
        [seg[3], body.nome ?? null, body.ordem != null ? Number(body.ordem) : null, typeof body.ativa === 'boolean' ? body.ativa : null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'categoria' && seg[3] && req.method === 'DELETE') {
      await db.q('UPDATE menu_categorias SET ativa=FALSE WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }

    // PRODUTO (item)
    if (seg[2] === 'produto' && !seg[3] && req.method === 'POST') {
      const nome = String(body.nome || '').trim(); if (!nome) return json(res, 400, { erro: 'informe o nome' });
      const tipo = (body.tipo_montagem === 'MONTAVEL') ? 'MONTAVEL' : 'SIMPLES';
      const r = await db.q(`INSERT INTO produtos (id,tenant_id,categoria_id,nome,descricao,tipo_montagem,preco_base,regra_preco,gratuito,status,ordem)
        VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,'ATIVO',$9) RETURNING id`,
        [TENANT, body.categoria_id ? Number(body.categoria_id) : null, nome, body.descricao || '', tipo, money(body.preco_base || 0),
         body.regra_preco || (tipo === 'SIMPLES' ? 'FIXO' : 'SOMA'), !!body.gratuito, Number(body.ordem) || 999]);
      return json(res, 201, { ok: true, id: r.rows[0].id });
    }
    if (seg[2] === 'produto' && seg[3] && req.method === 'PATCH') {
      await db.q(`UPDATE produtos SET nome=COALESCE($2,nome), descricao=COALESCE($3,descricao), preco_base=COALESCE($4,preco_base),
        tipo_montagem=COALESCE($5,tipo_montagem), status=COALESCE($6,status), ordem=COALESCE($7,ordem), categoria_id=COALESCE($8,categoria_id),
        regra_preco=COALESCE($9,regra_preco), atualizado_em=NOW() WHERE id=$1 AND tenant_id=$10`,
        [seg[3], body.nome ?? null, body.descricao ?? null, body.preco_base != null ? money(body.preco_base) : null,
         body.tipo_montagem ?? null, body.status ?? null, body.ordem != null ? Number(body.ordem) : null,
         body.categoria_id != null ? Number(body.categoria_id) : null, body.regra_preco ?? null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'produto' && seg[3] && req.method === 'DELETE') {
      await db.q('DELETE FROM produtos WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }

    // GRUPO (variação)
    if (seg[2] === 'grupo' && !seg[3] && req.method === 'POST') {
      const nome = String(body.nome || '').trim(); if (!nome || !body.produto_id) return json(res, 400, { erro: 'informe produto_id e nome' });
      const r = await db.q(`INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
        VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [TENANT, body.produto_id, nome, Number(body.ordem) || 1, Number(body.min) || 0, Number(body.max) || 1,
         !!body.repete, body.regra_preco || 'SOMA', JSON.stringify(body.condicao || {})]);
      await db.q("UPDATE produtos SET tipo_montagem='MONTAVEL' WHERE id=$1 AND tenant_id=$2", [body.produto_id, TENANT]);
      return json(res, 201, { ok: true, id: r.rows[0].id });
    }
    if (seg[2] === 'grupo' && seg[3] && req.method === 'PATCH') {
      await db.q(`UPDATE opcao_grupos SET nome=COALESCE($2,nome), min_escolhas=COALESCE($3,min_escolhas), max_escolhas=COALESCE($4,max_escolhas),
        permite_repeticao=COALESCE($5,permite_repeticao), ordem=COALESCE($6,ordem), regra_preco=COALESCE($7,regra_preco),
        condicao=COALESCE($8,condicao), atualizado_em=NOW() WHERE id=$1 AND tenant_id=$9`,
        [seg[3], body.nome ?? null, body.min != null ? Number(body.min) : null, body.max != null ? Number(body.max) : null,
         typeof body.repete === 'boolean' ? body.repete : null, body.ordem != null ? Number(body.ordem) : null,
         body.regra_preco ?? null, body.condicao != null ? JSON.stringify(body.condicao) : null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'grupo' && seg[3] && req.method === 'DELETE') {
      await db.q('DELETE FROM opcao_grupos WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }

    // OPÇÃO (escolha dentro de uma variação)
    if (seg[2] === 'opcao' && !seg[3] && req.method === 'POST') {
      const nome = String(body.nome || '').trim(); if (!nome || !body.grupo_id) return json(res, 400, { erro: 'informe grupo_id e nome' });
      const r = await db.q(`INSERT INTO opcoes (id,tenant_id,grupo_id,nome,descricao,preco,status,ordem)
        VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [TENANT, body.grupo_id, nome, body.descricao || '', money(body.preco || 0), body.status || 'ATIVO', Number(body.ordem) || 999]);
      return json(res, 201, { ok: true, id: r.rows[0].id });
    }
    if (seg[2] === 'opcao' && seg[3] && req.method === 'PATCH') {
      await db.q(`UPDATE opcoes SET nome=COALESCE($2,nome), preco=COALESCE($3,preco), status=COALESCE($4,status),
        descricao=COALESCE($5,descricao), ordem=COALESCE($6,ordem), atualizado_em=NOW() WHERE id=$1 AND tenant_id=$7`,
        [seg[3], body.nome ?? null, body.preco != null ? money(body.preco) : null, body.status ?? null,
         body.descricao ?? null, body.ordem != null ? Number(body.ordem) : null, TENANT]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'opcao' && seg[3] && req.method === 'DELETE') {
      await db.q('DELETE FROM opcoes WHERE id=$1 AND tenant_id=$2', [seg[3], TENANT]);
      return json(res, 200, { ok: true });
    }

    if (seg[2] === 'setores' && req.method === 'GET') {
      const r = await db.q(`SELECT s.id::text AS setor_id, s.nome AS setor_nome, count(p.id)::int itens,
          (SELECT c.usuario_nome FROM est_contagem c WHERE c.tenant_id=s.tenant_id AND c.setor_id=s.id ORDER BY c.encerrada_em DESC NULLS LAST, c.iniciada_em DESC LIMIT 1) AS ultimo_responsavel,
          (SELECT c.encerrada_em FROM est_contagem c WHERE c.tenant_id=s.tenant_id AND c.setor_id=s.id ORDER BY c.encerrada_em DESC NULLS LAST, c.iniciada_em DESC LIMIT 1) AS ultima_contagem
        FROM est_setor s
        LEFT JOIN est_produto_setor ps ON ps.tenant_id=s.tenant_id AND ps.setor_id=s.id
        LEFT JOIN est_produto p ON p.tenant_id=ps.tenant_id AND p.id=ps.produto_id AND p.ativo
        WHERE s.tenant_id=$1 AND s.ativo
        GROUP BY s.id, s.nome, s.tenant_id, s.ordem
        ORDER BY s.ordem, s.nome`, [TENANT]);
      return json(res, 200, { setores: r.rows });
    }
    if (seg[2] === 'setor' && (seg[3] === 'rename' || seg[4] === 'rename') && req.method === 'POST') {
      const novo = String(body.novo_nome || '').trim();
      const setorId = parseInt(seg[4] === 'rename' ? seg[3] : body.setor_id, 10);
      if (!setorId || !novo) return json(res, 400, { erro: 'informe setor_id e novo_nome' });
      const r = await db.q('UPDATE est_setor SET nome=$2 WHERE id=$1 AND tenant_id=$3 RETURNING id', [setorId, novo, TENANT]);
      if (!r.rows[0]) return json(res, 404, { erro: 'Setor não encontrado.' });
      return json(res, 200, { ok: true, setor_id: String(setorId), novo_nome: novo, origem: 'est_setor' });
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
    if (p === '/imprimir' || p === '/imprimir/') return serveStatic(res, path.join(ROOT, 'public/imprimir.html'));
    if (p === '/mesas' || p === '/mesas/') return serveStatic(res, path.join(ROOT, 'public/mesas.html'));
    if (p === '/admin' || p === '/admin/') return serveStatic(res, path.join(ROOT, 'public/admin.html'));
    if (p === '/caixa' || p === '/caixa/') return serveStatic(res, path.join(ROOT, 'public/caixa.html'));
    if (p === '/gestor' || p === '/gestor/') return serveStatic(res, path.join(ROOT, 'public/gestor/index.html'));
    if (p === '/mapper' || p === '/mapper/' || p === '/mapper.html' || p === '/command-center' || p === '/command-center/') {
      if (!hostFerramentasPermitido(req)) return notFound(res);
      return serveStatic(res, path.join(ROOT, 'public/mapper.html'));
    }
    const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
    const fp = path.join(ROOT, 'public', safe);
    if (fp.startsWith(path.join(ROOT, 'public'))) return serveStatic(res, fp);
    res.writeHead(404); res.end('404');
  } catch (e) { console.error(e); json(res, 500, { erro: 'erro interno' }); }
});

db.init().finally(() => {
  server.listen(PORT, () => console.log(`Premium Plataforma (convergida/khardela) na porta ${PORT} | migracoes=${db.state.migrationsOk}`));
});
