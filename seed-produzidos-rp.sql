-- ============================================================
-- Itens PRODUZIDOS e FRACIONADOS (Premium RP). Idempotente.
-- Categoria propria + setor Montagem + receitas de producao ligadas ao bruto.
-- ============================================================
SET search_path TO khardela, public;
INSERT INTO est_categoria (tenant_id, nome, ordem) VALUES ('khardela:premiumpizzas:sjrp','Produtos produzidos internamente',5) ON CONFLICT (tenant_id, nome) DO NOTHING;

-- FRACIONADOS POR GRAMATURA (pacote -> baixa do bruto na unidade do bruto)
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Muçarela 80g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 80g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 80g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'),0.02,'PEÇA DE 4 KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 80g'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Muçarela 150g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 150g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 150g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'),0.0375,'PEÇA DE 4 KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 150g'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Muçarela 175g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 175g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 175g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'),0.04375,'PEÇA DE 4 KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 175g'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Bacon em cubos 110g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon em cubos 110g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon em cubos 110g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon'),0.11,'KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon em cubos 110g'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Bacon fatiado 90g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon fatiado 90g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon fatiado 90g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon'),0.09,'KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon fatiado 90g'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Calabresa picada 70g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa picada 70g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa picada 70g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta'),0.07,'KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa picada 70g'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Calabresa 100g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa 100g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa 100g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta'),0.1,'KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa 100g'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Calabresa 175g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa 175g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa 175g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta'),0.175,'KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa 175g'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Lombo 150g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Lombo 150g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Lombo 150g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Lombo Canadense'),0.15,'UNIDADE DE 1 KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Lombo Canadense') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Lombo 150g'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Mignon 240g',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'PACOTE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Mignon 240g'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Mignon 240g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Filé Mignon'),0.24,'KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Filé Mignon') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Mignon 240g'));

-- FRANGO POR ESTADO (kg, cadeia 1:1)
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Frango congelado',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'KG',TRUE,FALSE,FALSE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango congelado'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Frango cozido sem temperar',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'KG',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango cozido sem temperar'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Frango temperado',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'KG',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango temperado'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango cozido sem temperar'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango congelado'),1,'KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango congelado') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango cozido sem temperar'));
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango temperado'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango cozido sem temperar'),1,'KG',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango cozido sem temperar') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Frango temperado'));

-- MOLHO PRODUZIDO (kg) — ficha a definir
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Molho produzido',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'KG',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Molho produzido'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;

-- NUTELLA: bisnagas produzidas (capacidade a definir pelo gestor)
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Bisnaga P de Nutella',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga P de Nutella'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Bisnaga G de Nutella',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga G de Nutella'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;

-- BOLINHAS E ROLINHOS (unidade) — ficha a definir
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Bolinha de muçarela',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Bolinha de presunto e muçarela',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de presunto e muçarela'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Bolinha de muçarela com orégano',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela com orégano'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Rolinho de muçarela',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de muçarela'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Rolinho de presunto e muçarela',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de presunto e muçarela'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;

-- BOMBONS: inteiro solto + metade (1 inteiro = 2 metades)
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Ouro Branco inteiro solto',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ouro Branco inteiro solto'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Ouro Branco metade',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ouro Branco metade'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ouro Branco metade'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ouro Branco inteiro solto'),0.5,'UNIDADE',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ouro Branco inteiro solto') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ouro Branco metade'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Sonho de Valsa inteiro solto',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Sonho de Valsa inteiro solto'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Sonho de Valsa metade',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Sonho de Valsa metade'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Sonho de Valsa metade'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Sonho de Valsa inteiro solto'),0.5,'UNIDADE',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Sonho de Valsa inteiro solto') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Sonho de Valsa metade'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Ferrero Rocher inteiro solto',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ferrero Rocher inteiro solto'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Ferrero Rocher metade',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ferrero Rocher metade'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ferrero Rocher metade'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ferrero Rocher inteiro solto'),0.5,'UNIDADE',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ferrero Rocher inteiro solto') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Ferrero Rocher metade'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Raffaello inteiro solto',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Raffaello inteiro solto'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Raffaello metade',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Raffaello metade'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Raffaello metade'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Raffaello inteiro solto'),0.5,'UNIDADE',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Raffaello inteiro solto') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Raffaello metade'));

INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Prestígio inteiro solto',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Prestígio inteiro solto'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_produto (tenant_id, nome, categoria_id, unidade, pode_contar, pode_comprar, pode_produzir, ativo)
SELECT 'khardela:premiumpizzas:sjrp','Prestígio metade',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'UNIDADE',TRUE,FALSE,TRUE,TRUE
ON CONFLICT (tenant_id, nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id, produto_id, setor_id, obrigatorio)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Prestígio metade'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE
WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id, produto_id, setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id, produto_id, insumo_produto_id, quantidade_por_unidade, unidade, rendimento, ativo)
SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Prestígio metade'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Prestígio inteiro solto'),0.5,'UNIDADE',1,TRUE
WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Prestígio inteiro solto') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Prestígio metade'));


-- ===== Itens abertos por setor (Catupiry/Cheddar/Chocolate) + ficha bolinha =====
INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo) SELECT 'khardela:premiumpizzas:sjrp','Catupiry Aberto da Borda',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'KG',TRUE,FALSE,TRUE,TRUE ON CONFLICT (tenant_id,nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Borda'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Borda'),FALSE WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Borda') ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Borda'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Catupiry'),NULL,NULL,1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Catupiry') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Borda'));
INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo) SELECT 'khardela:premiumpizzas:sjrp','Catupiry Aberto da Montagem',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'KG',TRUE,FALSE,TRUE,TRUE ON CONFLICT (tenant_id,nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Montagem'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Montagem'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Catupiry'),NULL,NULL,1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Catupiry') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Montagem'));
INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo) SELECT 'khardela:premiumpizzas:sjrp','Cheddar Aberto da Borda',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'KG',TRUE,FALSE,TRUE,TRUE ON CONFLICT (tenant_id,nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Borda'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Borda'),FALSE WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Borda') ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Borda'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Cheddar'),NULL,NULL,1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Cheddar') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Borda'));
INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo) SELECT 'khardela:premiumpizzas:sjrp','Cheddar Aberto da Montagem',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'KG',TRUE,FALSE,TRUE,TRUE ON CONFLICT (tenant_id,nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Montagem'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem'),FALSE WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Montagem') ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Montagem'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Cheddar'),NULL,NULL,1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Cheddar') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Montagem'));
INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo) SELECT 'khardela:premiumpizzas:sjrp','Chocolate ao Leite Bisnaga - Borda',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'BISNAGA',TRUE,FALSE,TRUE,TRUE ON CONFLICT (tenant_id,nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Borda'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Borda'),FALSE WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Borda') ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Borda'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga'),NULL,NULL,1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Borda'));
INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo) SELECT 'khardela:premiumpizzas:sjrp','Chocolate ao Leite Bisnaga - Finalização',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'BISNAGA',TRUE,FALSE,TRUE,TRUE ON CONFLICT (tenant_id,nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Finalização'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Finalização'),FALSE WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Finalização') ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Finalização'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga'),NULL,NULL,1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Finalização'));
INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo) SELECT 'khardela:premiumpizzas:sjrp','Chocolate Branco Bisnaga - Borda',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'BISNAGA',TRUE,FALSE,TRUE,TRUE ON CONFLICT (tenant_id,nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Borda'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Borda'),FALSE WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Borda') ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Borda'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga'),NULL,NULL,1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Borda'));
INSERT INTO est_produto (tenant_id,nome,categoria_id,unidade,pode_contar,pode_comprar,pode_produzir,ativo) SELECT 'khardela:premiumpizzas:sjrp','Chocolate Branco Bisnaga - Finalização',(SELECT id FROM est_categoria WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Produtos produzidos internamente'),'BISNAGA',TRUE,FALSE,TRUE,TRUE ON CONFLICT (tenant_id,nome) DO NOTHING;
INSERT INTO est_produto_setor (tenant_id,produto_id,setor_id,obrigatorio) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Finalização'),(SELECT id FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Finalização'),FALSE WHERE EXISTS (SELECT 1 FROM est_setor WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Finalização') ON CONFLICT (tenant_id,produto_id,setor_id) DO NOTHING;
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Finalização'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga'),NULL,NULL,1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Finalização'));
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'),0.035,'PEÇA DE 4 KG',1,TRUE WHERE NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela'));

