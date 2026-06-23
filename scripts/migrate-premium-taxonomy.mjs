#!/usr/bin/env node
/**
 * Migração operacional — Premium Pizzas / Estoque
 *
 * Objetivo:
 * - reorganizar departamento/categoria/subcategoria(setor) conforme briefing do Thiago;
 * - preservar estoque_atual/contagens já auditadas;
 * - desativar técnicos e itens explicitamente removidos;
 * - restringir Sophia à Recepção;
 * - manter Eva como gestora total quando já estiver correta.
 *
 * Uso:
 *   node scripts/migrate-premium-taxonomy.mjs          # simulação
 *   node scripts/migrate-premium-taxonomy.mjs --apply  # aplica em produção via API
 */

const APPLY = process.argv.includes('--apply');
const BASE = process.env.TITAN_BASE_URL || 'https://premium.titanatende.com.br';
const ADMIN = process.env.TITAN_ADMIN_USER || 'thiago';

const CATEGORY_DEPARTMENT = 'Classificação operacional';

const CAT_ORDER = new Map([
  ['Matéria Prima', 10],
  ['Insumos Produzidos', 20],
  ['Bebidas', 30],
  ['Limpeza', 40],
  ['Embalagens e Descartáveis', 50],
  ['Utensílios da cozinha', 60],
  ['Utensílios do Salão', 70],
  ['Material de escritório', 80],
]);

const TYPE_BY_CATEGORY = new Map([
  ['Matéria Prima', 'insumo'],
  ['Insumos Produzidos', 'produzido internamente'],
  ['Bebidas', 'bebida'],
  ['Limpeza', 'material de limpeza'],
  ['Embalagens e Descartáveis', 'embalagem'],
  ['Utensílios da cozinha', 'utensílio'],
  ['Utensílios do Salão', 'utensílio'],
  ['Material de escritório', 'material de escritório'],
]);

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function item(nome, departamento, categoria, subcategoria, opts = {}) {
  return {
    nome,
    departamento,
    categoria,
    subcategoria,
    aliases: opts.aliases || [],
    unidade: opts.unidade,
    pode_produzir: opts.pode_produzir ?? categoria === 'Insumos Produzidos',
    pode_contar: opts.pode_contar ?? true,
    pode_comprar: opts.pode_comprar ?? true,
    tipo_item: opts.tipo_item || TYPE_BY_CATEGORY.get(categoria) || 'outro',
  };
}

