# Diário operacional — Estoque Premium pronto

Data: 2026-06-22  
Objetivo do dia: entregar o estoque da Premium em estado operacional confiável para gestor e colaboradores.

## Regra deste diário

- Registrar cada avanço relevante antes de mudar de frente.
- Separar claramente o que foi feito, o que foi validado e o que ainda falta.
- Não registrar senhas, tokens, `DATABASE_URL`, chaves, certificados ou valores sensíveis.
- Manter este arquivo como fonte rápida para Thiago, Tassiano, Codex e Claude entenderem o dia de trabalho.

## Marco 01 — Login real do Titan Tools em produção

Status: concluído

O que foi feito:

- Implantado login real do Titan Tools em `tools.titanatende.com.br`.
- Criado fluxo de primeiro acesso por e-mail autorizado.
- Criada sessão por cookie HttpOnly, com opção “Manter conectado” desmarcada por padrão.
- Protegido `GET /api/mapper/state`: sem sessão real, retorna bloqueio.
- Criada aba **Acessos** no Command Center para autorizar novos e-mails.
- Configurado bootstrap inicial dos sócios no EasyPanel.

E-mails autorizados:

- Thiago: `thiagoribeiro33340@gmail.com`
- Tassiano: `tassianoborges@hotmail.com`

Validações feitas:

- `https://premium.titanatende.com.br/command-center` retorna `404`.
- `https://tools.titanatende.com.br/login` abre a tela do Titan Command Center.
- Os dois e-mails estão autorizados para primeiro acesso.
- `GET /api/mapper/state` sem sessão retorna `401`.
- Smoke read-only produção/tools executado com sucesso.

Arquivos/PRs relacionados:

- PR #18: `https://github.com/Thiago-33340/premium-plataforma/pull/18`
- Registro de deploy: `project-state/deploys.json`
- Última blindagem: `project-state/health-checks.json`

## Marco 02 — Preparação da trilha do dia

Status: em andamento

O que está sendo feito agora:

- Criar documentação viva para o Claude entender o que foi feito e como atuar dentro do Command Center/Mapper.
- Criar guia de uso do Command Center para Thiago e Tassiano.
- Auditar a situação atual do estoque/producao antes de novas alterações.

Próximo passo:

- Mapear o estado atual de `public/estoque.html`, `public/admin.html`, rotas `/api/est/*`, fichas de produção, contagem, permissões e dados-base da Premium.

## Marco 03 — Diagnóstico inicial do estoque real

Status: concluído

O que foi encontrado:

- Existem dois mundos de estoque no código:
  - estoque novo/oficial em `/api/est/*`, usando tabelas `est_*`;
  - estoque legado em `/api/estoque/*`, que deve ser mantido apenas por compatibilidade.
- A tela `public/estoque.html` já tem cadastro completo de produto, contagem, auditoria, compras, fornecedores, produção interna e permissões.
- A tela `public/admin.html` tem um editor de ficha de produção mais avançado, com porções, custo estimado, ingredientes e exclusão de ficha.
- A tela `public/estoque.html` ainda usava um editor simplificado de ficha dentro do produto, sem porções e sem exclusão clara de ficha técnica.
- A rota `/api/est/produtos` não retornava setores vinculados ao produto; isso deixava a lista de produtos pobre para gestão e dificultava filtro/auditoria por setor.
- A rota `/api/est/producao/produzidos` podia listar um produto mais de uma vez quando ele estava em mais de um setor, porque agrupava por `s.nome`.
- Setores de contagem já são dinâmicos por tenant via “Configurar setores”; portanto Premium não deve ser hardcoded no sistema.

Decisão técnica:

- Reforçar `/api/est/produtos` para retornar setores por produto.
- Melhorar a lista visual de produtos para mostrar/filtar por setor.
- Trazer para `public/estoque.html` o editor avançado de ficha de produção inspirado no `admin.html`, com:
  - criar/editar ficha;
  - adicionar/remover porção;
  - adicionar/remover ingredientes;
  - custo estimado;
  - setores dinâmicos;
  - exclusão real da ficha técnica preservando histórico.

