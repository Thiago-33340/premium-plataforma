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

## Marco 11 — Deploy passa a ter registro governado no Command

Status: implementado localmente, aguardando validação/deploy desta etapa

Motivo:

- O Command já registrava tarefas, riscos e decisões.
- O próximo gargalo era deploy: sem um registro orientado, a equipe depende da memória para saber o que foi planejado, publicado e validado.
- Acionar EasyPanel automaticamente ainda seria cedo, porque envolve efeito externo e não deve armazenar token/gatilho em código.

O que foi implementado:

- `deploys.json` entrou na whitelist gravável do Command.
- Nova ação `create_deploy_record` em `POST /api/mapper/action`.
- A aba **Deploys** ganhou formulário de **Registro governado de deploy**.
- O registro pode marcar deploy como:
  - planejado;
  - pronto para deploy;
  - concluído;
  - falhou.
- O registro grava:
  - `project-state/deploys.json`;
  - `project-state/command-audit-log.json`;
  - `titan_command_actions`.
- `GET /api/mapper/state` também aplica overlay dos deploys criados pela UI.

Limite consciente:

- Registrar deploy no Command não publica código.
- O Command não aciona EasyPanel automaticamente nesta etapa.
- Git, EasyPanel e smoke continuam sendo ações explícitas.
- Nenhum token, gatilho ou secret de deploy foi salvo.

Arquivos principais:

- `server-pg.js`
- `public/mapper.html`
- `project-state/api-contracts-critical.json`
- `project-state/tasks.json`
- `project-state/decisions.json`
- `project-state/modules.json`
- `docs/GUIA-COMMAND-CENTER-GESTORES.md`

## Marco 12 — Aprovação humana de deploy no Command

Status: implementado localmente, aguardando validação/deploy desta etapa

Motivo:

- Registrar deploy era necessário, mas ainda faltava o “ok humano” formal.
- Antes de qualquer automação externa real, o Command precisa diferenciar plano, aprovação, validação, reprovação e rollback.

O que foi implementado:

- Nova ação `approve_deploy_record` em `POST /api/mapper/action`.
- A aba **Deploys** ganhou bloco **Aprovação humana de deploy**.
- O usuário seleciona um deploy e escolhe:
  - aprovado para deploy;
  - validado pós-deploy;
  - reprovado;
  - rollback necessário.
- Para salvar, precisa digitar exatamente `AUTORIZO DEPLOY`.
- A aprovação grava:
  - `project-state/deploys.json`;
  - `project-state/command-audit-log.json`;
  - `titan_command_actions`.
- O card do deploy passa a mostrar `confirmação humana` quando houver aprovação/validação registrada.

Limite consciente:

- A aprovação humana ainda não aciona EasyPanel automaticamente.
- A aprovação não substitui smoke pós-deploy.
- O próximo passo futuro é conectar automação externa real sem salvar token no repositório/project-state.

Arquivos principais:

- `server-pg.js`
- `public/mapper.html`
- `project-state/tasks.json`
- `project-state/decisions.json`
- `project-state/api-contracts-critical.json`
- `docs/GUIA-COMMAND-CENTER-GESTORES.md`

## Marco 13 — Executor externo seguro no Command

Status: implementado localmente, aguardando validação/deploy desta etapa

Motivo:

- O Command precisava sair do papel de apenas registrar/aprovar deploy e ficar pronto para acionar um executor externo.
- Essa automação não pode salvar webhook, token ou URL sensível em Git, documentação, `project-state` ou UI.

O que foi implementado:

- Nova permissão `acionar_deploy`.
- Nova ação `trigger_deploy_external` em `POST /api/mapper/action`.
- A aba **Deploys** ganhou bloco **Executor externo**.
- A ação exige:
  - sessão Titan Tools;
  - permissão `editar_project_state`;
  - permissão `acionar_deploy`;
  - deploy previamente registrado;
  - aprovação humana;
  - status `aprovado_para_deploy` ou `validado_pos_deploy`;
  - confirmação textual `ACIONAR DEPLOY`;
  - variável segura `TITAN_DEPLOY_WEBHOOK_URL` ou `EASYPANEL_DEPLOY_WEBHOOK_URL` no ambiente do serviço.
