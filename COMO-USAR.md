# 🍕 Premium Pizzas — Plataforma de Pedidos

Plataforma **independente** (não depende de Jessica/Meta/Saipos) para receber pedidos online e gerenciá-los na loja, com impressão na Epson. São **dois apps** servidos pelo mesmo backend:

- **Cliente** → `http://localhost:8080/loja` — cardápio + pedido (mobile)
- **Estabelecimento** → `http://localhost:8080/gestor` — painel + impressão (computador da loja)

Cores e identidade Premium (preto/laranja/branco, Anton + Inter, "COM AMOR").

---

## ▶️ Como rodar (1 minuto)

Pré-requisito: **Node.js** instalado (já tem na sua máquina — testado no Node 22).

1. Abra o **PowerShell** ou **Prompt** nesta pasta.
2. Rode:
   ```
   node server.js
   ```
3. Pronto. Abra no navegador:
   - Loja do cliente: `http://localhost:8080/loja`
   - Painel da loja: `http://localhost:8080/gestor`

Para parar: `Ctrl + C`. Os dados ficam em `data/db.json`.

> Atalho: dê **dois cliques** em `iniciar.bat` (abre o servidor e o painel).

---

## 📱 App do cliente (`/loja`)

- **Login mínimo**: o **número de WhatsApp é o login E a senha**. Nada de cadastro chato.
- Validação: precisa ser um número de WhatsApp válido com DDD (ex: `5517999998888`).
- **Entrada pelo WhatsApp**: o link ideal é o que a Premium manda no WhatsApp, com um token de confirmação:
  ```
  http://SEU_HOST:8080/loja?tel=5517999998888&wa=<token>
  ```
  Quando o cliente entra por esse link, o pedido nasce marcado com **✓ WA** no painel (confirmação de que veio do WhatsApp). Para gerar o token de um número:
  ```
  GET http://localhost:8080/api/wa-link?telefone=5517999998888
  ```
  (Esse endpoint é o que a Jessica/bot vai chamar para montar o link de cada cliente.)
- Cardápio real: 35 sabores (salgadas/doces), meio-a-meio, bordas recheadas, adicionais, bebidas.
- Checkout: entrega ou retirada, endereço, pagamento (dinheiro com troco / cartão / PIX), observação.
- Após confirmar: número do pedido + acompanhamento de status.

## 🧑‍🍳 App do estabelecimento (`/gestor`)

- **Painel kanban**: Novos → Em preparo → Prontos → Em rota → Entregues.
- **Alerta de pedido novo**: som + destaque laranja (botão 🔔 liga/desliga o som).
- Cada pedido mostra cliente, itens, total, forma de pagamento, observação e se veio do WhatsApp.
- **Status com 1 clique**: Aceitar/Preparar → Pronto → Saiu para entrega → Entregue (retirada vira "Retirado").
- **Impressão**:
  - 👨‍🍳 **Comanda da cozinha** (só o que preparar) e 🧾 **Comanda de entrega/balcão** (com cliente, endereço e valores).
  - Funciona de duas formas: pelo **diálogo de impressão do navegador** (escolha a Epson) **ou** direto na **Epson em rede** via ePOS-Print.

## 🖨️ Configurar a Epson (impressão direta, sem diálogo)

No painel, clique em **⚙️** e informe o **IP da impressora** Epson (TM-T20/T88) e a porta (`8008` padrão). Use **Imprimir teste** para validar.

- Com IP configurado: a comanda vai **direto** para a térmica (silencioso).
- Sem IP: usa o diálogo do navegador — selecione a Epson e marque papel 80mm.

> A mesma Epson que vocês usam na Saipos serve aqui. Se ela estiver conectada via USB (e não rede), use o modo "diálogo do navegador" e defina a Epson como impressora padrão; para impressão 100% silenciosa por USB, dá para adicionar depois um agente local — me avise que eu configuro.

---

## 🔌 API (para integrar com a Jessica/n8n depois)

| Método | Rota | O quê |
|---|---|---|
| GET | `/api/cardapio` | cardápio completo |
| POST | `/api/auth` | login `{telefone, senha, nome, wa}` |
| GET | `/api/wa-link?telefone=` | gera link WhatsApp do cliente |
| POST | `/api/pedidos` | cria pedido |
| GET | `/api/pedidos` | lista pedidos (painel) |
| GET | `/api/meus-pedidos?telefone=` | pedidos do cliente |
| PATCH | `/api/pedidos/:id` | `{status}` ou `{impresso}` |
| GET/POST | `/api/config` | IP da impressora |

Status válidos: `RECEBIDO, EM_PREPARO, PRONTO, EM_ROTA, ENTREGUE, CANCELADO`.

---

## 🗺️ Próximos passos (quando você acordar)
- Hospedar (Cloudflare/VPS) com o domínio da Premium e HTTPS.
- Ligar a impressão direta na Epson de vocês (IP ou agente USB).
- Opcional: a Jessica/n8n cria o pedido por esta mesma API e dispara o mesmo painel — fonte única.
- Plugar este pedido no fluxo Saipos (depois de corrigir o nó que te falei).
