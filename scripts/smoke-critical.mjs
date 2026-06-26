import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const m = raw.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
}

const baseUrl = (args.get('base-url') || process.env.TITAN_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const toolsBaseUrl = (args.get('tools-base-url') || process.env.TITAN_TOOLS_BASE_URL || '').replace(/\/+$/, '');
let userId = args.get('user-id') || process.env.TITAN_SMOKE_USER_ID || '';
const staffLogin = args.get('staff-login') || process.env.TITAN_SMOKE_STAFF_LOGIN || '';
const staffPin = args.get('staff-pin') || process.env.TITAN_SMOKE_STAFF_PIN || '';
const timeoutMs = Number(args.get('timeout-ms') || process.env.TITAN_SMOKE_TIMEOUT_MS || 8000);
const outFile = args.get('out') || process.env.TITAN_SMOKE_OUT || '';

const checks = [];
let cookieHeader = '';

async function fetchJson(path, opts = {}, origin = baseUrl) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const headers = new Headers(opts.headers || {});
    if (cookieHeader && !headers.has('Cookie')) headers.set('Cookie', cookieHeader);
    const res = await fetch(origin + path, { ...opts, headers, signal: ac.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    return { res, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function check(name, path, validate = () => true, displayPath = path, origin = baseUrl) {
  const started = Date.now();
  try {
    const { res, json, text } = await fetchJson(path, {}, origin);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 180)}`);
    const result = validate(json, res, text);
    if (result !== true) throw new Error(result || 'resposta inválida');
    checks.push({ name, path: displayPath, ok: true, ms: Date.now() - started });
  } catch (err) {
    checks.push({ name, path: displayPath, ok: false, ms: Date.now() - started, error: err.message });
  }
  await delay(50);
}

async function checkStatus(name, path, validate = () => true, displayPath = path, origin = baseUrl) {
  const started = Date.now();
  try {
    const { res, json, text } = await fetchJson(path, {}, origin);
    const result = validate(json, res, text);
    if (result !== true) throw new Error(result || `HTTP ${res.status}: ${text.slice(0, 180)}`);
    checks.push({ name, path: displayPath, ok: true, ms: Date.now() - started });
  } catch (err) {
    checks.push({ name, path: displayPath, ok: false, ms: Date.now() - started, error: err.message });
  }
  await delay(50);
}

async function checkStatusRequest(name, path, opts = {}, validate = () => true, displayPath = path, origin = baseUrl) {
  const started = Date.now();
  try {
    const { res, json, text } = await fetchJson(path, opts, origin);
    const result = validate(json, res, text);
    if (result !== true) throw new Error(result || `HTTP ${res.status}: ${text.slice(0, 180)}`);
    checks.push({ name, path: displayPath, ok: true, ms: Date.now() - started });
  } catch (err) {
    checks.push({ name, path: displayPath, ok: false, ms: Date.now() - started, error: err.message });
  }
  await delay(50);
}

function skip(name, path, error) {
  checks.push({ name, path, ok: true, skipped: true, ms: 0, error });
}

async function staffSmokeLogin() {
  if (!staffLogin || !staffPin) return false;
  const started = Date.now();
  try {
    const { res, json, text } = await fetchJson('/api/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: staffLogin, pin: staffPin, remember: false })
    });
    if (!res.ok || !json?.ok || !json?.usuario?.id) throw new Error(`HTTP ${res.status}: ${text.slice(0, 180)}`);
    const setCookie = res.headers.get('set-cookie') || '';
    cookieHeader = setCookie.split(';')[0] || '';
    userId = userId || json.usuario.id;
    checks.push({ name: 'staff auth smoke', path: '/api/staff/login', ok: true, ms: Date.now() - started });
    return true;
  } catch (err) {
    checks.push({ name: 'staff auth smoke', path: '/api/staff/login', ok: false, ms: Date.now() - started, error: err.message });
    return false;
  }
}

async function checkProtected(name, path, validate = () => true, displayPath = path) {
  if (cookieHeader) return check(name, path, validate, displayPath);
  return checkStatus(name + ' protegido sem sessão', path, (j, res) => res.status === 401 && Boolean(j?.erro), displayPath);
}

await staffSmokeLogin();

await check('health', '/api/health', (j) => j && j.ok === true);
await checkProtected('estoque dashboard', '/api/est/dashboard', (j) => j && typeof j === 'object' && 'produtos_ativos' in j);
await checkProtected('estoque configuracoes tenant', '/api/est/configuracoes', (j) => j && j.config && Array.isArray(j.config.tipos_item));
await checkProtected('produtos', '/api/est/produtos', (j) => Array.isArray(j?.produtos));
await checkProtected('setores', '/api/est/setores', (j) => Array.isArray(j?.setores));
await checkProtected('categorias', '/api/est/categorias', (j) => Array.isArray(j?.categorias));
await checkProtected('fornecedores', '/api/est/fornecedores', (j) => Array.isArray(j?.fornecedores));
await checkProtected('produzidos', '/api/est/producao/produzidos', (j) => Array.isArray(j?.produzidos) && Array.isArray(j?.insumos));
await checkProtected('producoes recentes', '/api/est/producoes', (j) => Array.isArray(j?.producoes));
await checkProtected('movimentos recentes', '/api/est/movimentos?limit=3', (j) => Array.isArray(j?.movimentos));
await checkProtected('contagens recentes', '/api/est/contagens', (j) => Array.isArray(j?.contagens));
await checkProtected('mesas', '/api/mesas', (j) => Array.isArray(j?.mesas)
  && j.mesas.every((m) => typeof m.numero === 'number'
    && typeof m.ocupada === 'boolean'
    && typeof m.total === 'number'
    && typeof m.qtd_itens === 'number'));
await checkProtected('caixa', '/api/caixa', (j) => j && typeof j.aberto === 'boolean' && 'caixa' in j);
await checkProtected('entregadores', '/api/entregadores', (j) => Array.isArray(j?.entregadores)
  && j.entregadores.every((e) => e && 'id' in e && typeof e.nome === 'string' && typeof e.ativo === 'boolean'));

if (toolsBaseUrl) {
  await check('command center html', '/command-center', (_j, _res, text) => text.includes('Titan Command Center'), '/command-center', toolsBaseUrl);
  await check('titan auth me anon', '/api/titan/auth/me', (j) => j?.ok === true && j.usuario === null, '/api/titan/auth/me', toolsBaseUrl);
  await checkStatus('mapper state protegido', '/api/mapper/state', (j, res) => res.status === 401 && Boolean(j?.erro), '/api/mapper/state', toolsBaseUrl);
  await checkStatusRequest('mapper action protegido', '/api/mapper/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_task' })
  }, (j, res) => res.status === 401 && Boolean(j?.erro), '/api/mapper/action', toolsBaseUrl);
} else {
  skip('command center html', '/command-center', 'sem TITAN_TOOLS_BASE_URL');
  skip('titan auth me anon', '/api/titan/auth/me', 'sem TITAN_TOOLS_BASE_URL');
  skip('mapper state protegido', '/api/mapper/state', 'sem TITAN_TOOLS_BASE_URL');
  skip('mapper action protegido', '/api/mapper/action', 'sem TITAN_TOOLS_BASE_URL');
}

if (userId && cookieHeader) {
  await check('permissoes usuário', `/api/est/permissoes?usuario_id=${encodeURIComponent(userId)}`, (j) => j && Array.isArray(j.perms), '/api/est/permissoes?usuario_id=<usuario>');
  await check('meus itens usuário', `/api/est/meus-itens?usuario_id=${encodeURIComponent(userId)}`, (j) => j && Array.isArray(j.itens), '/api/est/meus-itens?usuario_id=<usuario>');
  await check('receitas estoque', `/api/est/receitas?usuario_id=${encodeURIComponent(userId)}&status=todas`, (j) => j && Array.isArray(j.receitas) && j.kpis && typeof j.kpis.total === 'number', '/api/est/receitas?usuario_id=<usuario>&status=todas');
  await check('perdas consumo dashboard', `/api/est/perdas-consumo/dashboard?usuario_id=${encodeURIComponent(userId)}&dias=7`, (j) => j && Array.isArray(j.kpis) && Array.isArray(j.por_produto) && Array.isArray(j.recentes), '/api/est/perdas-consumo/dashboard?usuario_id=<usuario>&dias=7');
  await check('admin estoque do cardapio', `/api/admin/estoque-cardapio?admin_id=${encodeURIComponent(userId)}&limit=5`, (j) => j && Array.isArray(j.itens) && j.kpis && j.mapper?.delivery_direto?.schema_preparado === true, '/api/admin/estoque-cardapio?admin_id=<gestor>&limit=5');
} else {
  const motivo = cookieHeader ? 'sem TITAN_SMOKE_USER_ID' : 'sem TITAN_SMOKE_STAFF_LOGIN/TITAN_SMOKE_STAFF_PIN';
  skip('permissoes usuário', '/api/est/permissoes?usuario_id=...', motivo);
  skip('meus itens usuário', '/api/est/meus-itens?usuario_id=...', motivo);
  skip('receitas estoque', '/api/est/receitas?usuario_id=...', motivo);
  skip('perdas consumo dashboard', '/api/est/perdas-consumo/dashboard?usuario_id=...', motivo);
  skip('admin estoque do cardapio', '/api/admin/estoque-cardapio?admin_id=...', motivo);
}

const failed = checks.filter((c) => !c.ok);
const skipped = checks.filter((c) => c.skipped);

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  tools_base_url: toolsBaseUrl || null,
  mode: 'read_only',
  mutates_data: false,
  staff_auth: Boolean(cookieHeader),
  total: checks.length,
  executed: checks.length - skipped.length,
  skipped: skipped.length,
  failed: failed.length,
  ok: failed.length === 0,
  checks
};

if (outFile) {
  const full = path.resolve(process.cwd(), outFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

console.log(`Smoke read-only em ${baseUrl}`);
for (const c of checks) {
  const mark = c.skipped ? 'SKIP' : c.ok ? 'OK  ' : 'FAIL';
  console.log(`${mark} ${String(c.ms).padStart(5)}ms ${c.name} ${c.path}${c.error ? ` — ${c.error}` : ''}`);
}

if (failed.length) {
  console.error(`\nFalhou: ${failed.length}/${checks.length} checks.`);
  if (outFile) console.error(`Relatório salvo em: ${outFile}`);
  process.exit(1);
}

console.log(`\nBlindagem read-only OK: ${checks.length - skipped.length}/${checks.length} checks executados.`);
if (outFile) console.log(`Relatório salvo em: ${outFile}`);
