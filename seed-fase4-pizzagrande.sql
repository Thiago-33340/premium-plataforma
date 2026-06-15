-- SEED FASE 4 — Pizza Grande no modelo de 4 bordas (idempotente, roda 1x).
-- Categoria "Pizza Grande - 8 Pedaços" -> 4 itens de borda -> variações.
SET search_path TO khardela, public;
DO $$
DECLARE
  t text := 'khardela:premiumpizzas:sjrp';
  v_cat int;
  v_prod uuid;
  v_grp uuid;
BEGIN
  IF (SELECT (config->>'pizza_grande_4bordas_v1') FROM tenants WHERE id=t) = 'true' THEN RETURN; END IF;
  SELECT id INTO v_cat FROM menu_categorias WHERE tenant_id=t AND codigo='pizza_grande';
  IF v_cat IS NULL THEN RETURN; END IF;
  UPDATE menu_categorias SET nome='Pizza Grande - 8 Pedaços' WHERE id=v_cat;
  DELETE FROM produtos WHERE tenant_id=t AND categoria_id=v_cat;

  -- ===== Pizza Grande - Sem Borda Recheada (base 0) =====
  INSERT INTO produtos (id,tenant_id,categoria_id,nome,descricao,tipo_montagem,preco_base,regra_preco,gratuito,status,ordem)
    VALUES (gen_random_uuid(),t,v_cat,'Pizza Grande - Sem Borda Recheada','Pizza grande (8 pedaços). Escolha 2 sabores.','MONTAVEL',0,'SOMA',FALSE,'ATIVO',1) RETURNING id INTO v_prod;
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Sabores (escolha 2, pode repetir o mesmo)',1,2,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Calabresa',47.45,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Calabacon',47.45,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Bacon com Batata Palha',47.45,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Frango com Bacon',47.45,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Frango com Catupiry',47.45,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Margherita',47.45,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Mussarela',47.45,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Portuguesa',47.45,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Mussarela com Bacon',47.45,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Palmito Cremoso',47.45,'ATIVO',10),
    (gen_random_uuid(),t,v_grp,'Sexta-Santa',47.45,'ATIVO',11),
    (gen_random_uuid(),t,v_grp,'Rúcula Premium',47.45,'ATIVO',12),
    (gen_random_uuid(),t,v_grp,'Quatro Queijos',47.45,'ATIVO',13),
    (gen_random_uuid(),t,v_grp,'5 Queijos',59.95,'ATIVO',14),
    (gen_random_uuid(),t,v_grp,'Pepperoni',59.95,'ATIVO',15),
    (gen_random_uuid(),t,v_grp,'Lombo',64.95,'ATIVO',16),
    (gen_random_uuid(),t,v_grp,'Do Cheff',59.95,'ATIVO',17),
    (gen_random_uuid(),t,v_grp,'Frango Cremoso',59.95,'ATIVO',18),
    (gen_random_uuid(),t,v_grp,'Premium',59.95,'ATIVO',19),
    (gen_random_uuid(),t,v_grp,'Mr. Pig',59.95,'ATIVO',20),
    (gen_random_uuid(),t,v_grp,'Suprema',64.95,'ATIVO',21),
    (gen_random_uuid(),t,v_grp,'Mignon',74.95,'ATIVO',22),
    (gen_random_uuid(),t,v_grp,'Mignon Cremosa',74.95,'ATIVO',23),
    (gen_random_uuid(),t,v_grp,'Mignon com Fritas',74.95,'ATIVO',24),
    (gen_random_uuid(),t,v_grp,'Camarão Rosa',89.95,'ATIVO',25),
    (gen_random_uuid(),t,v_grp,'Branco Supremo',44.95,'ATIVO',26),
    (gen_random_uuid(),t,v_grp,'Choco Premium',64.95,'ATIVO',27),
    (gen_random_uuid(),t,v_grp,'Diamante Negro',44.95,'ATIVO',28),
    (gen_random_uuid(),t,v_grp,'Ouro Branco',44.95,'ATIVO',29),
    (gen_random_uuid(),t,v_grp,'Prestigio',44.95,'ATIVO',30),
    (gen_random_uuid(),t,v_grp,'Sensação',44.95,'ATIVO',31),
    (gen_random_uuid(),t,v_grp,'Sonho de Valsa',44.95,'ATIVO',32),
    (gen_random_uuid(),t,v_grp,'Rafaello',64.95,'ATIVO',33),
    (gen_random_uuid(),t,v_grp,'Nutella com Morango',59.95,'ATIVO',34),
    (gen_random_uuid(),t,v_grp,'Ninho com Nutella',59.95,'ATIVO',35);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Pizza Pequena Doce (promoção — opcional)',2,0,1,FALSE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Diamante Negro',44.9,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Ouro Branco',44.9,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Prestigio',44.9,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Sensação',44.9,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Sonho de Valsa',44.9,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Branco Supremo',44.9,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Nutella com Morango',59.9,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Ninho com Nutella',64.9,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Choco Premium',69.9,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Raffaello',69.9,'ATIVO',10);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Acréscimos',3,0,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Bacon',9.9,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Batata Palha',9.9,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Catupiry',9.9,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Cebola Roxa',9.9,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Cheddar',9.9,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Milho',9.9,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Palmito',9.9,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Parmesão',9.9,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Tomate',9.9,'ATIVO',9);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Extras',4,0,15,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Heinz Ketchup + Maionese 12un',3.99,'ATIVO',1);

  -- ===== Pizza Grande + Borda Vulcão (base 24.9) =====
  INSERT INTO produtos (id,tenant_id,categoria_id,nome,descricao,tipo_montagem,preco_base,regra_preco,gratuito,status,ordem)
    VALUES (gen_random_uuid(),t,v_cat,'Pizza Grande + Borda Vulcão','Pizza grande (8 pedaços). Escolha 2 sabores.','MONTAVEL',24.9,'SOMA',FALSE,'ATIVO',2) RETURNING id INTO v_prod;
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Sabores (escolha 2, pode repetir o mesmo)',1,2,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Calabresa',47.45,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Calabacon',47.45,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Bacon com Batata Palha',47.45,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Frango com Bacon',47.45,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Frango com Catupiry',47.45,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Margherita',47.45,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Mussarela',47.45,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Portuguesa',47.45,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Mussarela com Bacon',47.45,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Palmito Cremoso',47.45,'ATIVO',10),
    (gen_random_uuid(),t,v_grp,'Sexta-Santa',47.45,'ATIVO',11),
    (gen_random_uuid(),t,v_grp,'Rúcula Premium',47.45,'ATIVO',12),
    (gen_random_uuid(),t,v_grp,'Quatro Queijos',47.45,'ATIVO',13),
    (gen_random_uuid(),t,v_grp,'5 Queijos',59.95,'ATIVO',14),
    (gen_random_uuid(),t,v_grp,'Pepperoni',59.95,'ATIVO',15),
    (gen_random_uuid(),t,v_grp,'Lombo',64.95,'ATIVO',16),
    (gen_random_uuid(),t,v_grp,'Do Cheff',59.95,'ATIVO',17),
    (gen_random_uuid(),t,v_grp,'Frango Cremoso',59.95,'ATIVO',18),
    (gen_random_uuid(),t,v_grp,'Premium',59.95,'ATIVO',19),
    (gen_random_uuid(),t,v_grp,'Mr. Pig',59.95,'ATIVO',20),
    (gen_random_uuid(),t,v_grp,'Suprema',64.95,'ATIVO',21),
    (gen_random_uuid(),t,v_grp,'Mignon',74.95,'ATIVO',22),
    (gen_random_uuid(),t,v_grp,'Mignon Cremosa',74.95,'ATIVO',23),
    (gen_random_uuid(),t,v_grp,'Mignon com Fritas',74.95,'ATIVO',24),
    (gen_random_uuid(),t,v_grp,'Camarão Rosa',89.95,'ATIVO',25),
    (gen_random_uuid(),t,v_grp,'Branco Supremo',44.95,'ATIVO',26),
    (gen_random_uuid(),t,v_grp,'Choco Premium',64.95,'ATIVO',27),
    (gen_random_uuid(),t,v_grp,'Diamante Negro',44.95,'ATIVO',28),
    (gen_random_uuid(),t,v_grp,'Ouro Branco',44.95,'ATIVO',29),
    (gen_random_uuid(),t,v_grp,'Prestigio',44.95,'ATIVO',30),
    (gen_random_uuid(),t,v_grp,'Sensação',44.95,'ATIVO',31),
    (gen_random_uuid(),t,v_grp,'Sonho de Valsa',44.95,'ATIVO',32),
    (gen_random_uuid(),t,v_grp,'Rafaello',64.95,'ATIVO',33),
    (gen_random_uuid(),t,v_grp,'Nutella com Morango',59.95,'ATIVO',34),
    (gen_random_uuid(),t,v_grp,'Ninho com Nutella',59.95,'ATIVO',35);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Recheio da borda (escolha até 2)',2,1,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Mussarela',0,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Presunto e Mussarela',0,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Catupiry',0,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Cheddar',0,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Bacon',0,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Parmesão',0,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Chocolate ao Leite',0,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Chocolate Branco',0,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Ninho com Morango',0,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Ninho com Uva',0,'ATIVO',10);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Pizza Pequena Doce (promoção — opcional)',3,0,1,FALSE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Diamante Negro',44.9,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Ouro Branco',44.9,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Prestigio',44.9,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Sensação',44.9,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Sonho de Valsa',44.9,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Branco Supremo',44.9,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Nutella com Morango',59.9,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Ninho com Nutella',64.9,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Choco Premium',69.9,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Raffaello',69.9,'ATIVO',10);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Acréscimos',4,0,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Bacon',9.9,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Batata Palha',9.9,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Catupiry',9.9,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Cebola Roxa',9.9,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Cheddar',9.9,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Milho',9.9,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Palmito',9.9,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Parmesão',9.9,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Tomate',9.9,'ATIVO',9);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Extras',5,0,15,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Heinz Ketchup + Maionese 12un',3.99,'ATIVO',1);

  -- ===== Pizza Grande + Borda Tradicional Recheada (base 24.9) =====
  INSERT INTO produtos (id,tenant_id,categoria_id,nome,descricao,tipo_montagem,preco_base,regra_preco,gratuito,status,ordem)
    VALUES (gen_random_uuid(),t,v_cat,'Pizza Grande + Borda Tradicional Recheada','Pizza grande (8 pedaços). Escolha 2 sabores.','MONTAVEL',24.9,'SOMA',FALSE,'ATIVO',3) RETURNING id INTO v_prod;
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Sabores (escolha 2, pode repetir o mesmo)',1,2,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Calabresa',47.45,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Calabacon',47.45,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Bacon com Batata Palha',47.45,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Frango com Bacon',47.45,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Frango com Catupiry',47.45,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Margherita',47.45,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Mussarela',47.45,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Portuguesa',47.45,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Mussarela com Bacon',47.45,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Palmito Cremoso',47.45,'ATIVO',10),
    (gen_random_uuid(),t,v_grp,'Sexta-Santa',47.45,'ATIVO',11),
    (gen_random_uuid(),t,v_grp,'Rúcula Premium',47.45,'ATIVO',12),
    (gen_random_uuid(),t,v_grp,'Quatro Queijos',47.45,'ATIVO',13),
    (gen_random_uuid(),t,v_grp,'5 Queijos',59.95,'ATIVO',14),
    (gen_random_uuid(),t,v_grp,'Pepperoni',59.95,'ATIVO',15),
    (gen_random_uuid(),t,v_grp,'Lombo',64.95,'ATIVO',16),
    (gen_random_uuid(),t,v_grp,'Do Cheff',59.95,'ATIVO',17),
    (gen_random_uuid(),t,v_grp,'Frango Cremoso',59.95,'ATIVO',18),
    (gen_random_uuid(),t,v_grp,'Premium',59.95,'ATIVO',19),
    (gen_random_uuid(),t,v_grp,'Mr. Pig',59.95,'ATIVO',20),
    (gen_random_uuid(),t,v_grp,'Suprema',64.95,'ATIVO',21),
    (gen_random_uuid(),t,v_grp,'Mignon',74.95,'ATIVO',22),
    (gen_random_uuid(),t,v_grp,'Mignon Cremosa',74.95,'ATIVO',23),
    (gen_random_uuid(),t,v_grp,'Mignon com Fritas',74.95,'ATIVO',24),
    (gen_random_uuid(),t,v_grp,'Camarão Rosa',89.95,'ATIVO',25),
    (gen_random_uuid(),t,v_grp,'Branco Supremo',44.95,'ATIVO',26),
    (gen_random_uuid(),t,v_grp,'Choco Premium',64.95,'ATIVO',27),
    (gen_random_uuid(),t,v_grp,'Diamante Negro',44.95,'ATIVO',28),
    (gen_random_uuid(),t,v_grp,'Ouro Branco',44.95,'ATIVO',29),
    (gen_random_uuid(),t,v_grp,'Prestigio',44.95,'ATIVO',30),
    (gen_random_uuid(),t,v_grp,'Sensação',44.95,'ATIVO',31),
    (gen_random_uuid(),t,v_grp,'Sonho de Valsa',44.95,'ATIVO',32),
    (gen_random_uuid(),t,v_grp,'Rafaello',64.95,'ATIVO',33),
    (gen_random_uuid(),t,v_grp,'Nutella com Morango',59.95,'ATIVO',34),
    (gen_random_uuid(),t,v_grp,'Ninho com Nutella',59.95,'ATIVO',35);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Recheio da borda (escolha até 2)',2,1,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Mussarela',0,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Presunto e Mussarela',0,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Catupiry',0,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Cheddar',0,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Bacon',0,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Parmesão',0,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Chocolate ao Leite',0,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Chocolate Branco',0,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Ninho com Morango',0,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Ninho com Uva',0,'ATIVO',10);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Pizza Pequena Doce (promoção — opcional)',3,0,1,FALSE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Diamante Negro',44.9,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Ouro Branco',44.9,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Prestigio',44.9,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Sensação',44.9,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Sonho de Valsa',44.9,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Branco Supremo',44.9,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Nutella com Morango',59.9,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Ninho com Nutella',64.9,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Choco Premium',69.9,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Raffaello',69.9,'ATIVO',10);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Acréscimos',4,0,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Bacon',9.9,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Batata Palha',9.9,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Catupiry',9.9,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Cebola Roxa',9.9,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Cheddar',9.9,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Milho',9.9,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Palmito',9.9,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Parmesão',9.9,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Tomate',9.9,'ATIVO',9);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Extras',5,0,15,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Heinz Ketchup + Maionese 12un',3.99,'ATIVO',1);

  -- ===== Pizza Grande + Borda Pãozinho (base 29.9) =====
  INSERT INTO produtos (id,tenant_id,categoria_id,nome,descricao,tipo_montagem,preco_base,regra_preco,gratuito,status,ordem)
    VALUES (gen_random_uuid(),t,v_cat,'Pizza Grande + Borda Pãozinho','Pizza grande (8 pedaços). Escolha 2 sabores.','MONTAVEL',29.9,'SOMA',FALSE,'ATIVO',4) RETURNING id INTO v_prod;
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Sabores (escolha 2, pode repetir o mesmo)',1,2,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Calabresa',47.45,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Calabacon',47.45,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Bacon com Batata Palha',47.45,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Frango com Bacon',47.45,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Frango com Catupiry',47.45,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Margherita',47.45,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Mussarela',47.45,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Portuguesa',47.45,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Mussarela com Bacon',47.45,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Palmito Cremoso',47.45,'ATIVO',10),
    (gen_random_uuid(),t,v_grp,'Sexta-Santa',47.45,'ATIVO',11),
    (gen_random_uuid(),t,v_grp,'Rúcula Premium',47.45,'ATIVO',12),
    (gen_random_uuid(),t,v_grp,'Quatro Queijos',47.45,'ATIVO',13),
    (gen_random_uuid(),t,v_grp,'5 Queijos',59.95,'ATIVO',14),
    (gen_random_uuid(),t,v_grp,'Pepperoni',59.95,'ATIVO',15),
    (gen_random_uuid(),t,v_grp,'Lombo',64.95,'ATIVO',16),
    (gen_random_uuid(),t,v_grp,'Do Cheff',59.95,'ATIVO',17),
    (gen_random_uuid(),t,v_grp,'Frango Cremoso',59.95,'ATIVO',18),
    (gen_random_uuid(),t,v_grp,'Premium',59.95,'ATIVO',19),
    (gen_random_uuid(),t,v_grp,'Mr. Pig',59.95,'ATIVO',20),
    (gen_random_uuid(),t,v_grp,'Suprema',64.95,'ATIVO',21),
    (gen_random_uuid(),t,v_grp,'Mignon',74.95,'ATIVO',22),
    (gen_random_uuid(),t,v_grp,'Mignon Cremosa',74.95,'ATIVO',23),
    (gen_random_uuid(),t,v_grp,'Mignon com Fritas',74.95,'ATIVO',24),
    (gen_random_uuid(),t,v_grp,'Camarão Rosa',89.95,'ATIVO',25),
    (gen_random_uuid(),t,v_grp,'Branco Supremo',44.95,'ATIVO',26),
    (gen_random_uuid(),t,v_grp,'Choco Premium',64.95,'ATIVO',27),
    (gen_random_uuid(),t,v_grp,'Diamante Negro',44.95,'ATIVO',28),
    (gen_random_uuid(),t,v_grp,'Ouro Branco',44.95,'ATIVO',29),
    (gen_random_uuid(),t,v_grp,'Prestigio',44.95,'ATIVO',30),
    (gen_random_uuid(),t,v_grp,'Sensação',44.95,'ATIVO',31),
    (gen_random_uuid(),t,v_grp,'Sonho de Valsa',44.95,'ATIVO',32),
    (gen_random_uuid(),t,v_grp,'Rafaello',64.95,'ATIVO',33),
    (gen_random_uuid(),t,v_grp,'Nutella com Morango',59.95,'ATIVO',34),
    (gen_random_uuid(),t,v_grp,'Ninho com Nutella',59.95,'ATIVO',35);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Recheio da borda (escolha até 2)',2,1,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Mussarela',0,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Presunto e Mussarela',0,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Catupiry',0,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Cheddar',0,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Bacon',0,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Parmesão',0,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Chocolate ao Leite',0,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Chocolate Branco',0,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Ninho com Morango',0,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Ninho com Uva',0,'ATIVO',10);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Pizza Pequena Doce (promoção — opcional)',3,0,1,FALSE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Diamante Negro',44.9,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Ouro Branco',44.9,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Prestigio',44.9,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Sensação',44.9,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Sonho de Valsa',44.9,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Branco Supremo',44.9,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Nutella com Morango',59.9,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Ninho com Nutella',64.9,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Choco Premium',69.9,'ATIVO',9),
    (gen_random_uuid(),t,v_grp,'Raffaello',69.9,'ATIVO',10);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Acréscimos',4,0,2,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Bacon',9.9,'ATIVO',1),
    (gen_random_uuid(),t,v_grp,'Batata Palha',9.9,'ATIVO',2),
    (gen_random_uuid(),t,v_grp,'Catupiry',9.9,'ATIVO',3),
    (gen_random_uuid(),t,v_grp,'Cebola Roxa',9.9,'ATIVO',4),
    (gen_random_uuid(),t,v_grp,'Cheddar',9.9,'ATIVO',5),
    (gen_random_uuid(),t,v_grp,'Milho',9.9,'ATIVO',6),
    (gen_random_uuid(),t,v_grp,'Palmito',9.9,'ATIVO',7),
    (gen_random_uuid(),t,v_grp,'Parmesão',9.9,'ATIVO',8),
    (gen_random_uuid(),t,v_grp,'Tomate',9.9,'ATIVO',9);
  INSERT INTO opcao_grupos (id,tenant_id,produto_id,nome,ordem,min_escolhas,max_escolhas,permite_repeticao,regra_preco,condicao)
    VALUES (gen_random_uuid(),t,v_prod,'Extras',5,0,15,TRUE,'SOMA','{}'::jsonb) RETURNING id INTO v_grp;
  INSERT INTO opcoes (id,tenant_id,grupo_id,nome,preco,status,ordem) VALUES
    (gen_random_uuid(),t,v_grp,'Heinz Ketchup + Maionese 12un',3.99,'ATIVO',1);

  UPDATE tenants SET config = COALESCE(config,'{}'::jsonb) || '{"pizza_grande_4bordas_v1":true}'::jsonb WHERE id=t;
END $$;