const cozinhaMateriaPrima = [
  ['Açúcar', 'Gerais'],
  ['Alho-poró', 'Montagem', { aliases: ['Alho-poró (maço)'] }],
  ['Arroz', 'Gerais'],
  ['Avelã', 'Finalização'],
  ['Azeite', 'Finalização', { aliases: ['Azeite Andorinha'] }],
  ['Azeitona Preta', 'Finalização'],
  ['Bacon', 'Montagem'],
  ['Batata Palito', 'Montagem', { aliases: ['Batata'] }],
  ['Batata Palha', 'Finalização'],
  ['Café', 'Gerais', { aliases: ['Café 3 Corações tradicional 500g', 'Café Cajuba'] }],
  ['Calabresa Reta', 'Montagem'],
  ['Caldo Knorr', 'Montagem'],
  ['Cebola roxa', 'Montagem'],
  ['Chocolate ao Leite Bisnaga', 'Finalização'],
  ['Chocolate Branco Bisnaga', 'Finalização'],
  ['Coco Ralado', 'Finalização'],
  ['Creme Culinário', 'Borda'],
  ['Creme de Leite', 'Borda'],
  ['Diamante Negro', 'Finalização'],
  ['Doce de Leite', 'Finalização'],
  ['Extrato de Tomate', 'Montagem'],
  ['Farinha', 'Borda'],
  ['Feijão', 'Gerais'],
  ['Fermento Fleischmann', 'Borda'],
  ['Ferrero Rocher caixa c/ 12', 'Finalização'],
  ['Ferrero Rocher caixa c/ 8', 'Finalização', { unidade: 'UNIDADE' }],
  ['Ferrero Rocher caixa c/ 4', 'Finalização', { unidade: 'UNIDADE' }],
  ['File Mignon', 'Montagem'],
  ['Frango Coxa - Congelado', 'Montagem'],
  ['Frango Peito - Congelado', 'Montagem'],
  ['Gelo em cubos 5kg', 'Gerais'],
  ['Gota Chips ao Leite', 'Finalização'],
  ['Gota Chips Branco', 'Finalização'],
  ['Leite Condensado', 'Finalização'],
  ['Leite em Pó', 'Finalização'],
  ['Lombo Canadense', 'Montagem'],
  ['Macarrão', 'Gerais'],
  ['Manjericão', 'Finalização'],
  ['Manteiga Sem Sal', 'Montagem'],
  ['Milho Lata', 'Montagem'],
  ['Morango caixa', 'Finalização', { aliases: ['Morango (caixa)'] }],
  ['Muçarela', 'Montagem'],
  ['Nutella 3Kg', 'Finalização'],
  ['Óleo de Algodão', 'Gerais'],
  ['Óleo de Girassol', 'Borda'],
  ['Óleo de Soja', 'Montagem'],
  ['Orégano', 'Finalização'],
  ['Ouro Branco', 'Finalização'],
  ['Ovo', 'Montagem', { aliases: ['Ovo branco grande cx 60un', 'Ovo branco grande cx 60un'] }],
  ['Palmito', 'Montagem'],
  ['Parmesão', 'Montagem'],
  ['Pepperoni', 'Montagem'],
  ['Pimentão Amarelo', 'Montagem'],
  ['Pimentão Verde', 'Montagem'],
  ['Pimentão Vermelho', 'Montagem'],
  ['Prestígio cx', 'Finalização'],
  ['Presunto', 'Montagem'],
  ['Provolone', 'Montagem'],
  ['Raffaello cx c/ 15', 'Finalização'],
  ['Raffaello cx c/ 12', 'Finalização', { unidade: 'UNIDADE' }],
  ['Requeijão Catupiry', 'Montagem'],
  ['Requeijão Cheddar', 'Montagem'],
  ['Rúcula', 'Finalização'],
  ['Sal', 'Borda'],
  ['Sonho de Valsa', 'Finalização'],
  ['Tomate italiano', 'Montagem'],
  ['Tomate salada', 'Montagem'],
  ['Tomate Cereja 180g', 'Montagem', { aliases: ['Tomate sweet grape 180g'] }],
  ['Uva', 'Finalização'],
  ['Camarão', 'Montagem', { pode_produzir: false }],
].map(([nome, sub, opts]) => item(nome, 'Cozinha', 'Matéria Prima', sub, opts));

const salaMateriaPrima = [
  ['Adoçante zero 100ml', 'Recepção'],
  ['Limão taiti', 'Recepção'],
  ['Pimenta 60ml', 'Recepção', { unidade: 'UNIDADE' }],
  ['Palito de dente', 'Recepção', { unidade: 'UNIDADE' }],
].map(([nome, sub, opts]) => item(nome, 'Salão', 'Matéria Prima', sub, opts));

