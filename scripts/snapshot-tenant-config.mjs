#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const DEFAULT_TENANT_ID = 'khardela:premiumpizzas:sjrp';
const DEFAULT_HTTP_FALLBACK_URL = 'https://premium.titanatende.com.br/api/config';
const SECRET_KEY_RE = /(secret|senha|password|token|api[_-]?key|key|webhook|credential|auth|bearer|cookie|session|pin)/i;

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function sanitize(value, key = '') {
  if (SECRET_KEY_RE.test(key)) return '[REDACTED]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, key));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)]),
    );
  }

  if (typeof value === 'string' && /(api\/deploy\/|token=|apikey=|api_key=|bearer\s+)/i.test(value)) {
    return '[REDACTED]';
  }

  return value;
}

function jsonStable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const tenantId = argValue('--tenant') || process.env.TITAN_TENANT_ID || DEFAULT_TENANT_ID;
const outDir = argValue('--out') || process.env.TITAN_SNAPSHOT_DIR || path.join(os.tmpdir(), 'premium-deploy-snapshots');
const fallbackUrl = argValue('--fallback-url') || process.env.TITAN_CONFIG_SNAPSHOT_URL || DEFAULT_HTTP_FALLBACK_URL;

function snapshotFilename(source) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `tenants-config-${tenantId.replace(/[^a-z0-9_-]+/gi, '_')}-${source}-${stamp}.json`;
}

async function saveSnapshot(snapshot, source) {
  await fs.mkdir(outDir, { recursive: true });
  const outputPath = path.join(outDir, snapshotFilename(source));
  await fs.writeFile(outputPath, jsonStable(snapshot), 'utf8');
  console.log(`SNAPSHOT_OK: ${outputPath}`);
}

async function snapshotViaHttp(reason) {
  if (!fallbackUrl) {
    throw new Error('fallback HTTP ausente. Defina TITAN_CONFIG_SNAPSHOT_URL ou use --fallback-url.');
  }

  const response = await fetch(fallbackUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`fallback HTTP retornou ${response.status}`);
  }

  const data = await response.json();
  let sourceUrl;
  try {
    const parsed = new URL(fallbackUrl);
    sourceUrl = `${parsed.origin}${parsed.pathname}`;
  } catch {
    sourceUrl = 'fallback-url';
  }

  const snapshot = {
    kind: 'tenants.config.snapshot',
    mode: 'http-read-only',
    source: 'production-api',
    source_url: sourceUrl,
    tenant_id: tenantId,
    snapshot_at: new Date().toISOString(),
    fallback_reason: reason || 'database_unavailable_from_local_shell',
    config: sanitize(data && data.config ? data.config : data, 'config'),
  };

  await saveSnapshot(snapshot, 'http');
  console.log('CONFIRMACAO: GET HTTP read-only contra producao; nenhuma escrita foi feita.');
}

async function snapshotViaDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente no ambiente. Este script nao le .env por seguranca.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL search_path TO khardela, public');

    const result = await client.query(
      `
        SELECT id, nome, slug, config, now() AS snapshot_at
        FROM tenants
        WHERE id = $1
        LIMIT 1
      `,
      [tenantId],
    );

    await client.query('ROLLBACK');

    if (result.rowCount !== 1) {
      throw new Error(`tenant nao encontrado para snapshot: ${tenantId}`);
    }

    const row = result.rows[0];
    const snapshot = {
      kind: 'tenants.config.snapshot',
      mode: 'database-read-only',
      schema_search_path: 'khardela, public',
      tenant_id: row.id,
      tenant_nome: row.nome || null,
      tenant_slug: row.slug || null,
      snapshot_at: row.snapshot_at,
      config: sanitize(row.config || {}, 'config'),
    };

    await saveSnapshot(snapshot, 'db');
    console.log('CONFIRMACAO: transacao read-only encerrada com ROLLBACK; nenhuma escrita foi feita.');
  } catch (error) {
    try {
      if (client) await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure during error handling
    }
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

try {
  await snapshotViaDatabase();
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  const canFallback = fallbackUrl && /(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|getaddrinfo|DATABASE_URL ausente)/i.test(message);
  if (!canFallback) {
    console.error(`ERRO_SNAPSHOT: ${message}`);
    process.exit(1);
  }

  console.error(`AVISO_SNAPSHOT_DB_INACESSIVEL: ${message}`);
  try {
    await snapshotViaHttp(message);
  } catch (fallbackError) {
    console.error(`ERRO_SNAPSHOT_HTTP: ${fallbackError.message}`);
    process.exit(1);
  }
}
