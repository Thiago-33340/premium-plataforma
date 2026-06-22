# 🗺️ Guia de Roteirização — Mapa de Pedidos e Entregadores (para implementação)

**Para:** desenvolvedor que vai ativar a área de roteirização (irmão do Tassiano)
**Objetivo:** dar ao operador um **mapa ao vivo** com (a) cada **pedido** marcado por um pino com o número do pedido, e (b) cada **entregador** marcado por um pino com ícone de moto + nome, para o operador montar rotas com facilidade.
**Estado hoje:** a plataforma já roda em produção (Node + Postgres, no Easypanel, em `pedido.titanatende.com.br`). Esta área entra como um módulo novo dentro do painel do operador (`/gestor`).

---

## 1. Visão do que precisa existir

1. **Mapa** na tela do operador mostrando a região de atuação (São José do Rio Preto e arredores).
2. **Pinos de pedido**: um marcador por pedido ativo de entrega, com o **número do pedido** dentro. Ao clicar, mostra resumo (cliente, endereço, valor, status).
3. **Pinos de entregador**: um marcador com **ícone de moto + nome** do entregador, atualizando a posição em tempo (quase) real.
4. **Nome do cliente** sobre o pino do pedido — **só quando não poluir** (mostrar no zoom mais próximo, ou só ao passar o mouse/clicar).
5. O operador usa isso para **montar rotas** (agrupar pedidos por entregador). Otimização automática de rota é uma fase futura; agora é visual + manual.

> Observação do Tassiano a confirmar: ele falou em "pino personalizado na área do cliente". Interpreto como: **o visual do pino é definido/configurável**, e a posição do pedido vem do **endereço do cliente**. Tratar a customização do ícone como um asset (imagem) que vocês trocam, não algo que o cliente final mexe. Confirmar com ele antes de investir nisso.

---

## 2. Tecnologias recomendadas (e por quê)

### Mapa: **Leaflet.js** (open-source, gratuito)
- É exatamente o que o Delivery Direto usa (dá pra ver o crédito "Leaflet | OpenStreetMap" no painel deles).
- Leve, sem custo de licença, ótimo com marcadores customizados.
- Tiles (as "imagens" do mapa): começar com **OpenStreetMap** padrão, mas **ler a política de uso** (a tile pública gratuita do OSM **não é pra produção pesada**). Para produção, usar um provedor de tiles com chave: **MapTiler**, **Mapbox**, **Stadia Maps** ou **Carto** (este aparece no painel do DD: "© CARTO"). Todos têm plano gratuito com limite — **pesquisar limites e preço atual de cada um**.
- Plugin útil: **Leaflet.markercluster** (agrupa pinos quando o mapa está afastado, evita poluição).

### Geocodificação (endereço → latitude/longitude)
Os pinos de pedido precisam de coordenadas. Duas fontes:
- **Aproveitar o que já temos**: o payload de pedido da Saipos já trazia `coordinates {latitude, longitude}`. Sempre que o pedido tiver coordenada, usar direto (custo zero).
- **Quando só tiver endereço/CEP**: geocodificar. Opções:
  - **Nominatim (OpenStreetMap)** — gratuito, mas com **limite de 1 req/seg** e exige atributos/cache; **não pode usar pra volume alto sem self-host**.
  - **LocationIQ / Geoapify / MapTiler Geocoding** — planos gratuitos generosos + pagos; mais confiáveis pra Brasil.
  - **Google Geocoding** — o mais preciso no Brasil, mas pago por uso.
  - **Recomendação**: geocodificar **uma vez** no momento que o pedido é criado e **salvar lat/lng no banco** (não geocodificar toda hora). Pesquisar qual provedor tem melhor precisão pra CEP de Rio Preto e o preço.

### Posição do entregador em tempo real
Aqui está o ponto mais delicado. O entregador precisa **transmitir a localização** do celular dele. Caminhos:
- **PWA simples no celular do entregador** (página web que ele abre e deixa aberta): usa `navigator.geolocation.watchPosition()` e envia a posição pro backend a cada X segundos. Funciona, **mas**:
  - Exige **HTTPS** (geolocalização só funciona em site seguro — já temos).
  - Em navegador, **rastreamento em segundo plano é limitado** (se ele bloquear a tela ou trocar de app, o GPS pode parar). Para manter, ou a tela fica acordada (Wake Lock API) ou parte-se pra **app nativo**.
- **App nativo (Android)** com serviço de localização em background: solução robusta de verdade pra entregador, porém mais trabalho. **Pesquisar**: "background geolocation" (libs como `react-native-background-geolocation`, ou Capacitor/Flutter com plugin de background location), consumo de bateria, e as **permissões do Android 13+** (localização em segundo plano exige fluxo de permissão específico).
- **Atualização em tempo real na tela do operador**: usar **WebSocket** (ou **Server-Sent Events**) pra empurrar as posições pro mapa sem ficar recarregando. Começar simples com **polling** (a tela busca posições a cada 5–10s) e evoluir pra WebSocket.

