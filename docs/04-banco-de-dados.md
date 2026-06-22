# Titan Khardela — Banco de Dados

Banco principal inferido: PostgreSQL.

Arquivos de schema/migração encontrados:

- `estoque-v2.sql`
- `modelo-completo-v1.sql`
- `sql/modelo-completo-v1.sql`
- `db.js`

## Áreas principais

| Área | Tabelas principais | Status |
| --- | --- | --- |
| Estoque | `est_produto`, `est_categoria`, `est_fornecedor`, `est_setor`, `est_movimento` | oficial/em validação |
| Produção | `est_ficha_producao`, `est_ficha_porcao`, `est_ficha_porcao_item`, `est_producao_run` | oficial/em validação |
| Contagem | `est_contagem`, `est_contagem_item`, `est_auditoria` | oficial/em validação |
| Compras/listas | `est_compra`, `est_compra_item`, `est_lista_compra`, `est_lista_compra_item` | a validar |
| Visitas/fornecedores | `est_visita`, `est_visita_item`, `est_fornecedor` | a validar |
| Loja/cardápio | `produtos`, `opcao_grupos`, `opcoes`, `cupons` | legado/oficial a classificar |
| Mesas/caixa | `mesas`, `comandas`, `comanda_itens`, `caixa`, `entregadores` | a validar |
| Permissões | `est_permissao`, RBAC no backend | a validar |

## Classificação necessária

Cada tabela deve receber uma classificação:

- `oficial`
- `legado`
- `compatibilidade`
- `rascunho`
- `depreciada`

## Próximo passo técnico

Criar um mapa detalhado:

```text
Módulo → Rotas → Tabelas → Arquivos → Riscos
```

Isso é especialmente importante para estoque, produção e contagem.
