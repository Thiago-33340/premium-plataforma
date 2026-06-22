# 📘 Premium Pizzas — Passo a passo de cada operação

Plataforma única (na rocha: tudo no Postgres). Funciona no computador e no celular.
**Endereço base: premium.titanatende.com.br**

| Operação | Quem usa | Endereço |
|---|---|---|
| Fazer pedido (cliente) | Cliente | `/loja` |
| Atender pedidos (operador) | Operador / Gestor | `/gestor` |
| Caixa + entregadores (operador) | Operador / Gestor | `/caixa` |
| Atender mesas (garçom) | Garçom / Operador | `/mesas` |
| Administração geral | Gestor (Tassiano, Eva, Thiago) | `/admin` |
| Contagem de estoque | Colaboradores | `/estoque` |

Todo acesso da equipe é por **usuário + PIN de 6 dígitos**.

---

## 🍕 1. Cliente — fazer um pedido (`/loja`)

1. Abre `premium.titanatende.com.br/loja`.
2. Escolhe a categoria (Pizza Grande, Pizza Pequena, Bebidas, Copos).
3. **Montar pizza** (toca no + da Grande/Pequena): escolhe **estilo de borda** → **sabores** (Grande: 2, pode repetir pra inteira; Pequena: 1) → se a borda for recheada, escolhe o **recheio** → **adicionais/extras** (opcional). A pizza monta na tela e o preço atualiza sozinho. Toca em **Adicionar**.
4. Bebidas/copos: toca no + e entram no carrinho.
5. **Ver carrinho** → confere → **Continuar**.
6. **Cria a conta** informando **nome** e **WhatsApp**: é rapidinho e serve pra guardar os pedidos anteriores (facilita os próximos) e avisar quando tiver promoção. Escolhe **Retirada** ou **Entrega** (com endereço).
7. **Revisar e enviar** → aparece o número do pedido. Item pausado aparece bloqueado ("indisponível").

---

## 👨‍🍳 2. Operador — pedidos, caixa e entregadores

**Pedidos (`/gestor`):**
1. Abre `premium.titanatende.com.br/gestor` (computador da loja).
2. Pedidos em colunas: **Recebido → Em preparo → Pronto → Em rota → Entregue**. Avança o pedido conforme a cozinha trabalha. Imprime o cupom no cartão.

**Caixa + entregadores (`/caixa`):**
1. Abre `premium.titanatende.com.br/caixa` e entra com usuário + PIN.
2. **Abrir frente de caixa:** informa o **valor em dinheiro** e uma **observação** (nome, horário) → **Abrir**. No fim do turno, **Fechar caixa** com o valor contado.
3. **Entregadores:** cadastra nome (e telefone) de cada entregador, pra despachar o pedido com o nome certo. Pode ativar/desativar.

> O operador também enxerga as mesas (abrindo `/mesas` com o mesmo usuário). Quem tem acesso restrito a só mesas é o garçom.

---

## 🧑‍🍽️ 3. Garçom — atender as mesas (`/mesas`)

1. Abre `premium.titanatende.com.br/mesas` (celular, tablet ou computador — a tela se adapta).
2. Entra com **usuário + PIN**.
3. Vê a **grade de mesas**: verde = livre, laranja = ocupada (com o total).
4. **Abrir mesa:** toca numa mesa livre → confirma o nome.
5. **Adicionar itens:** toca em **+ Item** → monta no cardápio (pizza igual ao cliente; bebida entra direto). **Dá pra continuar adicionando itens numa mesa já aberta** quando quiser — é só abrir a mesa de novo e tocar em + Item.
6. Pra tirar um item, toca no **✕**.
7. **Fechar conta:** toca em **Fechar conta** → escolhe a forma (DIN/CARTÃO/PIX). A mesa volta a ficar livre.

> **Garçom só vê mesas.** Operador e gestor veem mesas + o resto.

---

## 🛠️ 4. Administração (`/admin`) — só Gestor (Tassiano, Eva, Thiago)

1. Abre `premium.titanatende.com.br/admin` e entra com usuário + PIN.
2. **Início:** visão do dia (pedidos, mesas ocupadas, itens em falta, contagens, itens abaixo do mínimo) e as últimas contagens de estoque.
3. **Cardápio:** edita o **preço** (Enter salva) e a **disponibilidade** (Ativo / Em falta / Oculto) de cada produto e sabor — reflete na hora no site.
4. **Estoque:** gerencia os **itens que os colaboradores contam** — adiciona, edita mínimo/ideal/setor, ou remove. Tudo direto no banco, sem planilha.
5. **Equipe:** edita **perfil** e **setores** de cada um, **ativa/desativa** e **troca o PIN**. Também cria novos usuários.

---

## 📦 5. Estoque — contagem de fim de turno (`/estoque`)

1. Colaborador abre `premium.titanatende.com.br/estoque` no celular (dá pra gerar um QR e colar na cozinha).
2. **Entra:** digita o **nome/apelido** → **Continuar** → digita o **PIN de 6 dígitos** → **Entrar**.
3. Escolhe o **turno** (Manhã / Tarde / Noite / Fechamento).
4. Escolhe o **setor** (cada um vê só o(s) seu(s); gestor vê todos): Borda, Montagem, Finalização, Geral, Caixas.
5. **Conta cada item** (digita a quantidade ou usa − / +). O sistema marca sozinho se está **abaixo do mínimo** ou **zerado**.
6. **Finalizar contagem** → mostra o resumo. Dá pra **Contar outro setor** ou **Sair**.

> A contagem fica registrada no Postgres com quem contou, quando e qual turno — base pro controle de compras e CMV. *(Em implementação: aviso automático pro Thiago e Tassiano no WhatsApp ao finalizar.)*

---

### 🔐 Acesso
- Todos entram por **usuário + PIN** (guardado só como hash seguro — nem no banco dá pra ler).
- **Gestor** (Tassiano, Eva, Thiago) vê tudo; **operador** vê pedidos, caixa e mesas; **garçom** só mesas; **colaborador** só o estoque do seu setor.
- Trocar PIN e gerenciar usuários: no painel **/admin**.