- A URL do executor nunca é exposta pela API ou pela UI.
- O resultado do acionamento é auditado em:
  - `project-state/deploys.json`;
  - `project-state/command-audit-log.json`;
  - `titan_command_actions`.

Limite consciente:

- Se a variável segura não estiver configurada no EasyPanel, o botão aparece como **não configurado** e permanece desabilitado.
- O valor da variável deve ser configurado diretamente no ambiente do serviço, sem copiar para logs, prompts ou arquivos do projeto.

Arquivos principais:

- `server-pg.js`
- `db.js`
- `public/mapper.html`
- `project-state/tasks.json`
- `project-state/decisions.json`
- `project-state/api-contracts-critical.json`
- `docs/GUIA-COMMAND-CENTER-GESTORES.md`

## Marco 14 — Relatório Claude: frescos e fichas do cardápio

Status: implementado localmente, aguardando validação/deploy desta etapa

Fonte:

- `C:\Users\Thiago Ribeiro\Titan\workspace\entrega-fichas-premium\RELATORIO-PARA-CODEX.md`
- `C:\Users\Thiago Ribeiro\Titan\workspace\entrega-fichas-premium\fichas-premium.data.json`

Diagnóstico read-only confirmado em produção:

- `opcoes=309`
- `ficha_itens=0`
- o cardápio já existe; o problema é a ausência das fichas de baixa por venda.

O que foi implementado:

- Criado `data/fichas-premium-cardapio-v1.json`, base compacta e versionada com:
  - 35 sabores de pizza;
  - 9 adicionais;
  - 1 extra;
  - 261 linhas de consumo.
- `db.js` ganhou import idempotente `fichas_premium_cardapio_v1`:
  - insere ficha somente quando a opção ainda não tem ficha;
  - não sobrescreve edição do gestor;
  - converte `Molho Premium` para 35 g quando o dataset traz `equivalente_g`;
  - registra resumo em `tenants.config`;
  - reporta opções/insumos não casados no log.
- `db.js` ganhou seed resiliente `estoque_insumos_frescos_v1` para:
  - `Pimentão Verde`;
  - `Pimentão Vermelho`;
  - `Pimentão Amarelo`;
  - `Rúcula`;
  - `Manjericão`;
  - `Uva`.
- `server-pg.js` passou a deduplicar ficha por nome na baixa automática, evitando baixa multiplicada quando a mesma opção existe em vários produtos/grupos.

Limite consciente:

- Bordas combinadas do relatório não foram importadas nesta etapa, porque o cardápio atual representa borda como combinação de estilo + recheio. Importar nomes como `Borda Vulcão - Catupiry` sem modelo combinatório poderia gerar baixa errada.

Validações locais:

- `node --check db.js`
- `node --check server-pg.js`
- `npm run check:project-state`
- simulação read-only contra produção: 45/45 fichas casadas com opções existentes.

## Marco 15 — Command: webhook seguro de deploy configurado

Status: configurado no ambiente do serviço

O que foi feito:

- Configurada a variável `TITAN_DEPLOY_WEBHOOK_URL` diretamente no ambiente do serviço no EasyPanel.
- O valor sensível não foi registrado no Git, documentação, project-state ou logs de trabalho.
- As variáveis existentes do serviço foram preservadas.

Próximo uso esperado:

- Após o próximo deploy, o Executor externo do Command deve deixar de aparecer como "não configurado".
- A ação de deploy via Command deve registrar resultado em `deploys.json`, `command-audit-log.json` e `titan_command_actions`, sem expor o webhook.

## Marco 16 — Pós-deploy: import das fichas precisava de compatibilidade

Status: correção aplicada no código, aguardando novo deploy/validação

O que foi observado:

- O deploy do commit `ea7dfe8` manteve o app saudável e o smoke read-only passou 19/19.
- O diagnóstico de produção ainda mostrou `ficha_itens=0`.
- A simulação via API confirmou que as 45 fichas casam com 290 opções do cardápio, mas alguns nomes genéricos do dataset precisavam de alias para produtos reais do estoque.

Correção aplicada:

- Garantia explícita das colunas `base_medida`, `fonte` e `meta` em `ficha_itens`.
- Garantia da coluna `observacao` em `ficha_itens`, usada pela rota de edição de ficha.
- Aliases ampliados para ingredientes genéricos como `Tomate`, `Catupiry`, `Cheddar`, `Azeitona`, `Calabresa`, `Morango`, entre outros.
- Seed complementar para `Massa preparada`, `Brigadeiro de Ninho`, `Morango em cubos` e `Batata frita`, como itens produzidos/contáveis.

