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
function jsonComHeaders(res, code, obj, headers) {
  const b = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }, headers || {}));
  res.end(b);
}
const APP_VERSION_CACHE = {};
function publicFileVersion(rel) {
  const fp = path.join(ROOT, 'public', rel);
  const st = fs.statSync(fp);
  const key = rel;
  const cached = APP_VERSION_CACHE[key];
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.value;
  const hash = crypto.createHash('sha1').update(fs.readFileSync(fp)).digest('hex').slice(0, 14);
  const value = { file: rel, version: hash, mtime: st.mtime.toISOString(), size: st.size };
  APP_VERSION_CACHE[key] = { mtimeMs: st.mtimeMs, size: st.size, value };
  return value;
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); }); }

const TITAN_TOOL_PERMS = ['acesso_total', 'command_center', 'mapper', 'ver_project_state', 'editar_project_state', 'acionar_deploy', 'gerenciar_usuarios'];
const TITAN_TOOL_SESSION_COOKIE = 'tt_session';
function normEmail(v) { return String(v || '').trim().toLowerCase(); }
function emailValido(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(v)); }
function senhaForte(s) { return typeof s === 'string' && s.length >= 8 && /[A-ZÁÀÂÃÉÈÊÍÓÔÕÚÇ]/.test(s) && /\d/.test(s) && /[^A-Za-z0-9]/.test(s); }
function senhaMsg() { return 'A senha precisa ter no mínimo 8 caracteres, com pelo menos uma letra maiúscula, um número e um símbolo.'; }
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function cookieSeguro(req) {
  return String(req.headers['x-forwarded-proto'] || '').includes('https') || !['localhost', '127.0.0.1'].includes(reqHost(req));
}
function sessionCookie(req, token, maxAge) {
  const parts = [`${TITAN_TOOL_SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (cookieSeguro(req)) parts.push('Secure');
  if (maxAge) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}
function clearSessionCookie(req) {
  const parts = [`${TITAN_TOOL_SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (cookieSeguro(req)) parts.push('Secure');
  return parts.join('; ');
}
function tokenHash(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }
function userPublico(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, nome: u.nome || '', permissoes: u.permissoes || [], acesso_total: (u.permissoes || []).includes('acesso_total') };
}
function titanTemPerm(u, perm) {
  const perms = u && Array.isArray(u.permissoes) ? u.permissoes : [];
  return perms.includes('acesso_total') || perms.includes(perm);
}
function titanPermissoes(raw) {
  const src = Array.isArray(raw) ? raw : [];
  let out = src.map(p => String(p || '').trim()).filter(p => TITAN_TOOL_PERMS.includes(p));
  out = Array.from(new Set(out));
  if (out.includes('acesso_total')) return TITAN_TOOL_PERMS.slice();
  return out.length ? out : ['command_center', 'mapper', 'ver_project_state'];
}
async function titanToolSession(req) {
  const token = parseCookies(req)[TITAN_TOOL_SESSION_COOKIE];
  if (!token) return null;
  try {
    const r = await db.q(`SELECT u.id,u.email,u.nome,u.permissoes,s.id AS session_id
      FROM titan_tool_sessions s
      JOIN titan_tool_users u ON u.id=s.user_id AND u.tenant_id=s.tenant_id
      WHERE s.tenant_id=$1::varchar AND s.token_hash=$2 AND s.expira_em>NOW() AND u.ativo`, [TENANT, tokenHash(token)]);
    const u = r.rows[0];
    if (!u) return null;
    db.q('UPDATE titan_tool_sessions SET visto_em=NOW() WHERE id=$1', [u.session_id]).catch(() => {});
    return u;
  } catch (e) { return null; }
}
async function criarTitanSession(req, user, remember) {
  const token = crypto.randomBytes(32).toString('base64url');
  const dias = remember ? 30 : 0;
  const horas = remember ? 24 * 30 : 12;
  await db.q(`INSERT INTO titan_tool_sessions (tenant_id,user_id,token_hash,remember,ip,user_agent,expira_em)
    VALUES ($1::varchar,$2,$3,$4,$5,$6,NOW()+($7 || ' hours')::interval)`, [
      TENANT, user.id, tokenHash(token), !!remember,
      String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').slice(0, 120),
      String(req.headers['user-agent'] || '').slice(0, 240),
      String(horas)
    ]);
  return { token, cookie: sessionCookie(req, token, dias ? dias * 24 * 60 * 60 : null) };
}
async function requerTitanSession(req, res, perm) {
  if (!hostFerramentasPermitido(req)) { notFound(res); return null; }
  const u = await titanToolSession(req);
  if (!u) { json(res, 401, { erro: 'Faça login no Titan Tools.' }); return null; }
  if (perm && !titanTemPerm(u, perm)) { json(res, 403, { erro: 'Sem permissão para esta ferramenta.' }); return null; }
  return u;
}

const PROJECT_STATE_FILES = [
  'modules.json', 'routes.json', 'services.json', 'containers.json', 'databases.json',
  'tasks.json', 'risks.json', 'dependencies.json', 'decisions.json', 'roadmap.json',
  'weekly-focus.json', 'deploys.json', 'incidents.json', 'health-checks.json',
  'rbac-audit.json', 'people.json', 'module-route-table-map.json', 'api-contracts-critical.json',
  'test-matrix.json', 'agent-workflow.json', 'stock-command-step2.json', 'stock-readiness.json',
  'agent-bridge.json', 'agent-reports.json', 'local-agent-queue.json', 'command-audit-log.json'
];
const PROJECT_STATE_MUTABLE_FILES = new Set(['tasks.json', 'risks.json', 'decisions.json', 'deploys.json', 'agent-reports.json', 'local-agent-queue.json', 'command-audit-log.json']);
const PROJECT_STATE_DIR = path.join(ROOT, 'project-state');
async function gestorBasico(uid) {
  if (!uid) return null;
  try {
    const u = await rbacUserByRef(uid);
    return u && perfilGestor(u) ? u : null;
  } catch (e) { return null; }
}
function jsonObjeto(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {}
  }
  return {};
}
function upsertCommandItem(lista, item, substituir) {
  if (!Array.isArray(lista) || !item || !item.id) return;
  const idx = lista.findIndex(x => String(x && x.id) === String(item.id));
  if (idx < 0) lista.push(item);
  else if (substituir) lista[idx] = Object.assign({}, lista[idx], item);
}
function aplicarCommandActionsNoState(files, actions) {
  if (!files || !Array.isArray(actions) || !actions.length) return files;
  const tasks = Array.isArray(files['tasks.json']) ? files['tasks.json'] : [];
  const risks = Array.isArray(files['risks.json']) ? files['risks.json'] : [];
  const decisions = Array.isArray(files['decisions.json']) ? files['decisions.json'] : [];
  const deploys = Array.isArray(files['deploys.json']) ? files['deploys.json'] : [];
  const agentReports = Array.isArray(files['agent-reports.json']) ? files['agent-reports.json'] : [];
  const localAgentQueue = jsonObjeto(files['local-agent-queue.json']);
  localAgentQueue.tasks = Array.isArray(localAgentQueue.tasks) ? localAgentQueue.tasks : [];
  const auditLog = Array.isArray(files['command-audit-log.json']) ? files['command-audit-log.json'] : [];

  for (const row of actions) {
    const result = jsonObjeto(row.result);
    const target = jsonObjeto(result.target);
    const audit = jsonObjeto(result.audit);
    if (row.action === 'create_task' && target.id) upsertCommandItem(tasks, target, false);
    if (row.action === 'update_task' && target.id) upsertCommandItem(tasks, target, true);
    if (row.action === 'create_risk' && target.id) upsertCommandItem(risks, target, false);
    if (row.action === 'create_decision' && target.id) upsertCommandItem(decisions, target, false);
    if (row.action === 'create_deploy_record' && target.id) upsertCommandItem(deploys, target, false);
    if (row.action === 'approve_deploy_record' && target.id) upsertCommandItem(deploys, target, true);
    if (row.action === 'trigger_deploy_external' && target.id) upsertCommandItem(deploys, target, true);
    if (row.action === 'create_agent_report' && target.id) upsertCommandItem(agentReports, target, false);
    if (row.action === 'create_local_agent_task' && target.id) upsertCommandItem(localAgentQueue.tasks, target, false);
    if (row.action === 'update_local_agent_task' && target.id) upsertCommandItem(localAgentQueue.tasks, target, true);
    if (audit.id) upsertCommandItem(auditLog, audit, false);
  }
  files['tasks.json'] = tasks;
  files['risks.json'] = risks;
  files['decisions.json'] = decisions;
  files['deploys.json'] = deploys;
  files['agent-reports.json'] = agentReports;
  files['local-agent-queue.json'] = localAgentQueue;
  files['command-audit-log.json'] = auditLog
    .sort((a, b) => String(a.criado_em || '').localeCompare(String(b.criado_em || '')))
    .slice(-500);
  return files;
}
async function lerCommandActionsDb() {
  try {
    const r = await db.q(`SELECT id::text, action, target_file, target_id, payload, result,
             usuario_email, usuario_nome, criado_em
        FROM titan_command_actions
       WHERE tenant_id=$1::varchar
       ORDER BY criado_em ASC, id ASC
       LIMIT 1000`, [TENANT]);
    return r.rows.map(row => ({
      id: row.id,
      criado_em: row.criado_em,
      action: row.action,
      target_file: row.target_file,
      target_id: row.target_id,
      usuario_email: row.usuario_email,
      usuario_nome: row.usuario_nome,
      payload: jsonObjeto(row.payload),
      result: jsonObjeto(row.result)
    }));
  } catch (e) {
    return [];
  }
}
function payloadCommandSeguro(payload) {
  const out = {};
  for (const [k, v] of Object.entries(payload && typeof payload === 'object' ? payload : {})) {
    if (/senha|password|token|secret|chave|key|cert/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}
async function persistirCommandActionDb(user, action, payload, targetFile, targetId, target, audit) {
  try {
    const r = await db.q(`INSERT INTO titan_command_actions
        (tenant_id, action, target_file, target_id, payload, result, usuario_id, usuario_email, usuario_nome)
      VALUES ($1::varchar,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)
      RETURNING id::text, criado_em`,
      [
        TENANT,
        action,
        targetFile,
        targetId || null,
        JSON.stringify(payloadCommandSeguro(payload)),
        JSON.stringify({ target, audit }),
        user.id,
        user.email,
        user.nome || user.email
      ]);
    return { ok: true, id: r.rows[0].id, criado_em: r.rows[0].criado_em };
  } catch (e) {
    console.warn('[command-action-db] falha ao persistir ação auditada:', e.code || e.message);
    return { ok: false };
  }
}
async function lerProjectStateSeguro() {
  const out = {};
  for (const file of PROJECT_STATE_FILES) {
    try {
      const full = projectStatePath(file, false);
      out[file] = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      out[file] = { erro: e.message };
    }
  }
  const commandActions = await lerCommandActionsDb();
  out['command-db-actions.json'] = commandActions;
  aplicarCommandActionsNoState(out, commandActions);
  return out;
}
function projectStatePath(file, writable) {
  const name = path.basename(String(file || ''));
  if (!PROJECT_STATE_FILES.includes(name)) throw new Error('Arquivo de estado não permitido.');
  if (writable && !PROJECT_STATE_MUTABLE_FILES.has(name)) throw new Error('Arquivo de estado não gravável pelo Command.');
  const full = path.join(PROJECT_STATE_DIR, name);
  const rel = path.relative(PROJECT_STATE_DIR, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Caminho de estado inválido.');
  return full;
}
function lerProjectJson(file, fallback) {
  const full = projectStatePath(file, false);
  try { return JSON.parse(fs.readFileSync(full, 'utf8')); } catch { return fallback; }
}
function gravarProjectJson(file, data) {
  const full = projectStatePath(file, true);
  const tmp = `${full}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, full);
}
function textoLimpo(v, max) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max || 240);
}
function normStatus(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .trim();
}
function listaLimpa(v, maxItems) {
  const arr = Array.isArray(v) ? v : String(v || '').split(',');
  return arr.map(x => textoLimpo(x, 80)).filter(Boolean).slice(0, maxItems || 8);
}
function listaLinhasLimpa(v, maxItems, maxLen) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/[\n;,]+/);
  return arr.map(x => textoLimpo(x, maxLen || 180)).filter(Boolean).slice(0, maxItems || 12);
}
function slugCurto(v, fallback) {
  const s = String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return s || fallback || 'registro';
}
function proximoDeployId(deploys, titulo) {
  const base = `deploy-${dataSP()}-${slugCurto(titulo, 'command')}`;
  const usados = new Set((Array.isArray(deploys) ? deploys : []).map(d => String(d && d.id || '')));
  if (!usados.has(base)) return base;
  for (let i = 2; i < 200; i++) {
    const id = `${base}-${i}`;
    if (!usados.has(id)) return id;
  }
  return `${base}-${Date.now()}`;
}
function fraseConfirmacaoOk(v) {
  return String(v || '').trim().toUpperCase() === 'AUTORIZO DEPLOY';
}
function fraseAcionamentoOk(v) {
  return String(v || '').trim().toUpperCase() === 'ACIONAR DEPLOY';
}
function deployWebhookUrl() {
  return String(process.env.TITAN_DEPLOY_WEBHOOK_URL || process.env.EASYPANEL_DEPLOY_WEBHOOK_URL || '').trim();
}
function localAgentTokenRaw() {
  return String(process.env.TITAN_LOCAL_AGENT_TOKEN || '').trim();
}
function localAgentTokenSha256() {
  return String(process.env.TITAN_LOCAL_AGENT_TOKEN_SHA256 || '').trim().toLowerCase();
}
function localAgentConfigured() {
  return !!(localAgentTokenRaw() || localAgentTokenSha256());
}
function localAgentRuntimePublico() {
  return {
    local_agent_configured: localAgentConfigured(),
    local_agent_auth: localAgentConfigured() ? 'bearer_token' : 'not_configured',
    local_agent_default_id: process.env.TITAN_LOCAL_AGENT_DEFAULT_ID || 'thiago-windows-codex',
    local_agent_actions: ['codex_handoff', 'claude_handoff', 'git_status', 'project_checks', 'open_command_center']
  };
}
function bearerToken(req) {
  const h = String(req.headers.authorization || '');
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : String(req.headers['x-titan-local-agent-token'] || '').trim();
}
function safeCompare(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (!ba.length || !bb.length || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function localAgentAuthOk(req) {
  const token = bearerToken(req);
  if (!token || !localAgentConfigured()) return false;
  const raw = localAgentTokenRaw();
  if (raw && safeCompare(token, raw)) return true;
  const hash = localAgentTokenSha256();
  if (hash) return safeCompare(crypto.createHash('sha256').update(token).digest('hex'), hash);
  return false;
}
function requerLocalAgent(req, res) {
  if (!hostFerramentasPermitido(req)) { notFound(res); return false; }
  if (!localAgentConfigured()) { json(res, 409, { erro: 'Titan Local Agent não configurado no ambiente do serviço.' }); return false; }
  if (!localAgentAuthOk(req)) { json(res, 401, { erro: 'Token do Titan Local Agent inválido ou ausente.' }); return false; }
  return true;
}
const LOCAL_AGENT_ACTIONS = new Set(['codex_handoff', 'claude_handoff', 'git_status', 'project_checks', 'open_command_center']);
function normalizarLocalAgentTask(raw, gestor) {
  const action = textoLimpo(raw.local_action || raw.agent_action || raw.acao_local || 'codex_handoff', 80);
  const titulo = textoLimpo(raw.titulo || raw.title, 180);
  if (!titulo) throw new Error('Informe um título para a tarefa do agente local.');
  if (!LOCAL_AGENT_ACTIONS.has(action)) throw new Error('Ação local não permitida nesta versão.');
  const prompt = String(raw.prompt || raw.detalhe || raw.proximo_passo || '').trim().slice(0, 12000);
  if (!prompt && ['codex_handoff', 'claude_handoff'].includes(action)) throw new Error('Informe o briefing/prompt para enviar ao agente local.');
  if (promptContemPossivelSegredo(prompt)) throw new Error('O prompt parece conter segredo/token/senha. Remova dados sensíveis antes de enviar ao agente local.');
  return {
    id: null,
    agent_id: textoLimpo(raw.agent_id || raw.local_agent_id || process.env.TITAN_LOCAL_AGENT_DEFAULT_ID || 'thiago-windows-codex', 120),
    action,
    titulo,
    prompt,
    status: 'pendente',
    prioridade: textoLimpo(raw.prioridade, 40) || 'alta',
    origem: 'Command Center',
    criado_via_command: true,
    criado_por: gestor.email,
    criado_por_nome: gestor.nome || gestor.email,
    criado_em: new Date().toISOString(),
    logs: []
  };
}
function proximoLocalAgentTaskId(queue) {
  return proximoId(Array.isArray(queue && queue.tasks) ? queue.tasks : [], 'local-agent-task-', 3);
}
function commandAiConfig(providerPedido) {
  const anthropicKey = String(process.env.TITAN_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '').trim();
  const openaiKey = String(process.env.TITAN_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  let provider = String(providerPedido || process.env.TITAN_AI_PROVIDER || 'auto').trim().toLowerCase();
  if (provider === 'claude') provider = 'anthropic';
  if (!provider || provider === 'auto') provider = anthropicKey ? 'anthropic' : (openaiKey ? 'openai' : '');
  const key = provider === 'anthropic' ? anthropicKey : (provider === 'openai' ? openaiKey : '');
  const model = String(process.env.TITAN_AI_MODEL || (provider === 'anthropic' ? (process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest') : (process.env.OPENAI_MODEL || 'gpt-4o-mini'))).trim();
  const maxTokens = Math.max(500, Math.min(6000, Number(process.env.TITAN_AI_MAX_TOKENS || 2200) || 2200));
  return { provider, key, model, maxTokens, configured: !!(provider && key) };
}
function commandAiRuntimePublico() {
  const cfg = commandAiConfig();
  return {
    ai_console_configured: cfg.configured,
    ai_console_provider: cfg.configured ? cfg.provider : 'not_configured',
    ai_console_model: cfg.configured ? cfg.model : '',
    ai_console_requires_permission: 'editar_project_state'
  };
}
function deployRuntimePublico() {
  return {
    deploy_external_configured: !!deployWebhookUrl(),
    deploy_external_provider: deployWebhookUrl() ? 'env' : 'not_configured',
    deploy_external_requires_phrase: 'ACIONAR DEPLOY',
    ...localAgentRuntimePublico(),
    ...commandAiRuntimePublico()
  };
}
function promptContemPossivelSegredo(prompt) {
  const s = String(prompt || '');
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(s)
    || /\b(sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/.test(s)
    || /\b(api[_-]?key|senha|password|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{12,}/i.test(s);
}
function commandAiContextoSistema(assignmentId) {
  const bridge = lerProjectJson('agent-bridge.json', {});
  const workflow = lerProjectJson('agent-workflow.json', {});
  const assignments = Array.isArray(bridge.active_assignments) ? bridge.active_assignments : [];
  const assignment = assignments.find(a => String(a.id) === String(assignmentId)) || assignments[0] || null;
  const promptWorkflow = textoLimpo(workflow.prompt || workflow.handoff_prompt || workflow.claude_prompt, 1600);
  return [
    'Você é um agente de IA trabalhando dentro do Titan Command Center.',
    'Responda em português do Brasil, com clareza operacional, priorizando decisões, riscos, critérios de aceite e próximos passos práticos.',
    'Não invente dados. Quando faltar contexto, diga exatamente o que precisa ser verificado.',
    'Não peça, copie, gere nem exponha chaves, tokens, senhas, certificados ou dados sensíveis.',
    'Regra de papéis: Claude/IA avalia, calcula e revisa; Codex implementa e publica; Thiago/Tassiano aprovam decisões de produto e operação.',
    promptWorkflow ? `Prompt operacional do workflow: ${promptWorkflow}` : '',
    bridge.purpose ? `Agent Bridge: ${textoLimpo(bridge.purpose, 1000)}` : '',
    assignment ? `Missão selecionada: ${JSON.stringify({
      id: assignment.id,
      agent: assignment.agent,
      title: assignment.title,
      objective: assignment.objective,
      priority: assignment.priority,
      must_read: assignment.must_read,
      expected_output: assignment.expected_output
    })}` : 'Nenhuma missão ativa selecionada.'
  ].filter(Boolean).join('\n\n');
}
async function chamarCommandAi({ provider, prompt, assignmentId, user }) {
  const cfg = commandAiConfig(provider);
  if (!cfg.configured) {
    return { ok: false, status: 409, erro: 'IA do Command não configurada. Defina TITAN_ANTHROPIC_API_KEY ou TITAN_OPENAI_API_KEY no ambiente do serviço.' };
  }
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) return { ok: false, status: 400, erro: 'Escreva um prompt para enviar à IA.' };
  if (cleanPrompt.length > 16000) return { ok: false, status: 400, erro: 'Prompt muito longo. Limite atual: 16.000 caracteres.' };
  if (promptContemPossivelSegredo(cleanPrompt)) return { ok: false, status: 400, erro: 'O prompt parece conter segredo/token/senha. Remova dados sensíveis antes de enviar para IA externa.' };

  const system = commandAiContextoSistema(assignmentId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    let resposta = '';
    let usage = null;
    if (cfg.provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.key,
          'anthropic-version': '2023-06-01',
          'User-Agent': 'Titan-Command-Center'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: cfg.maxTokens,
          temperature: 0.2,
          system,
          messages: [{ role: 'user', content: cleanPrompt }]
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, status: 502, erro: 'IA falhou: ' + (j.error ? j.error.message : ('HTTP ' + r.status)) };
      resposta = Array.isArray(j.content) ? j.content.map(c => c && c.type === 'text' ? c.text : '').filter(Boolean).join('\n\n') : '';
      usage = j.usage || null;
    } else if (cfg.provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.key,
          'User-Agent': 'Titan-Command-Center'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.2,
          max_tokens: cfg.maxTokens,
          messages: [{ role: 'system', content: system }, { role: 'user', content: cleanPrompt }]
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, status: 502, erro: 'IA falhou: ' + (j.error ? j.error.message : ('HTTP ' + r.status)) };
      resposta = j.choices && j.choices[0] && j.choices[0].message ? String(j.choices[0].message.content || '') : '';
      usage = j.usage || null;
    } else {
      return { ok: false, status: 409, erro: 'Provider de IA inválido. Use auto, anthropic/claude ou openai.' };
    }
    resposta = String(resposta || '').trim();
    const audit = registrarCommandAudit(user, 'send_agent_prompt', 'command-audit-log.json', 'ai-console', `Prompt enviado para IA do Command (${cfg.provider})`, {
      provider: cfg.provider,
      model: cfg.model,
      assignment_id: assignmentId || null,
      prompt_chars: cleanPrompt.length,
      resposta_chars: resposta.length
    });
    const dbAction = await persistirCommandActionDb(user, 'send_agent_prompt', {
      action: 'send_agent_prompt',
      provider: cfg.provider,
      model: cfg.model,
      assignment_id: assignmentId || null,
      prompt_chars: cleanPrompt.length
    }, 'command-audit-log.json', audit.id, { id: audit.id, provider: cfg.provider, model: cfg.model }, audit);
    return {
      ok: true,
      provider: cfg.provider,
      model: cfg.model,
      resposta,
      usage,
      assignment_id: assignmentId || null,
      audit,
      persisted_db: dbAction.ok,
      db_action_id: dbAction.id || null
    };
  } catch (e) {
    return { ok: false, status: 502, erro: e.name === 'AbortError' ? 'A IA demorou demais para responder.' : ('Erro ao chamar IA: ' + (e.message || e)) };
  } finally {
    clearTimeout(timer);
  }
}
async function acionarDeployWebhookSeguro(deploy, user) {
  const url = deployWebhookUrl();
  if (!url) return { configured: false, ok: false, status: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const method = String(process.env.TITAN_DEPLOY_WEBHOOK_METHOD || 'POST').toUpperCase();
  const payload = JSON.stringify({
    source: 'titan-command-center',
    tenant_id: TENANT,
    deploy_id: deploy.id,
    branch: deploy.branch || 'main',
    commit: deploy.merge_commit || '',
    requested_by: user.email,
    requested_at: new Date().toISOString()
  });
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Titan-Command-Center' },
      signal: controller.signal
    };
    if (method !== 'GET' && method !== 'HEAD') opts.body = payload;
    const res = await fetch(url, opts);
    return { configured: true, ok: res.ok, status: res.status };
  } catch (e) {
    return { configured: true, ok: false, status: null, erro: e.name === 'AbortError' ? 'timeout' : 'request_failed' };
  } finally {
    clearTimeout(timer);
  }
}
function dataSP() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date()).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function proximoId(lista, prefixo, pad) {
  const re = new RegExp(`^${prefixo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  let max = 0;
  for (const item of Array.isArray(lista) ? lista : []) {
    const m = re.exec(String(item.id || ''));
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return prefixo + String(max + 1).padStart(pad || 3, '0');
}
function registrarCommandAudit(user, action, targetFile, targetId, resumo, extra) {
  const log = lerProjectJson('command-audit-log.json', []);
  const entry = {
    id: `command-log-${Date.now()}`,
    criado_em: new Date().toISOString(),
    usuario_id: user.id,
    usuario_email: user.email,
    usuario_nome: user.nome || user.email,
    action,
    target_file: targetFile,
    target_id: targetId || null,
    resumo: textoLimpo(resumo, 500),
    extra: extra && typeof extra === 'object' ? extra : {}
  };
  log.push(entry);
  gravarProjectJson('command-audit-log.json', log.slice(-500));
  return entry;
}

/* ===== Permissões do Estoque (configuráveis por usuário) ===== */
const EST_PERMS = ['acessar_estoque_premium_rp', 'acessar_produtos', 'acessar_categorias', 'acessar_fornecedores', 'acessar_visitas', 'acessar_mapa_comparativo_fornecedores', 'acessar_lista_compras_inteligente', 'acessar_contagem', 'acessar_auditoria', 'acessar_producao_interna', 'acessar_lancamentos', 'acessar_configuracoes', 'ver_valores', 'ver_maior_valor_pago', 'editar_produtos', 'editar_categorias', 'registrar_compra', 'registrar_perda_consumo', 'registrar_visita', 'fazer_contagem', 'auditar_contagem', 'aprovar_contagem', 'reprovar_contagem', 'exportar_dados', 'criar_usuarios', 'editar_permissoes'];
const EST_PERMS_COLAB = ['acessar_estoque_premium_rp', 'acessar_contagem', 'fazer_contagem'];
function perfisUsuario(u) { return [u && u.perfil_principal].concat((u && u.perfis_adicionais) || []).map(x => String(x || '').trim().toUpperCase()).filter(Boolean); }
function perfilGestor(u) { return perfisUsuario(u).some(p => p === 'GESTOR' || p === 'GERENTE' || p.startsWith('GESTOR') || p.startsWith('GERENTE')); }
function staffUsuarioPublico(col) {
  const perfis = perfisUsuario(col);
  const ehGarcom = perfis.includes('GARCOM');
  const ehGestor = perfilGestor(col) || perfis.some(p => ['CHEFE_COZINHA', 'OPERADOR_ATENDIMENTO'].includes(p));
  return {
    id: col.id,
    nome: col.nome,
    perfil: col.perfil_principal,
    login: col.apelido_login,
    setores_permitidos: setoresPermitidosLista(col.setores_permitidos),
    pode_mesas: ehGarcom || ehGestor,
    pode_gestor: ehGestor,
    so_mesas: ehGarcom && !ehGestor,
    pode_admin: perfilGestor(col)
  };
}
function setoresPermitidosLista(v) {
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (v == null) return [];
  return String(v).replace(/[{}"]/g, '').split(',').map(s => s.trim()).filter(Boolean);
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function rbacUserByRef(ref) {
  const v = String(ref || '').trim();
  if (!v) return null;
  const cols = 'id, nome, apelido_login, setores_permitidos, perfil_principal, perfis_adicionais';
  const r = UUID_RE.test(v)
    ? await db.q(`SELECT ${cols}
        FROM rbac_contacts
        WHERE tenant_id=$2 AND ativo AND (id=$1::uuid OR lower(COALESCE(apelido_login,''))=lower($3) OR lower(split_part(COALESCE(nome,''),' ',1))=lower($3))
        ORDER BY CASE WHEN id=$1::uuid THEN 0 WHEN lower(COALESCE(apelido_login,''))=lower($3) THEN 1 ELSE 2 END, nome
        LIMIT 1`, [v, TENANT, v])
    : await db.q(`SELECT ${cols}
        FROM rbac_contacts
        WHERE tenant_id=$2 AND ativo AND (lower(COALESCE(apelido_login,''))=lower($1) OR lower(split_part(COALESCE(nome,''),' ',1))=lower($1))
        ORDER BY CASE WHEN lower(COALESCE(apelido_login,''))=lower($1) THEN 0 ELSE 1 END, nome
        LIMIT 1`, [v, TENANT]);
  return r.rows[0] || null;
}
async function estPermsEfetivas(uid) {
  if (!uid) return { user: null, perms: [], gestor: false };
  let u; try { u = await rbacUserByRef(uid); } catch (e) { return { user: null, perms: [], gestor: false }; }
  if (!u) return { user: null, perms: [], gestor: false };
  const gestor = perfilGestor(u);
  if (gestor) return { user: u, perms: EST_PERMS.slice(), gestor: true };
  let ex = []; try { ex = (await db.q(`SELECT permissao FROM est_permissao WHERE tenant_id=$1 AND usuario_id=$2`, [TENANT, u.id])).rows; } catch (e) {}
  if (ex.some(r => r.permissao === '__configured__')) return { user: u, perms: ex.map(r => r.permissao).filter(p => p !== '__configured__'), gestor: false };
  return { user: u, perms: EST_PERMS_COLAB.slice(), gestor: false };
}
async function estPode(uid, perm) { const e = await estPermsEfetivas(uid); return e.gestor || e.perms.includes(perm); }
function estPodeMovimento(e) {
  return !!(e && e.user && (e.gestor || e.perms.includes('acessar_lancamentos') || e.perms.includes('registrar_perda_consumo')));
}
async function estPodeMovimentoUid(uid) {
  return estPodeMovimento(await estPermsEfetivas(uid));
}
function estNormLogin(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
function estEhThiago(u) {
  const login = estNormLogin(u && u.apelido_login);
  const primeiroNome = estNormLogin(u && u.nome).split(/\s+/)[0];
  return login === 'thiago' || primeiroNome === 'thiago';
}
async function estAcessoThiago(uid) {
  const e = await estPermsEfetivas(uid);
  return e.user && estEhThiago(e.user) ? e : null;
}
async function estEnsureGeraisSetor(client) {
  const q = client ? client.query.bind(client) : db.q;
  const r = await q(`INSERT INTO est_setor (tenant_id, nome, ordem, ativo)
    VALUES ($1,'Gerais',10,TRUE)
    ON CONFLICT (tenant_id, nome) DO UPDATE SET ativo=TRUE
    RETURNING id`, [TENANT]);
  return r.rows[0].id;
}
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
async function estSyncReceitaCompat(client, produtoId, fichaId) {
  await client.query('UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id=$1 AND produto_id=$2', [TENANT, produtoId]);
  const po = await client.query(`SELECT id,rendimento
    FROM est_ficha_porcao
    WHERE tenant_id=$1 AND ficha_id=$2 AND ativo
    ORDER BY ordem,id
    LIMIT 1`, [TENANT, fichaId]);
  if (!po.rows[0]) return { espelho: 0 };
  const itens = await client.query(`SELECT insumo_produto_id,quantidade,unidade,observacao
    FROM est_ficha_porcao_item
    WHERE tenant_id=$1 AND porcao_id=$2
    ORDER BY ordem,id`, [TENANT, po.rows[0].id]);
  let espelho = 0;
  for (const it of itens.rows) {
    const ex = await client.query('SELECT id FROM est_producao_receita WHERE tenant_id=$1 AND produto_id=$2 AND insumo_produto_id=$3', [TENANT, produtoId, it.insumo_produto_id]);
    if (ex.rows[0]) await client.query('UPDATE est_producao_receita SET quantidade_por_unidade=$2,unidade=$3,rendimento=$4,observacao=$5,ativo=TRUE WHERE id=$1', [ex.rows[0].id, it.quantidade, it.unidade, Number(po.rows[0].rendimento), it.observacao]);
    else await client.query('INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,observacao,ativo) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)', [TENANT, produtoId, it.insumo_produto_id, it.quantidade, it.unidade, Number(po.rows[0].rendimento), it.observacao]);
    espelho++;
  }
  return { espelho };
}

/* ===== Estoque config-first + inventário vendável do cardápio =====
   Regras decision-018:
   - valores configuráveis vêm de tenants.config, com defaults neutros;
   - produtos/opcoes continuam sendo a fonte do item vendável;
   - quantidade vendável fica separada do saldo operacional de est_produto;
   - mapper DD fica preparado em meta, sem sync. */
const ESTOQUE_CONFIG_DEFAULTS = {
  titulo: 'Estoque',
  departamentos: [],
  unidades_medida: [
    { valor: 'UNIDADE', rotulo: 'UNIDADE' },
    { valor: 'KG', rotulo: 'KG' },
    { valor: 'G', rotulo: 'G' },
    { valor: 'LITRO', rotulo: 'LITRO' },
    { valor: 'ML', rotulo: 'ML' },
    { valor: 'PACOTE', rotulo: 'PACOTE' },
    { valor: 'CAIXA', rotulo: 'CAIXA' },
    { valor: 'BALDE', rotulo: 'BALDE' },
    { valor: 'BISNAGA', rotulo: 'BISNAGA' },
    { valor: 'ROLO', rotulo: 'ROLO' },
    { valor: 'ROLOS', rotulo: 'ROLOS' },
    { valor: 'GALAO', rotulo: 'GALAO' },
    { valor: 'SACHE', rotulo: 'SACHE' },
    { valor: 'LATA', rotulo: 'LATA' },
    { valor: 'VIDRO', rotulo: 'VIDRO' },
    { valor: 'PECA', rotulo: 'PECA' },
    { valor: 'BANDEJA', rotulo: 'BANDEJA' },
    { valor: 'MACO', rotulo: 'MACO' }
  ],
  tipos_item: [
    { valor: 'insumo', rotulo: 'Insumo' },
    { valor: 'produzido internamente', rotulo: 'Produzido internamente' },
    { valor: 'semiacabado', rotulo: 'Semiacabado' },
    { valor: 'embalagem', rotulo: 'Embalagem' },
    { valor: 'bebida', rotulo: 'Bebida' },
    { valor: 'material de limpeza', rotulo: 'Material de limpeza' },
    { valor: 'higiene', rotulo: 'Higiene' },
    { valor: 'utensílio', rotulo: 'Utensílio' },
    { valor: 'material de escritório', rotulo: 'Material de escritório' },
    { valor: 'revenda', rotulo: 'Revenda' },
    { valor: 'outro', rotulo: 'Outro' }
  ]
};
const DD_STATUS_FROM_TITAN = { ATIVO: 'ACTIVE', EM_FALTA: 'SHORT_SUPPLY', OCULTO: 'HIDDEN' };
const TITAN_STATUS_FROM_ANY = { ACTIVE: 'ATIVO', SHORT_SUPPLY: 'EM_FALTA', HIDDEN: 'OCULTO', ATIVO: 'ATIVO', EM_FALTA: 'EM_FALTA', OCULTO: 'OCULTO' };

function cfgOpt(v, rotulo) {
  if (v && typeof v === 'object') {
    const valor = String(v.valor ?? v.value ?? v.id ?? v.nome ?? '').trim();
    const label = String(v.rotulo ?? v.label ?? v.nome ?? valor).trim();
    return valor ? { valor, rotulo: label || valor } : null;
  }
  const valor = String(v || '').trim();
  return valor ? { valor, rotulo: rotulo || valor } : null;
}
function uniqCfgOptions() {
  const out = [], seen = new Set();
  for (const arr of arguments) {
    for (const raw of Array.isArray(arr) ? arr : []) {
      const item = cfgOpt(raw);
      if (!item) continue;
      const key = item.valor.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}
function estoqueConfigSanitize(input, descobertos) {
  const raw = input && typeof input === 'object' ? input : {};
  const descob = descobertos || {};
  return {
    titulo: textoLimpo(raw.titulo || ESTOQUE_CONFIG_DEFAULTS.titulo, 60) || ESTOQUE_CONFIG_DEFAULTS.titulo,
    departamentos: uniqCfgOptions(raw.departamentos, descob.departamentos),
    unidades_medida: uniqCfgOptions(raw.unidades_medida, ESTOQUE_CONFIG_DEFAULTS.unidades_medida, descob.unidades_medida),
    tipos_item: uniqCfgOptions(raw.tipos_item, ESTOQUE_CONFIG_DEFAULTS.tipos_item, descob.tipos_item)
  };
}
async function estoqueTenantConfig() {
  const [cfgR, tiposR, depsR, unR] = await Promise.all([
    db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]),
    db.q(`SELECT DISTINCT tipo_item AS v FROM est_produto
      WHERE tenant_id=$1 AND tipo_item IS NOT NULL AND btrim(tipo_item)<>'' ORDER BY tipo_item`, [TENANT]).catch(() => ({ rows: [] })),
    db.q(`SELECT DISTINCT v FROM (
        SELECT departamento AS v FROM est_produto WHERE tenant_id=$1 AND departamento IS NOT NULL AND btrim(departamento)<>''
        UNION
        SELECT departamento AS v FROM est_categoria WHERE tenant_id=$1 AND departamento IS NOT NULL AND btrim(departamento)<>''
      ) x ORDER BY v`, [TENANT]).catch(() => ({ rows: [] })),
    db.q(`SELECT DISTINCT unidade AS v FROM est_produto
      WHERE tenant_id=$1 AND unidade IS NOT NULL AND btrim(unidade)<>'' ORDER BY unidade`, [TENANT]).catch(() => ({ rows: [] }))
  ]);
  const cfg = (cfgR.rows[0] && cfgR.rows[0].config) || {};
  return estoqueConfigSanitize(cfg.estoque || cfg.estoque_config || {}, {
    tipos_item: tiposR.rows.map(r => r.v),
    departamentos: depsR.rows.map(r => r.v),
    unidades_medida: unR.rows.map(r => r.v)
  });
}
function statusTitan(v) {
  return TITAN_STATUS_FROM_ANY[String(v || '').trim().toUpperCase()] || null;
}
function nOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function metaObj(m) {
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
}
function invFromMeta(meta) {
  const m = metaObj(meta);
  const inv = metaObj(m.inventory || m.estoque_cardapio);
  const dd = metaObj(metaObj(m.mapper || m.integration_map).delivery_direto || metaObj(m.mapper || m.integration_map).dd);
  return {
    controle_enabled: inv.enabled === true,
    quantidade_vendavel: nOrNull(inv.quantity ?? inv.quantidade_vendavel),
    atualizado_em: inv.updated_at || null,
    atualizado_por: inv.updated_by || null,
    dd_mapper: {
      provider: 'delivery_direto',
      external_id: dd.external_id || dd.id || '',
      preparado: true,
      sync_ativo: false
    }
  };
}
function mergeInventoryMeta(meta, patch, gestor) {
  const base = metaObj(meta);
  const inv = metaObj(base.inventory);
  const mapper = metaObj(base.mapper || base.integration_map);
  const dd = metaObj(mapper.delivery_direto || mapper.dd);
  if (Object.prototype.hasOwnProperty.call(patch, 'controle_enabled')) inv.enabled = patch.controle_enabled === true;
  if (Object.prototype.hasOwnProperty.call(patch, 'quantidade_vendavel')) inv.quantity = nOrNull(patch.quantidade_vendavel);
  if (Object.prototype.hasOwnProperty.call(patch, 'dd_external_id')) {
    dd.external_id = textoLimpo(patch.dd_external_id || '', 120);
    dd.provider = 'delivery_direto';
    dd.sync_enabled = false;
    dd.updated_at = new Date().toISOString();
    dd.updated_by = gestor && (gestor.apelido_login || gestor.nome || gestor.id) || null;
    mapper.delivery_direto = dd;
  }
  inv.updated_at = new Date().toISOString();
  inv.updated_by = gestor && (gestor.apelido_login || gestor.nome || gestor.id) || null;
  base.inventory = inv;
  base.mapper = mapper;
  return base;
}
async function adminEstoqueCardapioSnapshot(params) {
  const cfg = await estoqueTenantConfig();
  const [produtosR, opcoesR, fichasR] = await Promise.all([
    db.q(`SELECT 'produto' AS tipo, p.id::text AS id, p.nome, c.nome AS categoria, NULL::text AS produto_pai,
        NULL::text AS grupo, p.status, p.codigo_externo, p.meta, p.ordem, COALESCE(c.ordem,999) AS categoria_ordem
      FROM produtos p
      LEFT JOIN menu_categorias c ON c.id=p.categoria_id AND c.tenant_id=p.tenant_id
      WHERE p.tenant_id=$1
      ORDER BY COALESCE(c.ordem,999), p.ordem, p.nome`, [TENANT]),
    db.q(`SELECT 'opcao' AS tipo, o.id::text AS id, o.nome, c.nome AS categoria, p.nome AS produto_pai,
        g.nome AS grupo, o.status, o.codigo_externo, o.meta, o.ordem, COALESCE(c.ordem,999) AS categoria_ordem
      FROM opcoes o
      JOIN opcao_grupos g ON g.id=o.grupo_id AND g.tenant_id=o.tenant_id
      JOIN produtos p ON p.id=g.produto_id AND p.tenant_id=o.tenant_id
      LEFT JOIN menu_categorias c ON c.id=p.categoria_id AND c.tenant_id=p.tenant_id
      WHERE o.tenant_id=$1
      ORDER BY COALESCE(c.ordem,999), p.ordem, g.ordem, o.ordem, o.nome`, [TENANT]),
    db.q(`SELECT CASE WHEN f.opcao_id IS NOT NULL THEN 'opcao' ELSE 'produto' END AS tipo,
        COALESCE(f.opcao_id::text, f.produto_id::text) AS target_id,
        json_agg(json_build_object(
          'id', f.id,
          'est_produto_id', f.est_produto_id,
          'insumo_nome', COALESCE(e.nome, f.insumo_nome),
          'quantidade', f.quantidade,
          'unidade', f.unidade,
          'observacao', f.observacao,
          'estoque_atual', e.estoque_atual,
          'unidade_estoque', e.unidade,
          'ativo', e.ativo,
          'setores', COALESCE(sx.setores, '')
        ) ORDER BY f.id) AS itens
      FROM ficha_itens f
      LEFT JOIN est_produto e ON e.id=f.est_produto_id AND e.tenant_id=f.tenant_id
      LEFT JOIN LATERAL (
        SELECT string_agg(s.nome, ', ' ORDER BY s.ordem, s.nome) AS setores
        FROM est_produto_setor ps
        JOIN est_setor s ON s.id=ps.setor_id AND s.tenant_id=ps.tenant_id
        WHERE ps.tenant_id=f.tenant_id AND ps.produto_id=f.est_produto_id
      ) sx ON TRUE
      WHERE f.tenant_id=$1 AND (f.opcao_id IS NOT NULL OR f.produto_id IS NOT NULL)
      GROUP BY 1,2`, [TENANT])
  ]);
  const fichaMap = new Map();
  for (const f of fichasR.rows) fichaMap.set(f.tipo + ':' + f.target_id, Array.isArray(f.itens) ? f.itens : []);
  const all = produtosR.rows.concat(opcoesR.rows).map(r => {
    const inv = invFromMeta(r.meta);
    const ficha = fichaMap.get(r.tipo + ':' + r.id) || [];
    return {
      tipo: r.tipo,
      id: r.id,
      nome: r.nome,
      categoria: r.categoria || '',
      produto_pai: r.produto_pai || '',
      grupo: r.grupo || '',
      contexto: [r.categoria, r.produto_pai, r.grupo].filter(Boolean).join(' › ') || (r.tipo === 'produto' ? 'Item direto' : 'Opção'),
      status: r.status,
      dd_status: DD_STATUS_FROM_TITAN[r.status] || r.status,
      codigo_externo: r.codigo_externo || '',
      controle_enabled: inv.controle_enabled,
      quantidade_vendavel: inv.quantidade_vendavel,
      inventory_updated_at: inv.atualizado_em,
      inventory_updated_by: inv.atualizado_por,
      dd_mapper: inv.dd_mapper,
      ficha_count: ficha.length,
      ficha
    };
  });
  const q = String(params && params.q || '').toLowerCase().trim();
  const status = String(params && params.status || '').toUpperCase().trim();
  const fichaFiltro = String(params && params.ficha || '').toLowerCase().trim();
  const controleFiltro = String(params && params.controle || '').toLowerCase().trim();
  let itens = all.filter(x => {
    if (q && !(x.nome + ' ' + x.contexto + ' ' + x.codigo_externo).toLowerCase().includes(q)) return false;
    if (status && x.status !== status && x.dd_status !== status) return false;
    if (fichaFiltro === 'sem' && x.ficha_count > 0) return false;
    if (fichaFiltro === 'com' && x.ficha_count === 0) return false;
    if (controleFiltro === 'on' && !x.controle_enabled) return false;
    if (controleFiltro === 'off' && x.controle_enabled) return false;
    return true;
  });
  const limit = Math.max(1, Math.min(Number(params && params.limit) || 350, 1000));
  const kpis = {
    total: all.length,
    ativos: all.filter(x => x.status === 'ATIVO').length,
    em_falta: all.filter(x => x.status === 'EM_FALTA').length,
    ocultos: all.filter(x => x.status === 'OCULTO').length,
    controle_on: all.filter(x => x.controle_enabled).length,
    sem_ficha: all.filter(x => x.ficha_count === 0).length,
    quantidade_vendavel_total: all.reduce((n, x) => n + (x.controle_enabled && x.quantidade_vendavel != null ? Number(x.quantidade_vendavel) : 0), 0)
  };
  return {
    tenant: TENANT,
    config: cfg,
    status_map: DD_STATUS_FROM_TITAN,
    mapper: { delivery_direto: { schema_preparado: true, sync_ativo: false, storage: 'produtos/opcoes.meta.mapper.delivery_direto' } },
    kpis,
    filtros: { q, status, ficha: fichaFiltro, controle: controleFiltro, limit },
    itens: itens.slice(0, limit),
    total_filtrado: itens.length
  };
}

/* ===== Contagem Geral (periódica, genérica por tenant) =====
   Os itens do setor "Gerais" (sem dono fixo) são divididos entre os setores
   participantes no dia da contagem geral, de forma equilibrada pela carga:
   quem tem menos itens fixos recebe mais, nivelando os totais sem sobrecarregar.
   O que já pertence a um setor permanece no setor (não entra na divisão). */
const GERAL_DEFAULTS = { ativo: false, dia: 1, escopo: 'gerais', setores_participantes: [], forcar_data: null };
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
const TEMA_DEFAULTS = { marca: 'Restaurante', dominio: '', modo: 'escuro', cor_primaria: '#F97316', cor_primaria_texto: '#160a02', fonte: 'Sora', logo_url: '/logo.png', layout_card: 'lista', mostrar_busca: true, mostrar_descricao: true, mostrar_preco_a_partir: true, mostrar_destaques: false, mostrar_avaliacoes: false, texto_funcionamento: '' };
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

/* ===== Helpers compartilhados (matching, movimento, Khardela) ===== */
function estNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function estLev(a, b) { if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1); for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) { const cost = a[i - 1] === b[j - 1] ? 0 : 1; cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost); } [prev, cur] = [cur, prev]; } return prev[n]; }
function estSim(a, b) { if (!a || !b) return 0; return 1 - estLev(a, b) / Math.max(a.length, b.length); }
const EST_MATCH_STOPWORDS = new Set('de da do das dos para pra com sem e o a os as em no na nos nas ao aos item produto un und unidade unidades kg kgs kilo kilos quilo quilos g gr grama gramas l lt litro litros ml pct pc bisnaga pacote pacotes caixa caixas cx fardo fardos saco sacos rolo rolos lata latas balde baldes vidro vidros'.split(' '));
const EST_MATCH_SYNONYMS = {
  mussarela: 'mucarela', muzarela: 'mucarela', mozarela: 'mucarela', mozzarella: 'mucarela', mucarela: 'mucarela',
  calabreza: 'calabresa', catupiri: 'catupiry', caturipy: 'catupiry', requeijao: 'requeijao',
  cocacola: 'coca cola', choc: 'chocolate', chocolatebranco: 'chocolate branco',
  ninho: 'leite po', nutela: 'nutella', oleo: 'oleo', acucar: 'acucar'
};
const EST_MATCH_CONFLICT_GROUPS = [
  ['branco', 'leite'],
  ['zero', 'normal'],
  ['grande', 'pequena'],
  ['preta', 'verde']
];
function estNormBusca(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d)(kg|kgs|g|gr|ml|l|lt|un|und|pct|pc)\b/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function estTokensBusca(s) {
  const raw = estNormBusca(s).split(' ').filter(Boolean);
  const out = [];
  for (let t of raw) {
    t = EST_MATCH_SYNONYMS[t] || t;
    for (const part of String(t).split(' ')) {
      const p = part.trim();
      if (p && !EST_MATCH_STOPWORDS.has(p)) out.push(p);
    }
  }
  return Array.from(new Set(out));
}
function estTextoBusca(s) { return estTokensBusca(s).join(' '); }
function estAsObj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
function estAliasList(legado) {
  const l = estAsObj(legado);
  return [].concat(l.match_aliases || [], l.aliases || [], l.nomes_nf || [])
    .map(v => String(v || '').trim()).filter(Boolean).slice(0, 40);
}
function estProdutoTextos(p) {
  const texts = [
    { texto: p.nome, peso: 1, campo: 'nome' },
    { texto: p.nome_nf, peso: 0.96, campo: 'nome_nf' },
    { texto: p.marca_preferida, peso: 0.45, campo: 'marca_preferida' },
    { texto: p.ultima_marca, peso: 0.40, campo: 'ultima_marca' },
    { texto: p.categoria, peso: 0.32, campo: 'categoria' },
    { texto: p.subcategoria, peso: 0.34, campo: 'subcategoria' }
  ];
  for (const a of estAliasList(p.legado)) texts.push({ texto: a, peso: 0.98, campo: 'alias' });
  return texts.filter(x => String(x.texto || '').trim());
}
function estConflictPenalty(qTokens, cTokens) {
  let penalty = 0;
  for (const g of EST_MATCH_CONFLICT_GROUPS) {
    const q = g.filter(t => qTokens.includes(t));
    const c = g.filter(t => cTokens.includes(t));
    if (q.length && c.length && !q.some(t => c.includes(t))) penalty += 0.18;
  }
  return penalty;
}
function estScoreTextoProduto(queryText, candidateText) {
  const q = estTextoBusca(queryText), c = estTextoBusca(candidateText);
  const qTokens = q.split(' ').filter(Boolean), cTokens = c.split(' ').filter(Boolean);
  if (!q || !c || !qTokens.length || !cTokens.length) return { score: 0, motivo: 'sem tokens' };
  let score = 0, motivo = 'tokens';
  if (q === c) { score = 1; motivo = 'igual'; }
  else if (q.length >= 4 && c.includes(q)) { score = 0.92; motivo = 'nome contem texto'; }
  else if (c.length >= 4 && q.includes(c)) { score = 0.90; motivo = 'texto contem nome'; }
  const inter = qTokens.filter(t => cTokens.includes(t));
  const union = Array.from(new Set(qTokens.concat(cTokens))).length || 1;
  const jacc = inter.length / union;
  const coberturaQuery = inter.length / (qTokens.length || 1);
  const coberturaCand = inter.length / (cTokens.length || 1);
  const tokenScore = Math.max(jacc, (coberturaQuery * 0.78) + (coberturaCand * 0.18));
  if (tokenScore > score) { score = tokenScore; motivo = 'palavras-chave'; }
  if (Math.min(q.length, c.length) >= 6) {
    const fz = estSim(q, c);
    if (fz >= 0.72 && fz * 0.88 > score) { score = fz * 0.88; motivo = 'similaridade'; }
  }
  let penalty = estConflictPenalty(qTokens, cTokens);
  if ((cTokens.includes('aberto') || cTokens.includes('aberta')) && !(qTokens.includes('aberto') || qTokens.includes('aberta'))) penalty += 0.28;
  for (const t of ['borda', 'montagem', 'finalizacao']) {
    if (cTokens.includes(t) && !qTokens.includes(t)) penalty += 0.06;
  }
  score = Math.max(0, score - penalty);
  return { score, motivo };
}
function estScoreProdutoEntrada(texto, p) {
  const query = [texto && texto.texto, texto && texto.marca, texto && texto.unidade].filter(Boolean).join(' ');
  let best = { score: 0, motivo: 'sem correspondencia', campo: null };
  for (const tx of estProdutoTextos(p)) {
    const sc = estScoreTextoProduto(query, tx.texto);
    const weighted = Math.max(0, Math.min(1, sc.score * tx.peso));
    if (weighted > best.score) best = { score: weighted, motivo: sc.motivo, campo: tx.campo };
  }
  return best;
}
async function estMatchProdutosEntrada(textos, minScore, opts) {
  minScore = minScore == null ? 0.45 : minScore;
  opts = opts || {};
  const onlyCompraveis = opts.onlyCompraveis !== false;
  const rows = (await db.q(`SELECT p.id, p.nome, p.unidade, p.estoque_atual, p.nome_nf, p.marca_preferida, p.ultima_marca, p.subcategoria, p.legado, c.nome AS categoria
    FROM est_produto p
    LEFT JOIN est_categoria c ON c.id=p.categoria_id AND c.tenant_id=p.tenant_id
    WHERE p.tenant_id=$1 AND p.ativo ${onlyCompraveis ? 'AND COALESCE(p.pode_comprar, TRUE)' : ''}
    ORDER BY p.nome`, [TENANT])).rows;
  return (Array.isArray(textos) ? textos : []).map((t, idxDefault) => {
    const entrada = typeof t === 'string' ? { texto: t, idx: idxDefault } : Object.assign({ idx: idxDefault }, t || {});
    const scored = rows.map(p => {
      const sc = estScoreProdutoEntrada(entrada, p);
      return { id: p.id, nome: p.nome, unidade: p.unidade, categoria: p.categoria, score: Number(sc.score.toFixed(4)), motivo: sc.motivo, campo: sc.campo };
    }).filter(x => x.score >= minScore).sort((a, b) => b.score - a.score || String(a.nome).localeCompare(String(b.nome))).slice(0, 5);
    const best = scored[0] || null;
    const gap = best && scored[1] ? best.score - scored[1].score : (best ? best.score : 0);
    const status = best && best.score >= 0.86 && gap >= 0.035 ? 'auto' : (best && best.score >= 0.65 ? 'sugestao' : 'sem_match_seguro');
    return { idx: entrada.idx, texto: entrada.texto || '', melhor: best ? Object.assign({}, best, { status }) : null, sugestoes: scored, status };
  });
}
async function estAchaProduto(texto, minScore) {
  const r = await estMatchProdutosEntrada([{ texto }], minScore == null ? 0.5 : minScore, { onlyCompraveis: false });
  return r[0] && r[0].melhor ? r[0].melhor : null;
}
function estQtdMovimento(qtd, unidadeInformada, produto) {
  const n = Number(String(qtd == null ? '' : qtd).replace(',', '.'));
  if (!(n > 0)) return null;
  const ui = String(unidadeInformada || '').trim();
  if (!ui) return n;
  const conv = estBaixaEmUnidades(n, ui, produto && produto.peso_g, produto && produto.unidade);
  return conv > 0 ? conv : n;
}
function estObsMovimento(unidadeInformada, qtdOriginal, qtdLancada, produto, observacao) {
  const parts = [];
  if (unidadeInformada) parts.push('informado: ' + qtdOriginal + ' ' + unidadeInformada);
  if (unidadeInformada && qtdLancada != null && produto && produto.unidade) parts.push('lançado no estoque: ' + Number(qtdLancada).toFixed(3) + ' ' + produto.unidade);
  if (observacao) parts.push(String(observacao));
  return parts.filter(Boolean).join(' | ') || null;
}
async function estLancaMov(tipo, user, produto, qtd, motivo, origem, observacao) {
  const antes = Number(produto.estoque_atual); const depois = (tipo === 'ENTRADA') ? antes + qtd : antes - qtd;
  await db.q('UPDATE est_produto SET estoque_atual=$2, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$3', [produto.id, depois, TENANT]);
  await db.q(`INSERT INTO est_movimento (tenant_id, produto_id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, motivo, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [TENANT, produto.id, produto.nome, tipo, antes, qtd, depois, origem || 'MANUAL', user.id, user.nome, motivo || null, observacao || null]);
  return { antes, depois };
}
async function estKhardela(uid, pergunta) {
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
    const sys = `Você é a automação Khardela, assistente operacional de estoque do tenant atual. Responda em português do Brasil, curto e direto, à pergunta usando SOMENTE os dados do JSON (snapshot do banco oficial). Nunca invente: se não houver registro no snapshot, diga que não há registro. Hoje é ${new Date().toISOString().slice(0, 10)}. ${verValores ? '' : 'O usuário NÃO tem permissão de ver valores/preços — não revele valores monetários.'}`;
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
function estWaConfirmaTexto(texto) {
  return /^(sim|s|ok|confirmo|confirmar|confirma|pode|pode lancar|pode lançar)$/i.test(String(texto || '').trim());
}
function estWaCancelaTexto(texto) {
  return /^(nao|não|n|cancelar|cancela|cancela isso|descartar|descarta)$/i.test(String(texto || '').trim());
}
async function estWaPendente(telefone) {
  const r = await db.q(`SELECT id, interpretado
    FROM est_whatsapp_msg
    WHERE tenant_id=$1 AND telefone=$2 AND direcao='OUT'
      AND interpretado->>'tipo'='movimento_pendente'
      AND interpretado->>'status'='aguardando_confirmacao'
      AND criado_em > NOW() - INTERVAL '30 minutes'
    ORDER BY criado_em DESC
    LIMIT 1`, [TENANT, telefone]);
  return r.rows[0] || null;
}
async function estWaAtualizaPendente(id, status, extra) {
  const payload = Object.assign({ status, atualizado_em: new Date().toISOString() }, extra || {});
  await db.q(`UPDATE est_whatsapp_msg
    SET interpretado=COALESCE(interpretado,'{}'::jsonb) || $3::jsonb
    WHERE id=$1 AND tenant_id=$2`, [id, TENANT, JSON.stringify(payload)]).catch(() => {});
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

// Notifica supervisores (Thiago/Tassiano) no WhatsApp da Khardela ao fechar contagem. Best-effort.
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
      const opId = s && (s.opcao_id || s.opcaoId || s.id);
      const fr = (opId && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(opId)))
        ? (await db.q(`SELECT insumo_nome, est_produto_id, quantidade FROM ficha_itens WHERE tenant_id=$1 AND opcao_id=$2`, [TENANT, opId])).rows
        : (await db.q(`SELECT DISTINCT ON (lower(fi.insumo_nome), COALESCE(fi.est_produto_id::text,''), fi.quantidade)
              fi.insumo_nome, fi.est_produto_id, fi.quantidade
             FROM ficha_itens fi JOIN opcoes o ON o.id=fi.opcao_id
            WHERE fi.tenant_id=$1 AND lower(o.nome)=lower($2)
            ORDER BY lower(fi.insumo_nome), COALESCE(fi.est_produto_id::text,''), fi.quantidade, fi.id`, [TENANT, nm])).rows;
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
  if (sub === 'app-version' && req.method === 'GET') {
    try {
      return jsonComHeaders(res, 200, { ok: true, estoque: publicFileVersion('estoque.html') }, { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' });
    } catch (e) {
      return jsonComHeaders(res, 200, { ok: false, erro: e.message }, { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' });
    }
  }

  if (sub === 'titan' && seg[2] === 'auth') {
    if (!hostFerramentasPermitido(req)) {
      return json(res, 404, { erro: 'ferramenta interna disponível apenas no domínio técnico do Titan' });
    }
    const action = seg[3] || '';

    if (action === 'me' && req.method === 'GET') {
      const u = await titanToolSession(req);
      return json(res, 200, { ok: true, usuario: userPublico(u) });
    }

    if (action === 'logout' && req.method === 'POST') {
      const token = parseCookies(req)[TITAN_TOOL_SESSION_COOKIE];
      if (token) await db.q('DELETE FROM titan_tool_sessions WHERE tenant_id=$1::varchar AND token_hash=$2', [TENANT, tokenHash(token)]).catch(() => {});
      return jsonComHeaders(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
    }

    if (action === 'login' && req.method === 'POST') {
      const b = await readBody(req);
      const email = normEmail(b.email);
      const senha = String(b.senha || '');
      const remember = !!b.remember;
      if (!emailValido(email) || !senha) return json(res, 400, { erro: 'Informe e-mail e senha.' });
      const r = await db.q(`SELECT id,email,nome,permissoes,senha_hash
        FROM titan_tool_users
        WHERE tenant_id=$1::varchar AND lower(email)=lower($2) AND ativo`, [TENANT, email]);
      const u = r.rows[0];
      if (!u || !u.senha_hash) return json(res, 401, { erro: 'E-mail ou senha inválidos. Se for seu primeiro acesso, use o botão Primeiro acesso.' });
      const v = await db.q('SELECT ($1 = crypt($2, $1)) AS ok', [u.senha_hash, senha]);
      if (!v.rows[0] || !v.rows[0].ok) return json(res, 401, { erro: 'E-mail ou senha inválidos.' });
      await db.q('UPDATE titan_tool_users SET ultimo_login_em=NOW(), atualizado_em=NOW() WHERE id=$1 AND tenant_id=$2::varchar', [u.id, TENANT]);
      const s = await criarTitanSession(req, u, remember);
      return jsonComHeaders(res, 200, { ok: true, usuario: userPublico(u) }, { 'Set-Cookie': s.cookie });
    }

    if (action === 'first-access' && seg[4] === 'check' && req.method === 'POST') {
      const b = await readBody(req);
      const email = normEmail(b.email);
      if (!emailValido(email)) return json(res, 400, { erro: 'Informe um e-mail válido.' });
      const r = await db.q(`SELECT id,email,nome,(senha_hash IS NOT NULL) AS senha_definida
        FROM titan_tool_users
        WHERE tenant_id=$1::varchar AND lower(email)=lower($2) AND ativo`, [TENANT, email]);
      const u = r.rows[0];
      if (!u) return json(res, 404, { erro: 'Este e-mail ainda não foi autorizado para o Titan Tools.' });
      return json(res, 200, { ok: true, autorizado: true, ja_configurado: !!u.senha_definida, usuario: { email: u.email, nome: u.nome || '' } });
    }

    if (action === 'first-access' && req.method === 'POST') {
      const b = await readBody(req);
      const email = normEmail(b.email);
      const senha = String(b.senha || '');
      const confirmar = String(b.confirmar || b.confirmacao || '');
      const remember = !!b.remember;
      if (!emailValido(email)) return json(res, 400, { erro: 'Informe um e-mail válido.' });
      if (senha !== confirmar) return json(res, 400, { erro: 'As senhas precisam ser iguais.' });
      if (!senhaForte(senha)) return json(res, 400, { erro: senhaMsg() });
      const atual = await db.q(`SELECT id,email,nome,permissoes,senha_hash
        FROM titan_tool_users
        WHERE tenant_id=$1::varchar AND lower(email)=lower($2) AND ativo`, [TENANT, email]);
      const existente = atual.rows[0];
      if (!existente) return json(res, 404, { erro: 'Este e-mail ainda não foi autorizado para o Titan Tools.' });
      if (existente.senha_hash) return json(res, 409, { erro: 'Este e-mail já concluiu o primeiro acesso. Use o login normal.' });
      const r = await db.q(`UPDATE titan_tool_users
          SET senha_hash=crypt($2, gen_salt('bf',10)),
              primeiro_acesso_em=COALESCE(primeiro_acesso_em,NOW()),
              ultimo_login_em=NOW(),
              atualizado_em=NOW()
        WHERE id=$1 AND tenant_id=$3::varchar
        RETURNING id,email,nome,permissoes`, [existente.id, senha, TENANT]);
      const u = r.rows[0];
      const s = await criarTitanSession(req, u, remember);
      return jsonComHeaders(res, 200, { ok: true, usuario: userPublico(u) }, { 'Set-Cookie': s.cookie });
    }

    if (action === 'users' && req.method === 'GET') {
      const gestor = await requerTitanSession(req, res, 'gerenciar_usuarios');
      if (!gestor) return;
      const r = await db.q(`SELECT id,email,nome,permissoes,ativo,
          (senha_hash IS NOT NULL) AS senha_definida,
          primeiro_acesso_em,ultimo_login_em,criado_em,atualizado_em
        FROM titan_tool_users
        WHERE tenant_id=$1::varchar
        ORDER BY ativo DESC, lower(email)`, [TENANT]);
      return json(res, 200, { ok: true, usuarios: r.rows });
    }

    if (action === 'users' && req.method === 'PATCH' && seg[4]) {
      const gestor = await requerTitanSession(req, res, 'gerenciar_usuarios');
      if (!gestor) return;
      const b = await readBody(req);
      const perms = titanPermissoes(b.acesso_total || b.perfil === 'acesso_total' ? TITAN_TOOL_PERMS : b.permissoes);
      const nome = typeof b.nome === 'string' ? b.nome.trim().slice(0, 120) : null;
      const ativo = typeof b.ativo === 'boolean' ? b.ativo : null;
      const r = await db.q(`UPDATE titan_tool_users
          SET nome=COALESCE($3,nome),
              permissoes=$4::TEXT[],
              ativo=COALESCE($5,ativo),
              autorizado_por=$6,
              atualizado_em=NOW()
        WHERE tenant_id=$1::varchar AND id=$2
        RETURNING id,email,nome,permissoes,ativo,(senha_hash IS NOT NULL) AS senha_definida,primeiro_acesso_em,ultimo_login_em,criado_em,atualizado_em`,
        [TENANT, seg[4], nome, perms, ativo, gestor.id]);
      if (!r.rows[0]) return json(res, 404, { erro: 'Usuário não encontrado.' });
      return json(res, 200, { ok: true, usuario: r.rows[0] });
    }

    if (action === 'authorize-email' && req.method === 'POST') {
      const gestor = await requerTitanSession(req, res, 'gerenciar_usuarios');
      if (!gestor) return;
      const b = await readBody(req);
      const email = normEmail(b.email);
      if (!emailValido(email)) return json(res, 400, { erro: 'Informe um e-mail válido.' });
      const nome = String(b.nome || '').trim().slice(0, 120) || email.split('@')[0];
      const perms = titanPermissoes(b.acesso_total || b.perfil === 'acesso_total' ? TITAN_TOOL_PERMS : b.permissoes);
      const ativo = b.ativo !== false;
      const atual = await db.q(`SELECT id FROM titan_tool_users WHERE tenant_id=$1::varchar AND lower(email)=lower($2)`, [TENANT, email]);
      let r;
      if (atual.rows[0]) {
        r = await db.q(`UPDATE titan_tool_users
            SET email=$3,nome=$4,permissoes=$5::TEXT[],ativo=$6,autorizado_por=$7,atualizado_em=NOW()
          WHERE tenant_id=$1::varchar AND id=$2
          RETURNING id,email,nome,permissoes,ativo,(senha_hash IS NOT NULL) AS senha_definida,primeiro_acesso_em,ultimo_login_em,criado_em,atualizado_em`,
          [TENANT, atual.rows[0].id, email, nome, perms, ativo, gestor.id]);
      } else {
        r = await db.q(`INSERT INTO titan_tool_users (tenant_id,email,nome,permissoes,ativo,autorizado_por)
          VALUES ($1::varchar,$2,$3,$4::TEXT[],$5,$6)
          RETURNING id,email,nome,permissoes,ativo,(senha_hash IS NOT NULL) AS senha_definida,primeiro_acesso_em,ultimo_login_em,criado_em,atualizado_em`,
          [TENANT, email, nome, perms, ativo, gestor.id]);
      }
      return json(res, 200, { ok: true, usuario: r.rows[0] });
    }

    return json(res, 404, { erro: 'rota de autenticação não encontrada' });
  }

  if (sub === 'mapper' && seg[2] === 'state' && req.method === 'GET') {
    const gestor = await requerTitanSession(req, res, 'ver_project_state');
    if (!gestor) return;
    return json(res, 200, {
      ok: true,
      tenant: TENANT,
      generated_at: new Date().toISOString(),
      usuario: userPublico(gestor),
      runtime: deployRuntimePublico(),
      files: await lerProjectStateSeguro()
    });
  }

  if (sub === 'mapper' && seg[2] === 'ai' && req.method === 'POST') {
    const gestor = await requerTitanSession(req, res, 'editar_project_state');
    if (!gestor) return;
    const b = await readBody(req);
    const out = await chamarCommandAi({
      provider: textoLimpo(b.provider || b.provedor || 'auto', 40),
      prompt: String(b.prompt || b.pergunta || ''),
      assignmentId: textoLimpo(b.assignment_id || b.missao_id, 120),
      user: gestor
    });
    if (!out.ok) return json(res, out.status || 500, { erro: out.erro || 'Falha ao chamar IA.' });
    return json(res, 200, out);
  }

  if (sub === 'mapper' && seg[2] === 'local-agent' && seg[3] === 'poll' && req.method === 'POST') {
    if (!requerLocalAgent(req, res)) return;
    const b = await readBody(req);
    const agentId = textoLimpo(b.agent_id || b.agentId || process.env.TITAN_LOCAL_AGENT_DEFAULT_ID || 'thiago-windows-codex', 120);
    const state = await lerProjectStateSeguro();
    const queue = jsonObjeto(state['local-agent-queue.json']);
    const tasks = Array.isArray(queue.tasks) ? queue.tasks : [];
    const pendentes = tasks
      .filter(t => String(t.agent_id || '') === agentId && ['pendente', 'aprovado', 'reexecutar'].includes(normStatus(t.status)))
      .slice(0, 3)
      .map(t => ({
        id: t.id,
        agent_id: t.agent_id,
        action: t.action,
        titulo: t.titulo,
        prompt: t.prompt || '',
        prioridade: t.prioridade || 'media',
        criado_em: t.criado_em || null,
        criado_por_nome: t.criado_por_nome || t.criado_por || ''
      }));
    return json(res, 200, { ok: true, agent_id: agentId, tasks: pendentes, server_time: new Date().toISOString() });
  }

  if (sub === 'mapper' && seg[2] === 'local-agent' && seg[3] === 'report' && req.method === 'POST') {
    if (!requerLocalAgent(req, res)) return;
    const b = await readBody(req);
    const agentId = textoLimpo(b.agent_id || b.agentId || process.env.TITAN_LOCAL_AGENT_DEFAULT_ID || 'thiago-windows-codex', 120);
    const id = textoLimpo(b.task_id || b.id, 120);
    const status = textoLimpo(b.status, 80) || 'em_execucao';
    const allowed = new Set(['em_execucao', 'concluido', 'falhou', 'bloqueado', 'ignorado']);
    if (!id) return json(res, 400, { erro: 'Informe task_id.' });
    if (!allowed.has(status)) return json(res, 400, { erro: 'Status local inválido.' });
    const state = await lerProjectStateSeguro();
    const queue = jsonObjeto(state['local-agent-queue.json']);
    queue.tasks = Array.isArray(queue.tasks) ? queue.tasks : [];
    const idx = queue.tasks.findIndex(t => String(t.id) === id && String(t.agent_id || '') === agentId);
    if (idx < 0) return json(res, 404, { erro: 'Tarefa local não encontrada para este agente.' });
    const entry = {
      at: new Date().toISOString(),
      status,
      message: textoLimpo(b.message || b.mensagem || b.log, 900),
      result: textoLimpo(b.result || b.resultado, 1800)
    };
    queue.tasks[idx] = Object.assign({}, queue.tasks[idx], {
      status,
      ultimo_retorno_em: entry.at,
      atualizado_em: entry.at,
      resultado: entry.result || queue.tasks[idx].resultado || '',
      erro: status === 'falhou' ? entry.message : queue.tasks[idx].erro || '',
      logs: (Array.isArray(queue.tasks[idx].logs) ? queue.tasks[idx].logs : []).concat(entry).slice(-30)
    });
    if (status === 'em_execucao' && !queue.tasks[idx].iniciado_em) queue.tasks[idx].iniciado_em = entry.at;
    if (['concluido', 'falhou', 'bloqueado', 'ignorado'].includes(status)) queue.tasks[idx].concluido_em = entry.at;
    gravarProjectJson('local-agent-queue.json', queue);
    const localUser = { id: null, email: `local-agent:${agentId}`, nome: `Local Agent ${agentId}` };
    const audit = registrarCommandAudit(localUser, 'update_local_agent_task', 'local-agent-queue.json', id, `Agente local atualizou tarefa: ${id} -> ${status}`, { agent_id: agentId, status });
    const dbAction = await persistirCommandActionDb(localUser, 'update_local_agent_task', payloadCommandSeguro(b), 'local-agent-queue.json', id, queue.tasks[idx], audit);
    return json(res, 200, { ok: true, target: queue.tasks[idx], audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
  }

  if (sub === 'mapper' && seg[2] === 'action' && req.method === 'POST') {
    const gestor = await requerTitanSession(req, res, 'editar_project_state');
    if (!gestor) return;
    const b = await readBody(req);
    const action = textoLimpo(b.action || b.tipo, 60);
    try {
      if (action === 'create_task') {
        const state = await lerProjectStateSeguro();
        const tasks = Array.isArray(state['tasks.json']) ? state['tasks.json'] : lerProjectJson('tasks.json', []);
        const titulo = textoLimpo(b.titulo, 180);
        const modulo = textoLimpo(b.modulo, 80);
        if (!titulo || !modulo) return json(res, 400, { erro: 'Informe título e módulo da tarefa.' });
        const task = {
          id: proximoId(tasks, 'task-f2-', 3),
          titulo,
          modulo,
          status: textoLimpo(b.status, 60) || 'planejado',
          prioridade: textoLimpo(b.prioridade, 40) || 'media',
          categoria: textoLimpo(b.categoria, 80) || 'produto',
          responsavel_humano: textoLimpo(b.responsavel_humano, 80) || 'Thiago',
          ferramenta_atuante: textoLimpo(b.ferramenta_atuante, 80) || 'Codex',
          bloqueada: !!b.bloqueada,
          dependencias: listaLimpa(b.dependencias, 12),
          proximo_passo: textoLimpo(b.proximo_passo || b.detalhe, 500),
          criado_via_command: true,
          criado_em: new Date().toISOString()
        };
        tasks.push(task);
        gravarProjectJson('tasks.json', tasks);
        const audit = registrarCommandAudit(gestor, action, 'tasks.json', task.id, `Tarefa criada: ${task.titulo}`, { modulo: task.modulo, prioridade: task.prioridade });
        const dbAction = await persistirCommandActionDb(gestor, action, b, 'tasks.json', task.id, task, audit);
        return json(res, 201, { ok: true, target: task, audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
      }

      if (action === 'update_task') {
        const state = await lerProjectStateSeguro();
        const tasks = Array.isArray(state['tasks.json']) ? state['tasks.json'] : lerProjectJson('tasks.json', []);
        const id = textoLimpo(b.id || b.task_id, 80);
        const idx = tasks.findIndex(t => String(t.id) === id);
        if (idx < 0) return json(res, 404, { erro: 'Tarefa não encontrada.' });
        const antes = { status: tasks[idx].status, proximo_passo: tasks[idx].proximo_passo, bloqueada: tasks[idx].bloqueada };
        if (b.status != null) tasks[idx].status = textoLimpo(b.status, 80) || tasks[idx].status;
        if (b.proximo_passo != null || b.detalhe != null) tasks[idx].proximo_passo = textoLimpo(b.proximo_passo || b.detalhe, 500);
        if (typeof b.bloqueada === 'boolean') tasks[idx].bloqueada = b.bloqueada;
        if (b.ferramenta_atuante != null) tasks[idx].ferramenta_atuante = textoLimpo(b.ferramenta_atuante, 80) || tasks[idx].ferramenta_atuante;
        tasks[idx].atualizado_via_command = true;
        tasks[idx].atualizado_em = new Date().toISOString();
        gravarProjectJson('tasks.json', tasks);
        const audit = registrarCommandAudit(gestor, action, 'tasks.json', id, `Tarefa atualizada: ${id}`, { antes, depois: { status: tasks[idx].status, proximo_passo: tasks[idx].proximo_passo, bloqueada: tasks[idx].bloqueada } });
        const dbAction = await persistirCommandActionDb(gestor, action, b, 'tasks.json', id, tasks[idx], audit);
        return json(res, 200, { ok: true, target: tasks[idx], audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
      }

      if (action === 'create_risk') {
        const state = await lerProjectStateSeguro();
        const risks = Array.isArray(state['risks.json']) ? state['risks.json'] : lerProjectJson('risks.json', []);
        const titulo = textoLimpo(b.titulo, 180);
        if (!titulo) return json(res, 400, { erro: 'Informe o título do risco.' });
        const risk = {
          id: proximoId(risks, 'risk-', 3),
          titulo,
          severidade: textoLimpo(b.severidade, 40) || 'media',
          status: textoLimpo(b.status, 60) || 'aberto',
          modulos_afetados: listaLimpa(b.modulos_afetados || b.modulo, 8),
          impacto: textoLimpo(b.impacto || b.detalhe, 500),
          mitigacao: textoLimpo(b.mitigacao || b.proximo_passo, 500),
          criado_via_command: true,
          criado_em: new Date().toISOString()
        };
        risks.push(risk);
        gravarProjectJson('risks.json', risks);
        const audit = registrarCommandAudit(gestor, action, 'risks.json', risk.id, `Risco criado: ${risk.titulo}`, { severidade: risk.severidade });
        const dbAction = await persistirCommandActionDb(gestor, action, b, 'risks.json', risk.id, risk, audit);
        return json(res, 201, { ok: true, target: risk, audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
      }

      if (action === 'create_decision') {
        const state = await lerProjectStateSeguro();
        const decisions = Array.isArray(state['decisions.json']) ? state['decisions.json'] : lerProjectJson('decisions.json', []);
        const decisao = textoLimpo(b.decisao || b.titulo, 220);
        if (!decisao) return json(res, 400, { erro: 'Informe a decisão.' });
        const decision = {
          id: proximoId(decisions, 'decision-', 3),
          data: dataSP(),
          decisao,
          motivo: textoLimpo(b.motivo || b.detalhe, 700),
          impacto: textoLimpo(b.impacto || b.proximo_passo, 700),
          modulos_afetados: listaLimpa(b.modulos_afetados || b.modulo, 8),
          responsavel: textoLimpo(b.responsavel, 80) || (gestor.nome || gestor.email),
          status: textoLimpo(b.status, 60) || 'proposta',
          criado_via_command: true,
          criado_em: new Date().toISOString()
        };
        decisions.push(decision);
        gravarProjectJson('decisions.json', decisions);
        const audit = registrarCommandAudit(gestor, action, 'decisions.json', decision.id, `Decisão registrada: ${decision.decisao}`, { status: decision.status });
        const dbAction = await persistirCommandActionDb(gestor, action, b, 'decisions.json', decision.id, decision, audit);
        return json(res, 201, { ok: true, target: decision, audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
      }

      if (action === 'create_agent_report') {
        const state = await lerProjectStateSeguro();
        const reports = Array.isArray(state['agent-reports.json']) ? state['agent-reports.json'] : lerProjectJson('agent-reports.json', []);
        const agent = textoLimpo(b.agent || b.agente || 'Claude', 80);
        const titulo = textoLimpo(b.titulo, 180);
        if (!titulo) return json(res, 400, { erro: 'Informe o título do relatório do agente.' });
        const report = {
          id: proximoId(reports, 'agent-report-', 3),
          agent,
          assignment_id: textoLimpo(b.assignment_id || b.missao_id, 120) || null,
          titulo,
          status: textoLimpo(b.status, 60) || 'recebido',
          modulo: textoLimpo(b.modulo, 80) || 'command-center',
          resumo: textoLimpo(b.resumo || b.detalhe, 3000),
          achados: listaLinhasLimpa(b.achados, 20, 260),
          recomendacoes: listaLinhasLimpa(b.recomendacoes || b.proximo_passo, 20, 260),
          testes_sugeridos: listaLinhasLimpa(b.testes_sugeridos || b.testes, 20, 260),
          bloqueios: listaLinhasLimpa(b.bloqueios, 12, 260),
          converte_em: listaLimpa(b.converte_em, 8),
          criado_via_command: true,
          criado_por: gestor.email,
          criado_por_nome: gestor.nome || gestor.email,
          criado_em: new Date().toISOString()
        };
        reports.push(report);
        gravarProjectJson('agent-reports.json', reports);
        const audit = registrarCommandAudit(gestor, action, 'agent-reports.json', report.id, `Relatório de agente registrado: ${report.agent} — ${report.titulo}`, { assignment_id: report.assignment_id, status: report.status });
        const dbAction = await persistirCommandActionDb(gestor, action, b, 'agent-reports.json', report.id, report, audit);
        return json(res, 201, { ok: true, target: report, audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
      }

      if (action === 'create_local_agent_task') {
        const state = await lerProjectStateSeguro();
        const queue = jsonObjeto(state['local-agent-queue.json']);
        queue.tasks = Array.isArray(queue.tasks) ? queue.tasks : [];
        const task = normalizarLocalAgentTask(b, gestor);
        task.id = proximoLocalAgentTaskId(queue);
        queue.tasks.push(task);
        gravarProjectJson('local-agent-queue.json', queue);
        const audit = registrarCommandAudit(gestor, action, 'local-agent-queue.json', task.id, `Tarefa enviada ao agente local: ${task.titulo}`, { agent_id: task.agent_id, action: task.action });
        const dbAction = await persistirCommandActionDb(gestor, action, b, 'local-agent-queue.json', task.id, task, audit);
        return json(res, 201, { ok: true, target: task, audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
      }

      if (action === 'create_deploy_record') {
        const state = await lerProjectStateSeguro();
        const deploys = Array.isArray(state['deploys.json']) ? state['deploys.json'] : lerProjectJson('deploys.json', []);
        const titulo = textoLimpo(b.titulo || b.id || 'Deploy registrado pelo Command', 180);
        const status = textoLimpo(b.status, 60) || 'planejado';
        const deploy = {
          id: proximoDeployId(deploys, titulo),
          data: dataSP(),
          titulo,
          servico: textoLimpo(b.servico, 120) || 'mayaproject/github',
          ambiente: textoLimpo(b.ambiente, 80) || 'producao',
          status,
          origem: textoLimpo(b.origem, 160) || 'Command Center',
          branch: textoLimpo(b.branch, 80) || 'main',
          merge_commit: textoLimpo(b.merge_commit || b.commit, 80),
          pull_request: textoLimpo(b.pull_request, 240),
          dominios: listaLinhasLimpa(b.dominios, 8, 120).length ? listaLinhasLimpa(b.dominios, 8, 120) : ['https://premium.titanatende.com.br', 'https://tools.titanatende.com.br'],
          validacoes: listaLinhasLimpa(b.validacoes || b.detalhe, 14, 220),
          observacoes: textoLimpo(b.observacoes || b.proximo_passo || b.detalhe, 700),
          exige_confirmacao_humana: b.exige_confirmacao_humana !== false,
          aciona_deploy_automatico: false,
          criado_via_command: true,
          criado_por: gestor.email,
          criado_em: new Date().toISOString()
        };
        deploys.push(deploy);
        gravarProjectJson('deploys.json', deploys);
        const audit = registrarCommandAudit(gestor, action, 'deploys.json', deploy.id, `Deploy registrado: ${deploy.titulo}`, { status: deploy.status, branch: deploy.branch, commit: deploy.merge_commit || null });
        const dbAction = await persistirCommandActionDb(gestor, action, b, 'deploys.json', deploy.id, deploy, audit);
        return json(res, 201, { ok: true, target: deploy, audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
      }

      if (action === 'approve_deploy_record') {
        const state = await lerProjectStateSeguro();
        const deploys = Array.isArray(state['deploys.json']) ? state['deploys.json'] : lerProjectJson('deploys.json', []);
        const id = textoLimpo(b.id || b.deploy_id, 140);
        const idx = deploys.findIndex(d => String(d.id) === id);
        if (idx < 0) return json(res, 404, { erro: 'Deploy não encontrado.' });
        if (!fraseConfirmacaoOk(b.confirmacao)) return json(res, 400, { erro: 'Digite AUTORIZO DEPLOY para registrar aprovação humana.' });
        const statusPermitidos = new Set(['aprovado_para_deploy', 'validado_pos_deploy', 'reprovado', 'rollback_necessario']);
        const status = textoLimpo(b.status, 80) || 'aprovado_para_deploy';
        if (!statusPermitidos.has(status)) return json(res, 400, { erro: 'Status de aprovação inválido.' });
        const antes = {
          status: deploys[idx].status,
          aprovado_em: deploys[idx].aprovado_em || null,
          validado_em: deploys[idx].validado_em || null
        };
        const evento = {
          tipo: status,
          usuario_email: gestor.email,
          usuario_nome: gestor.nome || gestor.email,
          criado_em: new Date().toISOString(),
          observacao: textoLimpo(b.observacoes || b.proximo_passo || b.detalhe, 700),
          validacoes: listaLinhasLimpa(b.validacoes, 12, 220)
        };
        deploys[idx] = Object.assign({}, deploys[idx], {
          status,
          confirmacao_humana: true,
          confirmacao_recebida: true,
          aciona_deploy_automatico: false,
          exige_confirmacao_humana: true,
          aprovado_por: gestor.email,
          aprovado_por_nome: gestor.nome || gestor.email,
          aprovado_em: status === 'aprovado_para_deploy' ? evento.criado_em : (deploys[idx].aprovado_em || evento.criado_em),
          validado_em: status === 'validado_pos_deploy' ? evento.criado_em : deploys[idx].validado_em,
          reprovado_em: status === 'reprovado' ? evento.criado_em : deploys[idx].reprovado_em,
          rollback_solicitado_em: status === 'rollback_necessario' ? evento.criado_em : deploys[idx].rollback_solicitado_em,
          aprovacao_observacao: evento.observacao,
          aprovacao_validacoes: evento.validacoes,
          historico_command: (Array.isArray(deploys[idx].historico_command) ? deploys[idx].historico_command : []).concat(evento).slice(-30),
          atualizado_via_command: true,
          atualizado_em: evento.criado_em
        });
        gravarProjectJson('deploys.json', deploys);
        const audit = registrarCommandAudit(gestor, action, 'deploys.json', id, `Deploy ${status}: ${id}`, { antes, depois: { status: deploys[idx].status, confirmacao_humana: true } });
        const dbAction = await persistirCommandActionDb(gestor, action, b, 'deploys.json', id, deploys[idx], audit);
        return json(res, 200, { ok: true, target: deploys[idx], audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
      }

      if (action === 'trigger_deploy_external') {
        if (!titanTemPerm(gestor, 'acionar_deploy')) return json(res, 403, { erro: 'Sem permissão para acionar deploy externo.' });
        const state = await lerProjectStateSeguro();
        const deploys = Array.isArray(state['deploys.json']) ? state['deploys.json'] : lerProjectJson('deploys.json', []);
        const id = textoLimpo(b.id || b.deploy_id, 140);
        const idx = deploys.findIndex(d => String(d.id) === id);
        if (idx < 0) return json(res, 404, { erro: 'Deploy não encontrado.' });
        if (!fraseAcionamentoOk(b.confirmacao)) return json(res, 400, { erro: 'Digite ACIONAR DEPLOY para disparar o executor externo.' });
        if (!deployWebhookUrl()) return json(res, 409, { erro: 'Executor externo não configurado no ambiente. Configure TITAN_DEPLOY_WEBHOOK_URL ou EASYPANEL_DEPLOY_WEBHOOK_URL no EasyPanel.' });
        if (!deploys[idx].confirmacao_humana) return json(res, 409, { erro: 'Este deploy ainda não tem aprovação humana registrada.' });
        if (!['aprovado_para_deploy', 'validado_pos_deploy'].includes(String(deploys[idx].status || ''))) {
          return json(res, 409, { erro: 'Deploy precisa estar aprovado_para_deploy ou validado_pos_deploy antes do acionamento externo.' });
        }
        const antes = {
          status: deploys[idx].status,
          acionado_em: deploys[idx].acionado_em || null
        };
        const acionamento = await acionarDeployWebhookSeguro(deploys[idx], gestor);
        const evento = {
          tipo: acionamento.ok ? 'deploy_externo_acionado' : 'falha_acionamento_deploy',
          usuario_email: gestor.email,
          usuario_nome: gestor.nome || gestor.email,
          criado_em: new Date().toISOString(),
          observacao: textoLimpo(b.observacoes || b.proximo_passo || b.detalhe, 700),
          webhook_status: acionamento.status || null,
          webhook_configurado: acionamento.configured === true
        };
        deploys[idx] = Object.assign({}, deploys[idx], {
          status: acionamento.ok ? 'deploy_externo_acionado' : 'falha_acionamento_deploy',
          aciona_deploy_automatico: true,
          acionamento_externo_configurado: true,
          acionamento_externo_ok: acionamento.ok,
          acionamento_externo_status: acionamento.status || null,
          acionado_por: gestor.email,
          acionado_por_nome: gestor.nome || gestor.email,
          acionado_em: evento.criado_em,
          acionamento_observacao: evento.observacao,
          historico_command: (Array.isArray(deploys[idx].historico_command) ? deploys[idx].historico_command : []).concat(evento).slice(-30),
          atualizado_via_command: true,
          atualizado_em: evento.criado_em
        });
        gravarProjectJson('deploys.json', deploys);
        const audit = registrarCommandAudit(gestor, action, 'deploys.json', id, `Deploy externo ${acionamento.ok ? 'acionado' : 'falhou'}: ${id}`, { antes, depois: { status: deploys[idx].status, webhook_status: acionamento.status || null } });
        const dbAction = await persistirCommandActionDb(gestor, action, b, 'deploys.json', id, deploys[idx], audit);
        return json(res, 200, { ok: true, trigger_ok: acionamento.ok, webhook_status: acionamento.status || null, target: deploys[idx], audit, persisted_db: dbAction.ok, db_action_id: dbAction.id || null });
      }

      return json(res, 400, { erro: 'Ação do Command não reconhecida.' });
    } catch (e) {
      return json(res, 500, { erro: 'Falha ao registrar ação no Command.', detalhe: e.message });
    }
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

  // retrato do sistema p/ a Khardela responder gestores sobre a operacao/infra.
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

  if (sub === 'est' && seg[2] === 'configuracoes' && req.method === 'GET') {
    const cfg = await estoqueTenantConfig();
    return json(res, 200, { config: cfg, fonte: 'tenants.config.estoque + valores existentes em est_produto/est_categoria' });
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
    const setor = url.searchParams.get('setor') || '';
    const r = await db.q(`SELECT p.id, p.nome, p.unidade, p.unidade_base, p.estoque_atual, p.estoque_minimo, p.estoque_ideal, p.peso_g,
        p.pode_contar, p.pode_comprar, p.pode_produzir, p.ativo,
        p.ultimo_valor, p.maior_valor, p.menor_valor, p.medio_valor, p.observacoes,
        p.departamento, p.subcategoria,
        p.marca_preferida, p.ultima_marca, p.categoria_id, p.fornecedor_preferido_id, p.ultimo_fornecedor_id,
        p.conversao_origem, p.conversao_confianca, p.conversao_precisa_revisao, p.tipo_item, p.nome_nf,
        p.local_fisico_id, l.nome AS local_fisico,
        c.nome AS categoria, f.nome AS fornecedor, uf.nome AS ultimo_fornecedor,
        COALESCE(sx.setores, '[]'::json) AS setores,
        COALESCE(sx.setor_nomes, '') AS setor_nomes
      FROM est_produto p
      LEFT JOIN est_categoria c ON c.id=p.categoria_id
      LEFT JOIN est_fornecedor f ON f.id=p.fornecedor_preferido_id
      LEFT JOIN est_fornecedor uf ON uf.id=p.ultimo_fornecedor_id
      LEFT JOIN est_local_fisico l ON l.id=p.local_fisico_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id', s.id, 'nome', s.nome) ORDER BY s.ordem, s.nome) AS setores,
               string_agg(s.nome, ', ' ORDER BY s.ordem, s.nome) AS setor_nomes
          FROM est_produto_setor ps
          JOIN est_setor s ON s.id=ps.setor_id AND s.tenant_id=ps.tenant_id
         WHERE ps.tenant_id=p.tenant_id AND ps.produto_id=p.id
      ) sx ON TRUE
      WHERE p.tenant_id=$1
        AND ($2='' OR lower(p.nome) LIKE '%'||$2||'%')
        AND ($3='' OR c.nome=$3)
        AND ($4='' OR f.nome=$4)
        AND ($5='' OR EXISTS (
          SELECT 1
            FROM est_produto_setor ps2
            JOIN est_setor s2 ON s2.id=ps2.setor_id AND s2.tenant_id=ps2.tenant_id
           WHERE ps2.tenant_id=p.tenant_id AND ps2.produto_id=p.id AND (s2.nome=$5 OR s2.id::text=$5)
        ))
      ORDER BY p.ativo DESC, c.ordem, p.nome`, [TENANT, busca, cat, forn, setor]);
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
    try {
      const uid = url.searchParams.get('usuario_id');
      const u = await rbacUserByRef(uid);
      if (!u) return json(res, 403, { erro: 'usuário inválido' });
      const gestor = perfilGestor(u);
      const setp = setoresPermitidosLista(u.setores_permitidos);
      const tudo = gestor || setp.includes('TUDO');
      const r = tudo
        ? await db.q(`SELECT p.id, p.nome, p.unidade, p.estoque_atual, s.nome AS setor
            FROM est_produto p
            JOIN est_produto_setor ps ON ps.produto_id=p.id AND ps.tenant_id=p.tenant_id
            JOIN est_setor s ON s.id=ps.setor_id AND s.tenant_id=ps.tenant_id
           WHERE p.tenant_id=$1 AND p.ativo AND p.pode_contar
           ORDER BY s.nome, p.nome`, [TENANT])
        : await db.q(`SELECT p.id, p.nome, p.unidade, p.estoque_atual, s.nome AS setor
            FROM est_produto p
            JOIN est_produto_setor ps ON ps.produto_id=p.id AND ps.tenant_id=p.tenant_id
            JOIN est_setor s ON s.id=ps.setor_id AND s.tenant_id=ps.tenant_id
           WHERE p.tenant_id=$1 AND p.ativo AND p.pode_contar
             AND (s.id::text = ANY($2::text[]) OR s.nome = ANY($2::text[]))
           ORDER BY s.nome, p.nome`, [TENANT, setp]);
      return json(res, 200, { itens: r.rows, todos: tudo, setores: setp });
    } catch (e) {
      return json(res, 500, { erro: 'Falha ao carregar itens do usuário.' });
    }
  }
  if (sub === 'est' && seg[2] === 'movimentos' && req.method === 'GET') {
    const lim = Math.min(parseInt(url.searchParams.get('limit'), 10) || 30, 100);
    const r = await db.q(`SELECT id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_nome, motivo, criado_em
      FROM est_movimento WHERE tenant_id=$1 ORDER BY criado_em DESC LIMIT $2`, [TENANT, lim]);
    return json(res, 200, { movimentos: r.rows });
  }
  // Vínculos: produtos com setores + ligação bruto->produzido (para conferência sem erro)
  if (sub === 'est' && seg[2] === 'perdas-consumo' && seg[3] === 'dashboard' && req.method === 'GET') {
    const e = await estPermsEfetivas(url.searchParams.get('usuario_id') || url.searchParams.get('admin_id'));
    if (!estPodeMovimento(e)) return json(res, 403, { erro: 'Sem permissao para ver perdas/consumo.' });
    const dias = Math.max(1, Math.min(parseInt(url.searchParams.get('dias'), 10) || 7, 90));
    const ownOnly = !(e.gestor || e.perms.includes('acessar_lancamentos'));
    const params = [TENANT, dias];
    const userSql = ownOnly ? ' AND usuario_id=$3' : '';
    if (ownOnly) params.push(e.user.id);
    const kpis = (await db.q(`SELECT tipo, COUNT(*)::int AS lancamentos, COALESCE(SUM(qtd_movimentada),0)::float AS quantidade
      FROM est_movimento
      WHERE tenant_id=$1 AND tipo IN ('PERDA','CONSUMO') AND criado_em >= NOW() - ($2::int * INTERVAL '1 day') ${userSql}
      GROUP BY tipo ORDER BY tipo`, params)).rows;
    const porProduto = (await db.q(`SELECT produto_id, produto_nome, tipo, COUNT(*)::int AS lancamentos, COALESCE(SUM(qtd_movimentada),0)::float AS quantidade
      FROM est_movimento
      WHERE tenant_id=$1 AND tipo IN ('PERDA','CONSUMO') AND criado_em >= NOW() - ($2::int * INTERVAL '1 day') ${userSql}
      GROUP BY produto_id, produto_nome, tipo
      ORDER BY lancamentos DESC, quantidade DESC
      LIMIT 12`, params)).rows;
    const porUsuario = (await db.q(`SELECT usuario_nome, COUNT(*)::int AS lancamentos, COALESCE(SUM(qtd_movimentada),0)::float AS quantidade
      FROM est_movimento
      WHERE tenant_id=$1 AND tipo IN ('PERDA','CONSUMO') AND criado_em >= NOW() - ($2::int * INTERVAL '1 day') ${userSql}
      GROUP BY usuario_nome
      ORDER BY lancamentos DESC, quantidade DESC
      LIMIT 12`, params)).rows;
    const recentes = (await db.q(`SELECT id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_nome, motivo, observacao, criado_em
      FROM est_movimento
      WHERE tenant_id=$1 AND tipo IN ('PERDA','CONSUMO') AND criado_em >= NOW() - ($2::int * INTERVAL '1 day') ${userSql}
      ORDER BY criado_em DESC LIMIT 30`, params)).rows;
    return json(res, 200, { dias, escopo: ownOnly ? 'proprio_usuario' : 'tenant', kpis, por_produto: porProduto, por_usuario: porUsuario, recentes });
  }
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
    const pid = parseInt(seg[3], 10); const setores = Array.isArray(b.setores) ? [...new Set(b.setores.map(x => parseInt(x, 10)).filter(Boolean))] : [];
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const prod = await client.query('SELECT id FROM est_produto WHERE tenant_id=$1 AND id=$2', [TENANT, pid]);
      if (!prod.rows[0]) { await client.query('ROLLBACK'); return json(res, 404, { erro: 'Produto nao encontrado.' }); }
      const setorRows = setores.length ? (await client.query('SELECT id, nome FROM est_setor WHERE tenant_id=$1 AND ativo AND id=ANY($2::int[]) ORDER BY ordem, nome', [TENANT, setores])).rows : [];
      if (setorRows.length !== setores.length) throw new Error('Um dos setores selecionados nao existe ou esta inativo.');
      await client.query('DELETE FROM est_produto_setor WHERE tenant_id=$1 AND produto_id=$2', [TENANT, pid]);
      for (const sid of setores) await client.query('INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio) VALUES ($1,$2,$3,FALSE) ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING', [TENANT, pid, sid]);
      const subcategoria = setorRows.map(s => s.nome).join(' / ') || null;
      await client.query('UPDATE est_produto SET subcategoria=$3, atualizado_em=NOW() WHERE tenant_id=$1 AND id=$2', [TENANT, pid, subcategoria]);
      await client.query('COMMIT');
      return json(res, 200, { ok: true, setores, subcategoria });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      return json(res, 400, { erro: e.code || e.message });
    } finally { client.release(); }
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
    const prods = await db.q('SELECT id,categoria_id,nome,status,codigo_externo,codigo_externo AS codigo FROM produtos WHERE tenant_id=$1 ORDER BY ordem,nome',[TENANT]);
    const grupos = await db.q('SELECT id,produto_id,nome FROM opcao_grupos WHERE tenant_id=$1 ORDER BY ordem,nome',[TENANT]);
    const opcoes = await db.q('SELECT o.id,o.grupo_id,o.nome,o.status,o.codigo_externo,o.codigo_externo AS codigo FROM opcoes o JOIN opcao_grupos g ON g.id=o.grupo_id WHERE o.tenant_id=$1 ORDER BY o.ordem,o.nome',[TENANT]);
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
          conversao_origem, conversao_confianca, conversao_precisa_revisao, tipo_item, nome_nf, local_fisico_id, departamento)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
          [TENANT, nome, b.categoria_id || null, String(b.unidade || '').trim() || null,
           b.estoque_minimo !== '' && b.estoque_minimo != null ? Number(b.estoque_minimo) : null, b.estoque_ideal !== '' && b.estoque_ideal != null ? Number(b.estoque_ideal) : null,
           b.fornecedor_preferido_id || null, b.pode_contar !== false, b.pode_comprar !== false, !!b.pode_produzir, b.observacoes || null,
           String(b.subcategoria || '').trim() || null, String(b.marca_preferida || '').trim() || null, b.peso_g !== '' && b.peso_g != null ? Number(b.peso_g) : null,
           String(b.unidade_base || '').trim() || null,
           String(b.conversao_origem || '').trim() || null, String(b.conversao_confianca || '').trim() || null, !!b.conversao_precisa_revisao,
           String(b.tipo_item || '').trim() || null, String(b.nome_nf || '').trim() || null, b.local_fisico_id || null,
           String(b.departamento || '').trim() || null]);
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
          conversao_origem=$18,conversao_confianca=$19,conversao_precisa_revisao=$20,tipo_item=$21,local_fisico_id=$22,departamento=$23,atualizado_em=NOW()
          WHERE id=$1 AND tenant_id=$16 RETURNING id`, [seg[3],nome,b.categoria_id||null,String(b.unidade||'').trim()||null,
          b.estoque_minimo!==''&&b.estoque_minimo!=null?Number(b.estoque_minimo):null,b.estoque_ideal!==''&&b.estoque_ideal!=null?Number(b.estoque_ideal):null,
          b.fornecedor_preferido_id||null,b.pode_contar!==false,b.pode_comprar!==false,!!b.pode_produzir,b.observacoes||null,
          String(b.subcategoria||'').trim()||null,String(b.marca_preferida||'').trim()||null,b.peso_g!==''&&b.peso_g!=null?Number(b.peso_g):null,b.ativo!==false,TENANT,
          String(b.unidade_base||'').trim()||null,
          String(b.conversao_origem||'').trim()||null,String(b.conversao_confianca||'').trim()||null,!!b.conversao_precisa_revisao,
          String(b.tipo_item||'').trim()||null,b.local_fisico_id||null,String(b.departamento||'').trim()||null]);
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
  const estGestor = async (uid) => { if (!uid) return null; try { const u = await rbacUserByRef(uid); return u && perfilGestor(u) ? u : null; } catch (e) { return null; } };

  if (sub === 'est' && seg[2] === 'contagem' && seg[3] === 'iniciar-geral' && req.method === 'POST') {
    const b = await readBody(req);
    const e = await estAcessoThiago(b.usuario_id);
    if (!e) return json(res, 403, { erro: 'A contagem geral com edição rápida está liberada somente para o Thiago.' });
    const aberta = await db.q(`SELECT id, setor_nome, usuario_nome, iniciada_em
      FROM est_contagem
      WHERE tenant_id=$1 AND setor_id IS NULL AND usuario_id=$2 AND setor_nome='Contagem geral' AND status='EM_ANDAMENTO'
      ORDER BY iniciada_em DESC LIMIT 1`, [TENANT, e.user.id]);
    if (aberta.rows[0]) {
      const ai = await db.q('SELECT id, produto_id, produto_nome, unidade, obrigatorio, quantidade, status, observacao, geral FROM est_contagem_item WHERE contagem_id=$1 ORDER BY produto_nome', [aberta.rows[0].id]);
      return json(res, 200, { contagem: Object.assign({}, aberta.rows[0], { geral_total: true }), itens: ai.rows, retomada: true });
    }
    const itens = await db.q(`SELECT id, nome, unidade
      FROM est_produto
      WHERE tenant_id=$1 AND ativo AND pode_contar
      ORDER BY nome`, [TENANT]);
    if (!itens.rows.length) return json(res, 400, { erro: 'Não há produtos ativos para contar.' });
    const c = await db.q(`INSERT INTO est_contagem (tenant_id, setor_id, setor_nome, usuario_id, usuario_nome, status, status_auditoria)
      VALUES ($1,NULL,'Contagem geral',$2,$3,'EM_ANDAMENTO','AGUARDANDO')
      RETURNING id, setor_nome, usuario_nome, iniciada_em`, [TENANT, e.user.id, e.user.nome || e.user.apelido_login || 'Thiago']);
    const cid = c.rows[0].id;
    for (const it of itens.rows) {
      await db.q(`INSERT INTO est_contagem_item (tenant_id, contagem_id, produto_id, produto_nome, unidade, obrigatorio, status, geral)
        VALUES ($1,$2,$3,$4,$5,FALSE,'PENDENTE',TRUE)`,
        [TENANT, cid, it.id, it.nome, it.unidade]);
    }
    const out = await db.q('SELECT id, produto_id, produto_nome, unidade, obrigatorio, quantidade, status, observacao, geral FROM est_contagem_item WHERE contagem_id=$1 ORDER BY produto_nome', [cid]);
    return json(res, 201, { contagem: Object.assign({}, c.rows[0], { geral_total: true }), itens: out.rows });
  }

  if (sub === 'est' && seg[2] === 'contagem' && seg[3] === 'iniciar' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.usuario_id || !b.setor_id) return json(res, 400, { erro: 'informe usuario_id e setor_id' });
    if (!(await estPode(b.usuario_id, 'fazer_contagem'))) return json(res, 403, { erro: 'Sem permissão para fazer contagem.' });
    const uref = await rbacUserByRef(b.usuario_id);
    if (!uref) return json(res, 403, { erro: 'usuário inválido' });
    const s = await db.q('SELECT id, nome FROM est_setor WHERE id=$1 AND tenant_id=$2', [b.setor_id, TENANT]);
    if (!s.rows[0]) return json(res, 400, { erro: 'setor inválido' });
    const gestor = perfilGestor(uref);
    const permitidos = setoresPermitidosLista(uref.setores_permitidos);
    if (!gestor && !permitidos.includes('TUDO') && !permitidos.includes(String(s.rows[0].id)) && !permitidos.includes(s.rows[0].nome))
      return json(res, 403, { erro: 'Este setor não está atribuído ao colaborador.' });
    const aberta = await db.q(`SELECT id, setor_nome, usuario_nome, iniciada_em FROM est_contagem
      WHERE tenant_id=$1 AND setor_id=$2 AND usuario_id=$3 AND status='EM_ANDAMENTO' ORDER BY iniciada_em DESC LIMIT 1`,
      [TENANT, s.rows[0].id, uref.id]);
    if (aberta.rows[0]) {
      const ai = await db.q('SELECT id, produto_id, produto_nome, unidade, obrigatorio, quantidade, status, observacao, geral FROM est_contagem_item WHERE contagem_id=$1 ORDER BY geral, produto_nome', [aberta.rows[0].id]);
      return json(res, 200, { contagem: aberta.rows[0], itens: ai.rows, retomada: true });
    }
    const itens = await db.q(`SELECT ps.produto_id, ps.obrigatorio, p.nome, p.unidade
      FROM est_produto_setor ps JOIN est_produto p ON p.id=ps.produto_id
      WHERE ps.tenant_id=$1 AND ps.setor_id=$2 AND p.ativo AND p.pode_contar ORDER BY p.nome`, [TENANT, b.setor_id]);
    if (!itens.rows.length) return json(res, 400, { erro: 'Este setor não tem itens. Configure os itens do setor primeiro.' });
    const c = await db.q(`INSERT INTO est_contagem (tenant_id, setor_id, setor_nome, usuario_id, usuario_nome, status, status_auditoria)
      VALUES ($1,$2,$3,$4,$5,'EM_ANDAMENTO','AGUARDANDO') RETURNING id, setor_nome, usuario_nome, iniciada_em`, [TENANT, s.rows[0].id, s.rows[0].nome, uref.id, uref.nome]);
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
  if (sub === 'est' && seg[2] === 'contagem' && seg[3] && seg[4] === 'exportar' && req.method === 'GET') {
    const e = await estAcessoThiago(url.searchParams.get('usuario_id'));
    if (!e) return json(res, 403, { erro: 'Exportação rápida liberada somente para o Thiago.' });
    const cid = seg[3];
    const c = await db.q('SELECT id, setor_nome, usuario_nome, status, status_auditoria, iniciada_em, encerrada_em FROM est_contagem WHERE id=$1 AND tenant_id=$2', [cid, TENANT]);
    if (!c.rows[0]) return json(res, 404, { erro: 'Contagem não encontrada.' });
    const itens = await db.q(`SELECT produto_nome, unidade, quantidade, status, observacao, geral
      FROM est_contagem_item
      WHERE contagem_id=$1 AND tenant_id=$2
      ORDER BY produto_nome`, [cid, TENANT]);
    const linhas = [
      ['Contagem', c.rows[0].setor_nome],
      ['Responsável', c.rows[0].usuario_nome],
      ['Status', c.rows[0].status],
      ['Auditoria', c.rows[0].status_auditoria],
      ['Iniciada em', c.rows[0].iniciada_em],
      ['Encerrada em', c.rows[0].encerrada_em || ''],
      [],
      ['Item', 'Unidade', 'Quantidade contada', 'Status', 'Tipo', 'Observação']
    ];
    for (const it of itens.rows) linhas.push([it.produto_nome, it.unidade || '', it.quantidade == null ? '' : String(it.quantidade).replace('.', ','), it.status, it.geral ? 'geral' : 'setor', it.observacao || '']);
    const csv = '\ufeff' + linhas.map(l => l.map(csvCell).join(';')).join('\r\n');
    const safeId = String(cid).replace(/[^a-z0-9-]/gi, '');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contagem-${safeId}.csv"`,
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(csv);
  }
  if (sub === 'est' && seg[2] === 'contagem' && seg[3] && seg[4] === 'item' && !seg[5] && req.method === 'POST') {
    const b = await readBody(req); const cid = seg[3];
    const e = await estAcessoThiago(b.usuario_id);
    if (!e) return json(res, 403, { erro: 'Adicionar item durante a contagem está liberado somente para o Thiago.' });
    const nome = String(b.nome || '').trim();
    const unidade = String(b.unidade || '').trim().toUpperCase();
    if (!nome) return json(res, 400, { erro: 'Informe o nome do item.' });
    if (!unidade) return json(res, 400, { erro: 'Informe a unidade de medida.' });
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const cont = await client.query(`SELECT id, usuario_id, status FROM est_contagem WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [cid, TENANT]);
      if (!cont.rows[0]) { await client.query('ROLLBACK'); return json(res, 404, { erro: 'Contagem não encontrada.' }); }
      if (String(cont.rows[0].usuario_id) !== String(e.user.id)) { await client.query('ROLLBACK'); return json(res, 403, { erro: 'Esta contagem não pertence ao seu usuário.' }); }
      if (cont.rows[0].status !== 'EM_ANDAMENTO') { await client.query('ROLLBACK'); return json(res, 409, { erro: 'Esta contagem já foi encerrada.' }); }
      const setorGeraisId = await estEnsureGeraisSetor(client);
      let prod = await client.query('SELECT id, nome, unidade, ativo FROM est_produto WHERE tenant_id=$1 AND lower(nome)=lower($2) ORDER BY ativo DESC, id LIMIT 1', [TENANT, nome]);
      if (prod.rows[0]) {
        await client.query('UPDATE est_produto SET nome=$2, unidade=$3, pode_contar=TRUE, ativo=TRUE, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$4', [prod.rows[0].id, nome, unidade, TENANT]);
      } else {
        prod = await client.query(`INSERT INTO est_produto (tenant_id, nome, unidade, pode_contar, pode_comprar, pode_produzir, ativo, observacoes)
          VALUES ($1,$2,$3,TRUE,TRUE,FALSE,TRUE,$4) RETURNING id, nome, unidade`,
          [TENANT, nome, unidade, 'Criado durante contagem geral pelo Thiago']);
      }
      const produtoId = prod.rows[0].id;
      await client.query('INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio) VALUES ($1,$2,$3,FALSE) ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING', [TENANT, produtoId, setorGeraisId]);
      let item = await client.query('SELECT id, produto_id, produto_nome, unidade, obrigatorio, quantidade, status, observacao, geral FROM est_contagem_item WHERE tenant_id=$1 AND contagem_id=$2 AND produto_id=$3 LIMIT 1', [TENANT, cid, produtoId]);
      if (!item.rows[0]) {
        item = await client.query(`INSERT INTO est_contagem_item (tenant_id, contagem_id, produto_id, produto_nome, unidade, obrigatorio, status, geral)
          VALUES ($1,$2,$3,$4,$5,FALSE,'PENDENTE',TRUE)
          RETURNING id, produto_id, produto_nome, unidade, obrigatorio, quantidade, status, observacao, geral`,
          [TENANT, cid, produtoId, nome, unidade]);
      }
      await client.query('COMMIT');
      return json(res, 201, { ok: true, item: item.rows[0], produto_id: produtoId });
    } catch (e2) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      return json(res, 400, { erro: e2.code === '23505' ? 'Já existe um produto com esse nome.' : (e2.code || e2.message) });
    } finally { client.release(); }
  }
  if (sub === 'est' && seg[2] === 'contagem' && seg[3] && seg[4] === 'item' && seg[5] && seg[6] === 'produto' && req.method === 'PATCH') {
    const b = await readBody(req); const cid = seg[3], iid = seg[5];
    const e = await estAcessoThiago(b.usuario_id);
    if (!e) return json(res, 403, { erro: 'Editar item durante a contagem está liberado somente para o Thiago.' });
    const nome = String(b.nome || '').trim();
    const unidade = String(b.unidade || '').trim().toUpperCase();
    if (!nome) return json(res, 400, { erro: 'Informe o nome do item.' });
    if (!unidade) return json(res, 400, { erro: 'Informe a unidade de medida.' });
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const item = await client.query(`SELECT ci.id, ci.produto_id, c.usuario_id, c.status
        FROM est_contagem_item ci JOIN est_contagem c ON c.id=ci.contagem_id AND c.tenant_id=ci.tenant_id
        WHERE ci.id=$1 AND ci.contagem_id=$2 AND ci.tenant_id=$3 FOR UPDATE OF ci, c`, [iid, cid, TENANT]);
      if (!item.rows[0]) { await client.query('ROLLBACK'); return json(res, 404, { erro: 'Item da contagem não encontrado.' }); }
      if (String(item.rows[0].usuario_id) !== String(e.user.id)) { await client.query('ROLLBACK'); return json(res, 403, { erro: 'Esta contagem não pertence ao seu usuário.' }); }
      if (item.rows[0].status !== 'EM_ANDAMENTO') { await client.query('ROLLBACK'); return json(res, 409, { erro: 'Esta contagem já foi encerrada.' }); }
      if (!item.rows[0].produto_id) { await client.query('ROLLBACK'); return json(res, 400, { erro: 'Este item não está vinculado a um produto.' }); }
      await client.query('UPDATE est_produto SET nome=$2, unidade=$3, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$4', [item.rows[0].produto_id, nome, unidade, TENANT]);
      const up = await client.query(`UPDATE est_contagem_item SET produto_nome=$3, unidade=$4
        WHERE id=$1 AND contagem_id=$2 AND tenant_id=$5
        RETURNING id, produto_id, produto_nome, unidade, obrigatorio, quantidade, status, observacao, geral`,
        [iid, cid, nome, unidade, TENANT]);
      await client.query('COMMIT');
      return json(res, 200, { ok: true, item: up.rows[0] });
    } catch (e2) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      return json(res, 400, { erro: e2.code === '23505' ? 'Já existe outro produto com esse nome.' : (e2.code || e2.message) });
    } finally { client.release(); }
  }
  if (sub === 'est' && seg[2] === 'contagem' && seg[3] && seg[4] === 'item' && seg[5] && req.method === 'DELETE') {
    const b = await readBody(req); const cid = seg[3], iid = seg[5];
    const e = await estAcessoThiago(b.usuario_id);
    if (!e) return json(res, 403, { erro: 'Excluir item durante a contagem está liberado somente para o Thiago.' });
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const item = await client.query(`SELECT ci.id, ci.produto_id, c.usuario_id, c.status
        FROM est_contagem_item ci JOIN est_contagem c ON c.id=ci.contagem_id AND c.tenant_id=ci.tenant_id
        WHERE ci.id=$1 AND ci.contagem_id=$2 AND ci.tenant_id=$3 FOR UPDATE OF ci, c`, [iid, cid, TENANT]);
      if (!item.rows[0]) { await client.query('ROLLBACK'); return json(res, 404, { erro: 'Item da contagem não encontrado.' }); }
      if (String(item.rows[0].usuario_id) !== String(e.user.id)) { await client.query('ROLLBACK'); return json(res, 403, { erro: 'Esta contagem não pertence ao seu usuário.' }); }
      if (item.rows[0].status !== 'EM_ANDAMENTO') { await client.query('ROLLBACK'); return json(res, 409, { erro: 'Esta contagem já foi encerrada.' }); }
      await client.query('DELETE FROM est_contagem_item WHERE id=$1 AND contagem_id=$2 AND tenant_id=$3', [iid, cid, TENANT]);
      if (item.rows[0].produto_id) await client.query('UPDATE est_produto SET ativo=FALSE, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$2', [item.rows[0].produto_id, TENANT]);
      await client.query('COMMIT');
      return json(res, 200, { ok: true });
    } catch (e2) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      return json(res, 400, { erro: e2.code || e2.message });
    } finally { client.release(); }
  }
  if (sub === 'est' && seg[2] === 'contagem' && seg[3] && seg[4] === 'item' && seg[5] && req.method === 'PATCH') {
    const b = await readBody(req); const cid = seg[3], iid = seg[5];
    const e = await estPermsEfetivas(b.usuario_id);
    if (!e.user || (!e.gestor && !e.perms.includes('fazer_contagem'))) return json(res, 403, { erro: 'Sem permissão para fazer contagem.' });
    const c = await db.q('SELECT usuario_id, status FROM est_contagem WHERE id=$1 AND tenant_id=$2', [cid, TENANT]);
    if (!c.rows[0]) return json(res, 404, { erro: 'Contagem não encontrada.' });
    if (!e.gestor && String(c.rows[0].usuario_id) !== String(e.user.id)) return json(res, 403, { erro: 'Esta contagem pertence a outro colaborador.' });
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
    if (!e.gestor && String(owner.rows[0].usuario_id) !== String(e.user.id)) return json(res, 403, { erro: 'Esta contagem pertence a outro colaborador.' });
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
    const e = await estPermsEfetivas(b.usuario_id);
    if (!e.user || !(e.gestor || e.perms.includes('auditar_contagem'))) return json(res, 403, { erro: 'Sem permissão para auditar.' });
    const g = e.user;
    const cab = await db.q('SELECT status, status_auditoria FROM est_contagem WHERE id=$1 AND tenant_id=$2', [cid, TENANT]);
    if (!cab.rows[0]) return json(res, 404, { erro: 'Contagem não encontrada.' });
    const acao = b.acao;
    if (acao === 'aprovar') {
      if (cab.rows[0].status !== 'ENCERRADA') return json(res, 409, { erro: 'Só é possível aprovar contagem encerrada.' });
      const its = await db.q('SELECT produto_id, quantidade FROM est_contagem_item WHERE contagem_id=$1 AND quantidade IS NOT NULL AND produto_id IS NOT NULL', [cid]);
      for (const it of its.rows) {
        const cur = await db.q('SELECT estoque_atual FROM est_produto WHERE id=$1', [it.produto_id]);
        const antes = cur.rows[0] ? Number(cur.rows[0].estoque_atual) : 0, depois = Number(it.quantidade);
        await db.q('UPDATE est_produto SET estoque_atual=$2, atualizado_em=NOW() WHERE id=$1', [it.produto_id, depois]);
        await db.q(`INSERT INTO est_movimento (tenant_id, produto_id, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, ref)
          VALUES ($1,$2,'CONTAGEM',$3,$4,$5,'CONTAGEM',$6,$7,$8)`, [TENANT, it.produto_id, antes, depois - antes, depois, g.id, g.nome, cid]);
      }
      await db.q("UPDATE est_contagem SET status='APROVADA', status_auditoria='APROVADA' WHERE id=$1 AND tenant_id=$2", [cid, TENANT]);
    } else if (acao === 'reprovar') {
      await db.q("UPDATE est_contagem SET status='REPROVADA', status_auditoria='REPROVADA' WHERE id=$1 AND tenant_id=$2", [cid, TENANT]);
    } else if (acao === 'corrigir') {
      await db.q("UPDATE est_contagem SET status='EM_ANDAMENTO', status_auditoria='CORRECAO_SOLICITADA' WHERE id=$1 AND tenant_id=$2", [cid, TENANT]);
    } else return json(res, 400, { erro: 'ação inválida' });
    await db.q('INSERT INTO est_auditoria (tenant_id, contagem_id, gestor_id, gestor_nome, acao, observacao) VALUES ($1,$2,$3,$4,$5,$6)', [TENANT, cid, g.id, g.nome, acao, b.observacao || null]);
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
  if (sub === 'est' && seg[2] === 'match-produtos' && req.method === 'POST') {
    const b = await readBody(req);
    const e = await estPermsEfetivas(b.usuario_id);
    const pode = e.user && (e.gestor || e.perms.includes('registrar_compra') || e.perms.includes('acessar_lancamentos') || e.perms.includes('registrar_perda_consumo') || e.perms.includes('acessar_produtos'));
    if (!pode) return json(res, 403, { erro: 'Sem permissao para consultar vinculos de produtos.' });
    const escopo = String(b.escopo || b.modo || '').toLowerCase();
    const onlyCompraveis = !(escopo === 'movimento' || escopo === 'perda' || escopo === 'consumo' || escopo === 'estoque');
    const textos = Array.isArray(b.textos) ? b.textos : [{ texto: b.texto || b.produto || '', idx: 0, marca: b.marca || '', unidade: b.unidade || '' }];
    const limpos = textos.slice(0, 80).map((x, i) => typeof x === 'string' ? { texto: x, idx: i } : {
      idx: x.idx != null ? x.idx : i,
      texto: String(x.texto || x.produto || x.nome || '').slice(0, 240),
      marca: String(x.marca || '').slice(0, 80),
      unidade: String(x.unidade || '').slice(0, 30)
    }).filter(x => x.texto || x.marca);
    return json(res, 200, { resultados: await estMatchProdutosEntrada(limpos, 0.45, { onlyCompraveis }) });
  }

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
    const e = await estPermsEfetivas(b.usuario_id);
    if (!e.user || !(e.gestor || e.perms.includes('registrar_compra'))) return json(res, 403, { erro: 'Sem permissão para registrar compra.' });
    const itens = (Array.isArray(b.itens) ? b.itens : []).filter(it => it.produto_id);
    if (!itens.length) return json(res, 400, { erro: 'Selecione ao menos um produto.' });
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      let total = 0;
      const c = await client.query(`INSERT INTO est_compra (tenant_id, fornecedor_id, usuario_id, usuario_nome, origem, status, data_compra)
        VALUES ($1,$2,$3,$4,$5,'CONFIRMADA',COALESCE($6,CURRENT_DATE)) RETURNING id`,
        [TENANT, b.fornecedor_id || null, e.user.id, e.user.nome, b.origem || 'MANUAL', b.data_compra || null]);
      const cid = c.rows[0].id;
      for (const it of itens) {
        const qtd = Number(String(it.quantidade == null ? '' : it.quantidade).replace(',', '.'));
        if (!(qtd > 0)) throw new Error('Toda entrada de compra precisa de quantidade maior que zero.');
        let vu = it.valor_unitario != null && it.valor_unitario !== '' ? Number(String(it.valor_unitario).replace(',', '.')) : null;
        let vt = it.valor_total != null && it.valor_total !== '' ? Number(String(it.valor_total).replace(',', '.')) : null;
        if (vu != null && !(vu >= 0)) vu = null;
        if (vt != null && !(vt >= 0)) vt = null;
        if (vu == null && vt != null && qtd) vu = vt / qtd;
        if (vt == null && vu != null) vt = vu * qtd;
        total += vt || 0;
        const cur = await client.query('SELECT id, nome, estoque_atual, legado FROM est_produto WHERE id=$1 AND tenant_id=$2 AND ativo FOR UPDATE', [it.produto_id, TENANT]);
        if (!cur.rows[0]) throw new Error('Produto da compra não encontrado ou inativo.');
        const textoOriginal = String(it.texto_original || it.nome_original || it.produto_original || '').trim().slice(0, 240) || null;
        let matchScore = it.match_score != null && it.match_score !== '' ? Number(String(it.match_score).replace(',', '.')) : null;
        if (matchScore != null && !(matchScore >= 0 && matchScore <= 1)) matchScore = null;
        const matchStatus = String(it.match_status || '').trim().slice(0, 30) || null;
        await client.query('INSERT INTO est_compra_item (tenant_id, compra_id, produto_id, marca, quantidade, unidade, valor_unitario, valor_total, texto_original, match_score, match_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [TENANT, cid, it.produto_id, it.marca || null, qtd, it.unidade || null, vu, vt, textoOriginal, matchScore, matchStatus]);
        const antes = Number(cur.rows[0].estoque_atual), depois = antes + qtd;
        await client.query('UPDATE est_produto SET estoque_atual=$2, ultima_marca=COALESCE($3,ultima_marca), ultimo_fornecedor_id=COALESCE($4,ultimo_fornecedor_id), atualizado_em=NOW() WHERE id=$1 AND tenant_id=$5', [it.produto_id, depois, it.marca || null, b.fornecedor_id || null, TENANT]);
        if (textoOriginal && ['auto', 'confirmado', 'manual'].includes(matchStatus || '')) {
          const legado = estAsObj(cur.rows[0].legado);
          const aliasNorm = estTextoBusca(textoOriginal), nomeNorm = estTextoBusca(cur.rows[0].nome);
          if (aliasNorm && aliasNorm !== nomeNorm) {
            const aliases = estAliasList(legado);
            if (!aliases.some(a => estTextoBusca(a) === aliasNorm)) {
              legado.match_aliases = aliases.concat([textoOriginal]).slice(-40);
              await client.query('UPDATE est_produto SET legado=$2, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$3', [it.produto_id, JSON.stringify(legado), TENANT]);
            }
          }
        }
        await client.query(`INSERT INTO est_movimento (tenant_id, produto_id, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, ref, motivo)
          VALUES ($1,$2,'ENTRADA',$3,$4,$5,'COMPRA',$6,$7,$8,'Compra')`, [TENANT, it.produto_id, antes, qtd, depois, e.user.id, e.user.nome, cid]);
        if (vu != null && vu > 0) {
          await client.query(`UPDATE est_produto SET ultimo_valor=$2, maior_valor=GREATEST(COALESCE(maior_valor,0),$2), menor_valor=LEAST(COALESCE(menor_valor,$2),$2) WHERE id=$1 AND tenant_id=$3`, [it.produto_id, vu, TENANT]);
          await client.query(`UPDATE est_produto p SET medio_valor=(SELECT AVG(ci.valor_unitario) FROM est_compra_item ci JOIN est_compra cc ON cc.id=ci.compra_id WHERE ci.produto_id=p.id AND ci.valor_unitario IS NOT NULL AND cc.tenant_id=$1) WHERE p.id=$2 AND p.tenant_id=$1`, [TENANT, it.produto_id]);
        }
      }
      await client.query('UPDATE est_compra SET total=$2 WHERE id=$1 AND tenant_id=$3', [cid, total, TENANT]);
      await client.query('COMMIT');
      return json(res, 201, { ok: true, id: cid, total });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      return json(res, 400, { erro: e.code || e.message });
    } finally {
      client.release();
    }
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
    const gestores = (await db.q(`SELECT phone, perfil_principal, perfis_adicionais FROM rbac_contacts WHERE tenant_id=$1 AND ativo AND COALESCE(phone,'')<>''`, [TENANT])).rows
      .filter(perfilGestor).map(r => soPhone(r.phone)).filter(Boolean);
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

  // ---- Receitas do estoque (visão do gestor sobre fichas de produção) ----
  if (sub === 'est' && seg[2] === 'receitas' && req.method === 'GET') {
    const uid = url.searchParams.get('usuario_id') || url.searchParams.get('admin_id');
    const e = await estPermsEfetivas(uid);
    if (!e.user) return json(res, 403, { erro: 'Faça login.' });
    if (!(e.gestor || e.perms.includes('acessar_producao_interna') || e.perms.includes('editar_produtos'))) {
      return json(res, 403, { erro: 'Sem permissão para acessar receitas.' });
    }
    const status = String(url.searchParams.get('status') || 'ativas').toLowerCase();
    const busca = estNorm(url.searchParams.get('q') || url.searchParams.get('busca') || '');
    const rows = await db.q(`SELECT p.id AS produto_id,p.nome,p.unidade,p.ativo AS produto_ativo,
        COALESCE(p.pode_produzir,FALSE) AS pode_produzir,p.estoque_atual,p.departamento,p.subcategoria,
        c.nome AS categoria,f.id AS ficha_id,COALESCE(f.ativo,FALSE) AS ficha_ativa,
        f.descricao,f.unidade_consumo,f.tipo,f.instrucoes,f.atualizado_em,
        COALESCE(sx.setores,'') AS setores,
        COALESCE(px.porcoes,0)::int AS porcoes,
        COALESCE(px.ingredientes,0)::int AS ingredientes
      FROM est_produto p
      LEFT JOIN est_categoria c ON c.id=p.categoria_id AND c.tenant_id=p.tenant_id
      LEFT JOIN est_ficha_producao f ON f.tenant_id=p.tenant_id AND f.produto_id=p.id
      LEFT JOIN LATERAL (
        SELECT string_agg(s.nome, ', ' ORDER BY s.ordem,s.nome) AS setores
        FROM est_produto_setor ps
        JOIN est_setor s ON s.id=ps.setor_id AND s.tenant_id=ps.tenant_id
        WHERE ps.tenant_id=p.tenant_id AND ps.produto_id=p.id
      ) sx ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT po.id) FILTER (WHERE po.ativo)::int AS porcoes,
          COUNT(pi.id) FILTER (WHERE po.ativo)::int AS ingredientes
        FROM est_ficha_porcao po
        LEFT JOIN est_ficha_porcao_item pi ON pi.tenant_id=po.tenant_id AND pi.porcao_id=po.id
        WHERE po.tenant_id=p.tenant_id AND po.ficha_id=f.id
      ) px ON TRUE
      WHERE p.tenant_id=$1 AND (COALESCE(p.pode_produzir,FALSE) OR f.id IS NOT NULL)
      ORDER BY COALESCE(sx.setores,''),p.nome`, [TENANT]);
    const todas = rows.rows.map(r => {
      const temFicha = !!r.ficha_id;
      const ativa = !!(r.produto_ativo && r.pode_produzir && temFicha && r.ficha_ativa);
      const incompleta = !!(r.produto_ativo && r.pode_produzir && !ativa);
      const situacao = ativa ? 'ativa' : incompleta ? 'incompleta' : 'inativa';
      return {
        ...r,
        ativa,
        incompleta,
        situacao,
        setores: r.setores || 'Sem setor',
        unidade_consumo: r.unidade_consumo || r.unidade || '',
        descricao: r.descricao || r.nome,
        tipo: r.tipo || 'PRODUZIDO'
      };
    });
    let receitas = todas;
    if (busca) receitas = receitas.filter(r => estNorm([r.nome, r.descricao, r.categoria, r.departamento, r.subcategoria, r.setores].filter(Boolean).join(' ')).includes(busca));
    if (status === 'inativas') receitas = receitas.filter(r => r.situacao === 'inativa');
    else if (status !== 'todas') receitas = receitas.filter(r => r.situacao !== 'inativa');
    const kpis = {
      total: todas.length,
      ativas: todas.filter(r => r.situacao === 'ativa').length,
      incompletas: todas.filter(r => r.situacao === 'incompleta').length,
      inativas: todas.filter(r => r.situacao === 'inativa').length
    };
    return json(res, 200, { receitas, kpis, status });
  }

  // ---- Produção Interna (ficha técnica + baixa de insumos) ----
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'produzidos' && req.method === 'GET') {
    const prods = await db.q(`SELECT p.id,p.nome,p.unidade,p.estoque_atual,p.estoque_ideal,
        COALESCE(string_agg(DISTINCT s.nome, ', ' ORDER BY s.nome), 'Sem setor') AS setor,
        COALESCE(array_agg(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL), '{}') AS setores,
        f.id AS ficha_id,COUNT(DISTINCT po.id)::int AS porcoes,COUNT(DISTINCT pi.id)::int AS ingredientes
      FROM est_produto p
      LEFT JOIN est_produto_setor ps ON ps.tenant_id=p.tenant_id AND ps.produto_id=p.id
      LEFT JOIN est_setor s ON s.id=ps.setor_id
      LEFT JOIN est_ficha_producao f ON f.tenant_id=p.tenant_id AND f.produto_id=p.id AND f.ativo
      LEFT JOIN est_ficha_porcao po ON po.tenant_id=p.tenant_id AND po.ficha_id=f.id AND po.ativo
      LEFT JOIN est_ficha_porcao_item pi ON pi.tenant_id=p.tenant_id AND pi.porcao_id=po.id
      WHERE p.tenant_id=$1 AND p.ativo AND p.pode_produzir
      GROUP BY p.id,f.id ORDER BY setor,p.nome`, [TENANT]);
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
      if(b.atualizar_setores === true && Array.isArray(b.setores)){await client.query('DELETE FROM est_produto_setor WHERE tenant_id=$1 AND produto_id=$2',[TENANT,pid]);for(const sid of b.setores.map(Number).filter(Boolean))await client.query('INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) VALUES ($1,$2,$3,FALSE) ON CONFLICT DO NOTHING',[TENANT,pid,sid]);}
      await client.query('COMMIT');return json(res,200,{ok:true,ficha_id:fichaId,porcoes:mantidas.length});
    }catch(e){try{await client.query('ROLLBACK')}catch(_){}return json(res,400,{erro:e.code||e.message});}finally{client.release();}
  }
  if (sub === 'est' && seg[2] === 'producao' && seg[3] === 'ficha' && seg[4] && seg[5] === 'restaurar' && req.method === 'POST') {
    const b=await readBody(req);if(!(await estPode(b.usuario_id,'editar_produtos')))return json(res,403,{erro:'Sem permissão para restaurar fichas.'});
    const pid=parseInt(seg[4],10),client=await db.pool.connect();try{await client.query('BEGIN');
      const f=await client.query('UPDATE est_ficha_producao SET ativo=TRUE,atualizado_em=NOW() WHERE tenant_id=$1 AND produto_id=$2 RETURNING id',[TENANT,pid]);
      if(!f.rows[0]){await client.query('ROLLBACK');return json(res,404,{erro:'Ficha não encontrada para este produto.'});}
      await client.query('UPDATE est_ficha_porcao SET ativo=TRUE,atualizado_em=NOW() WHERE tenant_id=$1 AND ficha_id=$2',[TENANT,f.rows[0].id]);
      await client.query('UPDATE est_produto SET pode_produzir=TRUE,atualizado_em=NOW() WHERE tenant_id=$1 AND id=$2',[TENANT,pid]);
      const sync=await estSyncReceitaCompat(client,pid,f.rows[0].id);
      await client.query('COMMIT');return json(res,200,{ok:true,ficha_id:f.rows[0].id,espelho:sync.espelho});
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
    const e = await estPermsEfetivas(b.usuario_id);
    if (!e.user) return json(res, 403, { erro: 'Faça login.' });
    if (!(e.gestor || e.perms.includes('acessar_producao_interna'))) return json(res, 403, { erro: 'Sem permissão para lançar produção.' });
    const usuarioId = e.user.id;
    const uname = e.user.nome || e.user.apelido_login || null;
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
      const run = await client.query(`INSERT INTO est_producao_run (tenant_id, produto_id, quantidade, rendido, perda, usuario_id, usuario_nome, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [TENANT, pid, qtd, rendido, perda || null, usuarioId, uname, b.observacao || null]);
      const runId = run.rows[0].id; const avisos = [];
      for (const r of rec.rows) {
      const qpu = r.quantidade_por_unidade != null ? Number(r.quantidade_por_unidade) : 0;
      const rend = r.rendimento != null && Number(r.rendimento) > 0 ? Number(r.rendimento) : 1;
      // por unidade produzida: converte g/kg/ml -> unidade de contagem do bruto via peso_g
      const baixa = estBaixaEmUnidades(qpu, r.receita_unidade, r.peso_g, r.estoque_unidade) * qtd / rend;
      if (!(baixa > 0)) continue;
      const antes = Number(r.estoque_atual), depois = antes - baixa;
      await client.query('UPDATE est_produto SET estoque_atual=$2, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$3', [r.insumo_produto_id, depois, TENANT]);
      await client.query(`INSERT INTO est_movimento (tenant_id, produto_id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, motivo, ref) VALUES ($1,$2,$3,'PRODUCAO_BAIXA',$4,$5,$6,'PRODUCAO',$7,$8,$9,$10)`, [TENANT, r.insumo_produto_id, r.insumo, antes, baixa, depois, usuarioId, uname, 'Produção de ' + p.rows[0].nome, runId]);
      if (depois < 0) avisos.push(r.insumo + ' ficou negativo (' + depois.toFixed(3) + ')');
    }
    const antesP = Number(p.rows[0].estoque_atual), depoisP = antesP + entrada;
    await client.query('UPDATE est_produto SET estoque_atual=$2, atualizado_em=NOW() WHERE id=$1 AND tenant_id=$3', [pid, depoisP, TENANT]);
    await client.query(`INSERT INTO est_movimento (tenant_id, produto_id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, motivo, ref) VALUES ($1,$2,$3,'PRODUCAO_ENTRADA',$4,$5,$6,'PRODUCAO',$7,$8,$9,$10)`, [TENANT, pid, p.rows[0].nome, antesP, entrada, depoisP, usuarioId, uname, 'Produção interna', runId]);
    // Perda de produção (merma): diferença entre a base e o rendido real
    let perda_pct = null, alerta_perda = null;
    if (perda > 0) {
      perda_pct = qtd > 0 ? (perda / qtd * 100) : 0;
      await client.query(`INSERT INTO est_movimento (tenant_id, produto_id, produto_nome, tipo, qtd_antes, qtd_movimentada, qtd_depois, origem, usuario_id, usuario_nome, motivo, ref) VALUES ($1,$2,$3,'PERDA',$4,$5,$6,'PRODUCAO',$7,$8,$9,$10)`,
        [TENANT, pid, p.rows[0].nome, depoisP, perda, depoisP, usuarioId, uname, 'Merma de produção (' + perda_pct.toFixed(1) + '%)', runId]);
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
    const r = await db.q(`SELECT id, nome, apelido_login, perfil_principal, perfis_adicionais, setores_permitidos,
        ativo, (pin_hash IS NOT NULL) AS tem_pin, pin_must_change
      FROM rbac_contacts WHERE tenant_id=$1 AND ativo ORDER BY nome`, [TENANT]);
    return json(res, 200, { usuarios: r.rows, catalogo: EST_PERMS });
  }
  if (sub === 'est' && seg[2] === 'usuario' && seg[3] && req.method === 'PATCH') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'editar_permissoes'))) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    const alvo = await rbacUserByRef(seg[3]);
    if (!alvo) return json(res, 404, { erro: 'Usuário alvo não encontrado.' });
    const setores = Array.isArray(b.setores_permitidos)
      ? b.setores_permitidos.map(String).map(s => s.trim()).filter(Boolean)
      : null;
    const apelido = b.apelido_login != null ? String(b.apelido_login).trim().toLowerCase() : null;
    await db.q(`UPDATE rbac_contacts
      SET setores_permitidos=COALESCE($2,setores_permitidos),
          apelido_login=COALESCE($3,apelido_login),
          ativo=COALESCE($4,ativo)
      WHERE id=$1 AND tenant_id=$5`,
      [alvo.id, setores, apelido || null, typeof b.ativo === 'boolean' ? b.ativo : null, TENANT]);
    return json(res, 200, { ok: true, setores_permitidos: setores });
  }
  if (sub === 'est' && seg[2] === 'usuario' && seg[3] && seg[4] === 'pin' && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'editar_permissoes'))) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    const alvo = await rbacUserByRef(seg[3]);
    if (!alvo) return json(res, 404, { erro: 'Usuário alvo não encontrado.' });
    const pin = String(b.pin || '').replace(/\D/g, '');
    if (pin.length < 4 || pin.length > 6) return json(res, 400, { erro: 'PIN precisa ter 4 a 6 dígitos.' });
    const mustChange = b.pin_must_change !== false;
    await db.q(`UPDATE rbac_contacts
      SET pin_hash=crypt($2, gen_salt('bf',8)), pin_changed_at=NOW(), pin_must_change=$3
      WHERE id=$1 AND tenant_id=$4`, [alvo.id, pin, mustChange, TENANT]);
    return json(res, 200, { ok: true, pin_must_change: mustChange });
  }
  if (sub === 'est' && seg[2] === 'permissoes' && req.method === 'GET') {
    const alvo = url.searchParams.get('alvo_id') || url.searchParams.get('usuario_id');
    const e = await estPermsEfetivas(alvo);
    return json(res, 200, { perms: e.perms, gestor: !!e.gestor, user: e.user || null, catalogo: EST_PERMS });
  }
  if (sub === 'est' && seg[2] === 'permissoes' && req.method === 'POST') {
    const b = await readBody(req);
    if (!(await estPode(b.usuario_id, 'editar_permissoes'))) return json(res, 403, { erro: 'Apenas gestor ou gerente.' });
    if (!b.alvo_id) return json(res, 400, { erro: 'alvo_id obrigatório' });
    const alvoEh = await estPermsEfetivas(b.alvo_id);
    if (!alvoEh.user) return json(res, 404, { erro: 'Usuário alvo não encontrado.' });
    if (alvoEh.gestor) return json(res, 400, { erro: 'Gestores/gerentes já têm acesso total.' });
    const sel = Array.isArray(b.permissoes) ? b.permissoes.filter(p => EST_PERMS.includes(p)) : [];
    await db.q(`DELETE FROM est_permissao WHERE tenant_id=$1 AND usuario_id=$2`, [TENANT, alvoEh.user.id]);
    for (const p of sel.concat(['__configured__'])) await db.q(`INSERT INTO est_permissao (tenant_id, usuario_id, permissao) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, usuario_id, permissao) DO NOTHING`, [TENANT, alvoEh.user.id, p]);
    return json(res, 200, { ok: true, perms: sel });
  }

  // ---- Khardela: consulta direta ao banco do estoque (respeita permissões) ----
  if (sub === 'est' && (seg[2] === 'jessica' || seg[2] === 'khardela') && req.method === 'POST') {
    const b = await readBody(req);
    const pergunta = String(b.pergunta || '').trim();
    if (!pergunta) return json(res, 400, { erro: 'envie a pergunta' });
    const out = await estKhardela(b.usuario_id, pergunta);
    if (out.erro) return json(res, 403, out);
    return json(res, 200, out);
  }

  // ---- Interpretar foto de perda/consumo (balanca) sem escrever estoque ----
  if (sub === 'est' && seg[2] === 'movimento' && seg[3] === 'foto' && req.method === 'POST') {
    const b = await readBody(req);
    const e = await estPermsEfetivas(b.usuario_id);
    if (!estPodeMovimento(e)) return json(res, 403, { erro: 'Sem permissao para interpretar movimento.' });
    const key = process.env.OPENAI_API_KEY;
    if (!key) return json(res, 400, { erro: 'Leitura por imagem nao configurada (defina OPENAI_API_KEY no Easypanel).' });
    if (!b.image) return json(res, 400, { erro: 'envie a imagem' });
    const dataUrl = String(b.image).startsWith('data:') ? b.image : ('data:image/jpeg;base64,' + b.image);
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          max_tokens: 700,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Voce analisa uma foto operacional de restaurante: um item deve estar sobre uma balanca. Extraia somente o que estiver visivel/seguro. Responda APENAS JSON {"produto": string|null, "quantidade": number|null, "unidade": "g"|"KG"|"UNIDADE"|"LITRO"|"ML"|null, "leitura_balanca": string|null, "observacao": string|null, "confianca": number}. Se nao conseguir ler peso/produto com seguranca, use null e explique em observacao. Nao invente.' },
            { role: 'user', content: [{ type: 'text', text: 'Identifique o item e a medida mostrada na balanca para o gestor revisar antes de baixar estoque.' }, { type: 'image_url', image_url: { url: dataUrl } }] }
          ]
        })
      });
      const j = await r.json();
      if (!r.ok) return json(res, 502, { erro: 'Leitura da foto falhou: ' + (j.error ? j.error.message : ('HTTP ' + r.status)) });
      let p = {}; try { p = JSON.parse(j.choices[0].message.content); } catch (_) { p = {}; }
      const match = await estMatchProdutosEntrada([{ idx: 0, texto: p.produto || '', unidade: p.unidade || '' }], 0.45, { onlyCompraveis: false });
      return json(res, 200, { produto: p.produto || null, quantidade: p.quantidade ?? null, unidade: p.unidade || null, leitura_balanca: p.leitura_balanca || null, observacao: p.observacao || null, confianca: p.confianca ?? null, match: match[0] || null });
    } catch (e) {
      return json(res, 502, { erro: 'Erro na leitura da foto: ' + (e.message || e) });
    }
  }

  // ---- Lançar perda / consumo / entrada (in-app) ----
  if (sub === 'est' && seg[2] === 'movimento' && req.method === 'POST') {
    const b = await readBody(req);
    const e = await estPermsEfetivas(b.usuario_id);
    if (e.user && e.perms.includes('registrar_perda_consumo') && !e.perms.includes('acessar_lancamentos')) e.perms.push('acessar_lancamentos');
    if (!e.user || !(e.gestor || e.perms.includes('acessar_lancamentos'))) return json(res, 403, { erro: 'Sem permissão para lançar movimento.' });
    const tipo = String(b.tipo || '').toUpperCase();
    if (!['PERDA', 'CONSUMO', 'ENTRADA'].includes(tipo)) return json(res, 400, { erro: 'tipo deve ser PERDA, CONSUMO ou ENTRADA' });
    const qtdOriginal = Number(String(b.quantidade).replace(',', '.'));
    if (!b.produto_id || !(qtdOriginal > 0)) return json(res, 400, { erro: 'informe produto e quantidade (>0)' });
    const p = (await db.q('SELECT id, nome, unidade, estoque_atual, peso_g FROM est_produto WHERE id=$1 AND tenant_id=$2', [b.produto_id, TENANT])).rows[0];
    if (!p) return json(res, 404, { erro: 'produto não encontrado' });
    const unidadeInformada = b.unidade || b.unidade_informada || '';
    const qtd = estQtdMovimento(qtdOriginal, unidadeInformada, p);
    if (!(qtd > 0)) return json(res, 400, { erro: 'quantidade convertida invalida' });
    const obs = estObsMovimento(unidadeInformada, qtdOriginal, qtd, p, b.observacao || null);
    const mv = await estLancaMov(tipo, e.user, p, qtd, b.motivo || null, 'MANUAL', obs);
    return json(res, 200, { ok: true, produto: p.nome, antes: mv.antes, depois: mv.depois, unidade: p.unidade, quantidade_lancada: qtd, unidade_informada: unidadeInformada || null });
  }

  // ---- WhatsApp: webhook de entrada (Khardela recebe e lança) ----
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
    const pend = await estWaPendente(telefone);
    if (pend && estWaCancelaTexto(texto)) {
      await estWaAtualizaPendente(pend.id, 'cancelado', { cancelado_por: u.id });
      resposta = 'Combinado, descartei o lancamento pendente. Nada foi alterado no estoque.';
      await db.q(`INSERT INTO est_whatsapp_msg (tenant_id, telefone, direcao, texto) VALUES ($1,$2,'OUT',$3)`, [TENANT, telefone, resposta]).catch(() => {});
      return json(res, 200, { resposta, usuario: u.nome, pendente_cancelado: true });
    }
    if (pend && estWaConfirmaTexto(texto)) {
      const p = pend.interpretado || {};
      if (String(p.usuario_id || '') !== String(u.id)) {
        resposta = 'Existe um lancamento pendente, mas ele pertence a outro usuario. Envie novamente o lancamento.';
      } else if (!(await estPodeMovimentoUid(u.id))) {
        resposta = 'Voce nao tem permissao para confirmar perdas/consumos. Fale com o gestor.';
      } else {
        const prod = (await db.q('SELECT id, nome, unidade, estoque_atual, peso_g FROM est_produto WHERE id=$1 AND tenant_id=$2 AND ativo', [p.produto_id, TENANT])).rows[0];
        if (!prod) {
          resposta = 'O produto pendente nao esta mais ativo no estoque. Envie o lancamento novamente.';
          await estWaAtualizaPendente(pend.id, 'erro_produto_inativo', { confirmado_por: u.id });
        } else {
          const tipo = String(p.tipo_movimento || p.acao || '').toUpperCase();
          const qtdOriginal = Number(p.quantidade);
          const qtd = estQtdMovimento(qtdOriginal, p.unidade_informada || '', prod);
          const obs = estObsMovimento(p.unidade_informada || '', qtdOriginal, qtd, prod, p.observacao || null);
          const mv = await estLancaMov(tipo, u, prod, qtd, p.motivo || null, 'WHATSAPP', obs);
          await estWaAtualizaPendente(pend.id, 'confirmado', { confirmado_por: u.id, quantidade_lancada: qtd, estoque_antes: mv.antes, estoque_depois: mv.depois });
          const rotuloConfirmado = tipo === 'PERDA' ? 'Perda' : (tipo === 'CONSUMO' ? 'Consumo' : 'Entrada');
          resposta = `✅ ${rotuloConfirmado} registrada: ${qtdOriginal} ${p.unidade_informada || prod.unidade || ''} de ${prod.nome}.\nEstoque: ${mv.antes} → ${mv.depois} ${prod.unidade || ''}.${p.motivo ? '\nMotivo: ' + p.motivo : ''}\n(${u.nome})`;
        }
      }
      await db.q(`INSERT INTO est_whatsapp_msg (tenant_id, telefone, direcao, texto) VALUES ($1,$2,'OUT',$3)`, [TENANT, telefone, resposta]).catch(() => {});
      return json(res, 200, { resposta, usuario: u.nome, pendente_confirmado: true });
    }
    if (['perda', 'consumo', 'entrada'].includes(interp.acao)) {
      if (!(await estPodeMovimentoUid(u.id))) {
        resposta = 'Você não tem permissão para lançar movimentações no estoque. Fale com o gestor.';
      } else if (!interp.produto || !(Number(interp.quantidade) > 0)) {
        resposta = 'Entendi que é um lançamento, mas faltou o produto ou a quantidade. Ex: "perda muçarela 2 peças motivo caiu no chão".';
      } else {
        const found = await estAchaProduto(interp.produto, 0.5);
        const prod = found ? (await db.q('SELECT id, nome, unidade, estoque_atual, peso_g FROM est_produto WHERE id=$1 AND tenant_id=$2 AND ativo', [found.id, TENANT])).rows[0] : null;
        if (!prod) {
          resposta = `Não encontrei o produto "${interp.produto}" no cadastro. Confira o nome e tente de novo.`;
        } else {
          const tipo = interp.acao.toUpperCase();
          const rotulo = tipo === 'PERDA' ? 'Perda' : (tipo === 'CONSUMO' ? 'Consumo' : 'Entrada');
          const qtdConvertida = estQtdMovimento(Number(interp.quantidade), interp.unidade || '', prod);
          const pendente = {
            tipo: 'movimento_pendente',
            status: 'aguardando_confirmacao',
            usuario_id: u.id,
            acao: interp.acao,
            produto_id: prod.id,
            produto_nome: prod.nome,
            tipo_movimento: tipo,
            quantidade: Number(interp.quantidade),
            unidade_informada: interp.unidade || null,
            quantidade_lancada: qtdConvertida,
            unidade_estoque: prod.unidade || null,
            motivo: interp.motivo || null,
            observacao: 'confirmacao_whatsapp'
          };
          resposta = `Entendi assim:\n${rotulo}: ${interp.quantidade} ${interp.unidade || prod.unidade || ''} de ${prod.nome}\nLancamento no estoque: ${Number(qtdConvertida).toFixed(3)} ${prod.unidade || ''}${interp.motivo ? '\nMotivo: ' + interp.motivo : ''}\n\nResponda SIM para confirmar ou CANCELAR para descartar.`;
          await db.q(`INSERT INTO est_whatsapp_msg (tenant_id, telefone, direcao, texto, interpretado) VALUES ($1,$2,'OUT',$3,$4)`, [TENANT, telefone, resposta, JSON.stringify(pendente)]).catch(() => {});
          return json(res, 200, { resposta, usuario: u.nome, aguardando_confirmacao: true, movimento: pendente });
          const obs = interp.unidade ? ('informado: ' + interp.quantidade + ' ' + interp.unidade) : null;
          const mv = await estLancaMov(tipo, u, prod, Number(interp.quantidade), interp.motivo || null, 'WHATSAPP', obs);
          const rotuloConfirmado = tipo === 'PERDA' ? 'Perda' : (tipo === 'CONSUMO' ? 'Consumo' : 'Entrada');
          resposta = `✅ ${rotulo} registrada: ${interp.quantidade} ${prod.unidade || ''} de ${prod.nome}.\nEstoque: ${mv.antes} → ${mv.depois}.${interp.motivo ? '\nMotivo: ' + interp.motivo : ''}\n(${u.nome})`;
        }
      }
    } else if (interp.acao === 'ajuda') {
      resposta = 'Sou a automação Khardela do estoque. Você pode:\n• Lançar perda: "perda muçarela 2 peças motivo queimou"\n• Lançar consumo: "consumo catupiry 3 unidades montagem"\n• Perguntar: "quais produtos estão abaixo do mínimo?"';
    } else {
      const jr = await estKhardela(u.id, texto);
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
    const setoresPerm = setoresPermitidosLista(col.setores_permitidos);
    const veTudo = perfilGestor(col) || setoresPerm.map(s => String(s).toUpperCase()).includes('TUDO');
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
  // movimentacao de estoque: ENTRADA (Khardela/nota), SAIDA (pedido), AJUSTE. Infra pronta p/ integrar.
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
  if (sub === 'staff' && seg[2] === 'session' && req.method === 'GET') {
    const ref = url.searchParams.get('usuario_id') || url.searchParams.get('id') || url.searchParams.get('login');
    const col = await rbacUserByRef(ref);
    if (!col) return json(res, 401, { ok: false, erro: 'Sessão expirada. Entre novamente.' });
    return jsonComHeaders(res, 200, { ok: true, usuario: staffUsuarioPublico(col) }, { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' });
  }
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
    return json(res, 200, { ok: true, must_change: !!col.pin_must_change, usuario: staffUsuarioPublico(col) });
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
    const g = await rbacUserByRef(adminId);
    if (!g || !perfilGestor(g)) return json(res, 403, { erro: 'acesso restrito ao gestor' });

    if (seg[2] === 'usuarios' && req.method === 'GET') {
      const r = await db.q(`SELECT id, nome, apelido_login, perfil_principal, perfis_adicionais, setores_permitidos, ativo, (pin_hash IS NOT NULL) AS tem_pin FROM rbac_contacts WHERE tenant_id=$1 ORDER BY ativo DESC, nome`, [TENANT]);
      return json(res, 200, { usuarios: r.rows });
    }
    if (seg[2] === 'usuario' && !seg[3] && req.method === 'POST') {
      const ph = '+' + Date.now();
      const pinNovo = String(body.pin || '').replace(/\D/g, '');
      const r = await db.q(`INSERT INTO rbac_contacts (tenant_id, phone, nome, apelido_login, perfil_principal, setores_permitidos, ativo, pin_hash, pin_changed_at, pin_must_change)
        VALUES ($1,$2,$3,$4,$5,$6,TRUE, CASE WHEN $7<>'' THEN crypt($7, gen_salt('bf',8)) ELSE NULL END, NOW(), $8) RETURNING id`,
        [TENANT, body.phone || ph, body.nome || '', String(body.apelido_login || '').toLowerCase(), body.perfil_principal || 'COLABORADOR', body.setores_permitidos || [], pinNovo, !!pinNovo]);
      return json(res, 201, { ok: true, id: r.rows[0].id });
    }
    if (seg[2] === 'usuario' && seg[3] && seg[4] === 'pin' && req.method === 'POST') {
      const pin = String(body.pin || '').replace(/\D/g, ''); if (pin.length < 4) return json(res, 400, { erro: 'PIN curto' });
      const mustChange = body.pin_must_change !== false;
      await db.q(`UPDATE rbac_contacts SET pin_hash=crypt($2, gen_salt('bf',8)), pin_changed_at=NOW(), pin_must_change=$4 WHERE id=$1 AND tenant_id=$3`, [seg[3], pin, TENANT, mustChange]);
      return json(res, 200, { ok: true });
    }
    if (seg[2] === 'usuario' && seg[3] && req.method === 'PATCH') {
      await db.q(`UPDATE rbac_contacts SET perfil_principal=COALESCE($2,perfil_principal), setores_permitidos=COALESCE($3,setores_permitidos), apelido_login=COALESCE($4,apelido_login), ativo=COALESCE($5,ativo) WHERE id=$1 AND tenant_id=$6`,
        [seg[3], body.perfil_principal ?? null, body.setores_permitidos ?? null, body.apelido_login ? String(body.apelido_login).toLowerCase() : null, typeof body.ativo === 'boolean' ? body.ativo : null, TENANT]);
      return json(res, 200, { ok: true });
    }

    // Estoque do cardápio: visão vendável sobre produtos/opcoes, com ponte ficha_itens -> est_produto.
    // Não duplica o estoque operacional; saldo físico continua em est_produto/estoque.html.
    if (seg[2] === 'estoque-cardapio' && !seg[3] && req.method === 'GET') {
      const snap = await adminEstoqueCardapioSnapshot({
        q: url.searchParams.get('q') || '',
        status: url.searchParams.get('status') || '',
        ficha: url.searchParams.get('ficha') || '',
        controle: url.searchParams.get('controle') || '',
        limit: url.searchParams.get('limit') || ''
      });
      return json(res, 200, snap);
    }
    if (seg[2] === 'estoque-config' && req.method === 'GET') {
      const cfg = await estoqueTenantConfig();
      return json(res, 200, { config: cfg, fonte: 'tenants.config.estoque + valores existentes' });
    }
    if (seg[2] === 'estoque-config' && req.method === 'POST') {
      const curR = await db.q('SELECT config FROM tenants WHERE id=$1', [TENANT]);
      const cur = (curR.rows[0] && curR.rows[0].config) || {};
      cur.estoque = estoqueConfigSanitize(body.config || body.estoque || body, {});
      await db.q('UPDATE tenants SET config=$2 WHERE id=$1', [TENANT, JSON.stringify(cur)]);
      return json(res, 200, { ok: true, config: await estoqueTenantConfig() });
    }
    if (seg[2] === 'estoque-cardapio' && seg[3] === 'status' && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const st = statusTitan(body.status);
      if (!st) return json(res, 400, { erro: 'Status inválido. Use ATIVO/EM_FALTA/OCULTO ou ACTIVE/SHORT_SUPPLY/HIDDEN.' });
      const itens = (Array.isArray(body.itens) ? body.itens : []).map(x => ({
        tipo: String(x.tipo || '').trim(),
        id: String(x.id || '').trim()
      })).filter(x => ['produto', 'opcao'].includes(x.tipo) && x.id);
      if (!itens.length) return json(res, 400, { erro: 'Informe ao menos um item para atualização em massa.' });
      if (itens.length > 1000) return json(res, 400, { erro: 'Limite de 1000 itens por operação em massa.' });
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        let afetados = 0;
        for (const it of itens) {
          const tabela = it.tipo === 'produto' ? 'produtos' : 'opcoes';
          const r = await client.query(`UPDATE ${tabela}
            SET status=$3, status_ts=NOW(), status_by=$4, status_motivo=$5, atualizado_em=NOW()
            WHERE tenant_id=$1 AND id=$2 RETURNING id`, [TENANT, it.id, st, g.apelido_login || g.nome || g.id, body.motivo || 'admin estoque-cardapio massa']);
          afetados += r.rowCount || 0;
        }
        await client.query('COMMIT');
        return json(res, 200, { ok: true, status: st, dd_status: DD_STATUS_FROM_TITAN[st], itens_recebidos: itens.length, afetados });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        return json(res, 400, { erro: e.code || e.message });
      } finally { client.release(); }
    }
    if (seg[2] === 'estoque-cardapio' && seg[3] && seg[4] && req.method === 'GET') {
      const tipo = String(seg[3] || '').trim();
      const id = String(seg[4] || '').trim();
      if (!['produto', 'opcao'].includes(tipo) || !id) return json(res, 400, { erro: 'Item inválido.' });
      const snap = await adminEstoqueCardapioSnapshot({ limit: 1000 });
      const item = snap.itens.find(x => x.tipo === tipo && x.id === id);
      if (!item) return json(res, 404, { erro: 'Item do cardápio não encontrado.' });
      return json(res, 200, { item, status_map: snap.status_map, mapper: snap.mapper });
    }
    if (seg[2] === 'estoque-cardapio' && seg[3] && seg[4] && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const tipo = String(seg[3] || '').trim();
      const id = String(seg[4] || '').trim();
      if (!['produto', 'opcao'].includes(tipo) || !id) return json(res, 400, { erro: 'Item inválido.' });
      const tabela = tipo === 'produto' ? 'produtos' : 'opcoes';
      const atual = await db.q(`SELECT id, nome, status, meta FROM ${tabela} WHERE tenant_id=$1 AND id=$2`, [TENANT, id]);
      if (!atual.rows[0]) return json(res, 404, { erro: 'Item do cardápio não encontrado.' });
      const st = Object.prototype.hasOwnProperty.call(body, 'status') ? statusTitan(body.status) : null;
      if (Object.prototype.hasOwnProperty.call(body, 'status') && !st) return json(res, 400, { erro: 'Status inválido. Use ATIVO/EM_FALTA/OCULTO ou ACTIVE/SHORT_SUPPLY/HIDDEN.' });
      const meta = mergeInventoryMeta(atual.rows[0].meta, body, g);
      const r = await db.q(`UPDATE ${tabela}
        SET status=COALESCE($3,status),
            status_ts=CASE WHEN $3 IS NULL THEN status_ts ELSE NOW() END,
            status_by=CASE WHEN $3 IS NULL THEN status_by ELSE $4 END,
            status_motivo=CASE WHEN $3 IS NULL THEN status_motivo ELSE $5 END,
            meta=$6,
            atualizado_em=NOW()
        WHERE tenant_id=$1 AND id=$2
        RETURNING id, nome, status, meta`, [TENANT, id, st, g.apelido_login || g.nome || g.id, body.motivo || 'admin estoque-cardapio', JSON.stringify(meta)]);
      const inv = invFromMeta(r.rows[0].meta);
      return json(res, 200, { ok: true, item: { id: r.rows[0].id, nome: r.rows[0].nome, tipo, status: r.rows[0].status, dd_status: DD_STATUS_FROM_TITAN[r.rows[0].status], ...inv } });
    }
    if (seg[2] === 'estoque-cardapio' && seg[3] && seg[4] && req.method === 'DELETE') {
      const tipo = String(seg[3] || '').trim();
      const id = String(seg[4] || '').trim();
      if (!['produto', 'opcao'].includes(tipo) || !id) return json(res, 400, { erro: 'Item inválido.' });
      const tabela = tipo === 'produto' ? 'produtos' : 'opcoes';
      const atual = await db.q(`SELECT id, nome, meta FROM ${tabela} WHERE tenant_id=$1 AND id=$2`, [TENANT, id]);
      if (!atual.rows[0]) return json(res, 404, { erro: 'Item do cardápio não encontrado.' });
      const meta = mergeInventoryMeta(atual.rows[0].meta, { controle_enabled: false, quantidade_vendavel: null }, g);
      await db.q(`UPDATE ${tabela} SET meta=$3, atualizado_em=NOW() WHERE tenant_id=$1 AND id=$2`, [TENANT, id, JSON.stringify(meta)]);
      return json(res, 200, { ok: true, removido: 'controle_vendavel', tipo, id });
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
      const prods = await db.q('SELECT id, categoria_id, nome, descricao, tipo_montagem, preco_base, regra_preco, gratuito, status, codigo_externo, ordem FROM produtos WHERE tenant_id=$1 ORDER BY ordem, nome', [TENANT]);
      const grupos = await db.q('SELECT id, produto_id, nome, ordem, min_escolhas, max_escolhas, permite_repeticao, regra_preco, condicao FROM opcao_grupos WHERE tenant_id=$1 ORDER BY ordem', [TENANT]);
      const opcoes = await db.q('SELECT id, grupo_id, nome, descricao, preco, status, codigo_externo, ordem FROM opcoes WHERE tenant_id=$1 ORDER BY ordem', [TENANT]);
      const opByG = {}; for (const o of opcoes.rows) (opByG[o.grupo_id] = opByG[o.grupo_id] || []).push({ id: o.id, grupo_id: o.grupo_id, nome: o.nome, descricao: o.descricao || '', preco: Number(o.preco), status: o.status, codigo: o.codigo_externo || '', ordem: o.ordem });
      const gByP = {}; for (const g of grupos.rows) (gByP[g.produto_id] = gByP[g.produto_id] || []).push({ id: g.id, produto_id: g.produto_id, nome: g.nome, ordem: g.ordem, min: g.min_escolhas, max: g.max_escolhas, repete: g.permite_repeticao, regra: g.regra_preco, condicao: g.condicao || {}, opcoes: opByG[g.id] || [] });
      const pByC = {}; for (const p of prods.rows) (pByC[p.categoria_id] = pByC[p.categoria_id] || []).push({ id: p.id, categoria_id: p.categoria_id, nome: p.nome, descricao: p.descricao || '', tipo: p.tipo_montagem, preco_base: Number(p.preco_base), regra: p.regra_preco, gratuito: p.gratuito, status: p.status, codigo: p.codigo_externo || '', ordem: p.ordem, grupos: gByP[p.id] || [] });
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
      const status = ['ATIVO', 'EM_FALTA', 'OCULTO'].includes(body.status) ? body.status : 'ATIVO';
      const r = await db.q(`INSERT INTO produtos (id,tenant_id,categoria_id,nome,descricao,tipo_montagem,preco_base,regra_preco,gratuito,status,ordem,codigo_externo)
        VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [TENANT, body.categoria_id ? Number(body.categoria_id) : null, nome, body.descricao || '', tipo, money(body.preco_base || 0),
         body.regra_preco || (tipo === 'SIMPLES' ? 'FIXO' : 'SOMA'), !!body.gratuito, status, Number(body.ordem) || 999,
         body.codigo != null ? String(body.codigo).trim() || null : null]);
      return json(res, 201, { ok: true, id: r.rows[0].id });
    }
    if (seg[2] === 'produto' && seg[3] && req.method === 'PATCH') {
      await db.q(`UPDATE produtos SET nome=COALESCE($2,nome), descricao=COALESCE($3,descricao), preco_base=COALESCE($4,preco_base),
        tipo_montagem=COALESCE($5,tipo_montagem), status=COALESCE($6,status), ordem=COALESCE($7,ordem), categoria_id=COALESCE($8,categoria_id),
        regra_preco=COALESCE($9,regra_preco), codigo_externo=COALESCE($10,codigo_externo), gratuito=COALESCE($11,gratuito), atualizado_em=NOW() WHERE id=$1 AND tenant_id=$12`,
        [seg[3], body.nome ?? null, body.descricao ?? null, body.preco_base != null ? money(body.preco_base) : null,
         body.tipo_montagem ?? null, body.status ?? null, body.ordem != null ? Number(body.ordem) : null,
         body.categoria_id != null ? Number(body.categoria_id) : null, body.regra_preco ?? null,
         body.codigo != null ? String(body.codigo).trim() || null : null,
         typeof body.gratuito === 'boolean' ? body.gratuito : null, TENANT]);
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
      const r = await db.q(`INSERT INTO opcoes (id,tenant_id,grupo_id,nome,descricao,preco,status,ordem,codigo_externo)
        VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [TENANT, body.grupo_id, nome, body.descricao || '', money(body.preco || 0), body.status || 'ATIVO', Number(body.ordem) || 999,
         body.codigo != null ? String(body.codigo).trim() || null : null]);
      return json(res, 201, { ok: true, id: r.rows[0].id });
    }
    if (seg[2] === 'opcao' && seg[3] && req.method === 'PATCH') {
      await db.q(`UPDATE opcoes SET nome=COALESCE($2,nome), preco=COALESCE($3,preco), status=COALESCE($4,status),
        descricao=COALESCE($5,descricao), ordem=COALESCE($6,ordem), codigo_externo=COALESCE($7,codigo_externo), atualizado_em=NOW() WHERE id=$1 AND tenant_id=$8`,
        [seg[3], body.nome ?? null, body.preco != null ? money(body.preco) : null, body.status ?? null,
         body.descricao ?? null, body.ordem != null ? Number(body.ordem) : null,
         body.codigo != null ? String(body.codigo).trim() || null : null, TENANT]);
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
function serveStatic(res, fp) {
  fs.readFile(fp, (e, buf) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    const ext = path.extname(fp);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html') Object.assign(headers, { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' });
    res.writeHead(200, headers);
    res.end(buf);
  });
}

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
    if (p === '/mapper' || p === '/mapper/' || p === '/mapper.html' || p === '/command-center' || p === '/command-center/' || p === '/login' || p === '/login/') {
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
