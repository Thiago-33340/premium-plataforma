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
| `compras-listas-visitas` | compras-fornecedores | `/api/est` | a_validar |
| `producao-fichas` | producao-fichas | `/api/est` | ativo |
| `usuarios-permissoes-ia` | permissoes-staff | `/api/est` | a_validar |
| `estoque-legado` | estoque-v2 | `/api/estoque` | legado |
| `staff-mesas-caixa` | mesas-caixa | `/api` | a_validar |
| `admin` | admin-gestor | `/api/admin` | ativo |
| `config-global` | core-http | `/api` | ativo |

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
