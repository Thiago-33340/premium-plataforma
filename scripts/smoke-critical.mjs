import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const m = raw.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
}

const baseUrl = (args.get('base-url') || process.env.TITAN_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const userId = args.get('user-id') || process.env.TITAN_SMOKE_USER_ID || '';
const timeoutMs = Number(args.get('timeout-ms') || process.env.TITAN_SMOKE_TIMEOUT_MS || 8000);
const outFile = args.get('out') || process.env.TITAN_SMOKE_OUT || '';

const checks = [];

async function fetchJson(path, opts = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl + path, { ...opts, signal: ac.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    return { res, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function check(name, path, validate = () => true, displayPath = path) {
  const started = Date.now();
  try {
    const { res, json, text } = await fetchJson(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 180)}`);
    const result = validate(json, res);
    if (result !== true) throw new Error(result || 'resposta inválida');
    checks.push({ name, path: displayPath, ok: true, ms: Date.now() - started });
  } catch (err) {
    checks.push({ name, path: displayPath, ok: false, ms: Date.now() - started, error: err.message });
  }
  await delay(50);
}

await check('health', '/api/health', (j) => j && j.ok === true);
await check('estoque dashboard', '/api/est/dashboard', (j) => j && typeof j === 'object' && 'produtos_ativos' in j);
await check('produtos', '/api/est/produtos', (j) => Array.isArray(j?.produtos));
await check('setores', '/api/est/setores', (j) => Array.isArray(j?.setores));
await check('categorias', '/api/est/categorias', (j) => Array.isArray(j?.categorias));
await check('fornecedores', '/api/est/fornecedores', (j) => Array.isArray(j?.fornecedores));
await check('produzidos', '/api/est/producao/produzidos', (j) => Array.isArray(j?.produzidos) && Array.isArray(j?.insumos));
await check('producoes recentes', '/api/est/producoes', (j) => Array.isArray(j?.producoes));
await check('movimentos recentes', '/api/est/movimentos?limit=3', (j) => Array.isArray(j?.movimentos));
await check('contagens recentes', '/api/est/contagens', (j) => Array.isArray(j?.contagens));
await check('mesas', '/api/mesas', (j) => Array.isArray(j?.mesas)
  && j.mesas.every((m) => typeof m.numero === 'number'
    && typeof m.ocupada === 'boolean'
    && typeof m.total === 'number'
    && typeof m.qtd_itens === 'number'));
await check('caixa', '/api/caixa', (j) => j && typeof j.aberto === 'boolean' && 'caixa' in j);
await check('entregadores', '/api/entregadores', (j) => Array.isArray(j?.entregadores)
  && j.entregadores.every((e) => e && 'id' in e && typeof e.nome === 'string' && typeof e.ativo === 'boolean'));

if (userId) {
  await check('permissoes usuário', `/api/est/permissoes?usuario_id=${encodeURIComponent(userId)}`, (j) => j && Array.isArray(j.perms), '/api/est/permissoes?usuario_id=<usuario>');
  await check('meus itens usuário', `/api/est/meus-itens?usuario_id=${encodeURIComponent(userId)}`, (j) => j && Array.isArray(j.itens), '/api/est/meus-itens?usuario_id=<usuario>');
  await check('mapper state', `/api/mapper/state?admin_id=${encodeURIComponent(userId)}`, (j) => j?.ok === true && j.files && Array.isArray(j.files['modules.json']), '/api/mapper/state?admin_id=<gestor>');
} else {
  checks.push({ name: 'permissoes usuário', path: '/api/est/permissoes?usuario_id=...', ok: true, skipped: true, ms: 0, error: 'sem TITAN_SMOKE_USER_ID' });
  checks.push({ name: 'meus itens usuário', path: '/api/est/meus-itens?usuario_id=...', ok: true, skipped: true, ms: 0, error: 'sem TITAN_SMOKE_USER_ID' });
  checks.push({ name: 'mapper state', path: '/api/mapper/state?admin_id=...', ok: true, skipped: true, ms: 0, error: 'sem TITAN_SMOKE_USER_ID' });
}

const failed = checks.filter((c) => !c.ok);
const skipped = checks.filter((c) => c.skipped);

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  mode: 'read_only',
  mutates_data: false,
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