Critério de aceite pós-deploy:

- `ficha_itens` sair de `0`;
- `Massa preparada` e `Brigadeiro de Ninho` aparecerem em `/api/est/produtos`;
- `/api/est/fichas-cardapio?usuario_id=thiago` retornar resumo com opções preenchidas;
- smoke read-only permanecer 19/19.

Resultado final desta rodada:

- Deploys aplicados até o commit `941479c`.
- `ficha_itens=1521` em produção.
- 285 opções do cardápio com ficha técnica vinculada.
- 24 opções permanecem sem ficha: todas são opções de borda/estilo de borda e exigem modelagem combinatória para não gerar baixa duplicada.
- `Massa preparada`, `Brigadeiro de Ninho`, `Morango em cubos` e `Batata frita` foram criados como itens produzidos/contáveis.
- Smoke read-only pós-import: 19/19.

Pendência consciente:

- Modelar bordas combinatórias usando `fichas_borda` do relatório Claude/Saipos. Não tratar como sabor comum, porque o cardápio separa estilo de borda e recheio da borda.

## Marco 17 — Mapper PDV/Saipos das bordas Premium

Status: mapper criado, ajuste de cardápio preparado em nível de código/base

O que foi analisado:

- Planilha `cardapio_premium_detalhado_ingredientes_v4.xlsx`.
- Abas principais: `CARDAPIO_DETALHADO`, `EXPLOSAO_INGREDIENTES` e `RECEITAS_BORDAS`.
- Catálogo atual em produção via `/api/catalogo`.
- Itens de estoque em produção via `/api/est/produtos`.

Artefatos criados/alterados:

- Criado `data/premium-border-pdv-mapper-v1.json`.
- Criado `docs/MAPPER-BORDAS-PREMIUM-2026-06-23.md`.
- Atualizado `project-state/tasks.json`: `task-f2-026` passou para `em_andamento`.
- `server-pg.js` passou a expor/salvar `codigo_externo` no catálogo admin e nas fichas de cardápio.
- `public/admin.html` passou a mostrar/editar Código PDV/Saipos em produtos e opções.
- `public/mesas.html` passou a aceitar `condicao.mostrar_se.igual_a`, igual à loja pública.

Achados principais:

- O cardápio atual simplificou bordas em 10 opções genéricas, mas a Saipos trabalha com códigos pai/filho por estilo real.
- Pizza Grande + Borda Pãozinho espera 9 opções; faltam 8 e sobram 9 genéricas.
- Pizza Grande + Borda Tradicional espera 6 opções; sobram 4 genéricas.
- Pizza Grande + Borda Vulcão espera 21 opções; faltam 13 e sobram 2 genéricas.
- Pizza Pequena está como produto único, mas a Saipos usa 4 códigos pai por estilo de borda. O modelo correto é manter a experiência simples com grupos condicionais por estilo, ou dividir em quatro produtos.
- Alguns códigos atuais da Pizza Pequena vieram de Pizza Grande + Borda Pãozinho, portanto não devem ser usados como fonte confiável de baixa.

Decisão importante:

- Não criar item produzido `Vulcões montados`. Esse item foi marcado no mapper como ignorado por decisão operacional; a baixa deve ocorrer nos insumos reais da ficha.

Próximo passo:

- Criar migração idempotente do cardápio Premium usando o mapper:
  - preencher códigos pai/filho;
  - ocultar opções genéricas incorretas;
  - inserir opções faltantes de borda;
  - remodelar Pizza Pequena com grupos condicionais;
  - importar fichas faltantes por código;
  - validar `/api/catalogo`, `/api/est/fichas-cardapio?usuario_id=thiago` e smoke read-only.

## Marco 18 — Agent Bridge do Claude entra em operação

Status: operacional no Command Center

Motivo:

- Claude informou que o Command ainda parecia apenas planejado e não tinha caminho ativo para ele atuar.

O que foi feito:

- Criado `project-state/agent-bridge.json` com missão ativa para Claude.
- Criado `project-state/agent-reports.json` para receber relatórios auditados de agentes.
- `server-pg.js` ganhou ação `create_agent_report` em `POST /api/mapper/action`.
- `public/mapper.html` ganhou painel **Agent Bridge operacional** e formulário **Registrar relatório do Claude** na aba Agentes.
- `scripts/check-project-state.mjs` passou a validar os arquivos do Agent Bridge.
- `project-state/agent-workflow.json` saiu de fluxo apenas ativo para `operacional`, indicando Claude ativo via Agent Bridge.
- Documentados o uso e o handoff em `docs/HANDOFF-CLAUDE-COMMAND-MAPPER.md`, `docs/modulos/command-center.md` e `docs/GUIA-COMMAND-CENTER-GESTORES.md`.

Primeira missão operacional:

- `claude-op-001-mapper-bordas-premium`
- Revisar o mapper PDV/Saipos das bordas Premium antes da migração viva do cardápio/fichas.

Regra de segurança:

- Relatório do Claude vira evidência auditada no Command, não alteração automática de código ou deploy.

## Marco 19 — Console IA dentro do Command Center

Status: implementado em código, aguardando variável de IA no ambiente para uso real

Motivo:

- Thiago pediu para enviar prompts direto pela IA dentro do Command, sem precisar sair e voltar entre ferramentas.
- A regra continua sendo governança: IA ajuda e responde, mas o registro oficial exige revisão humana.

O que foi feito:

- Nova rota protegida `POST /api/mapper/ai`.
- Suporte a Claude/Anthropic via `TITAN_ANTHROPIC_API_KEY` ou `ANTHROPIC_API_KEY`.
- Suporte a OpenAI via `TITAN_OPENAI_API_KEY` ou `OPENAI_API_KEY`.
- `TITAN_AI_PROVIDER` e `TITAN_AI_MODEL` opcionais.
- A aba **Agentes** ganhou o **Console IA do Command**.
- O usuário pode enviar prompt, receber resposta na tela e preencher o formulário de relatório com essa resposta.
- A resposta só entra em `agent-reports.json` após clique em **Registrar relatório no Command**.
- O envio gera auditoria com metadados em `command-audit-log.json` e `titan_command_actions`.

Segurança:

- A chave da IA fica somente no ambiente do serviço.
- A UI/API não expõe chave.
- Prompts que parecem conter senha, token, chave ou certificado são bloqueados.
- O prompt completo não é salvo automaticamente.

Arquivos alterados:

- `server-pg.js`
- `public/mapper.html`
- `project-state/routes.json`
- `project-state/api-contracts-critical.json`
- `project-state/tasks.json`
- `project-state/decisions.json`
- `docs/modulos/command-center.md`
- `docs/GUIA-COMMAND-CENTER-GESTORES.md`
- `docs/HANDOFF-CLAUDE-COMMAND-MAPPER.md`

## Marco 20 — Titan Local Agent V1

Status: implementado em código, aguardando configuração do token no EasyPanel e no PC

Motivo:

- Thiago quer usar o Command pelo celular para acionar o PC local, aproximando o Command da experiência do Codex desktop.
- A solução precisa evitar abrir controle remoto livre do computador pela internet.

O que foi feito:

- Criado `project-state/local-agent-queue.json`.
- Criado `scripts/titan-local-agent.mjs`.
- Criado `docs/GUIA-TITAN-LOCAL-AGENT.md`.
- Backend passou a expor:
  - `POST /api/mapper/local-agent/poll`;
  - `POST /api/mapper/local-agent/report`;
  - `POST /api/mapper/action` com `action=create_local_agent_task`.
- Aba **Agentes** ganhou card **Codex Local / PC Thiago**.
- O card cria tarefas locais auditadas.
- O script local busca tarefas por token, executa ações permitidas e devolve status/log.

Ações permitidas na V1:

- `codex_handoff`;
- `claude_handoff`;
- `git_status`;
- `project_checks`;
- `open_command_center`.

Segurança:

- Exige `TITAN_LOCAL_AGENT_TOKEN` ou `TITAN_LOCAL_AGENT_TOKEN_SHA256` no serviço.
- Exige `TITAN_LOCAL_AGENT_TOKEN` no PC local.
- Não executa comando livre vindo do navegador.
- Não faz commit, push, deploy, delete ou ação destrutiva.
- Não lê `.env`, chaves, certificados ou bancos locais.