const cozinhaInsumosProduzidos = [
  ['Avelã 30g', 'Finalização'],
  ['Bacon em cubos 110g', 'Montagem'],
  ['Bacon fatiado 90g', 'Montagem'],
  ['Batata frita', 'Montagem'],
  ['Bisnaga G de Doce de Leite 500g', 'Finalização', { aliases: ['Bisnaga G de Doce de Leite'] }],
  ['Bisnaga G de Doce de Leite - Aberta', 'Finalização'],
  ['Bisnaga G de Nutella 500g', 'Finalização', { aliases: ['Bisnaga G de Nutella'] }],
  ['Bisnaga G de Nutella - Aberta', 'Finalização'],
  ['Bisnaga P de Nutella 240g', 'Finalização', { aliases: ['Bisnaga P de Nutella'] }],
  ['Bisnaga P de Nutella - Aberta', 'Finalização'],
  ['Bolinha de muçarela 4un', 'Borda', { aliases: ['Bolinha de muçarela'] }],
  ['Bolinha de muçarela com orégano 4un', 'Borda', { aliases: ['Bolinha de muçarela com orégano'] }],
  ['Bolinha de presunto e muçarela 4un', 'Borda', { aliases: ['Bolinha de presunto e muçarela'] }],
  ['Brigadeiro de Ninho - Bisnaga G 500g', 'Finalização', { aliases: ['Brigadeiro de Ninho'] }],
  ['Brigadeiro de Ninho - Bisnaga P 240g', 'Finalização', { unidade: 'UNIDADE' }],
  ['Calabresa 100g', 'Montagem'],
  ['Calabresa 175g', 'Montagem'],
  ['Calabresa picada 80g', 'Borda'],
  ['Camarão 200g', 'Montagem', { unidade: 'PACOTE' }],
  ['Catupiry Aberto da Borda', 'Borda'],
  ['Catupiry Aberto da Montagem', 'Montagem'],
  ['Cheddar Aberto da Borda', 'Borda'],
  ['Cheddar Aberto da Montagem', 'Montagem'],
  ['Chocolate ao Leite - Aberto Finalização', 'Finalização'],
  ['Chocolate ao Leite - Aberto Borda', 'Borda', { aliases: ['Chocolate ao Leite Aberto da Borda'] }],
  ['Chocolate Branco - Aberto Finalização', 'Finalização'],
  ['Chocolate Branco - Aberto Borda', 'Borda', { aliases: ['Chocolate Branco Aberto da Borda'] }],
  ['Coco Ralado Floco 30g', 'Finalização', { aliases: ['Coco Ralado Floco'] }],
  ['Ferrero Rocher inteiro solto', 'Finalização'],
  ['Ferrero Rocher metade', 'Finalização'],
  ['Frango cozido sem temperar', 'Montagem'],
  ['Frango temperado', 'Montagem'],
  ['Lombo 150g', 'Montagem'],
  ['Massa G 480g', 'Borda', { aliases: ['Massa G (480g)'] }],
  ['Massa P 240g', 'Borda', { aliases: ['Massa P (240g)'] }],
  ['Mignon 240g', 'Montagem'],
  ['Molho produzido', 'Montagem'],
  ['Morango em cubos', 'Finalização', { pode_contar: false }],
  ['Muçarela 150g', 'Montagem'],
  ['Muçarela 175g', 'Montagem'],
  ['Muçarela 80g', 'Montagem'],
  ['Ouro Branco inteiro solto', 'Finalização'],
  ['Ouro Branco metade', 'Finalização'],
  ['Prestígio inteiro solto', 'Finalização'],
  ['Prestígio metade', 'Finalização'],
  ['Raffaello inteiro solto', 'Finalização'],
  ['Raffaello metade', 'Finalização'],
  ['Rolinho de muçarela', 'Borda'],
  ['Rolinho de presunto e muçarela', 'Borda'],
  ['Sonho de Valsa inteiro solto', 'Finalização'],
  ['Sonho de Valsa metade', 'Finalização'],
].map(([nome, sub, opts]) => item(nome, 'Cozinha', 'Insumos Produzidos', sub, opts));

