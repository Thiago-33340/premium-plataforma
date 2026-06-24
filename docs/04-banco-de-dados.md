# Titan Khardela — Banco de Dados

Banco principal inferido: PostgreSQL.

Arquivos de schema/migração encontrados:

- `estoque-v2.sql`
- `modelo-completo-v1.sql`
- `sql/modelo-completo-v1.sql`
- `db.js`

## Regra de classificação

Cada tabela deve ser tratada em uma destas classes:

- `oficial`: fonte de verdade atual para uma área do Titan.
- `oficial_em_validacao`: em uso, mas ainda precisa de smoke mutável/staging antes de virar contrato estável.
- `compatibilidade`: ponte entre fluxos novos e antigos; pode ser necessária, mas não deve receber expansão sem decisão.
- `legado`: fluxo antigo mantido apenas para leitura, migração ou compatibilidade temporária.
- `planejado`: estrutura criada para uso futuro ou automação ainda não consolidada.

## Áreas principais

| Área | Tabelas principais | Status |
| --- | --- | --- |
| Estoque v2 | `est_produto`, `est_categoria`, `est_fornecedor`, `est_setor`, `est_movimento`, `est_produto_setor`, `est_produto_fornecedor`, `est_local_fisico`, `est_conversao_categoria` | oficial |
| Produção interna | `est_ficha_producao`, `est_ficha_porcao`, `est_ficha_porcao_item`, `est_producao_run` | oficial |
| Receita simples antiga do estoque | `est_producao_receita` | compatibilidade |
| Contagem/auditoria | `est_contagem`, `est_contagem_item`, `est_auditoria` | oficial |
| Compras/listas/visitas | `est_compra`, `est_compra_item`, `est_lista_compra`, `est_lista_compra_item`, `est_lista_auto`, `est_visita`, `est_visita_item` | oficial_em_validacao |
| Permissões de estoque | `est_permissao` + `rbac_contacts` | oficial |
| Eventos/integrações de estoque | `est_notificacao`, `est_whatsapp_msg`, `est_titan_evento`, `est_integracao_log` | planejado/oficial_em_validacao |
| Loja/cardápio | `menu_categorias`, `produtos`, `opcao_grupos`, `opcoes`, `cupons` | oficial no módulo cardápio |
| Receitas do cardápio e baixa por pedido | `ficha_itens`, `preparos`, `preparo_itens` | compatibilidade |
| Mesas/caixa | `mesas`, `comandas`, `comanda_itens`, `caixa`, `entregadores` | oficial_em_validacao |
| Estoque legado | `estoque_itens_definicao`, `estoque_contagens`, `estoque_itens`, `estoque_movimentos` | legado |
| Tabelas antigas auxiliares | `fornecedores`, `insumo_custos`, `manual_montagem` | legado/compatibilidade |

## Limites que não podem ser confundidos

- `est_produto` é item de estoque. `produtos` é item de cardápio. São coisas diferentes.
- `est_setor` é setor dinâmico por cliente/tenant. `estoque_itens_definicao.setor_id` com `SET001`, `SET002` etc. é legado.
- `est_ficha_*` é ficha técnica oficial para produção interna/fracionados.
- `ficha_itens` continua existindo para ficha do cardápio e baixa automática por pedido.
- `est_producao_receita` é uma ponte de compatibilidade para ficha simples antiga; nova evolução deve priorizar `est_ficha_producao`, `est_ficha_porcao` e `est_ficha_porcao_item`.
- Rotas `/api/est/*` são o caminho oficial novo do estoque.
- Rotas `/api/estoque/*` são legado de contagem/estoque antigo.
- Rotas `/api/admin/estoque-*` e `/api/admin/setor/*/rename` são compatibilidade de admin antigo e devem ler/escrever `est_produto`/`est_setor`.
- A aba admin **Estoque do cardápio** não cria um terceiro modelo: lê/escreve disponibilidade e inventário vendável em `produtos`/`opcoes`, mostra a ponte por `ficha_itens` e consulta saldo/setor em `est_produto`/`est_produto_setor`.

## Ponte vendável → ficha → insumo

Fluxo oficial da primeira fatia do Estoque Admin:

```text
produtos/opcoes
  status: ATIVO | EM_FALTA | OCULTO
  meta.inventory: controle ligado/desligado + quantidade vendável
  meta.mapper.delivery_direto: provider/external_id preparado, sem sync
        ↓
ficha_itens
  produto_id/opcao_id + est_produto_id + quantidade/unidade
        ↓
est_produto
  saldo operacional, unidade, setores e histórico de movimentos
```

Quantidade vendável não é saldo operacional. O saldo físico continua apenas em `est_produto.estoque_atual` e é alterado por compras, contagens, movimentações e produção.

## Zonas de risco

1. **Nome `produtos` vs `est_produto`**
   `produtos` aparece no cardápio; `est_produto` aparece no estoque. Qualquer integração entre venda e estoque deve passar por ficha/mapeamento, nunca assumir que são a mesma tabela.

2. **Setores legados `SETxxx`**
   O SaaS não pode fixar setores por código antigo. O gestor cria setores em `est_setor` por tenant.

3. **Duas camadas de ficha técnica**
   Cardápio usa `ficha_itens`; produção interna usa `est_ficha_*`. Elas se conectam no consumo/baixa, mas não são substitutas diretas.

4. **Admin ainda tem nomes de rota antigos**
   `public/admin.html` usa `/api/est/*` para estoque. As rotas `/api/admin/estoque-*` permanecem apenas como compatibilidade e não devem voltar a escrever em `estoque_*`.

## Próximo passo técnico

Manter e evoluir o mapa detalhado:

```text
Módulo → Rotas → Tabelas → Arquivos → Riscos
```

Prioridade: estoque, produção, contagem, cardápio e admin.
