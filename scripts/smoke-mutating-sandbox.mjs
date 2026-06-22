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
  console.error('Defina TITAN_SMOKE_USER_ID ou use --user-id=<id/login de gestor>.');
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
  insumoId: null,
  produzidoId: null,
  nomes: []
};

async function cleanup() {
  if (created.produzidoId) {
    try {
      await request(`/api/est/producao/ficha/${created.produzidoId}`, 'DELETE', {});
    } catch (err) {
      console.warn(`Aviso: não consegui excluir ficha de teste: ${err.message}`);
    }
  }
  for (const id of [created.produzidoId, created.insumoId].filter(Boolean)) {
    try {
      await request(`/api/est/produto/${id}`, 'DELETE', {});
    } catch (err) {
      console.warn(`Aviso: não consegui inativar produto de teste ${id}: ${err.message}`);
    }
  }
}

function n(v) {
  return Number(Number(v || 0).toFixed(4));
}

try {
  console.log(`Smoke mutável controlado em ${baseUrl}`);
  console.log('Escopo: cria produtos de teste, compra de teste, ficha avançada, produção e cleanup lógico.');

  const categorias = await request('/api/est/categorias');
  const categoria = (categorias.categorias || []).find((c) => c.ativo !== false);

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const nomeInsumo = `SMOKE_TESTE_INSUMO_${stamp}`;
  const nomeProduzido = `SMOKE_TESTE_PRODUZIDO_${stamp}`;
  created.nomes.push(nomeInsumo, nomeProduzido);

  const insumo = await request('/api/est/produto', 'POST', {
    nome: nomeInsumo,
    unidade: 'KG',
    categoria_id: categoria?.id || null,
    pode_produzir: false,
    pode_contar: false,
    pode_comprar: true,
    observacoes: 'Criado automaticamente por smoke-mutating-sandbox. Deve ser inativado no cleanup.'
  });
  created.insumoId = insumo.id;
  console.log(`OK insumo de teste criado: ${created.insumoId}`);

  await request('/api/est/compra', 'POST', {
    origem: 'SMOKE_MUTATING',
    itens: [
      {
        produto_id: created.insumoId,
        marca: 'Smoke',
        quantidade: 10,
        unidade: 'KG',
        valor_unitario: 2,
        valor_total: 20
      }
    ]
  });
  console.log('OK compra/entrada de teste registrada');

  const produzido = await request('/api/est/produto', 'POST', {
    nome: nomeProduzido,
    unidade: 'UNIDADE',
    categoria_id: categoria?.id || null,
    pode_produzir: true,
    pode_contar: false,
    pode_comprar: false,
    observacoes: 'Criado automaticamente por smoke-mutating-sandbox. Deve ser inativado no cleanup.'
  });
  created.produzidoId = produzido.id;
  console.log(`OK produzido de teste criado: ${created.produzidoId}`);

  await request(`/api/est/produto/${created.produzidoId}`, 'PATCH', {
    nome: `${nomeProduzido}_EDITADO`,
    unidade: 'UNIDADE',
    categoria_id: categoria?.id || null,
    pode_produzir: true,
    pode_contar: false,
    pode_comprar: false,
    observacoes: 'Editado automaticamente por smoke-mutating-sandbox.'
  });
  console.log('OK produto produzido editado');

  await request('/api/est/producao/ficha', 'PUT', {
    produto_id: created.produzidoId,
    descricao: `${nomeProduzido}_EDITADO`,
    unidade_consumo: 'UNIDADE',
    tipo: 'PRODUZIDO',
    instrucoes: 'Ficha criada por smoke mutável controlado.',
    porcoes: [
      {
        nome: 'Porção smoke',
        rendimento: 1,
        unidade: 'UNIDADE',
        itens: [
          {
            insumo_produto_id: created.insumoId,
            quantidade: 100,
            unidade: 'G',
            observacao: '100 g por unidade produzida'
          }
        ]
      }
    ]
  });
  console.log('OK ficha avançada salva');

  const ficha = await request(`/api/est/producao/ficha?produto_id=${created.produzidoId}`);
  if (!Array.isArray(ficha.porcoes) || ficha.porcoes.length !== 1) throw new Error('Ficha avançada não retornou exatamente uma porção.');
  if (!Array.isArray(ficha.porcoes[0].itens) || ficha.porcoes[0].itens.length !== 1) throw new Error('Ficha avançada não retornou exatamente um ingrediente.');
  console.log('OK ficha avançada consultada');

  const antesInsumo = await request(`/api/est/produto/${created.insumoId}`);
  const antesProduzido = await request(`/api/est/produto/${created.produzidoId}`);

  const run = await request('/api/est/producao/run', 'POST', {
    produto_id: created.produzidoId,
    porcao_id: ficha.porcoes[0].id,
    lotes: 2,
    observacao: 'Produção de teste criada por smoke-mutating-sandbox.'
  });
  if (!run.ok) throw new Error('Produção de teste não retornou ok=true.');
  console.log('OK produção lançada');

  const depoisInsumo = await request(`/api/est/produto/${created.insumoId}`);
  const depoisProduzido = await request(`/api/est/produto/${created.produzidoId}`);
  const deltaInsumo = n(Number(antesInsumo.produto.estoque_atual) - Number(depoisInsumo.produto.estoque_atual));
  const deltaProduzido = n(Number(depoisProduzido.produto.estoque_atual) - Number(antesProduzido.produto.estoque_atual));
  if (Math.abs(deltaInsumo - 0.2) > 0.0001) throw new Error(`Baixa do insumo esperada 0.2 KG; recebido ${deltaInsumo}.`);
  if (Math.abs(deltaProduzido - 2) > 0.0001) throw new Error(`Entrada do produzido esperada 2 UNIDADE; recebido ${deltaProduzido}.`);
  console.log('OK baixa/entrada conferidas: -0.2 KG no insumo e +2 UNIDADE no produzido');

  await cleanup();
  console.log('OK cleanup executado: ficha desativada e produtos de teste inativados.');
  console.log('Blindagem mutável controlada OK.');
} catch (err) {
  console.error(`FAIL ${err.message}`);
  await cleanup();
  if (created.insumoId || created.produzidoId) {
    console.error(`Produtos de teste criados: ${JSON.stringify(created, null, 2)}. Confira/inative manualmente se necessário.`);
  }
  process.exit(1);
}
