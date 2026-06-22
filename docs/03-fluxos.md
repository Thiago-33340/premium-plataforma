# Titan Khardela — Fluxos Principais

Este documento descreve os fluxos operacionais que devem ser estabilizados antes do Command Center visual.

## Fluxo de trabalho técnico

```text
Entrada
→ Triagem
→ Planejamento
→ Desenvolvimento
→ Revisão
→ Teste
→ Deploy
→ Validação
→ Documentação
→ Concluído
```

## Fluxo de pedido

```text
Cliente acessa loja
→ escolhe itens
→ envia pedido
→ pedido entra no backend
→ gestor/staff acompanha
→ possível baixa de estoque
→ status do pedido muda
→ histórico fica disponível
```

Pendências:

- documentar payload de pedido;
- mapear estados;
- validar baixa automática.

## Fluxo de estoque

```text
Gestor cadastra/ajusta produto
→ produto pertence a setores
→ entradas/saídas geram movimentos
→ fichas e produção consomem insumos
→ contagens auditam o saldo
```

Pendências:

- padronizar contratos de API;
- testar conversões de unidade;
- classificar rotas antigas `/api/estoque/*`.

## Fluxo de produção

```text
Item produzido tem ficha técnica
→ ficha tem uma ou mais porções
→ porção tem ingredientes
→ produção roda em transação
→ insumos são baixados
→ item produzido recebe entrada/movimento
```

Pendências:

- completar fichas;
- auditar custo/rendimento;
- documentar transação.

## Fluxo de contagem

```text
Gestor define setor e itens
→ colaborador inicia contagem
→ horário e usuário são registrados
→ colaborador informa quantidades
→ sistema salva itens
→ colaborador encerra
→ gestor audita
```

Pendências:

- documentar regras de reabertura/correção;
- criar tela de divergências;
- definir alertas.
