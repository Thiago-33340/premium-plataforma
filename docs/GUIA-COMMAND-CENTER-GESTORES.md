# Guia do gestor — Titan Command Center

Este guia é para Thiago e Tassiano usarem o Command Center como central de gestão do Titan.

## Acesso

Endereço:

- `https://tools.titanatende.com.br/login`

Também funcionam:

- `https://tools.titanatende.com.br/command-center`
- `https://tools.titanatende.com.br/mapper`

## Primeiro acesso

1. Abra `https://tools.titanatende.com.br/login`.
2. Clique em **Primeiro acesso**.
3. Digite seu e-mail autorizado.
4. Crie uma senha seguindo as regras:
   - mínimo de 8 caracteres;
   - pelo menos uma letra maiúscula;
   - pelo menos um número;
   - pelo menos um símbolo.
5. Confirme a senha.
6. Se quiser manter o dispositivo conectado, marque **Manter conectado**.
7. Clique para entrar.

Observação: por segurança, “Manter conectado” vem desmarcado por padrão.

## Login normal

Depois do primeiro acesso:

1. Abra `/login`.
2. Digite e-mail e senha.
3. Marque **Manter conectado** apenas em computador confiável.
4. Clique em **Entrar**.

## Abas principais

### Visão geral

Use para entender:

- progresso geral do Titan;
- missão atual;
- prioridades;
- alertas de blindagem;
- próximo movimento recomendado.

### Estoque

Use como cockpit da entrega do estoque.

Mostra:

- módulos críticos do estoque;
- tarefas abertas;
- riscos;
- contratos de API;
- testes exigidos;
- divisão Codex/Claude.

Esta é a aba mais importante enquanto o objetivo for “estoque Premium pronto”.

### Agentes

Use para alinhar Codex, Claude e Thiago.

Funções:

- ver papéis oficiais;
- copiar briefing para o Claude;
- consultar fluxo de trabalho;
- evitar retrabalho entre ferramentas.

### Execução

Use para procurar módulos e tarefas.

Filtros úteis:

- módulo;
- status;
- ferramenta atuante;
- busca por texto.

Se o usuário tiver permissão de escrita no Command, esta aba também mostra **Registrar no Command**.

Use essa área para:

- criar uma nova tarefa;
- registrar um risco;
- registrar uma decisão;
- atualizar o status de uma tarefa existente.

Toda ação gravável gera auditoria em `project-state/command-audit-log.json`, com:

- usuário;
- horário;
- tipo da ação;
- arquivo alterado;
- ID criado ou atualizado;
- resumo da mudança.

Além do arquivo versionado, a ação também tenta gravar uma cópia auditada no banco Postgres, na tabela `titan_command_actions`. A tela mostra a quantidade de ações persistidas e, ao registrar algo, indica se voltou como **Postgres OK**.

Regra prática:

- use **Nova tarefa** quando algo precisa ser executado;
- use **Novo risco** quando algo pode quebrar prazo, operação, segurança ou estoque;
- use **Nova decisão** quando Thiago/Tassiano definirem uma regra do produto ou do processo;
- use **Atualizar tarefa** quando algo andou, travou ou foi concluído.

Importante: o Command Center gerencia progresso, riscos, tarefas e decisões. Ele não altera código sozinho. Mudanças de código, interface, banco operacional e deploy continuam exigindo commit/push/deploy explícito.

Como pensar a persistência:

- `project-state/*.json`: trilha versionada no Git, boa para documentação e handoff entre ferramentas.
- `titan_command_actions`: trilha viva do que foi registrado pela tela em produção, boa para sobreviver a deploys.
- Git/commit: fonte definitiva para código, documentação versionada e mudanças publicáveis.

### Qualidade

Use antes/depois de deploy.

Verifique:

- smoke read-only;
- auditoria RBAC;
- matriz de testes;
- riscos priorizados;
- critérios de pronto.

### Deploys

Use para ver o que foi publicado.

Verifique:

- data do deploy;
- PR/commit;
- ambiente;
- validações feitas;
- observações.

Usuários com permissão de escrita também podem usar **Registro governado de deploy** para registrar:

- deploy planejado;
- deploy pronto para publicar;
- deploy concluído;
- deploy falho.

Esse registro entra no `project-state/deploys.json`, no log auditado do Command e na trilha persistente do Postgres.

Importante: registrar deploy no Command **não aciona o EasyPanel automaticamente**. Ele documenta a intenção/resultado. A publicação real continua exigindo GitHub + EasyPanel + smoke.

### Aprovação humana de deploy

Na mesma aba **Deploys**, use **Aprovação humana de deploy** para marcar:

