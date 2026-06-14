# 🚀 Deploy no Easypanel (VPS Hostinger) — Premium Plataforma

Versão de produção: Node + **Postgres** (pool de conexões + índices), Dockerizada, pronta pra aguentar muitos pedidos e atendimentos ao mesmo tempo. Serve os dois apps no mesmo serviço:
- Cliente: `https://SEU_DOMINIO/loja`
- Estabelecimento: `https://SEU_DOMINIO/gestor`

## Visão geral (3 passos)
1. Subir o código pro GitHub.
2. Criar o app no Easypanel apontando pro repositório (build pelo Dockerfile).
3. Configurar variáveis (Postgres), domínio e dar Deploy.

---

## 1) Código no GitHub
Crie um repositório (ex: `premium-plataforma`) e suba **todo o conteúdo desta pasta** (`server-pg.js`, `db.js`, `package.json`, `Dockerfile`, `public/`, `data/`). Pode ser pela interface do GitHub (botão "Add file → Upload files", arrasta tudo) — não precisa de terminal.

> Quando o Claude no Chrome reconectar, eu faço esse passo com você (criar repo + upload), é só você estar logado no GitHub.

## 2) App no Easypanel
No projeto `mayaproject` (o mesmo do n8n):
1. **Create Service → App**.
2. **Source:** GitHub → selecione o repositório `premium-plataforma` (se for privado, conecte sua conta GitHub no Easypanel; se público, cole a URL).
3. **Build:** deixe em **Dockerfile** (ele detecta automaticamente o `Dockerfile` da raiz).

## 3) Variáveis de ambiente
Na aba **Environment** do app, adicione:

```
DATABASE_URL=postgres://USUARIO:SENHA@NOME_DO_SERVICO_POSTGRES:5432/titan_khardela
WA_SECRET=troque-por-uma-frase-secreta-sua
PORT=8080
```

- `NOME_DO_SERVICO_POSTGRES` é o **nome interno** do serviço Postgres no Easypanel (ex: `titan-postgres`). No Easypanel os serviços se enxergam pelo nome.
- Pode usar o banco `titan_khardela` que já existe — a plataforma cria um **schema próprio `premium`** lá dentro, sem mexer no schema `khardela`. (Se preferir isolar, crie um banco `premium` e troque no fim da URL.)
- `USUARIO`/`SENHA`: as credenciais do seu Postgres (as mesmas que o n8n usa).

## 4) Domínio
1. No app, aba **Domains → Add Domain**: `pedido.titanatende.com.br`, **Port 8080**, **HTTPS** ligado (Easypanel emite o certificado Let's Encrypt sozinho).
2. No DNS do `titanatende.com.br` (Cloudflare/registrador): crie um registro **A** `pedido` → **IP da VPS** (`2.24.97.168`). Se usar Cloudflare, deixe o proxy cinza (DNS only) na primeira emissão do certificado.
3. O painel da loja fica no mesmo domínio em `/gestor` (ex: `https://pedido.titanatende.com.br/gestor`). Se quiser um subdomínio separado pro painel, adicione também `painel.titanatende.com.br` apontando pro mesmo app.

## 5) Deploy
Clique em **Deploy**. O Easypanel builda a imagem e sobe. Acompanhe os **Logs**: deve aparecer `[db] schema pronto` e `Premium Plataforma (Postgres) na porta 8080`.

## Verificação
- `https://pedido.titanatende.com.br/api/health` → `{"ok":true}`
- `/loja` abre o app do cliente, `/gestor` o painel.
- Faça um pedido de teste no `/loja` e veja ele cair no `/gestor`.

## Atualizações futuras
Toda vez que eu mudar o código e você (ou eu) der push no GitHub, é só clicar **Deploy** de novo no Easypanel (ou ligar o auto-deploy por webhook).

## Importante (pizza visual)
As imagens das pizzas (camadas que você vai produzir) entram depois em `public/assets/` seguindo a convenção combinada — o motor de composição já vai consumir de lá. Nada disso bloqueia subir a plataforma agora.
