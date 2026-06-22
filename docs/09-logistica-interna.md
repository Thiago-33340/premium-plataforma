# Titan Khardela — Logística Interna

O Titan deve operar com processo, não com tarefas soltas.

## Pipeline oficial

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

## Status oficiais

- `nao_iniciado`
- `planejado`
- `em_andamento`
- `bloqueado`
- `em_revisao`
- `em_teste`
- `pronto_para_deploy`
- `online`
- `concluido`
- `pausado`
- `cancelado`

## Prioridades

- `critica`
- `alta`
- `media`
- `baixa`

## Categorias

- `feature`
- `bug`
- `infra`
- `documentacao`
- `refatoracao`
- `seguranca`
- `devops`
- `banco_de_dados`
- `integracao`
- `ux_ui`
- `automacao`
- `logistica`

## Responsabilidade

Mesmo com Thiago sozinho hoje, cada tarefa deve poder registrar:

- responsável humano;
- ferramenta atuante;
- revisor;
- aprovador;
- bloqueios;
- próximo passo.