Próximo passo:

- Configurar token no EasyPanel.
- Rodar `npm run local-agent -- --once` no PC para validar.
- Depois avaliar V2 com Codex App Server/execução real e confirmações próprias.

## Marco 21 — Correção de RBAC UUID e preparo da contagem Premium

Status: implementado em código, pendente de deploy/teste em produção

Motivo:

- A auditoria read-only mostrou que `/api/est/meus-itens` funcionava com apelidos (`thiago`, `dany`, `geane`), mas quebrava com o UUID real retornado pelo login da tela de estoque.
- Como `public/estoque.html` salva e usa `user.id`, o bug poderia impedir colaborador/gestor de iniciar contagem corretamente.
- Thiago pediu para deixar o gestor com controle direto sobre usuários, PINs, setores e itens de contagem antes de iniciar a primeira contagem oficial.

O que foi feito:

- Corrigida a busca `rbacUserByRef()` para UUID não conflitar com `lower($1)` no Postgres.
- `GET /api/est/usuarios` passou a retornar setores permitidos, perfil, status de PIN e troca obrigatória.
- Criadas rotas protegidas por `editar_permissoes`:
  - `PATCH /api/est/usuario/:id`;
  - `POST /api/est/usuario/:id/pin`.
- A tela **Mais > Permissões da equipe** passou a permitir:
  - editar setores que o colaborador pode contar;
  - redefinir PIN temporário;
  - obrigar troca do PIN no primeiro acesso;
  - manter gestores como acesso total.
- A auditoria de contagens passou a listar contagens abertas/em andamento, além das encerradas aguardando aprovação.
- O backend passou a bloquear aprovação de contagem ainda em andamento; para limpar sessão antiga, o gestor deve reprovar.
- Rotas e contratos atualizados em `project-state/routes.json` e `project-state/api-contracts-critical.json`.

Operação planejada após deploy:

- Redefinir PINs temporários válidos para os usuários ativos.
- Reprovar/limpar contagens antigas abertas de 17/06/2026.
- Vincular produtos sem setor ao setor **Gerais** temporariamente.
- Rodar smoke read-only e auditoria RBAC até passar completamente.

Resultado pós-deploy:

- Commit publicado: `e736e8c`.
- Deploy acionado no EasyPanel e confirmado em produção.
- `/api/est/meus-itens` e `/api/est/permissoes` passaram a responder corretamente com UUID real de Thiago e Tassiano.
- PINs temporários foram resetados para Cristina, Dany, Geane, Maria e Sophia com `pin_must_change=true`.
- Contagens antigas em andamento de Dany, Geane e Maria foram reprovadas para limpar a operação.
- 39 produtos ativos/contáveis sem setor foram vinculados ao setor **Gerais**.
- Verificação final:
  - smoke read-only: 19/19;
  - RBAC audit: OK para Cristina, Dany, Geane, Maria e Sophia;
  - contagens abertas: 0;
  - produtos ativos/contáveis sem setor: 0.

Estado operacional:

- Thiago e Tassiano enxergam todos os 218 itens contáveis via UUID e têm permissões completas.
- Colaboradores enxergam apenas os itens dos setores atribuídos, exceto Sophia que está com `TUDO`.
- O gestor já pode entrar em **Estoque > Mais > Configurar setores** para adicionar/remover itens da contagem de cada setor.
- O gestor já pode entrar em **Estoque > Mais > Permissões da equipe** para ajustar setores permitidos e redefinir PIN temporário dos colaboradores.

## Marco 22 — Reorganização de departamentos, categorias e setores da Premium

Data: 2026-06-23

Status: aplicado em produção via API do próprio sistema

Motivo:

- Após a primeira contagem/auditoria, Thiago identificou que a organização por categorias estava bagunçada e dificultava encontrar ingredientes.
- A operação precisa separar três departamentos principais: **Cozinha**, **Salão** e **Limpeza**.
- As categorias devem representar a família operacional do item: **Matéria Prima**, **Insumos Produzidos**, **Bebidas**, **Limpeza**, **Embalagens e Descartáveis**, **Utensílios da cozinha**, **Utensílios do Salão** e **Material de escritório**.
- A subcategoria do produto passou a representar o setor de contagem: **Gerais**, **Borda**, **Montagem**, **Finalização** e **Recepção**.