const salaBebidas = [
  ['Água com Gás 500ml', 'Recepção'],
  ['Água sem Gás 500ml', 'Recepção'],
  ['Coca Cola 1.5L', 'Recepção'],
  ['Coca Cola 1.5L Zero', 'Recepção'],
  ['Coca Cola 1L', 'Recepção'],
  ['Coca Cola 2L', 'Recepção'],
  ['Coca Cola 2L Zero', 'Recepção'],
  ['Coca Cola Zero 1L', 'Recepção'],
  ['Coca-Cola Lata 310ml', 'Recepção'],
  ['Coca-Cola Lata Zero 310ml', 'Recepção'],
  ['Guaraná Antártica Zero 350ml', 'Recepção'],
  ['Heineken 330ml', 'Recepção'],
  ['Original 300ml', 'Recepção'],
  ['Sprite Zero 310ml', 'Recepção'],
  ['Suco Del Valle Uva 1L', 'Recepção'],
  ['Suco de Laranja Natural', 'Recepção', { aliases: ['Suco Laranja Copo'], pode_produzir: true, tipo_item: 'produzido internamente' }],
  ['Suco de Morango Natural', 'Recepção', { aliases: ['Suco Morango Copo'], pode_produzir: true, tipo_item: 'produzido internamente' }],
].map(([nome, sub, opts]) => item(nome, 'Salão', 'Bebidas', sub, opts));

const limpeza = [
  ['Água Sanitária', 'Gerais'],
  ['Álcool 40', 'Gerais'],
  ['Álcool 70', 'Gerais'],
  ['Álcool em Gel', 'Gerais'],
  ['Avental Emborrachado', 'Gerais'],
  ['Bucha Dupla Face', 'Gerais'],
  ['Bucha Fibra Verde', 'Gerais'],
  ['Desengordurante', 'Gerais'],
  ['Desinfetante 5L', 'Gerais'],
  ['Detergente Neutro', 'Gerais'],
  ['Escova de Mãos', 'Gerais'],
  ['Limpa Forno', 'Gerais'],
  ['Luva Amarela', 'Gerais'],
  ['Pano de Chão', 'Gerais'],
  ['Pano Multiuso Perflex', 'Gerais', { aliases: ['Pano Multiuso (Perflex)'] }],
  ['Papel Higiênico', 'Gerais'],
  ['Papel Toalha Interfolhas', 'Gerais'],
  ['Qualifood', 'Gerais'],
  ['Rodo', 'Gerais'],
  ['Sabão em Pó', 'Gerais'],
  ['Saco de Lixo 200l 25un', 'Gerais', { aliases: ['Saco de Lixo'] }],
  ['Saco de lixo 30l 100un', 'Gerais', { aliases: ['Saco de lixo (100un)'] }],
  ['Toalha de papel 1000fl', 'Gerais', { aliases: ['Toalha de papel (1000fl)'] }],
  ['Touca Branca', 'Gerais'],
].map(([nome, sub, opts]) => item(nome, 'Limpeza', 'Limpeza', sub, opts));

const cozinhaEmbalagens = [
  ['Bobina Picotada', 'Gerais'],
  ['Caixas Fundo G depósito', 'Gerais'],
  ['Caixas Fundo P depósito', 'Gerais'],
  ['Caixas tampa G depósito', 'Gerais'],
  ['Caixas tampas P depósito', 'Gerais'],
  ['Manga Grande', 'Finalização'],
  ['Manga Pequena', 'Finalização'],
  ['Plástico Filme', 'Gerais'],
].map(([nome, sub, opts]) => item(nome, 'Cozinha', 'Embalagens e Descartáveis', sub, opts));

const salaEmbalagens = [
  ['Caixas de Pedaço - Branca', 'Recepção', { unidade: 'UNIDADE' }],
  ['Caixas de Pedaço - Amarela', 'Recepção', { unidade: 'UNIDADE' }],
].map(([nome, sub, opts]) => item(nome, 'Salão', 'Embalagens e Descartáveis', sub, opts));

const cozinhaUtensilios = [
  ['Desmoldante', 'Borda'],
  ['Fitas / Fita', 'Finalização'],
  ['Forro Plástico', 'Finalização'],
  ['Isqueiro', 'Montagem'],
  ['Etiquetas', 'Gerais'],
  ['Pilhas Finas', 'Gerais'],
].map(([nome, sub, opts]) => item(nome, 'Cozinha', 'Utensílios da cozinha', sub, opts));

