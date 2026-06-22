# Titan Khardela — APIs e Rotas

As rotas oficiais iniciais estão em `project-state/routes.json`.

## Observação importante

O backend não usa Express. Ele usa `http.createServer` em `server-pg.js`, com roteamento manual por `pathname`, `sub` e `seg[]`.

Isso significa que scanners automáticos comuns podem não detectar as rotas. Por isso, a Fase 2 criou um mapa manual inicial.

## Grupos de rotas

| Grupo | Módulo | Base | Status |
| --- | --- | --- | --- |
| `saude-diagnostico` | core-http | `/api` | ativo |
| `loja-cardapio-pedidos` | loja-pedidos | `/api` | ativo |
| `estoque-v2-cadastros-operacao` | estoque-v2 | `/api/est` | ativo |
| `contagem-auditoria` | contagem-auditoria | `/api/est` | ativo |
| `compras-listas-visitas` | compras-fornecedores | `/api/est` | ativo_em_validacao |
| `producao-fichas` | producao-fichas | `/api/est` | ativo |
| `usuarios-permissoes-ia` | permissoes-staff | `/api/est` | misto |
| `estoque-legado` | estoque-v2 | `/api/estoque` | legado |
| `staff-mesas-caixa` | mesas-caixa | `/api` | ativo_em_validacao |
| `admin` | admin-gestor | `/api/admin` | misto |
| `config-global` | core-http | `/api` | ativo |

## Decisões de fronteira

- `/api/est/*` é o caminho oficial novo do estoque, produção, contagem, compras, visitas e permissões do estoque.
- `/api/estoque/*` é legado. Usa `estoque_itens_definicao`, `estoque_contagens`, `estoque_itens` e `estoque_movimentos`.
- `/api/admin/estoque-*` é compatibilidade para clientes/código antigo; a tela nova deve usar `/api/est/*` e essas rotas não devem receber expansão funcional nova.
- `/api/admin/catalogo`, `/api/admin/produto`, `/api/admin/grupo`, `/api/admin/opcao` são oficiais para cardápio.
- `/api/catalogo`, `/api/pedidos`, `/api/meus-pedidos` e rotas públicas de loja são oficiais do módulo loja/cardápio/pedidos.
- `/api/staff`, `/api/mesas`, `/api/caixa` e `/api/entregadores` estão ativos. As leituras de mesas/caixa/entregadores já têm smoke read-only; abertura/fechamento ainda precisa de staging antes de virar contrato fechado.

## Rotas que devem ser evitadas em implementação nova

```text
POST /api/estoque/login
GET  /api/estoque/itens
POST /api/estoque/contagem
POST /api/estoque/importar-definicao
GET  /api/estoque/contagens
POST /api/estoque/movimento
GET  /api/estoque/movimentos
GET  /api/admin/estoque-itens
POST /api/admin/estoque-item
DELETE /api/admin/estoque-item/:id
POST /api/admin/setor/:id/rename
```

As rotas `/api/admin/estoque-*` e `/api/admin/setor/*/rename` são mantidas apenas como compatibilidade e devem escrever/ler `est_produto`/`est_setor`. Toda UI nova deve usar `/api/est/*` diretamente.

## Pendência de contrato

Para cada rota crítica, documentar:

- método;
- caminho;
- módulo;
- permissão exigida;
- payload;
- resposta;
- erros esperados;
- tabelas afetadas;
- teste/smoke correspondente.

Prioridade:

1. Estoque.
2. Produção.
3. Contagem.
4. Pedidos.
5. Admin.
