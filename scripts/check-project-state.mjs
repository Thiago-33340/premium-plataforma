import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stateDir = path.join(root, 'project-state');

const required = [
  'modules.json',
  'routes.json',
  'services.json',
  'containers.json',
  'databases.json',
  'tasks.json',
  'risks.json',
  'dependencies.json',
  'decisions.json',
  'roadmap.json',
  'weekly-focus.json',
  'people.json',
  'deploys.json',
  'incidents.json',
  'health-checks.json',
  'rbac-audit.json',
  'module-route-table-map.json',
  'api-contracts-critical.json',
  'test-matrix.json',
  'agent-workflow.json',
  'stock-command-step2.json',
  'stock-readiness.json',
  'agent-bridge.json',
  'agent-reports.json',
  'local-agent-queue.json',
  'command-audit-log.json'
];

const errors = [];
const warnings = [];

function readJson(file) {
  const full = path.join(stateDir, file);
  if (!fs.existsSync(full)) {
    errors.push(`Arquivo obrigatório ausente: project-state/${file}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    errors.push(`JSON inválido em project-state/${file}: ${err.message}`);
    return null;
  }
}

const data = Object.fromEntries(required.map((file) => [file, readJson(file)]));

const modules = Array.isArray(data['modules.json']) ? data['modules.json'] : [];
const moduleIds = new Set(modules.map((m) => m.id).filter(Boolean));
const serviceIds = new Set((Array.isArray(data['services.json']) ? data['services.json'] : []).map((s) => s.id).filter(Boolean));
const databaseIds = new Set((Array.isArray(data['databases.json']) ? data['databases.json'] : []).map((d) => d.id).filter(Boolean));
const knownIds = new Set([...moduleIds, ...serviceIds, ...databaseIds, 'project-state', 'easypanel']);

function assertArray(name, value) {
  if (!Array.isArray(value)) errors.push(`${name} deveria ser uma lista.`);
}

assertArray('modules.json', data['modules.json']);
assertArray('services.json', data['services.json']);
assertArray('containers.json', data['containers.json']);
assertArray('databases.json', data['databases.json']);
assertArray('tasks.json', data['tasks.json']);
assertArray('risks.json', data['risks.json']);
assertArray('dependencies.json', data['dependencies.json']);
assertArray('decisions.json', data['decisions.json']);
assertArray('roadmap.json', data['roadmap.json']);
assertArray('people.json', data['people.json']);
assertArray('deploys.json', data['deploys.json']);
assertArray('incidents.json', data['incidents.json']);
assertArray('api-contracts-critical.json', data['api-contracts-critical.json']);
assertArray('test-matrix.json', data['test-matrix.json']);

for (const m of modules) {
  for (const field of ['id', 'nome', 'status', 'progresso', 'responsavel_humano', 'proximos_passos']) {
    if (m[field] == null) errors.push(`Módulo ${m.id || '(sem id)'} sem campo ${field}.`);
  }
  if (typeof m.progresso === 'number' && (m.progresso < 0 || m.progresso > 100)) {
    errors.push(`Módulo ${m.id} com progresso fora de 0..100.`);
  }
}

const routes = data['routes.json'];
if (!routes || !Array.isArray(routes.api_groups)) {
  errors.push('routes.json precisa ter api_groups.');
} else {
  for (const g of routes.api_groups) {
    if (!g.id) errors.push('Grupo de rota sem id.');
    if (!g.module) errors.push(`Grupo de rota ${g.id || '(sem id)'} sem module.`);
    if (g.module && !moduleIds.has(g.module)) warnings.push(`Grupo de rota ${g.id} aponta para módulo não cadastrado: ${g.module}`);
    if (!Array.isArray(g.routes) || !g.routes.length) errors.push(`Grupo de rota ${g.id} sem rotas.`);
  }
}

for (const task of Array.isArray(data['tasks.json']) ? data['tasks.json'] : []) {
  if (!task.id || !task.titulo || !task.status || !task.prioridade) errors.push(`Tarefa incompleta: ${task.id || task.titulo || '(sem id)'}`);
  if (task.modulo && !knownIds.has(task.modulo)) warnings.push(`Tarefa ${task.id} aponta para módulo/serviço desconhecido: ${task.modulo}`);
}

for (const dep of Array.isArray(data['dependencies.json']) ? data['dependencies.json'] : []) {
  if (!dep.from || !dep.to || !dep.type) errors.push(`Dependência incompleta: ${JSON.stringify(dep)}`);
  if (dep.from && !knownIds.has(dep.from)) warnings.push(`Dependência from desconhecida: ${dep.from}`);
  if (dep.to && !knownIds.has(dep.to)) warnings.push(`Dependência to desconhecida: ${dep.to}`);
}

for (const contract of Array.isArray(data['api-contracts-critical.json']) ? data['api-contracts-critical.json'] : []) {
  for (const field of ['id', 'module', 'method', 'path', 'permission', 'success']) {
    if (!contract[field]) errors.push(`Contrato ${contract.id || '(sem id)'} sem campo ${field}.`);
  }
  if (contract.module && !String(contract.module).split('/').some((id) => moduleIds.has(id))) {
    warnings.push(`Contrato ${contract.id} aponta para módulo não cadastrado: ${contract.module}`);
  }
}

for (const test of Array.isArray(data['test-matrix.json']) ? data['test-matrix.json'] : []) {
  for (const field of ['id', 'module', 'type', 'priority', 'covers', 'expected']) {
    if (test[field] == null) errors.push(`Teste ${test.id || '(sem id)'} sem campo ${field}.`);
  }
}

const agentWorkflow = data['agent-workflow.json'];
if (!agentWorkflow || typeof agentWorkflow !== 'object' || Array.isArray(agentWorkflow)) {
  errors.push('agent-workflow.json deveria ser um objeto.');
} else {
  for (const field of ['status', 'current_mission', 'roles', 'workflow', 'handoff_to_claude']) {
    if (agentWorkflow[field] == null) errors.push(`agent-workflow.json sem campo ${field}.`);
  }
  if (!Array.isArray(agentWorkflow.roles)) errors.push('agent-workflow.json precisa ter roles como lista.');
  if (!Array.isArray(agentWorkflow.workflow)) errors.push('agent-workflow.json precisa ter workflow como lista.');
  if (!agentWorkflow.handoff_to_claude || typeof agentWorkflow.handoff_to_claude !== 'object') {
    errors.push('agent-workflow.json precisa ter handoff_to_claude como objeto.');
  }
}

const agentBridge = data['agent-bridge.json'];
if (!agentBridge || typeof agentBridge !== 'object' || Array.isArray(agentBridge)) {
  errors.push('agent-bridge.json deveria ser um objeto.');
} else {
  for (const field of ['id', 'status', 'active_assignments', 'report_schema', 'command_center_surface']) {
    if (agentBridge[field] == null) errors.push(`agent-bridge.json sem campo ${field}.`);
  }
  if (!Array.isArray(agentBridge.active_assignments)) errors.push('agent-bridge.json precisa ter active_assignments como lista.');
}

const agentReports = data['agent-reports.json'];
if (!Array.isArray(agentReports)) {
  errors.push('agent-reports.json deveria ser uma lista.');
} else {
  for (const [idx, report] of agentReports.entries()) {
    if (!report || typeof report !== 'object') {
      errors.push(`agent-reports.json item ${idx} deveria ser objeto.`);
      continue;
    }
    for (const field of ['id', 'agent', 'titulo', 'status', 'criado_em']) {
      if (report[field] == null) errors.push(`agent-reports.json item ${idx} sem campo ${field}.`);
    }
  }
}

const localAgentQueue = data['local-agent-queue.json'];
if (!localAgentQueue || typeof localAgentQueue !== 'object' || Array.isArray(localAgentQueue)) {
  errors.push('local-agent-queue.json deveria ser um objeto.');
} else {
  for (const field of ['id', 'status', 'security_model', 'agents', 'tasks', 'allowed_actions']) {
    if (localAgentQueue[field] == null) errors.push(`local-agent-queue.json sem campo ${field}.`);
  }
  if (!Array.isArray(localAgentQueue.agents)) errors.push('local-agent-queue.json precisa ter agents como lista.');
  if (!Array.isArray(localAgentQueue.tasks)) errors.push('local-agent-queue.json precisa ter tasks como lista.');
  if (!Array.isArray(localAgentQueue.allowed_actions)) errors.push('local-agent-queue.json precisa ter allowed_actions como lista.');
}

const stockStep2 = data['stock-command-step2.json'];
if (!stockStep2 || typeof stockStep2 !== 'object' || Array.isArray(stockStep2)) {
  errors.push('stock-command-step2.json deveria ser um objeto.');
} else {
  for (const field of ['id', 'titulo', 'status', 'fontes_usadas', 'calculos_oficiais', 'criterios_de_aceite_estoque', 'proxima_ordem']) {
    if (stockStep2[field] == null) errors.push(`stock-command-step2.json sem campo ${field}.`);
  }
  if (!Array.isArray(stockStep2.fontes_usadas)) errors.push('stock-command-step2.json precisa ter fontes_usadas como lista.');
  if (!Array.isArray(stockStep2.calculos_oficiais)) errors.push('stock-command-step2.json precisa ter calculos_oficiais como lista.');
  if (!Array.isArray(stockStep2.criterios_de_aceite_estoque)) errors.push('stock-command-step2.json precisa ter criterios_de_aceite_estoque como lista.');
}

const health = data['health-checks.json'];
if (!health || typeof health !== 'object' || Array.isArray(health)) {
  errors.push('health-checks.json deveria ser um objeto.');
} else {
  for (const field of ['mode', 'mutates_data', 'total', 'executed', 'failed', 'checks']) {
    if (health[field] == null) errors.push(`health-checks.json sem campo ${field}.`);
  }
  if (!Array.isArray(health.checks)) errors.push('health-checks.json precisa ter checks como lista.');
  if (health.mutates_data !== false) errors.push('health-checks.json deve representar apenas smoke read-only.');
}

const stockReadiness = data['stock-readiness.json'];
if (!stockReadiness || typeof stockReadiness !== 'object' || Array.isArray(stockReadiness)) {
  errors.push('stock-readiness.json deveria ser um objeto.');
} else {
  for (const field of ['id', 'status', 'catalog_source', 'smokes', 'remaining_recipe_gaps']) {
    if (stockReadiness[field] == null) errors.push(`stock-readiness.json sem campo ${field}.`);
  }
  if (!Array.isArray(stockReadiness.remaining_recipe_gaps)) errors.push('stock-readiness.json precisa ter remaining_recipe_gaps como lista.');
  if (!Array.isArray(stockReadiness.real_data_corrections)) errors.push('stock-readiness.json precisa ter real_data_corrections como lista.');
}

const commandAudit = data['command-audit-log.json'];
if (!Array.isArray(commandAudit)) {
  errors.push('command-audit-log.json deveria ser uma lista.');
} else {
  for (const [idx, entry] of commandAudit.entries()) {
    if (!entry || typeof entry !== 'object') {
      errors.push(`command-audit-log.json item ${idx} deveria ser objeto.`);
      continue;
    }
    for (const field of ['id', 'criado_em', 'action', 'target_file', 'resumo']) {
      if (entry[field] == null) errors.push(`command-audit-log.json item ${idx} sem campo ${field}.`);
    }
  }
}

const rbacAudit = data['rbac-audit.json'];
if (!rbacAudit || typeof rbacAudit !== 'object' || Array.isArray(rbacAudit)) {
  errors.push('rbac-audit.json deveria ser um objeto.');
} else {
  for (const field of ['mode', 'mutates_data', 'users_found', 'users_audited', 'audited']) {
    if (rbacAudit[field] == null) errors.push(`rbac-audit.json sem campo ${field}.`);
  }
  if (!Array.isArray(rbacAudit.audited)) errors.push('rbac-audit.json precisa ter audited como lista.');
  if (rbacAudit.mutates_data !== false) errors.push('rbac-audit.json deve representar apenas auditoria read-only.');
}

if (warnings.length) {
  console.log('Avisos:');
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length) {
  console.error('Falhas encontradas no project-state:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`project-state OK: ${required.length} arquivos, ${modules.length} módulos, ${routes?.api_groups?.length || 0} grupos de rota.`);
