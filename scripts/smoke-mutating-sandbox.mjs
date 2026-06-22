const args = new Map();
for (const raw of process.argv.slice(2)) {
  const m = raw.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
}

const baseUrl = (args.get('base-url') || process.env.TITAN_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
const userId = args.get('user-id') || process.env.TITAN_SMOKE_USER_ID || '';
const confirm = args.get('confirm') || process.env.TITAN_SMOKE_MUTATE_CONFIRM || '';
const allowRemote = args.get('allow-remote') === '1' || process.env.TITAN_SMOKE_ALLOW_REMOTE === '1';

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl);

if (!userId) {
  console.error('Defina TITAN_SMOKE_USER_ID ou use --user-id=<id de gestor>.');
  process.exit(2);
}

if (confirm !== 'CRIAR_DADOS_DE_TESTE') {
  console.error('Teste mutável bloqueado. Para rodar, defina TITAN_SMOKE_MUTATE_CONFIRM=CRIAR_DADOS_DE_TESTE.');
  process.exit(2);
}

if (!isLocal && !allowRemote) {
  console.error('Base URL não é local. Para rodar fora de localhost, defina TITAN_SMOKE_ALLOW_REMOTE=1 conscientemente.');
  process.exit(2);
}

async function request(path, method = 'GET', body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify({ usuario_id: userId, ...body });
  const res = await fetch(baseUrl + path, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok || json?.erro) throw new Error(`${method} ${path} → HTTP ${res.status}: ${json?.erro || text.slice(0, 220)}`);
  return json;
}

const created = {
  produtoId: null,
  produtoNome: null
};

async function cleanup() {
  if (!created.produtoId) return;
  try {
    await request(`/api/est/producao/ficha/${created.produtoId}`, 'DELETE', {});
  } catch (err) {
    console.warn(`Aviso: não consegui excluir ficha de teste: ${err.message}`);
  }
  try {
    await request(`/api/est/produto/${created.produtoId}`, 'DELETE', {});
  } catch (err) {
    console.warn(`Aviso: não consegui inativar produto de teste ${created.produtoId}: ${err.message}`);
  }
}

try {
  console.log(`Smoke mutável controlado em ${baseUrl}`);

  const produtos = await request('/api/est/produtos');
  const insumo = (produtos.produtos || []).find((p) => p.ativo !== false && p.id);
  if (!insumo) throw new Error('Nenhum insumo/produto ativo encontrado para montar ficha de teste.');

  const categorias = await request('/api/est/categorias');
  const categoria = (categorias.categorias || []).find((c) => c.ativo !== false);

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const nome = `SMOKE_TESTE_CODEX_${stamp}`;
  created.produtoNome = nome;

  const createdProduct = await request('/api/est/produto', 'POST', {
    nome,
    unidade: 'UNIDADE',
    categoria_id: categoria?.id || null,
    pode_produzir: true,
    pode_contar: false,
    pode_comprar: false,
    observacoes: 'Criado automaticamente por smoke-mutating-sandbox. Deve ser inativado no cleanup.'
  });
  created.produtoId = createdProduct.id;
  console.log(`OK produto criado: ${created.produtoId}`);

  await request(`/api/est/produto/${created.produtoId}`, 'PATCH', {
    nome: `${nome}_EDITADO`,
    unidade: 'UNIDADE',
    categoria_id: categoria?.id || null,
    pode_produzir: true,
    pode_contar: false,
    pode_comprar: false,
    observacoes: 'Editado automaticamente por smoke-mutating-sandbox.'
  });
  console.log('OK produto editado');

  await request(`/api/est/produto/${created.produtoId}/ficha`, 'PUT', {
    rendimento: 1,
    itens: [
      {
        insumo_produto_id: insumo.id,
        quantidade: 0.001,
        unidade: insumo.unidade || 'UNIDADE',
        observacao: 'Linha de teste criada por smoke-mutating-sandbox.'
      }
    ]
  });
  console.log(`OK ficha simples salva usando insumo ${insumo.id}`);

  const ficha = await request(`/api/est/producao/ficha?produto_id=${created.produtoId}`);
  if (!Array.isArray(ficha.porcoes) || ficha.porcoes.length < 1) throw new Error('Ficha de teste não retornou porções.');
  console.log('OK ficha consultada');

  await cleanup();
  console.log('OK cleanup executado: ficha desativada e produto inativado.');
  console.log('Blindagem mutável controlada OK.');
} catch (err) {
  console.error(`FAIL ${err.message}`);
  await cleanup();
  if (created.produtoId) {
    console.error(`Produto de teste criado: ${created.produtoId} (${created.produtoNome}). Confira/inative manualmente se necessário.`);
  }
  process.exit(1);
}