const salaUtensilios = [
  ['Copo Descartável', 'Recepção'],
  ['Ketchup Heinz sachê cx 144x7g', 'Recepção', { aliases: ['Ketchup Heinz sachê (cx 144x7g)'] }],
  ['Maionese Heinz sachê cx 144x7g', 'Recepção', { aliases: ['Maionese Heinz sachê (cx 144x7g)'] }],
].map(([nome, sub, opts]) => item(nome, 'Salão', 'Utensílios do Salão', sub, opts));

const escritorio = [
  ['Caneta BIC', 'Recepção', { unidade: 'UNIDADE' }],
  ['Pincel Pilot', 'Recepção', { unidade: 'UNIDADE' }],
  ['Grampeador', 'Recepção', { unidade: 'UNIDADE' }],
  ['Caixa de Grampo', 'Recepção', { unidade: 'UNIDADE' }],
  ['Espetos de aço', 'Recepção', { unidade: 'UNIDADE' }],
].map(([nome, sub, opts]) => item(nome, 'Salão', 'Material de escritório', sub, opts));

const DESIRED = [
  ...cozinhaMateriaPrima,
  ...salaMateriaPrima,
  ...cozinhaInsumosProduzidos,
  ...salaBebidas,
  ...limpeza,
  ...cozinhaEmbalagens,
  ...salaEmbalagens,
  ...cozinhaUtensilios,
  ...salaUtensilios,
  ...escritorio,
];

const DELETE_NAMES = [
  'Bacon Sadia granel',
  'Bacon Sadia (granel)',
  'Café Cajuba',
  'Calabresa defumada Sadia 2,5kg',
  'Chocolate Prestígio Nestlé caixa',
  'Chocolate Prestígio Nestlé (caixa)',
  'Extrato de tomate Bonare 1,7kg',
  'Extrato de tomate Elefante 1,7kg',
  'Farinha de trigo p/ pizza Anaconda 5kg',
  'Filé de peito',
  'Frango congelado',
  'Manteiga Italac c/ sal 500g',
  'Manteiga Itambé c/ sal 500g',
  'Milho',
  'Mussarela Italac granel',
  'Mussarela Italac (granel)',
  'Mussarela Rádio peça',
  'Nutella',
  'Óleo de girassol Liza 900ml',
  'Orégano Kitano 200g',
  'Ovo branco grande cx 60un',
  'Pepperoni fatiado Seara 100g',
  'Recheio Scala choc. branco 1,05kg',
  'Requeijão Scala 1,5kg',
  'Salame italiano Seara 100g',
  'Calabresa picada 70g',
  'Chocolate ao Leite Bisnaga - Borda',
  'Chocolate ao Leite Bisnaga - Finalização',
  'Chocolate Branco Bisnaga - Borda',
  'Chocolate Branco Bisnaga - Finalização',
  'Lombo Fracionado',
  'Desinfetante Azulim',
  'Detergente líquido Ypê',
  'Sabonete Dove antibact. 90g',
  'Saco de lixo Santa Maria 25un',
  'Saco de lixo Santa Maria (25un)',
  'Copo descartável cristal',
  'Ketchup Heinz',
  'Maionese Heinz',
  'SMOKE_TESTE_INSUMO_20260622181643',
  'SMOKE_TESTE_INSUMO_20260622182220',
  'SMOKE_TESTE_PRODUZIDO_20260622181643_EDITADO',
  'SMOKE_TESTE_PRODUZIDO_20260622182220_EDITADO',
];

const DISABLE_COUNT_ONLY = [
  'Morango em cubos',
];

async function api(path, method = 'GET', body = undefined) {
  const headers = { 'Accept': 'application/json' };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const details = data?.erro || data?.error || text || res.statusText;
    throw new Error(`${method} ${path} -> ${res.status}: ${details}`);
  }
  return data;
}

function indexActive(products) {
  const m = new Map();
  for (const p of products) {
    if (!p.ativo) continue;
    const k = norm(p.nome);
    if (!m.has(k)) m.set(k, p);
  }
  return m;
}

