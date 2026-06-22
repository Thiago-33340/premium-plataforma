# Titan Khardela — Módulos Oficiais

Os módulos oficiais iniciais estão em `project-state/modules.json`.

## Resumo

| Módulo | Status | Progresso | Papel |
| --- | --- | ---: | --- |
| Servidor HTTP e roteamento | em_andamento | 55 | núcleo técnico das rotas |
| Loja, catálogo e pedidos | em_andamento | 60 | fluxo cliente |
| Admin/Gestor | em_andamento | 65 | gestão do sistema |
| Estoque operacional v2 | em_andamento | 70 | controle de estoque |
| Produção e fichas técnicas | em_andamento | 60 | produção interna e baixa |
| Contagem e auditoria | em_andamento | 55 | conferência operacional |
| Compras, fornecedores e lista automática | detectado | 40 | suprimentos |
| Mesas, comandas e caixa | detectado | 45 | operação de salão/caixa |
| Usuários, PIN, equipe e permissões | detectado | 45 | acesso e responsabilidade |
| Infraestrutura e deploy | parcial | 50 | publicação e ambiente |
| Titan Command Center | em_andamento | 95 | coordenação, mapper, agentes, progresso e ações auditadas |

## Relação módulo → rota → banco → serviço

| Módulo | Rotas | Banco/tabelas | Serviço |
| --- | --- | --- | --- |
| core-http | `saude-diagnostico`, `config-global` | não exclusivo | `premium-plataforma-node` |
| loja-pedidos | `loja-cardapio-pedidos` | `produtos`, `opcoes`, `cupons`, pedidos | `premium-plataforma-node` |
| admin-gestor | `admin` | várias tabelas operacionais | `premium-plataforma-node` |
| estoque-v2 | `estoque-v2-cadastros-operacao`, `estoque-legado` | `est_produto`, `est_movimento`, `est_setor` | `premium-plataforma-node` |
| producao-fichas | `producao-fichas` | `est_ficha_*`, `est_producao_*` | `premium-plataforma-node` |
| contagem-auditoria | `contagem-auditoria` | `est_contagem`, `est_contagem_item`, `est_auditoria` | `premium-plataforma-node` |
| compras-fornecedores | `compras-listas-visitas` | `est_compra`, `est_lista_compra`, `est_visita` | `premium-plataforma-node` |
| mesas-caixa | `staff-mesas-caixa` | `mesas`, `comandas`, `caixa` | `premium-plataforma-node` |
| permissoes-staff | `usuarios-permissoes-ia`, `staff` | `est_permissao` e RBAC | `premium-plataforma-node` |
| infra-deploy | health/deploy | não aplicável | EasyPanel/Docker |
| command-center | `/command-center`, `/mapper`, `mapper-state` | `project-state/*.json`, `agent-workflow.json`, `titan_command_actions` | `premium-plataforma-node` |

## Próxima revisão

Thiago deve validar:

- nomes dos módulos;
- status real;
- o que está online;
- o que é legado;
- prioridade de cada módulo;
- responsável/revisor de cada frente.
