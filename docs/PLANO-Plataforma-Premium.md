# 🏗️ Plano da Plataforma Premium — Blueprint completo

Este documento organiza tudo que o Tassiano pediu, pra a gente construir em fases sem perder nada. Objetivo declarado: **a melhor operação possível — melhor que Saipos e que Delivery Direto.** Não copiar; superar.

**Estado atual (já no ar):** `pedido.titanatende.com.br` — app do cliente (`/loja`), painel do operador (`/gestor`), backend Node + Postgres no Easypanel. Independente de Saipos/DD/iFood.

---

## 1. Apps e perfis de acesso (com login)

Quatro frentes, cada uma com login simples:

| App | Quem usa | O que faz |
|---|---|---|
| `/loja` | Cliente | Cardápio + pedido (entra pelo WhatsApp). Login = nº de WhatsApp. |
| `/gestor` | **Operador de atendimento** | Vê a operação inteira: entregas, retiradas e mesas. Muda status, imprime, controla prazos, disponibilidade de cardápio, caixa, roteirização. |
| `/garcom` | **Garçom** | Vê **só as mesas**. Abre comanda, lança pedido, recebe aviso de "pronto". |
| `/admin` | **Dono / gestor / responsável** | Edita **tudo que o site mostra**: produtos, categorias, promoções, formas de pagamento, áreas/prazos, textos, e **gerencia os usuários** do painel gestor/garçom. Separado do painel de pedidos. |

**Perfis (roles):** `admin`, `operador`, `garcom`. O admin cria/edita usuários e define o perfil de cada um. Login simples (usuário + senha), sessão por token.

---

## 2. Três fluxos de pedido

### 2.1 Entrega (colunas de status, configuráveis)
`Novos → Em preparo → Aguardando entregador → Em rota → Entregue`

### 2.2 Retirada
`Novos → Em preparo → Pedido pronto → Retirado`

> As colunas podem ser **aumentadas/diminuídas** pelo operador pra ganhar visibilidade (mostrar/ocultar colunas).

### 2.3 Mesa (novo — diferente dos outros)
Aqui **não são colunas de status**, e sim **colunas por número de mesa** (começa 1 a 16, configurável no admin).
- Ao clicar numa mesa, abre a **tela de lançar pedido** (do garçom).
- Cada mesa, ao abrir, **inicia uma comanda** — o garçom pede o **nome do cliente** pra abrir.
- Uma mesma mesa pode ter **várias comandas** (clientes que querem contas separadas).
- Status interno da mesa/comanda: `Em preparo → Pedido pronto`.
- A cozinha sempre roda o **mesmo processo** durante o "Em preparo" (igual aos outros fluxos).
- O pedido da cozinha ganha um campo a mais: **nome do cliente** (da comanda).
- Ao lançar, **imprime na Epson**. Quando sair na finalização → status `Pedido pronto` + **garçom recebe notificação no site**.
- Mesa **não usa automação de WhatsApp** por enquanto. Só Khardela + Postgres.

**Lançamento de pedido do garçom:** parecido com a Saipos, mas mais intuitivo, seguindo o padrão do nosso site. Navega por categorias: **Pizzas Grandes, Pizzas Pequenas, Bebidas, Copos**.
- **Copos** é categoria especial: itens **não cobrados** (R$ 0) — copo simples, copo com gelo, copo com limão e gelo. São cortesia (consumo na loja). Editáveis no admin como qualquer produto.

---

## 3. Cozinha e prioridades (estrutura futura, deixar preparado)

- Toda a cozinha trabalha enquanto o pedido está em **Em preparo**, em estações: **Borda → Montagem → Finalização** (esqueleto agora, evolui depois).
- **Prioridade de fila** (futuro, quando ligar as estações):
  - Prioridade 1: **Mesas** · Prioridade 2: **Retirada** · Prioridade 3: **Entrega**.
  - **Prioridade 0 (refação):** pedido que precisa ser refeito sobe pra prioridade 0 e pode até **ocupar o lugar** de um pedido que está na borda/montagem/finalização **se for igual e com as mesmas observações** (ex: "sem cebola").
- Avisos ao garçom (futuro): "pedido da mesa 1 está no forno!" pra ele já levar pratos/talheres.
- Mesa lançada entra na fila do operador da borda como **próximo imediato** (futuro).

---

## 4. Painel do operador — controles essenciais

1. **Prazos de entrega** — padrão Delivery Direto (mínimo/máximo de tempo), config simples pro operador (referência: imagem 2 que você mandou).
2. **Cardápio disponível** — padrão DD (imagem 3): **cardápio completo** com 3 status: **Ativo / Em falta / Oculto**. Aqui **só muda disponibilidade**, não edita dados (edição é no admin).
3. **Promoções e Cupons** (opcional) — lista os descontos ativos pra o operador não se perder.
4. **Abertura de caixa** — simples, como na Saipos ao iniciar o turno.
5. **Roteirização** (no lugar de "gerenciar áreas") — mapa com pinos de pedidos e entregadores (ver `GUIA-Roteirizacao-Mapa.md`). O **gerenciar áreas de entrega** provavelmente fica no admin, não no operador (a confirmar).