### Otimização de rota (fase futura, não agora)
- Para sugerir a melhor ordem de entrega: **OSRM** (self-host, gratuito), **GraphHopper**, **Mapbox Optimization API** ou **Google Directions/Routes**. É um problema de "Vehicle Routing Problem (VRP)". **Pesquisar** depois; agora o operador agrupa manualmente.

---

## 3. O que muda no backend (estrutura de dados)

Adicionar (sem quebrar o que existe):
- Na tabela `pedidos`: colunas `lat NUMERIC`, `lng NUMERIC`, `entregador_id` (quando atribuído).
- Tabela `entregadores`: `id`, `nome`, `telefone`, `ativo`, `ultima_lat`, `ultima_lng`, `ultima_atualizacao`.
- **Endpoint** `POST /api/entregador/posicao` — o PWA/app do entregador manda `{entregador_id, lat, lng}`; o backend salva `ultima_lat/lng/atualizacao`.
- **Endpoint** `GET /api/roteirizacao` — devolve, num JSON só: pedidos ativos de entrega (com lat/lng, número, cliente, status) + entregadores (com posição). A tela do operador consome isso.
- Geocodificar o endereço no `POST /api/pedidos` (quando criar) e salvar `lat/lng`.

---

## 4. O que fazer no front (tela do operador)

1. Incluir Leaflet (CSS + JS) na página de roteirização.
2. Inicializar o mapa centrado em Rio Preto (lat ≈ -20.8197, lng ≈ -49.3794), zoom ~13.
3. Buscar `GET /api/roteirizacao` a cada 5–10s.
4. Para cada **pedido**: um marcador com `L.divIcon` mostrando o **número** (HTML/CSS estilizado, cores da Premium). Popup com cliente/endereço/valor ao clicar.
5. Para cada **entregador**: marcador com **ícone de moto** (imagem PNG) + label com o nome.
6. **Anti-poluição**: nome do cliente só aparece em zoom alto OU no popup; usar markercluster quando afastado.
7. Atualizar posições sem recriar o mapa (mover os marcadores existentes).

---

## 5. Pontos de atenção (não pular)

- **HTTPS obrigatório** para geolocalização (já temos no domínio).
- **LGPD**: rastrear posição de entregador e guardar endereço/coordenada de cliente é dado pessoal. Ter **base legal** (contrato/consentimento do entregador), **reter pelo tempo necessário** e **não expor publicamente**. Vale uma cláusula no contrato do entregador autorizando o rastreio durante o expediente.
- **Bateria do entregador**: rastreio contínuo consome bateria — definir intervalo (ex: a cada 10–15s) e parar quando ele encerrar o expediente.
- **Limites/custos** dos provedores de tiles e geocoding — **pesquisar e dimensionar** pro volume da loja (vocês tiveram ~497 pedidos em 30 dias = ~16/dia; tranquilo pros planos gratuitos, mas confirmar).
- **Privacidade do cliente no mapa**: nome do cliente sobre o pino só pro operador (tela interna), nunca exposto a terceiros.
- **Fallback sem coordenada**: se um pedido não geocodificar, mostrar numa lista lateral "sem localização" pro operador tratar manualmente.

---

## 6. Passo a passo sugerido (ordem de implementação)

1. **Banco**: criar tabela `entregadores` e colunas `lat/lng/entregador_id` em `pedidos`.
2. **Geocoding na criação do pedido**: escolher provedor, geocodificar e salvar lat/lng. Aproveitar coordenada quando já vier.
3. **Mapa básico** no `/gestor` com os **pinos dos pedidos** (já resolve o pedido principal do Tassiano: "ter o mapa com a localização dos pedidos pra facilitar criar rotas").
4. **Endpoint de posição do entregador** + um **PWA simples** pro entregador transmitir.
5. **Pinos de entregador** no mapa (moto + nome), atualizando por polling.
6. **Evoluções**: WebSocket pra tempo real, markercluster, app nativo pra background, e por fim **otimização automática de rota**.

---

## 7. Lista de pesquisa pro desenvolvedor
- Leaflet.js — documentação oficial e exemplos de `divIcon`/marcadores customizados.
- Política de uso de tiles do OpenStreetMap e planos de MapTiler / Mapbox / Stadia / Carto (limites e preço).
- Provedores de geocoding pro Brasil (precisão de CEP em Rio Preto): LocationIQ, Geoapify, Google, MapTiler — limites e preço.
- `navigator.geolocation.watchPosition` + Wake Lock API (manter tela ativa no PWA).
- Background geolocation no Android (Capacitor/Flutter/React Native) e permissões Android 13+.
- WebSocket vs Server-Sent Events para atualização ao vivo.
- Leaflet.markercluster (agrupamento de marcadores).
- LGPD aplicada a rastreamento de localização de colaboradores e clientes.
- (Futuro) OSRM / GraphHopper / Mapbox Optimization para otimização de rotas (VRP).

---

**Resumo do que o Tassiano quer pronto primeiro:** o **mapa com os pedidos marcados por pino** (passos 1–3 acima), para o operador montar rotas. O rastreio de entregador (passos 4–5) entra logo depois. Otimização automática é fase futura.