Validação inicial em produção:

- Premium possui aproximadamente 191 produtos ativos.
- Há 5 setores ativos: Gerais, Borda, Finalização, Montagem e Recepção.
- Há produtos produzidos marcados com fichas completas e outros ainda sem ingredientes.
- A contagem já registra sessões em andamento/aguardando auditoria por setor.

Próximo passo:

- Implementar os ajustes de API/UI citados acima e rodar validação local segura antes de preparar deploy.

## Marco 04 — Ajustes críticos implementados no estoque

Status: concluído localmente

Arquivos alterados:

- `server-pg.js`
- `public/estoque.html`

O que foi implementado:

- `/api/est/produtos` agora retorna setores vinculados a cada produto:
  - `setores`: lista com `id` e `nome`;
  - `setor_nomes`: texto agregado para leitura/diagnóstico.
- `/api/est/produtos` aceita filtro opcional por `setor`.
- `/api/est/producao/produzidos` deixou de duplicar produtos com mais de um setor e agora agrega os setores do item produzido.
- Tela de Produtos em `public/estoque.html` ganhou:
  - chips de filtro por setor dinâmico;
  - chips visuais de setor dentro de cada card de produto;
  - resumo que mostra o setor filtrado.
- Aba “Ficha técnica” do editor de produto foi reorganizada para apontar para a ficha avançada de produção.
- Editor avançado de ficha de produção foi integrado ao estoque com:
  - porções;
  - rendimento por porção;
  - ingredientes;
  - observação por ingrediente;
  - custo estimado por ingrediente/porção;
  - setores dinâmicos;
  - instruções de preparo;
  - exclusão real de ficha técnica preservando produto e histórico.
- Cadastro de produto novo marcado como “Produzido internamente” abre a ficha avançada logo após salvar.

Validações locais executadas:

- `node --check server-pg.js`
- parse do JavaScript embutido em `public/estoque.html` com `new Function(...)`
- `npm run check:project-state`
- `git diff --check`

Resultado:

- Sintaxe do servidor OK.
- Sintaxe do JavaScript do estoque OK.
- Project-state OK.
- Patch sem erro de whitespace.

Limite da validação local:

- Não foi iniciado servidor local porque a aplicação depende de Postgres/ambiente e não devemos ler `.env` ou credenciais.
- Smoke de rota nova deve ser feito depois do deploy, em produção, de forma read-only.

Próximo passo:

- Revisar visual/fluxo em produção após deploy.
- Validar:
  - `/api/est/produtos` retornando setores;
  - lista de produtos com filtro por setor;
  - abrir produto produzido;
  - abrir editor avançado de ficha;
  - adicionar/remover porção em ambiente controlado antes de usar em operação real;
  - excluir ficha apenas quando intencional.

## Marco 05 — Correção de RBAC para Gestor Geral

Status: concluído localmente

O que aconteceu:

- Smoke read-only pré-deploy contra produção passou em 17/18 checks.
- A falha foi em `GET /api/est/meus-itens?usuario_id=thiago`, retornando `500`.
- Investigação apontou que várias regras antigas só reconheciam perfis exatamente como `GESTOR` ou `GERENTE`.
- Como o acesso do Thiago foi ajustado para “gestor geral”, algumas rotas ainda não tratavam `GESTOR_GERAL` como gestor.

Correção aplicada:

- Criada lógica central no backend para reconhecer:
  - `GESTOR`;
  - `GERENTE`;
  - qualquer perfil começando com `GESTOR_`;
  - qualquer perfil começando com `GERENTE_`.
- Ajustadas rotas de estoque, contagem, staff/admin e notificações que ainda usavam comparação antiga.
- Ajustado frontend `public/estoque.html` para liberar navegação de gestor também para `GESTOR_*` e `GERENTE_*`.

