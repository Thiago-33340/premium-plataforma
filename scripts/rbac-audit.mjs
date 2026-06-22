import fs from 'node:fs';
import path from 'node:path';

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const m = raw.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
}

const baseUrl = (args.get('base-url') || process.env.TITAN_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const managerId = args.get('manager-id') || process.env.TITAN_RBAC_MANAGER_ID || process.env.TITAN_SMOKE_USER_ID || '';
const explicitUserIds = (args.get('user-id') || process.env.TITAN_RBAC_USER_IDS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const outFile = args.get('out') || process.env.TITAN_RBAC_OUT || '';
const maxAutoUsers = Number(args.get('limit') || process.env.TITAN_RBAC_LIMIT || 12);

const NAV_PERM = {
  produtos: 'acessar_produtos',
  contagem: 'acessar_contagem',
  fornecedores: 'acessar_fornecedores'
};

const MORE_PERMS = [
  'acessar_lancamentos',
  'acessar_lista_compras_inteligente',
  'acessar_visitas',
  'acessar_mapa_comparativo_fornecedores',
  'acessar_producao_interna',
  'acessar_configuracoes',
  'editar_permissoes'
];

function isManagerProfile(profile) {
  return ['GESTOR', 'GERENTE'].includes(String(profile || '').toUpperCase());
}

function expectedNav({ gestor, perms }) {
  const set = new Set(perms || []);
  return {
    inicio: true,
    produtos: gestor || set.has(NAV_PERM.produtos),
    contagem: gestor || set.has(NAV_PERM.contagem),
    fornecedores: gestor || set.has(NAV_PERM.fornecedores),
    mais: gestor || MORE_PERMS.some((p) => set.has(p))
  };
}

async function fetchJson(apiPath, opts = {}) {
  const res = await fetch(baseUrl + apiPath, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok || json?.erro) {
    throw new Error(`${apiPath} → HTTP ${res.status}: ${json?.erro || text.slice(0, 200)}`);
  }
  return json;
}

async function getUsers() {
  if (!managerId) return { usuarios: [], catalogo: [], error: 'sem manager-id' };
  try {
    return await fetchJson(`/api/est/usuarios?usuario_id=${encodeURIComponent(managerId)}`);
  } catch (err) {
    return { usuarios: [], catalogo: [], error: err.message };
  }
}

async function lookupLoginWithoutPin(login) {
  if (!login) return null;
  try {
    const res = await fetch(baseUrl + '/api/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login })
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    return { status: res.status, json, text };
  } catch (err) {
    return { error: err.message };
  }
}

async function auditUser(user) {
  const id = user.id || user;
  const info = typeof user === 'object' ? user : { id };
  const checks = [];
  let permsData = null;
  let itemsData = null;

  try {
    permsData = await fetchJson(`/api/est/permissoes?alvo_id=${encodeURIComponent(id)}`);
    checks.push({ id: 'permissoes-endpoint', ok: true });
  } catch (err) {
    checks.push({ id: 'permissoes-endpoint', ok: false, severity: 'alta', message: err.message });
  }

  try {
    itemsData = await fetchJson(`/api/est/meus-itens?usuario_id=${encodeURIComponent(id)}`);
    checks.push({ id: 'meus-itens-endpoint', ok: true });
  } catch (err) {
    checks.push({ id: 'meus-itens-endpoint', ok: false, severity: 'media', message: err.message });
  }

  const profile = info.perfil_principal || info.perfil || '';
  const gestor = Boolean(permsData?.gestor || isManagerProfile(profile));
  const perms = Array.isArray(permsData?.perms) ? permsData.perms : [];
  const nav = expectedNav({ gestor, perms });
  const setores = Array.isArray(itemsData?.setores) ? itemsData.setores.map(String) : [];
  const itemCount = Array.isArray(itemsData?.itens) ? itemsData.itens.length : 0;
  const setoresComItens = Array.isArray(itemsData?.itens)
    ? [...new Set(itemsData.itens.map((x) => x.setor).filter(Boolean))].sort()
    : [];

  if (gestor) {
    if (!nav.produtos || !nav.contagem || !nav.fornecedores || !nav.mais) {
      checks.push({ id: 'gestor-nav-total', ok: false, severity: 'alta', message: 'Gestor/gerente deveria ver todas as abas principais.' });
    } else {
      checks.push({ id: 'gestor-nav-total', ok: true });
    }
  } else {
    if (perms.includes('fazer_contagem') && !perms.includes('acessar_contagem')) {
      checks.push({
        id: 'contagem-botao-quebrado',
        ok: false,
        severity: 'alta',
        message: 'Usuário pode fazer contagem, mas não tem acessar_contagem; na tela o botão de contagem tende a redirecionar para Início.'
      });
    }
    if (perms.includes('acessar_contagem') && !perms.includes('fazer_contagem')) {
      checks.push({
        id: 'contagem-visivel-sem-executar',
        ok: false,
        severity: 'alta',
        message: 'Usuário vê a aba Contagem, mas a API de iniciar contagem deve retornar 403 por falta de fazer_contagem.'
      });
    }
    if (perms.includes('acessar_contagem') && !itemsData?.todos && !setores.length) {
      checks.push({
        id: 'contagem-sem-setor',
        ok: false,
        severity: 'media',
        message: 'Usuário tem acesso à contagem, mas não tem setores permitidos retornados.'
      });
    }
    if (perms.includes('acessar_contagem') && itemCount === 0) {
      checks.push({
        id: 'contagem-sem-itens',
        ok: false,
        severity: 'media',
        message: 'Usuário tem acesso à contagem, mas a API meus-itens retornou zero itens.'
      });
    }
    if (perms.includes('editar_permissoes') && !gestor) {
      checks.push({
        id: 'colaborador-edita-permissoes',
        ok: false,
        severity: 'alta',
        message: 'Colaborador não gestor possui editar_permissoes.'
      });
    }
    if (perms.includes('acessar_configuracoes') && !gestor) {
      checks.push({
        id: 'colaborador-configuracoes',
        ok: false,
        severity: 'media',
        message: 'Colaborador não gestor possui acessar_configuracoes.'
      });
    }
  }

  const failed = checks.filter((c) => !c.ok);
  return {
    id,
    nome: info.nome || info.apelido_login || null,
    apelido_login: info.apelido_login || null,
    perfil_principal: profile || null,
    gestor,
    perms,
    setores_permitidos_api: setores,
    ve_tudo: Boolean(itemsData?.todos),
    itens_visiveis: itemCount,
    setores_com_itens: setoresComItens,
    visualizacao_esperada_estoque_html: {
      abas_visiveis: nav,
      observacao: 'Calculado a partir das regras do public/estoque.html: gestores veem tudo; colaboradores dependem de permissões.'
    },
    checks,
    ok: failed.length === 0,
    failures: failed
  };
}

function chooseAutoUsers(users) {
  const out = [];
  const byId = new Map(users.map((u) => [String(u.id), u]));
  if (managerId && byId.has(String(managerId))) out.push(byId.get(String(managerId)));

  const nonManagers = users.filter((u) => !isManagerProfile(u.perfil_principal) && String(u.id) !== String(managerId));
  out.push(...nonManagers.slice(0, Math.max(1, maxAutoUsers - out.length)));

  return [...new Map(out.map((u) => [String(u.id), u])).values()];
}

const usersResp = await getUsers();
const managerLoginProbe = usersResp.error && managerId ? await lookupLoginWithoutPin(managerId) : null;
let targets = [];

if (explicitUserIds.length) {
  const known = new Map((usersResp.usuarios || []).map((u) => [String(u.id), u]));
  targets = explicitUserIds.map((id) => known.get(String(id)) || { id });
  if (managerId && !explicitUserIds.includes(managerId) && known.has(String(managerId))) {
    targets.unshift(known.get(String(managerId)));
  }
} else if (usersResp.usuarios?.length) {
  targets = chooseAutoUsers(usersResp.usuarios);
} else if (managerId) {
  targets = [{ id: managerId, nome: 'manager-id informado' }];
}

const audited = [];
for (const target of targets) {
  audited.push(await auditUser(target));
}

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  mode: 'read_only_rbac_audit',
  mutates_data: false,
  manager_id_used: managerId || null,
  user_listing_ok: !usersResp.error,
  user_listing_error: usersResp.error || null,
  manager_login_probe: managerLoginProbe,
  manager_id_note: usersResp.error
    ? 'O valor informado não foi aceito como id interno de gestor. Se manager_login_probe indicar precisa_pin=true, o valor parece ser login/apelido, não usuario_id.'
    : null,
  users_found: usersResp.usuarios?.length || 0,
  users_audited: audited.length,
  ok: audited.every((u) => u.ok) && !usersResp.error,
  audited
};

if (outFile) {
  const full = path.resolve(process.cwd(), outFile);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

console.log(`RBAC audit read-only em ${baseUrl}`);
if (usersResp.error) console.log(`WARN listagem de usuários falhou: ${usersResp.error}`);
if (managerLoginProbe?.json?.precisa_pin) console.log(`INFO '${managerId}' parece ser login/apelido existente, mas não é o usuario_id interno exigido pelas rotas RBAC.`);
console.log(`Usuários encontrados: ${report.users_found}; auditados: ${report.users_audited}`);

for (const user of audited) {
  const status = user.ok ? 'OK  ' : 'FAIL';
  const nav = Object.entries(user.visualizacao_esperada_estoque_html.abas_visiveis)
    .filter(([, visible]) => visible)
    .map(([name]) => name)
    .join(', ');
  console.log(`${status} ${user.nome || user.id} (${user.perfil_principal || 'sem perfil'}) — abas: ${nav || 'nenhuma'} — itens: ${user.itens_visiveis}`);
  for (const fail of user.failures) console.log(`  - [${fail.severity || 'info'}] ${fail.id}: ${fail.message}`);
}

if (outFile) console.log(`Relatório salvo em: ${outFile}`);

if (!report.ok) process.exit(1);