Decisão técnica:

- O campo `departamento` foi mantido no próprio `est_produto`, não apenas em `est_categoria`.
- Isso evita gambiarra quando a mesma categoria precisa existir em departamentos diferentes, por exemplo:
  - `Cozinha > Matéria Prima > Montagem`;
  - `Salão > Matéria Prima > Recepção`.
- A categoria segue como classificação funcional e a subcategoria segue como setor operacional/contagem.

Execução:

- Criado script auditável: `scripts/migrate-premium-taxonomy.mjs`.
- O script possui modo simulação por padrão e só aplica quando chamado com `--apply`.
- A migração foi feita usando `usuario_id=thiago`, sem leitura de `.env`, sem acesso direto ao banco e sem alterar valores de estoque.

Resultado aplicado:

- Categorias criadas:
  - `Matéria Prima`;
  - `Insumos Produzidos`;
  - `Limpeza`;
  - `Embalagens e Descartáveis`;
  - `Utensílios da cozinha`;
  - `Utensílios do Salão`;
  - `Material de escritório`.
- 14 produtos novos foram adicionados com estoque inicial zero:
  - `Ferrero Rocher caixa c/ 8`;
  - `Ferrero Rocher caixa c/ 4`;
  - `Raffaello cx c/ 12`;
  - `Pimenta 60ml`;
  - `Palito de dente`;
  - `Brigadeiro de Ninho - Bisnaga P 240g`;
  - `Camarão 200g`;
  - `Caixas de Pedaço - Branca`;
  - `Caixas de Pedaço - Amarela`;
  - `Caneta BIC`;
  - `Pincel Pilot`;
  - `Grampeador`;
  - `Caixa de Grampo`;
  - `Espetos de aço`.
- 176 produtos foram reclassificados/renomeados para departamento, categoria, subcategoria e setor corretos.
- `Morango em cubos` ficou ativo para uso em ficha técnica, mas fora da contagem (`pode_contar=false`), classificado como `Cozinha > Insumos Produzidos > Finalização`.
- 5 produtos foram desativados de forma suave (`ativo=false`), sem apagar histórico e sem alterar `estoque_atual`:
  - `Café Cajuba`;
  - `Milho`;
  - `Nutella`;
  - `Recheio Scala choc. branco 1,05kg`;
  - `Lombo Fracionado`.

Permissões:

- Eva foi conferida e já estava correta:
  - perfil `GESTOR`;
  - setores `["TUDO"]`;
  - acesso total igual Thiago/Tassiano.
- Sophia foi ajustada para enxergar somente `Recepção`:
  - antes: `["TUDO"]`;
  - depois: `["4"]`;
  - resultado: vê apenas as abas de início/contagem e os itens da Recepção.

Validação pós-migração:

- Produção `/api/health`: OK.
- Produtos ativos: 190.
- Produtos ativos contáveis: 189.
- Produtos ativos sem departamento/categoria/subcategoria: 0.
- Produtos contáveis sem setor: 0.
- Thiago, Tassiano e Eva:
  - acesso total;
  - 189 itens contáveis;
  - setores: Borda, Finalização, Gerais, Montagem e Recepção.
- Sophia:
  - acesso restrito;
  - 31 itens contáveis;
  - setor: Recepção.
- `npm run smoke:read -- --base-url=https://premium.titanatende.com.br --user-id=thiago`: OK nos checks executados.
- `npm run audit:rbac -- --base-url=https://premium.titanatende.com.br --manager-id=thiago --user-id=thiago,tassiano,eva,sophia`: OK.

Ponto de decisão pendente:

- Não foi feita transferência/soma de estoque entre produtos.
- Dois itens desativados ainda preservam saldo histórico:
  - `Milho`: `4.000 LATA DE 1,7 KG`;
  - `Nutella`: `2.000 BALDE DE 3KG`.
- Os itens ativos atuais são:
  - `Milho Lata`: `4.000 UN`;
  - `Nutella 3Kg`: `0.000 UN`.
- Se o gestor quiser reaproveitar esses saldos no item ativo, deve decidir manualmente se transfere, descarta ou ajusta o valor. A migração não alterou contagem para evitar perda de auditoria.