function indexAny(products) {
  const m = new Map();
  for (const p of products) {
    const k = norm(p.nome);
    if (!m.has(k) || (!m.get(k).ativo && p.ativo)) m.set(k, p);
  }
  return m;
}

function findProduct(products, names) {
  const active = indexActive(products);
  const any = indexAny(products);
  for (const name of names) {
    const p = active.get(norm(name));
    if (p) return p;
  }
  for (const name of names) {
    const p = any.get(norm(name));
    if (p) return p;
  }
  return null;
}

function sameArray(a = [], b = []) {
  const aa = a.map(String).sort();
  const bb = b.map(String).sort();
  return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
}

function currentSetorIds(produto) {
  return Array.isArray(produto.setores) ? produto.setores.map(s => Number(s.id || s)).filter(Boolean) : [];
}

function buildPatchPayload(produto, updates) {
  return {
    usuario_id: ADMIN,
    nome: updates.nome ?? produto.nome,
    categoria_id: updates.categoria_id ?? produto.categoria_id ?? null,
    unidade: updates.unidade ?? produto.unidade ?? null,
    estoque_minimo: produto.estoque_minimo ?? null,
    estoque_ideal: produto.estoque_ideal ?? null,
    fornecedor_preferido_id: produto.fornecedor_preferido_id ?? null,
    pode_contar: updates.pode_contar ?? produto.pode_contar ?? true,
    pode_comprar: updates.pode_comprar ?? produto.pode_comprar ?? true,
    pode_produzir: updates.pode_produzir ?? produto.pode_produzir ?? false,
    observacoes: produto.observacoes ?? null,
    subcategoria: updates.subcategoria ?? produto.subcategoria ?? null,
    marca_preferida: produto.marca_preferida ?? null,
    peso_g: produto.peso_g ?? null,
    ativo: updates.ativo ?? produto.ativo ?? true,
    unidade_base: produto.unidade_base ?? null,
    conversao_origem: produto.conversao_origem ?? null,
    conversao_confianca: produto.conversao_confianca ?? null,
    conversao_precisa_revisao: !!produto.conversao_precisa_revisao,
    tipo_item: updates.tipo_item ?? produto.tipo_item ?? null,
    local_fisico_id: produto.local_fisico_id ?? null,
    departamento: updates.departamento ?? produto.departamento ?? null,
    setores: updates.setores ?? currentSetorIds(produto),
  };
}

function productNeedsPatch(produto, desired, categoriaId, setorId) {
  const desiredSetores = [setorId];
  return (
    produto.nome !== desired.nome ||
    Number(produto.categoria_id || 0) !== Number(categoriaId) ||
    (produto.departamento || '') !== desired.departamento ||
    (produto.subcategoria || '') !== desired.subcategoria ||
    (desired.unidade != null && (produto.unidade || '') !== desired.unidade) ||
    !!produto.pode_contar !== !!desired.pode_contar ||
    !!produto.pode_comprar !== !!desired.pode_comprar ||
    !!produto.pode_produzir !== !!desired.pode_produzir ||
    (produto.tipo_item || '') !== desired.tipo_item ||
    !produto.ativo ||
    !sameArray(currentSetorIds(produto), desiredSetores)
  );
}

