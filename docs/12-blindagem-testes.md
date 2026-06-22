# Titan Khardela — Blindagem e testes

Blindagem é o conjunto de verificações rápidas que protege o Titan contra regressão antes de novas mudanças ou deploys.

## Comandos criados

### 1. Validar a fonte operacional

```powershell
npm run check:project-state
```

Valida:

- JSONs de `project-state/`;
- campos obrigatórios;
- módulos;
- grupos de rotas;
- tarefas;
- contratos críticos;
- matriz de testes.

Esse comando não acessa API, banco ou internet. É seguro.

### 2. Smoke test read-only

```powershell
npm run smoke:read
```

Por padrão testa:

```text
http://localhost:8080
```

Para testar outra URL:

```powershell
$env:TITAN_BASE_URL="https://premium.titanatende.com.br"
npm run smoke:read
```

Esse teste só consulta rotas. Não cria produto, não altera estoque e não faz contagem.

Para salvar o resultado na fonte operacional do Titan:

```powershell
node scripts/smoke-critical.mjs --base-url=https://premium.titanatende.com.br --out=project-state/health-checks.json
```

Esse arquivo pode ser lido futuramente pelo Command Center:

```text
project-state/health-checks.json
```

Rotas verificadas:

- `/api/health`
- `/api/est/dashboard`
- `/api/est/produtos`
- `/api/est/setores`
- `/api/est/categorias`
- `/api/est/fornecedores`
- `/api/est/producao/produzidos`
- `/api/est/producoes`
- `/api/est/movimentos`
- `/api/est/contagens`

Se informar um usuário:

```powershell
$env:TITAN_SMOKE_USER_ID="ID_DO_USUARIO"
npm run smoke:read
```

Também testa:

- `/api/est/permissoes`
- `/api/est/meus-itens`

### 3. Smoke test mutável controlado

```powershell
npm run smoke:mutating
```

Esse comando é bloqueado por padrão.

Ele só roda se você confirmar explicitamente:

```powershell
$env:TITAN_SMOKE_USER_ID="ID_DE_UM_GESTOR"
$env:TITAN_SMOKE_MUTATE_CONFIRM="CRIAR_DADOS_DE_TESTE"
npm run smoke:mutating
```

O que ele faz:

1. cria um produto de teste com prefixo `SMOKE_TESTE_CODEX`;
2. edita esse produto;
3. salva uma ficha técnica simples usando um insumo real;
4. consulta a ficha;
5. desativa a ficha;
6. inativa o produto de teste.

Ele não lança produção e não baixa estoque.

## Trava contra produção remota

Se a URL não for `localhost` ou `127.0.0.1`, o teste mutável também exige:

```powershell
$env:TITAN_SMOKE_ALLOW_REMOTE="1"
```

Use isso apenas conscientemente.

## Ordem recomendada antes de deploy

```powershell
npm run check:project-state
npm run smoke:read
```

Depois de validar produção:

```powershell
node scripts/smoke-critical.mjs --base-url=https://premium.titanatende.com.br --out=project-state/health-checks.json
```

## Auditoria RBAC remota sem PIN

Para validar permissões e visualização esperada da tela de estoque sem precisar do PIN do usuário:

```powershell
$env:TITAN_BASE_URL="https://premium.titanatende.com.br"
$env:TITAN_RBAC_MANAGER_ID="ID_DO_GESTOR"
npm run audit:rbac
```

Para salvar o relatório na fonte operacional:

```powershell
node scripts/rbac-audit.mjs --base-url=https://premium.titanatende.com.br --manager-id=ID_DO_GESTOR --out=project-state/rbac-audit.json
```

Para auditar um colaborador específico:

```powershell
node scripts/rbac-audit.mjs --base-url=https://premium.titanatende.com.br --manager-id=ID_DO_GESTOR --user-id=ID_DO_COLABORADOR --out=project-state/rbac-audit.json
```

O auditor verifica:

- se o gestor consegue listar usuários remotamente;
- permissões efetivas de cada usuário;
- setores/itens visíveis em `/api/est/meus-itens`;
- abas que a tela `public/estoque.html` deveria mostrar;
- conflitos como “vê Contagem mas não pode iniciar” ou “pode fazer contagem mas a aba fica escondida”.

Ele não altera permissões, não troca PIN, não cria usuário e não mexe no estoque.

Depois, em ambiente local/dev com banco seguro:

```powershell
npm run smoke:mutating
```

## Próxima evolução

Criar um ambiente de teste isolado para permitir:

- lançar produção real de teste;
- validar baixa de insumo;
- validar entrada do produzido;
- aprovar contagem sem afetar estoque real;
- rodar tudo automaticamente antes do deploy.
