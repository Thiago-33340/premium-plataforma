# 🛠️ Painel Administrativo — Guia detalhado (Premium Pizzas)

**Endereço:** `premium.titanatende.com.br/admin`
**Quem entra:** só os 3 gestores — **Tassiano, Eva e Thiago**. Os demais perfis não conseguem abrir o admin.

---

## 🔑 1. Acesso e primeiro login

1. Abra `premium.titanatende.com.br/admin`.
2. Digite seu **usuário** (`tassiano`, `eva` ou `thiago`) → **Continuar**.
3. Digite seu **PIN**.
4. **No primeiro acesso**, o sistema pede pra você **definir um PIN definitivo** (digita o novo e confirma). A partir daí, é esse novo PIN que vale.
5. Pronto — abre o painel com seu nome no canto.

> O mesmo usuário/PIN serve em **todas as páginas** do sistema (Pedidos, Mesas, Caixa, Estoque, Loja). No topo do admin tem **links rápidos** pra pular de uma área pra outra.

---

## 🏠 2. Aba INÍCIO — visão do dia + integrações

**Visão do dia** (atualiza sozinha): pedidos de hoje, mesas ocupadas, itens em falta, contagens de estoque feitas hoje e itens abaixo do mínimo.

**Últimas contagens de estoque:** as últimas contagens com quem contou, turno, total, abaixo do mínimo e zerados.

**Integrações & sistema:**
- **Destino dos pedidos da Jéssica** — escolha **Saipos** ou **Nosso sistema**. É por aqui que você troca pra onde vai o pedido que a Jéssica fecha no WhatsApp, sem perder nada.
- **Baixa automática de estoque** — **Ligada/Desligada**. Quando ligada, todo pedido que entra dá saída automática dos insumos pela ficha técnica.

*Passo:* toque no botão desejado (ex: "Nosso sistema") — salva na hora.

---

## 🍕 3. Aba CARDÁPIO — preço e disponibilidade

Lista por categoria (toque pra abrir). Em cada produto e sabor você tem:

- **Preço:** clique no campo de preço, digite o novo valor e aperte **Enter** → salva (a borda fica verde).
- **Disponibilidade:** botões **Ativo / Falta / Oculto**.
  - *Ativo* = aparece e pode ser pedido.
  - *Falta* = aparece bloqueado ("indisponível hoje").
  - *Oculto* = some do cardápio.
- Reflete **na hora** no site do cliente e nas mesas.

> Pizza montável: o preço vem das opções (sabores/bordas), então o campo do produto fica travado — você edita o preço **no sabor**.

---

## 📦 4. Aba ESTOQUE — itens que os colaboradores contam

Lista por setor (Borda, Montagem, Finalização, Geral, Caixas). Aqui você controla o que entra na contagem, **direto no banco, sem planilha**.

- **+ Novo item:** abra "Novo item", preencha nome, unidade, setor, categoria, mínimo e ideal → **Adicionar item**.
- **Editar:** em cada item, ajuste **mínimo** e **ideal** e toque em **Salvar**.
- **Remover:** **Remover** tira o item da contagem (fica inativo).

> O que você mexe aqui é exatamente o que aparece pro colaborador no `/estoque` na hora de contar.

---

## 👥 5. Aba EQUIPE — perfis, setores e PIN

Lista todos os colaboradores (toque pra abrir cada um):

- **Perfil:** Gestor, Chefe de Cozinha, Operador de Atendimento, Garçom, Entregador, Colaborador.
- **Setores:** quais setores a pessoa vê no estoque. Use os setores criados para este cliente/tenant (ex.: `Borda`, `Montagem`, `Recepção`) ou `TUDO` para ver todos. Não use IDs legados `SETxxx` no fluxo novo do estoque.
- **Salvar** aplica perfil + setores.
- **Ativar/Desativar** o acesso da pessoa.
- **Trocar PIN:** digite um novo PIN no campo e toque em **Trocar PIN** (útil se alguém esquecer).
- **+ Novo usuário:** crie nome, usuário (apelido), perfil e PIN inicial.

> **Regra de acesso:** só quem é **Gestor** abre o admin. Operador vê pedidos/caixa/mesas; garçom só mesas; colaborador só o estoque do seu setor.

---

## 🔗 6. Links rápidos (navegação)

No topo do admin há atalhos: **Pedidos · Mesas · Caixa · Estoque · Loja**. O caixa também tem atalho de volta pro Admin (só aparece pra gestor). Assim você circula entre as áreas com 1 clique, sem precisar logar de novo.

---

## ✅ Resumo do que o gestor controla por aqui
Preço e disponibilidade do cardápio · itens e mínimos do estoque · equipe (perfil, setor, PIN, ativar/desativar) · destino do pedido (Saipos ↔ Nosso) · baixa automática de estoque · visão do dia da operação. Tudo numa fonte só (Postgres), refletindo na hora em todas as telas.