Validações após correção local:

- `node --check server-pg.js`
- parse do JavaScript embutido em `public/estoque.html`
- `npm run check:project-state`

Observação:

- O smoke em produção só deve ficar 18/18 depois do deploy desta correção.

## Marco 06 — Fechamento do ciclo API/RBAC e smoke final

Status: concluído em produção

O que foi entregue neste ciclo:

- PR #19 (`codex/estoque-premium-fichas-rbac`) foi mergeado na `main`.
- Ajustes críticos posteriores foram aplicados direto na `main` para corrigir o comportamento real em produção.
- Deploy manual no EasyPanel foi acionado para publicar as correções.
- A rota `GET /api/est/meus-itens?usuario_id=thiago` passou a resolver o usuário por login/apelido/nome, além de UUID.
- A rota retornou `200` para o usuário `thiago`, com acesso amplo de gestor.
- Erros internos da rota foram protegidos para não expor detalhe técnico sensível ao cliente.
- O smoke read-only final foi executado contra:
  - `https://premium.titanatende.com.br`
  - `https://tools.titanatende.com.br`

Resultado do smoke final:

- `18/18` checks executados.
- `0` falhas.
- `0` checks pulados.
- Blindagem read-only confirmada.
- Resultado salvo em `project-state/health-checks.json`.

Checks cobertos:

- Health da aplicação.
- Dashboard do estoque.
- Produtos.
- Setores.
- Categorias.
- Fornecedores.
- Produzidos/fichas.
- Produções recentes.
- Movimentos recentes.
- Contagens recentes.
- Mesas.
- Caixa.
- Entregadores.
- Command Center HTML.
- Autenticação Titan anônima protegida.
- Mapper protegido sem sessão.
- Permissões do usuário.
- Meus itens do usuário.

Pendência proposital:

- Testes de criação/alteração/exclusão real de ficha técnica e produção devem ser feitos em fluxo controlado com item de teste ou janela operacional autorizada, porque alteram dados reais de estoque.

## Marco 07 — Codex assume o passo 2 do Command e corrige gargalos finais do estoque

Status: concluído localmente, pendente de deploy e smoke mutável controlado

Contexto:

- O Claude não estava atuando no estoque.
- O passo 2 do Command Center, “Arquitetura e cálculo”, estava atribuído ao Claude.
- Para não travar a entrega do estoque Premium, o Codex assumiu temporariamente este papel.

Fontes usadas:

- `docs/HANDOFF-CLAUDE-COMMAND-MAPPER.md`
- `project-state/agent-workflow.json`
- `project-state/tasks.json`
- `project-state/modules.json`
- `project-state/api-contracts-critical.json`
- `project-state/test-matrix.json`
- `public/estoque.html`
- `public/mapper.html`
- `server-pg.js`
- `scripts/smoke-mutating-sandbox.mjs`
- `data/estoque-catalogo-premium-v4.json`
- `seed-setores-premium.sql`
- `seed-produzidos-rp.sql`

O que foi encontrado:

- A compra manual (`POST /api/est/compra`) tinha bug de runtime: usava `g.nome` sem definir `g`.
- Algumas rotas validavam permissão por login/apelido, mas gravavam `usuario_id` com o valor bruto recebido; isso poderia quebrar testes remotos usando `thiago`.
- O smoke mutável existente testava produto/ficha simples, mas não testava o fluxo oficial novo de ficha avançada por porção e produção.
- O Command Center mostrava briefing para Claude, mas não tinha um artefato oficial do passo 2.

Correções aplicadas:

- `POST /api/est/compra` agora:
  - resolve usuário efetivo por UUID/login/apelido;
  - valida quantidade maior que zero;
  - grava compra, itens, entrada, movimento e custos em transação;
  - evita gravação parcial se algum item falhar.
