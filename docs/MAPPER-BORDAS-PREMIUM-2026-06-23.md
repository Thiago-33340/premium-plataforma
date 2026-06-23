# Mapper de bordas Premium — Saipos v4 → Titan

Data: 2026-06-23  
Fonte principal: `cardapio_premium_detalhado_ingredientes_v4.xlsx`  
Artefato gerado: `data/premium-border-pdv-mapper-v1.json`

## Conclusão executiva

O problema não era só “falta de ficha”. O cardápio atual do Titan simplificou as bordas em opções genéricas, enquanto a Saipos/planilha trabalha com `codigo_pai + codigo_filho` para cada variação real.

Isso cria risco de:

- baixa de estoque em ficha errada;
- borda aparecendo em estilo onde ela não existe;
- Pizza Pequena usando código de Pizza Grande;
- duplicidade de baixa quando estilo de borda e recheio são tratados como a mesma coisa;
- criação indevida de item “Vulcões montados”, que não existe na operação.

## Decisões aplicadas no mapper

- A chave confiável é o código PDV/Saipos, não apenas o nome.
- `Vulcões montados` foi marcado como item ignorado operacionalmente. A baixa deve ocorrer nos recheios, bolinhas, frutas e bombons reais da ficha.
- Borda Vulcão doce aponta para operação/insumos de Finalização.
- Borda Vulcão salgada, Borda Pãozinho e Borda Tradicional apontam principalmente para Borda, com compartilhamento de Montagem quando o insumo produzido pertence a Montagem.
- Pizza Pequena precisa de grupos condicionais por estilo de borda, porque a Saipos tem um código pai para cada estilo.

## Diagnóstico do cardápio atual

### Pizza Grande + Borda Pãozinho

- Esperado pela planilha: 9 opções.
- Atual no cardápio: 10 opções genéricas.
- Faltando: Calabresa + Catupiry; Calabresa + Cheddar; Calabresa + Muçarela; Frango + Catupiry; Frango + Cheddar; Frango + Muçarela; Presunto + Catupiry; Presunto + Cheddar.
- Sobrando: Bacon; Catupiry; Cheddar; Chocolate ao Leite; Chocolate Branco; Mussarela; Ninho com Morango; Ninho com Uva; Parmesão.

### Pizza Grande + Borda Tradicional Recheada

- Esperado pela planilha: 6 opções reais de borda.
- Atual no cardápio: 10 opções genéricas.
- Sobrando: Bacon; Ninho com Morango; Ninho com Uva; Parmesão.

### Pizza Grande + Borda Vulcão

- Esperado pela planilha: 21 opções reais de borda.
- Atual no cardápio: 10 opções genéricas.
- Faltando: Chocolate ao Leite com Morango; Chocolate ao Leite com Uva; Chocolate Branco com Morango; Chocolate Branco com Uva; Doce de Leite com Coco; Ferrero Rocher; Muçarela com Oregano; Nutella; Nutella com Morango; Nutella com Uva; Raffaello; Vulcão Premium Ouro Branco; Vulcão Premium Sonho de Valsa.
- Sobrando: Bacon; Parmesão.

### Pizza Pequena

A Pizza Pequena está como produto único no Titan, mas a Saipos usa quatro códigos pai:

- Sem borda recheada: `6006199`
- Borda Vulcão: `6006156`
- Borda Pãozinho: `6006165`
- Borda Tradicional Recheada: `6006190`

Além disso, o catálogo atual trouxe códigos de Pizza Grande + Borda Pãozinho nos sabores da Pizza Pequena. Isso precisa ser corrigido antes de usar código como chave de baixa.

Modelo recomendado para Pizza Pequena:

- Manter um produto `Pizza Pequena`, se quisermos preservar a experiência simples do cliente.
- O grupo `Estilo de borda` recebe o código pai de cada estilo.
- Criar três grupos condicionais de recheio:
  - `Recheio da borda — Vulcão`, visível só quando estilo = `Borda Vulcão`;
  - `Recheio da borda — Tradicional`, visível só quando estilo = `Borda Tradicional Recheada`;
  - `Recheio da borda — Pãozinho`, visível só quando estilo = `Borda Pãozinho`.
- O grupo antigo genérico de recheio deve ser substituído/ocultado.

## Pendências operacionais encontradas

- `Rolinho de presunto` aparece na planilha, mas não existe como item de estoque atual. O estoque tem `Rolinho de muçarela` e `Rolinho de presunto e muçarela`.
- Morango e uva aparecem como “metades”; o estoque ainda precisa de fator de conversão para baixa perfeita.
- Algumas promoções/especiais do dia têm bordas próprias na planilha, mas não existem como produtos equivalentes no catálogo atual do Titan.

## Ajustes já feitos no código

- `GET /api/est/fichas-cardapio` agora expõe `codigo_externo` em produtos/opções.
- `GET /api/admin/catalogo` agora expõe `codigo_externo`.
- `POST/PATCH /api/admin/produto` e `POST/PATCH /api/admin/opcao` aceitam código PDV/Saipos.
- A tela admin passou a mostrar/editar Código PDV/Saipos.
- A tela de mesas passou a suportar `condicao.mostrar_se.igual_a`, igual à loja pública.
- `project-state/tasks.json` colocou `task-f2-026` em andamento com o mapper v1 como artefato oficial.

## Próximo passo recomendado

Criar uma migração idempotente baseada no mapper para:

1. preencher os códigos pai dos produtos/estilos;
2. ocultar opções genéricas incorretas de borda;
3. inserir as opções faltantes de Pãozinho/Vulcão/Tradicional com seus códigos filhos;
4. remodelar Pizza Pequena com grupos condicionais;
5. importar fichas de borda usando `ingredientes_normalizados`;
6. validar `GET /api/catalogo` e `GET /api/est/fichas-cardapio?usuario_id=thiago`;
7. rodar smoke antes de deploy.

Esse ajuste deve ser tratado como configuração da Premium, não como padrão fixo do Titan para todos os clientes.
