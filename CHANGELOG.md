# Changelog

## 1.4.0 — Automation Studio

- Adiciona motor local de workflows em TypeScript/Node.js, iniciado junto com o Kamy.
- Adiciona editor visual com nós manuais, webhook, schedule, HTTP, condições, transformação, IA, JavaScript, Python e log.
- Adiciona histórico de execuções e validação de grafos para impedir ciclos.
- Adiciona saídas condicionais true/false e importação de operações HTTP a partir de especificações OpenAPI.
- Adiciona catálogo inicial com 31 modelos de integração via HTTP genérico. Adaptadores nativos OAuth ainda serão desenvolvidos.
- Adiciona serviço de automação separado no Docker Compose com dados persistentes.
- Atualiza a identidade visual para preto/grafite com detalhes verdes.
- Execução de JavaScript/Python é opt-in e destinada a código confiável do próprio usuário; ainda não é sandbox de segurança.


## Cockpit local — atualização

Esta atualização mantém a identidade visual existente e preserva o mascote oficial em `assets/kamy-mascot.svg` e o símbolo reduzido em `assets/kamy-mark.svg`.

O README agora descreve o cockpit atual, incluindo coworkers independentes, workspaces de browser, trilha de auditoria, verificação de políticas antes da execução e o comportamento diferente entre Docker e instalação nativa.

O fluxo recomendado para testar a experiência é:

1. iniciar com `docker compose up --build -d`;
2. abrir `http://127.0.0.1:8000`;
3. escolher um coworker, enviar uma mensagem que proponha uma ação e revisar a pendência em **Audit trail**;
4. aprovar ou rejeitar a ação e observar o resultado no workspace do agente.

Nenhum segredo, `.env`, banco local ou diretório `data/` deve ser commitado.