- Produção interna (`POST /api/est/producao/run`) agora resolve usuário efetivo antes de gravar produção/movimentos.
- Auditoria/contagem e permissões passaram a usar o usuário resolvido onde havia risco de alias.
- `scripts/smoke-mutating-sandbox.mjs` foi ampliado para:
  - criar insumo de teste;
  - lançar compra/entrada de teste;
  - criar produzido de teste;
  - salvar ficha avançada;
  - lançar produção;
  - conferir baixa/entrada;
  - inativar produtos de teste no cleanup.
- Criado `project-state/stock-command-step2.json`.
- Criado `docs/COMMAND-STEP2-ESTOQUE-PREMIUM.md`.
- Command/Mapper passou a exibir o passo 2 na aba Estoque e no briefing de Agentes.

Próximo passo:

- Rodar validações locais.
- Deployar.
- Rodar smoke read-only.
- Rodar smoke mutável controlado em produção com produtos de teste, usando confirmação explícita.

## Marco 08 — Deploy, smoke real e prontidão do estoque

Status: motor validado em produção; conteúdo com 3 receitas reais pendentes

Deploy:

- Commit implantado pelo EasyPanel: `c121cb3 Conclui passo 2 do Command e reforca estoque`.
- O histórico do EasyPanel mostrou o commit novo no topo.
- Nenhum token, gatilho de deploy ou secret foi copiado para os registros.

Validações pós-deploy:

- Smoke read-only produção/tools: 18/18 OK.
- Smoke mutável controlado: OK.
- O smoke mutável criou produtos `SMOKE_TESTE_*`, lançou compra, salvou ficha avançada, lançou produção, conferiu baixa de `0.2 KG` e entrada de `2 UNIDADE`, depois inativou os itens de teste.

Correções reais feitas via API oficial com `usuario_id=thiago`:

- `Molho produzido`: unidade corrigida de `Litro` para `KG`.
- `Bisnaga G de Nutella - Aberta`: unidade corrigida de `GRAMAS` para `UNIDADE`.
- `Bisnaga G de Doce de Leite - Aberta`: unidade corrigida de `G` para `UNIDADE`.
- `Lombo Fracionado`: ficha 1:1 criada, 1 g produzido baixa 1 g de `Lombo Canadense`.
- `Bisnaga G de Nutella - Aberta`: ficha 1:1 criada, 1 unidade aberta baixa 1 `Bisnaga G de Nutella`.
- `Bisnaga P de Nutella - Aberta`: ficha 1:1 criada, 1 unidade aberta baixa 1 `Bisnaga P de Nutella`.
- `Bisnaga G de Doce de Leite - Aberta`: ficha 1:1 criada, 1 unidade aberta baixa 1 `Bisnaga G de Doce de Leite`.
- `Chocolate ao Leite - Aberto Finalização`: ficha 1:1 criada, 1 aberta baixa 1 `Chocolate ao Leite Bisnaga`.
- `Chocolate Branco - Aberto Finalização`: ficha 1:1 criada, 1 aberta baixa 1 `Chocolate Branco Bisnaga`.

Auditoria de catálogo:

- Setores ativos: Gerais, Borda, Finalização, Montagem e Recepção.
- Produtos ativos na API: 201.
- Catálogo Premium v4 bateu por setor e unidade:
  - Gerais: 38/38.
  - Borda: 17/17.
  - Finalização: 43/43.
  - Montagem: 35/35.
  - Recepção: 19/19.
- Itens produzidos esperados: 30/30 retornando na API.
- Produzidos com ficha e ingrediente: 27/30.

Pendências que não devem ser inventadas:

- `Camarão`: falta insumo bruto separado ou regra real.
- `Molho produzido`: falta receita real do molho.
- `Coco Ralado Floco`: falta regra operacional real.

Artefatos:

- `project-state/stock-readiness.json`
- `project-state/health-checks.json`
- `project-state/stock-command-step2.json`
- `docs/COMMAND-STEP2-ESTOQUE-PREMIUM.md`

