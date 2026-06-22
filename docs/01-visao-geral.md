# Titan Khardela — Visão Geral

O Titan Khardela é a camada de comando, operação e governança do ecossistema que está nascendo a partir da plataforma Premium. O objetivo não é apenas ter um site funcionando: é construir uma plataforma auditável, documentada, escalável e controlável por Thiago.

## Objetivo estratégico

Transformar código, infraestrutura, documentação e operação real em uma fonte de verdade única.

```text
Código real + Infra real + Estado operacional + Documentação viva
```

## Núcleo atual analisado

Raiz atual:

```text
C:\Users\Thiago Ribeiro\Titan\workspace\premium-plataforma
```

Stack detectada:

- Node.js CommonJS.
- Backend HTTP nativo em `server-pg.js`.
- PostgreSQL via biblioteca `pg`.
- Frontend estático em `public/`.
- Dockerfile com porta `8080`.
- Deploy real a confirmar/documentar no EasyPanel.

## Situação atual

O sistema já tem módulos reais em funcionamento ou evolução:

- Loja e pedidos.
- Admin/Gestor.
- Estoque v2.
- Produção e fichas técnicas.
- Contagem e auditoria.
- Compras/listas/fornecedores.
- Mesas/caixa.
- Usuários/permissões.
- Infra/deploy.

O principal risco atual é o crescimento rápido sem uma camada estável de documentação, contratos e estado operacional.

## Direção correta

1. Inventariar.
2. Organizar.
3. Documentar contratos.
4. Validar com testes/smoke.
5. Criar o Command Center.
6. Integrar GitHub, EasyPanel, banco e logs.