async function main() {
  console.log(`${APPLY ? 'APLICANDO' : 'SIMULANDO'} migração em ${BASE}`);

  const [produtosRes, categoriasRes, setoresRes, usuariosRes] = await Promise.all([
    api('/api/est/produtos'),
    api('/api/est/categorias'),
    api('/api/est/setores'),
    api(`/api/est/usuarios?usuario_id=${encodeURIComponent(ADMIN)}`),
  ]);

  const produtos = produtosRes.produtos || [];
  const categorias = categoriasRes.categorias || [];
  const setores = setoresRes.setores || [];
  const usuarios = usuariosRes.usuarios || [];

  const stockBefore = new Map(produtos.map(p => [String(p.id), String(p.estoque_atual)]));
  const sectorByName = new Map(setores.filter(s => s.ativo).map(s => [norm(s.nome), s]));

  const actions = {
    categoriesCreated: [],
    productsCreated: [],
    productsUpdated: [],
    productsDeleted: [],
    countDisabled: [],
    usersUpdated: [],
    skippedDeletes: [],
    warnings: [],
  };

  async function ensureCategory(name) {
    const existing = categorias.find(c => norm(c.nome) === norm(name) && c.ativo !== false);
    if (existing) return existing.id;

    const fakeId = -1000 - actions.categoriesCreated.length;
    actions.categoriesCreated.push(name);
    if (!APPLY) {
      categorias.push({ id: fakeId, nome: name, departamento: CATEGORY_DEPARTMENT, ordem: CAT_ORDER.get(name) || 90, ativo: true });
      return fakeId;
    }
    const created = await api('/api/est/categoria', 'POST', {
      usuario_id: ADMIN,
      nome: name,
      departamento: CATEGORY_DEPARTMENT,
      ordem: CAT_ORDER.get(name) || 90,
    });
    categorias.push({ id: created.id, nome: name, departamento: CATEGORY_DEPARTMENT, ordem: CAT_ORDER.get(name) || 90, ativo: true });
    return created.id;
  }

  for (const categoryName of CAT_ORDER.keys()) {
    await ensureCategory(categoryName);
  }

  const categoryByName = new Map(categorias.filter(c => c.ativo !== false).map(c => [norm(c.nome), c]));

  for (const desired of DESIRED) {
    const category = categoryByName.get(norm(desired.categoria));
    if (!category) throw new Error(`Categoria não encontrada/criada: ${desired.categoria}`);
    const sector = sectorByName.get(norm(desired.subcategoria));
    if (!sector) throw new Error(`Setor não encontrado: ${desired.subcategoria}`);
    const names = [desired.nome, ...desired.aliases];
    const existing = findProduct(produtos, names);
    const setorIds = [Number(sector.id)];

    if (!existing) {
      actions.productsCreated.push(desired.nome);
      if (!APPLY) continue;
      const created = await api('/api/est/produto', 'POST', {
        usuario_id: ADMIN,
        nome: desired.nome,
        categoria_id: category.id,
        unidade: desired.unidade || 'UNIDADE',
        estoque_minimo: null,
        estoque_ideal: null,
        fornecedor_preferido_id: null,
        pode_contar: desired.pode_contar,
        pode_comprar: desired.pode_comprar,
        pode_produzir: desired.pode_produzir,
        observacoes: null,
        subcategoria: desired.subcategoria,
        marca_preferida: null,
        peso_g: null,
        unidade_base: null,
        conversao_origem: null,
        conversao_confianca: null,
        conversao_precisa_revisao: false,
        tipo_item: desired.tipo_item,
        local_fisico_id: null,
        departamento: desired.departamento,
        setores: setorIds,
      });
      produtos.push({
        id: created.id,
        nome: desired.nome,
        categoria_id: category.id,
        categoria: desired.categoria,
        unidade: desired.unidade || 'UNIDADE',
        estoque_atual: '0.000',
        pode_contar: desired.pode_contar,
        pode_comprar: desired.pode_comprar,
        pode_produzir: desired.pode_produzir,
        ativo: true,
        departamento: desired.departamento,
        subcategoria: desired.subcategoria,
        tipo_item: desired.tipo_item,
        setores: setorIds.map(id => ({ id })),
      });
      continue;
    }

    if (productNeedsPatch(existing, desired, category.id, sector.id)) {
      actions.productsUpdated.push(`${existing.nome} -> ${desired.nome}`);
      const patch = buildPatchPayload(existing, {
        nome: desired.nome,
        categoria_id: category.id,
        unidade: desired.unidade ?? existing.unidade,
        pode_contar: desired.pode_contar,
        pode_comprar: desired.pode_comprar,
        pode_produzir: desired.pode_produzir,
        tipo_item: desired.tipo_item,
        departamento: desired.departamento,
        subcategoria: desired.subcategoria,
        ativo: true,
        setores: setorIds,
      });
      if (APPLY) await api(`/api/est/produto/${existing.id}`, 'PATCH', patch);
      Object.assign(existing, {
        nome: desired.nome,
        categoria_id: category.id,
        categoria: desired.categoria,
        unidade: patch.unidade,
        pode_contar: desired.pode_contar,
        pode_comprar: desired.pode_comprar,
        pode_produzir: desired.pode_produzir,
        tipo_item: desired.tipo_item,
        departamento: desired.departamento,
        subcategoria: desired.subcategoria,
        ativo: true,
        setores: setorIds.map(id => ({ id })),
      });
    }
  }

  for (const name of DISABLE_COUNT_ONLY) {
    const p = findProduct(produtos, [name]);
    if (!p || !p.ativo) continue;
    if (p.pode_contar !== false) {
      actions.countDisabled.push(p.nome);
      if (APPLY) {
        await api(`/api/est/produto/${p.id}`, 'PATCH', buildPatchPayload(p, { pode_contar: false, ativo: true }));
      }
      p.pode_contar = false;
    }
  }

  for (const name of DELETE_NAMES) {
    const p = findProduct(produtos, [name]);
    if (!p || !p.ativo) {
      actions.skippedDeletes.push(name);
      continue;
    }
    const qtd = Number(String(p.estoque_atual || '0').replace(',', '.'));
    if (qtd > 0) actions.warnings.push(`Desativado com estoque preservado: ${p.nome} (${p.estoque_atual} ${p.unidade || ''})`);
    actions.productsDeleted.push(p.nome);
    if (APPLY) await api(`/api/est/produto/${p.id}`, 'DELETE', { usuario_id: ADMIN });
    p.ativo = false;
  }

  const eva = usuarios.find(u => norm(u.nome) === 'eva' || norm(u.apelido_login) === 'eva');
  if (eva && eva.perfil_principal !== 'GESTOR') {
    actions.usersUpdated.push('Eva -> conferir: não está como GESTOR');
    actions.warnings.push(`Eva encontrada sem perfil GESTOR (${eva.perfil_principal}). A API de estoque não altera perfil; precisa rota admin se quiser trocar.`);
  }
  if (eva && eva.perfil_principal === 'GESTOR' && sameArray(eva.setores_permitidos || [], ['TUDO'])) {
    actions.skippedDeletes.push('Eva já está com acesso total (GESTOR + TUDO).');
  }

  const sophia = usuarios.find(u => norm(u.nome) === 'sophia' || norm(u.apelido_login) === 'sophia');
  const recepcao = sectorByName.get(norm('Recepção'));
  if (sophia && recepcao && !sameArray(sophia.setores_permitidos || [], [String(recepcao.id)])) {
    actions.usersUpdated.push(`Sophia setores_permitidos -> [${recepcao.id}] Recepção`);
    if (APPLY) {
      await api(`/api/est/usuario/${sophia.id}`, 'PATCH', {
        usuario_id: ADMIN,
        setores_permitidos: [String(recepcao.id)],
      });
    }
  }

  if (APPLY) {
    const after = await api('/api/est/produtos');
    for (const p of after.produtos || []) {
      const before = stockBefore.get(String(p.id));
      if (before !== undefined && before !== String(p.estoque_atual)) {
        actions.warnings.push(`ATENÇÃO: estoque_atual mudou no produto ${p.id} ${p.nome}: ${before} -> ${p.estoque_atual}`);
      }
    }
  }

  console.log(JSON.stringify({
    apply: APPLY,
    base: BASE,
    resumo: {
      categorias_criadas: actions.categoriesCreated.length,
      produtos_criados: actions.productsCreated.length,
      produtos_atualizados: actions.productsUpdated.length,
      produtos_desativados: actions.productsDeleted.length,
      produtos_fora_da_contagem: actions.countDisabled.length,
      usuarios_atualizados: actions.usersUpdated.length,
      avisos: actions.warnings.length,
    },
    actions,
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