-- ===== Ajustes: peso_g dos brutos, contagem por peso (abertos), fracionados em gramas, fichas bolinhas, bisnagas =====
UPDATE est_produto SET peso_g=4000 WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela';
UPDATE est_produto SET peso_g=1000 WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon';
UPDATE est_produto SET peso_g=1000 WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta';
UPDATE est_produto SET peso_g=1000 WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Lombo Canadense';
UPDATE est_produto SET peso_g=1000 WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Filé Mignon';
UPDATE est_produto SET peso_g=3500 WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Presunto';
UPDATE est_produto SET peso_g=1500 WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Catupiry';
UPDATE est_produto SET peso_g=1500 WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Requeijão Cheddar';
UPDATE est_produto SET peso_g=3000 WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Nutella';
UPDATE est_produto SET unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Borda';
UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Borda');
UPDATE est_produto SET unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Montagem';
UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Catupiry Aberto da Montagem');
UPDATE est_produto SET unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Borda';
UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Borda');
UPDATE est_produto SET unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Montagem';
UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Cheddar Aberto da Montagem');
UPDATE est_produto SET unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Borda';
UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Borda');
UPDATE est_produto SET unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Finalização';
UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate ao Leite Bisnaga - Finalização');
UPDATE est_produto SET unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Borda';
UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Borda');
UPDATE est_produto SET unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Finalização';
UPDATE est_producao_receita SET ativo=FALSE WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Chocolate Branco Bisnaga - Finalização');
UPDATE est_producao_receita SET quantidade_por_unidade=80, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 80g') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela');
UPDATE est_producao_receita SET quantidade_por_unidade=150, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 150g') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela');
UPDATE est_producao_receita SET quantidade_por_unidade=175, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela 175g') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela');
UPDATE est_producao_receita SET quantidade_por_unidade=110, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon em cubos 110g') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon');
UPDATE est_producao_receita SET quantidade_por_unidade=90, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon fatiado 90g') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bacon');
UPDATE est_producao_receita SET quantidade_por_unidade=70, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa picada 70g') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta');
UPDATE est_producao_receita SET quantidade_por_unidade=100, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa 100g') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta');
UPDATE est_producao_receita SET quantidade_por_unidade=175, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa 175g') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Calabresa Reta');
UPDATE est_producao_receita SET quantidade_por_unidade=150, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Lombo 150g') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Lombo Canadense');
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Mignon 240g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Filé Mignon'),240,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Mignon 240g') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Filé Mignon') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Mignon 240g') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Filé Mignon'));
UPDATE est_producao_receita SET quantidade_por_unidade=140, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela');
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela com orégano'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'),140,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela com orégano') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela com orégano') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'));
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de presunto e muçarela'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'),70,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de presunto e muçarela') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de presunto e muçarela') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'));
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de presunto e muçarela'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Presunto'),70,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de presunto e muçarela') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Presunto') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de presunto e muçarela') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Presunto'));
UPDATE est_produto SET unidade='UNIDADE' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga P de Nutella';
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga P de Nutella'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Nutella'),NULL,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga P de Nutella') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Nutella') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga P de Nutella') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Nutella'));
UPDATE est_produto SET unidade='UNIDADE' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga G de Nutella';
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga G de Nutella'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Nutella'),NULL,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga G de Nutella') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Nutella') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bisnaga G de Nutella') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Nutella'));

-- ===== Ajuste 2: contagem por pacote, Mignon (File Mignon), multi-insumo bolinhas/rolinhos =====
UPDATE est_produto SET unidade='Pacote' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela';
UPDATE est_produto SET unidade='Pacote' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela com orégano';
UPDATE est_produto SET unidade='Pacote' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de presunto e muçarela';
UPDATE est_produto SET unidade='Pacote' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de muçarela';
UPDATE est_produto SET unidade='Pacote' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de presunto e muçarela';
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Mignon 240g'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='File Mignon'),240,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Mignon 240g') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='File Mignon') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Mignon 240g') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='File Mignon'));
UPDATE est_producao_receita SET quantidade_por_unidade=140, unidade='g' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela com orégano') AND insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela');
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela com orégano'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Orégano'),NULL,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela com orégano') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Orégano') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Bolinha de muçarela com orégano') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Orégano'));
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de muçarela'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'),NULL,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de muçarela') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de muçarela') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'));
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de presunto e muçarela'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'),NULL,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de presunto e muçarela') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de presunto e muçarela') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Muçarela'));
INSERT INTO est_producao_receita (tenant_id,produto_id,insumo_produto_id,quantidade_por_unidade,unidade,rendimento,ativo) SELECT 'khardela:premiumpizzas:sjrp',(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de presunto e muçarela'),(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Presunto'),NULL,'g',1,TRUE WHERE (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de presunto e muçarela') IS NOT NULL AND (SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Presunto') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM est_producao_receita r WHERE r.tenant_id='khardela:premiumpizzas:sjrp' AND r.produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Rolinho de presunto e muçarela') AND r.insumo_produto_id=(SELECT id FROM est_produto WHERE tenant_id='khardela:premiumpizzas:sjrp' AND nome='Presunto'));
