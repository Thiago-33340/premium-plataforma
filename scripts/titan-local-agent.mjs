#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const once = args.has('--once');
const intervalMs = Number(process.env.TITAN_LOCAL_AGENT_INTERVAL_MS || 15000);

const baseUrl = String(process.env.TITAN_COMMAND_URL || 'https://tools.titanatende.com.br').replace(/\/+$/, '');
const token = String(process.env.TITAN_LOCAL_AGENT_TOKEN || '').trim();
const agentId = String(process.env.TITAN_LOCAL_AGENT_ID || 'thiago-windows-codex').trim();
const workspace = path.resolve(process.env.TITAN_WORKSPACE || process.cwd());
const inboxDir = path.join(workspace, '.agents', 'titan-local-agent');

function log(message) {
  console.log(`[titan-local-agent] ${new Date().toISOString()} ${message}`);
}

function failConfig() {
  if (!token) throw new Error('Defina TITAN_LOCAL_AGENT_TOKEN no ambiente local.');
  if (!fssync.existsSync(workspace)) throw new Error(`Workspace não existe: ${workspace}`);
}

async function post(route, body) {
  const res = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': `Titan-Local-Agent/${agentId}`
    },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`);
  return data;
}

async function report(task, status, message, result = '') {
  return post('/api/mapper/local-agent/report', {
    agent_id: agentId,
    task_id: task.id,
    status,
    message: String(message || '').slice(0, 900),
    result: String(result || '').slice(0, 1800)
  });
}

function safeName(v) {
  return String(v || 'task')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'task';
}

async function writeHandoff(task, target) {
  const dir = path.join(inboxDir, target === 'claude' ? 'claude-code' : 'codex');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${safeName(task.id)}-${safeName(task.titulo)}.md`);
  const body = `# ${task.titulo}

Origem: Titan Command Center
Agente local: ${agentId}
Tarefa: ${task.id}
Ação: ${task.action}
Criada por: ${task.criado_por_nome || task.criado_por || 'Command'}
Criada em: ${task.criado_em || new Date().toISOString()}

## Briefing

${task.prompt || '(sem briefing informado)'}

## Regras locais

- Não ler .env, chaves, certificados, bancos locais ou arquivos sensíveis.
- Não apagar nada.
- Não executar deploy, commit ou push sem autorização explícita no Command.
- Trabalhar dentro do workspace: ${workspace}
- Registrar o que foi feito no Command Center.
`;
  await fs.writeFile(file, body, 'utf8');
  return file;
}

function runFile(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(cmd, cmdArgs, {
      cwd: workspace,
      timeout: opts.timeout || 60000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === 'number' ? error.code : 0,
        duration_ms: Date.now() - started,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error ? String(error.message || error) : ''
      });
    });
  });
}

async function gitStatus() {
  const status = await runFile('git', ['status', '--short'], { timeout: 30000 });
  const head = await runFile('git', ['rev-parse', '--short', 'HEAD'], { timeout: 30000 });
  return [
    `git status: ${status.ok ? 'OK' : 'FALHOU'}`,
    status.stdout || status.stderr || status.error || '(sem alterações)',
    `HEAD: ${(head.stdout || head.stderr || head.error || '').trim()}`
  ].join('\n').trim();
}

async function projectChecks() {
  const checks = [];
  checks.push(['node --check server-pg.js', await runFile(process.execPath, ['--check', 'server-pg.js'], { timeout: 30000 })]);
  checks.push(['node scripts/check-project-state.mjs', await runFile(process.execPath, ['scripts/check-project-state.mjs'], { timeout: 30000 })]);
  return checks.map(([name, r]) => {
    const text = [r.stdout, r.stderr, r.error].filter(Boolean).join('\n').trim();
    return `## ${name}\n${r.ok ? 'OK' : 'FALHOU'} (${r.duration_ms}ms)\n${text || '(sem saída)'}`;
  }).join('\n\n');
}

async function openCommandCenter() {
  const url = `${baseUrl}/command-center`;
  if (process.platform === 'win32') {
    await runFile('cmd.exe', ['/c', 'start', '', url], { timeout: 10000 });
  } else if (process.platform === 'darwin') {
    await runFile('open', [url], { timeout: 10000 });
  } else {
    await runFile('xdg-open', [url], { timeout: 10000 });
  }
  return `Command Center solicitado no navegador padrão: ${url}`;
}

async function handleTask(task) {
  await report(task, 'em_execucao', `Executando ${task.action}`);
  if (task.action === 'codex_handoff') {
    const file = await writeHandoff(task, 'codex');
    return `Handoff para Codex salvo em: ${file}`;
  }
  if (task.action === 'claude_handoff') {
    const file = await writeHandoff(task, 'claude');
    return `Handoff para Claude Code salvo em: ${file}`;
  }
  if (task.action === 'git_status') return gitStatus();
  if (task.action === 'project_checks') return projectChecks();
  if (task.action === 'open_command_center') return openCommandCenter();
  throw new Error(`Ação não permitida pelo agente local: ${task.action}`);
}

async function tick() {
  const polled = await post('/api/mapper/local-agent/poll', {
    agent_id: agentId,
    host: os.hostname(),
    workspace
  });
  const tasks = Array.isArray(polled.tasks) ? polled.tasks : [];
  if (!tasks.length) {
    log('sem tarefas pendentes');
    return;
  }
  for (const task of tasks) {
    try {
      log(`executando ${task.id}: ${task.action}`);
      const result = await handleTask(task);
      await report(task, 'concluido', 'Tarefa concluída pelo agente local.', result);
      log(`concluído ${task.id}`);
    } catch (err) {
      await report(task, 'falhou', err.message || String(err), '');
      log(`falhou ${task.id}: ${err.message || err}`);
    }
  }
}

failConfig();
log(`iniciado agent_id=${agentId} workspace=${workspace} command=${baseUrl}`);

if (once) {
  await tick();
} else {
  while (true) {
    try {
      await tick();
    } catch (err) {
      log(`erro: ${err.message || err}`);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(5000, intervalMs)));
  }
}