---

## 5. Painel administrativo — controle total do site

Separado do painel de pedidos. Intuitivo e fácil. Inclui:
- **Produtos** (estilo DD): categorias, itens, variações (sabores/bordas/adicionais/extras), **nº de escolhas por variação**, ordem dos passos, preços, status, fotos/camadas. Inclui a categoria **Copos**.
- **Promoções e cupons**: criar/editar.
- **Formas de pagamento** (quais aceitar).
- **Áreas de entrega** e **prazos** (config base).
- **Mesas**: quantidade/numeração.
- **Textos e identidade**: nome, endereço, horários, descrição, política de privacidade, canais de atendimento.
- **Usuários do painel**: criar/editar operadores e garçons, definir perfil e senha.
- **Horário de funcionamento** e modos de pedido (entrega/retirada/mesa on-off).

> Você vai me mandar mais prints do DD pra eu tirar de base — mas o alvo é **superar**, não copiar.

---

## 6. Modelo de dados (Postgres — schema `premium`)

Tabelas novas/ajustadas (aditivas, sem quebrar o que já roda):
- `usuarios` (painel): `id, nome, login, senha_hash, perfil[admin|operador|garcom], ativo`.
- `categorias`: `id, nome, ordem, visivel, tipo`.
- `produtos`: `id, categoria_id, nome, descricao, preco, status[ATIVO|EM_FALTA|OCULTO], gratuito(bool), foto/camada, ordem`.
- `variacoes` / `opcoes`: sabores, bordas, adicionais, extras, com `min_escolhas/max_escolhas`.
- `promocoes`, `cupons`.
- `mesas`: `id, numero, ativa`.
- `comandas`: `id, mesa_id, nome_cliente, status[ABERTA|FECHADA], aberta_em`.
- `pedidos` (ampliar): `tipo[DELIVERY|TAKEOUT|MESA]`, `comanda_id`, `mesa_id`, `obs_cozinha`, `lat/lng`, `entregador_id`, `prioridade`.
- `entregadores`: posição (ver guia de roteirização).
- `caixa`: `id, aberto_por, aberto_em, fechado_em, valor_abertura, status`.
- `config` (já existe): horários, áreas, prazos, formas de pagamento, etc.

---

## 7. Roadmap em fases (proposta de ordem)

**Fase 1 — Fundação (o que destrava tudo):**
- Login + perfis (admin/operador/garçom).
- Separar `/admin` do `/gestor`.
- Modelo de dados ampliado (usuários, produtos editáveis, mesas, comandas, caixa).
- Os 3 fluxos no `/gestor` (Entrega, Retirada, Mesa) com os status que você definiu.

**Fase 2 — Mesas e garçom:**
- Colunas por mesa (1–16), abrir comanda com nome do cliente, lançar pedido (categorias + Copos cortesia), imprimir na Epson, status `Em preparo → Pedido pronto`, notificação ao garçom.
- Acesso restrito do garçom (só mesas).

**Fase 3 — Admin completo:**
- Produtos/categorias/variações/promoções/cupons/pagamentos/áreas/prazos/textos + gestão de usuários.

**Fase 4 — Controles do operador:**
- Prazos de entrega, cardápio disponível (3 status), promoções/cupons (visão), abertura de caixa.

**Fase 5 — Roteirização (com seu irmão):**
- Mapa com pinos de pedido (já útil pro operador montar rotas); depois entregadores ao vivo.

**Fase 6 — Cozinha e prioridades:**
- Estações (borda/montagem/finalização), fila por prioridade, avisos ao garçom, "no forno".

**Transversal:** prévia visual da pizza com suas fotos (camadas), escolha simples estilo DD, e melhorias de UX que você apontar.

---

## 8. Decisões/dúvidas a alinhar (rápidas)
1. **Pino do mapa "na área do cliente"**: confirmar o que quis dizer (acho que é: visual do pino configurável + posição vinda do endereço do cliente).
2. **Gerenciar áreas de entrega**: fica no **admin** (não no operador), certo? O operador só vê roteirização.
3. **Login**: usuário+senha por perfil já basta agora (sem 2FA), certo?
4. **Copos**: confirmo R$ 0 e não entram no total — certo?
5. **Mesas 1–16** como ponto de partida, ajustável no admin — ok?

> Não preciso travar em nenhuma dessas pra começar a Fase 1 — sigo com o entendimento acima e você corrige no caminho.