- aprovado para deploy;
- validado pós-deploy;
- reprovado;
- rollback necessário.

Para gravar, o Command exige digitar exatamente:

```text
AUTORIZO DEPLOY
```

Isso reduz clique acidental e cria trilha clara de quem aprovou/validou. Mesmo aprovado no Command, o deploy real ainda precisa ser feito pelo fluxo operacional autorizado.

### Executor externo de deploy

A aba **Deploys** também mostra o bloco **Executor externo**.

Ele serve para acionar um executor de deploy configurado no ambiente do EasyPanel, sem mostrar nem salvar a URL/token no código, no `project-state` ou na tela.

Para o botão ficar disponível:

- o usuário precisa ter permissão `acionar_deploy`;
- o deploy precisa estar registrado no Command;
- o deploy precisa ter aprovação humana;
- a variável segura `TITAN_DEPLOY_WEBHOOK_URL` ou `EASYPANEL_DEPLOY_WEBHOOK_URL` precisa existir no ambiente do serviço;
- antes de acionar, é obrigatório digitar exatamente:

```text
ACIONAR DEPLOY
```

Se a variável segura não estiver configurada, o bloco aparece como **não configurado**. Isso é esperado e protege o projeto contra vazamento de gatilhos de deploy.

Fluxo recomendado:

1. Registrar o deploy no Command.
2. Aprovar com `AUTORIZO DEPLOY`.
3. Acionar com `ACIONAR DEPLOY`, se o executor externo estiver configurado.
4. Rodar smoke depois do deploy.
5. Registrar validação pós-deploy no Command.

### Mapa técnico

Use quando alguém estiver em dúvida sobre rota, serviço ou fronteira.

Ajuda a evitar erros como:

- mexer em rota legada;
- gravar em tabela errada;
- confundir ficha de produção com ficha de cardápio.

### Acessos

Disponível para usuários com permissão de gestão.

Use para:

- autorizar novo e-mail;
- definir se a pessoa terá acesso total ou técnico;
- verificar quem já criou senha;
- acompanhar último login.

Regra: nunca crie senha por outra pessoa. Autorize o e-mail e peça para a pessoa usar **Primeiro acesso**.

## Rotina recomendada para Thiago e Tassiano

No início do trabalho:

1. Entrar no Command Center.
2. Abrir **Visão geral**.
3. Abrir **Estoque**.
4. Ver tarefas abertas e riscos.
5. Copiar briefing da aba **Agentes** para o Claude quando precisar de revisão.

Antes de aprovar deploy:

1. Conferir aba **Qualidade**.
2. Ver se smoke/blindagem passou.
3. Conferir aba **Deploys** depois da publicação.
4. Validar no navegador a tela afetada.

Quando houver dúvida técnica:

1. Abrir **Mapa técnico**.
2. Verificar se a rota é oficial ou legada.
3. Se envolver estoque novo, priorizar `/api/est/*`.

## Como usar o Command/Mapper durante a entrega do estoque

Fluxo recomendado:

1. Abra **Command Center → Estoque**.
2. Veja tarefas, riscos e próximos critérios de aceite.
3. Abra **Agentes** quando quiser acionar o Claude.
4. Copie para o Claude o handoff atualizado:
   - `docs/HANDOFF-CLAUDE-COMMAND-MAPPER.md`
   - `docs/DIARIO-ESTOQUE-PREMIUM-2026-06-22.md`
5. Peça ao Claude revisão de regra, cálculo e lacunas — não peça para ele reimplementar em paralelo o mesmo arquivo.
6. Use **Mapper** para conferir rotas, módulos e fronteiras:
   - estoque novo: `/api/est/*`;
   - ficha de produção: `est_ficha_*`;
   - ficha de venda/cardápio: `ficha_itens`;
   - legado: `/api/estoque/*`.

Durante testes de estoque:

- Produto e setores: conferir na tela **Produtos** se os chips de setor aparecem.
- Ficha técnica: abrir produto produzido e usar **Abrir editor de ficha**.
- Produção: usar **Mais → Produção interna** apenas para lançar produção, não para desenhar a ficha.
- Contagem: colaborador usa apenas setor atribuído.
- Auditoria: gestor valida antes de aceitar contagem como verdade operacional.

Regra prática:

- Command Center diz o que está sendo feito.
- Mapper mostra onde está no sistema.
- Diário registra o que mudou.
- Handoff orienta o Claude.

## Regra de ouro

Thiago e Tassiano decidem a operação.  
Codex implementa, testa e publica.  
Claude revisa, calcula impacto e aponta lacunas.  
Command Center registra o caminho para ninguém trabalhar no escuro.
