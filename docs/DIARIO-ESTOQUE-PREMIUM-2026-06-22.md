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