Próximo passo:

- Thiago confirmar ingredientes, quantidade, unidade e rendimento das 3 fichas pendentes.
- Depois disso, gravar fichas pelo editor avançado e repetir smoke mutável controlado.

## Marco 09 — Command Center ganha ações graváveis auditadas

Status: implantado e validado em produção

O Command Center deixou de ser apenas leitura de `project-state` e ganhou a primeira versão de ações graváveis na aba **Execução**.

O que foi implementado:

- Nova permissão `editar_project_state`.
- Novo arquivo `project-state/command-audit-log.json`.
- Nova rota `POST /api/mapper/action`, protegida por sessão Titan Tools e host técnico.
- Ações disponíveis:
  - criar tarefa;
  - atualizar status/próximo passo de tarefa;
  - criar risco;
  - criar decisão.
- Toda gravação usa whitelist de arquivos permitidos e gera log de auditoria.

Limites conscientes:

- A versão atual grava `tasks.json`, `risks.json`, `decisions.json` e `command-audit-log.json`.
- Não edita arquivos fora da whitelist.
- Não manipula secrets.
- Ainda não faz commit/PR automático; versionamento externo virou próxima etapa.

Validações pós-deploy:

- Commit implantado: `d343838 Implementa acoes auditadas no Command Center`.
- Smoke read-only produção/tools: 19/19 OK.
- Aba **Execução** validada no Chrome com sessão de Thiago.
- A UI mostrou:
  - Registrar no Command;
  - Nova tarefa;
  - Novo risco;
  - Nova decisão;
  - Atualizar tarefa;
  - Últimas ações auditadas.
- A rota `POST /api/mapper/action` sem sessão retornou 401 no smoke, sem gravar dados.

Arquivos principais:

- `server-pg.js`
- `public/mapper.html`
- `project-state/command-audit-log.json`
- `docs/GUIA-COMMAND-CENTER-GESTORES.md`

## Marco 10 — Command Center ganha trilha persistente no Postgres

Status: implementado localmente, aguardando validação/deploy desta etapa

Motivo:

- A primeira versão gravava ações do Command nos arquivos do `project-state`.
- Isso é bom para Git e handoff, mas ações feitas pela tela em produção poderiam ficar presas no filesystem do container.
- Um novo deploy poderia sobrescrever esse estado se ele não estivesse commitado.

O que foi implementado:

- Nova tabela `titan_command_actions`.
- `POST /api/mapper/action` continua gravando nos arquivos permitidos:
  - `project-state/tasks.json`;
  - `project-state/risks.json`;
  - `project-state/decisions.json`;
  - `project-state/command-audit-log.json`.
- A mesma ação agora também tenta persistir no Postgres com:
  - ação;
  - arquivo alvo;
  - ID alvo;
  - payload sem campos sensíveis;
  - resultado com `target` e `audit`;
  - usuário/e-mail/nome;
  - horário.
- `GET /api/mapper/state` lê `project-state` e aplica overlay das ações em `titan_command_actions`.
- A tela da aba **Execução** mostra a quantidade de ações persistidas no Postgres.
- Ao criar/atualizar algo, a confirmação informa `Postgres OK` ou `Postgres pendente`.

Regra de arquitetura:

- O Command Center gerencia progresso, tarefas, riscos e decisões.
- O Command Center ainda não altera código sozinho.
- Git continua sendo a trilha definitiva para código, interface, documentação versionada e deploy.
- Automação de PR/deploy pelo Command ficou como próxima etapa, com confirmação humana obrigatória.

Arquivos principais:

- `db.js`
- `server-pg.js`
- `public/mapper.html`
- `project-state/tasks.json`
- `project-state/decisions.json`
- `project-state/api-contracts-critical.json`
- `project-state/modules.json`
- `project-state/routes.json`
- `docs/GUIA-COMMAND-CENTER-GESTORES.md`
