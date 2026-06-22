# Titan Khardela — Decisões Técnicas

As decisões estruturadas estão em `project-state/decisions.json`.

## Decisões iniciais

### Criar `project-state/`

Motivo: o Titan precisa de uma fonte operacional que ferramentas e pessoas consigam ler sem depender de memória solta.

Impacto: base para o Command Center.

### Não iniciar Command Center visual antes de validar inventário

Motivo: evitar dashboard bonito em cima de dados incompletos.

Impacto: prioridade para mapa, rotas, banco e pendências.

### Tratar `/api/estoque/*` como legado até revisão

Motivo: existe o fluxo novo `/api/est/*`.

Impacto: reduz confusão no módulo de estoque.

## Como registrar novas decisões

Toda decisão relevante deve entrar em `project-state/decisions.json` com:

- data;
- decisão;
- motivo;
- impacto;
- módulos afetados;
- responsável;
- status.
