# Operacao de estoque

## Setores de contagem por cliente

Setores de contagem nao sao uma lista fixa do Titan. Cada cliente/tenant deve configurar os setores conforme a propria operacao.

Exemplo da Premium: Borda, Montagem, Finalizacao, Recepcao e Gerais. Outros clientes podem usar qualquer organizacao, como Cozinha, Bar, Deposito, Salao, Camara fria ou outro modelo operacional.

Regra atual:

- O gestor cria, renomeia, ordena, desativa e reativa setores no painel de estoque.
- Produtos sao vinculados aos setores do tenant.
- Colaboradores recebem `setores_permitidos` com `est_setor.id` do tenant ou `TUDO`.
- Novas atribuicoes de equipe devem oferecer apenas setores ativos.
- Setores inativos podem continuar aparecendo apenas quando ja estao vinculados a alguem, para preservar historico e permitir limpeza segura.
- IDs legados como `SET001`, `SET002` e `SET003` nao devem ser usados em novas configuracoes do fluxo `/api/est`.

Essa decisao evita que a operacao da Premium vire regra global do SaaS.
