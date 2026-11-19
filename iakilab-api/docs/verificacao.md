# Verificação da entrega — 30/10/2026

## Executado

- Instalação com `--ignore-scripts`, após revisão dos scripts; nenhuma migration no install/start/build.
- Geração do Prisma Client 6.1.0 sem conexão com banco.
- `prisma validate`: schema válido.
- `npm run typecheck` e `npm run build`.
- 30 testes automatizados em Fastify inject e armazenamento local sintético: login correto/incorreto, perfis, laboratório, listagem/detalhe/PDF, tenant injection, sessão e usuário/vínculo desativados, origem, limite de tentativas, refresh e replay, logout, expiração, reset de senha, integridade do PDF e diretórios exclusivos.
- `npm audit --omit=dev`: zero vulnerabilidades conhecidas reportadas na consulta desta entrega. Isso não substitui revisão contínua.
- ZIP conferido para excluir node_modules, build, .env, frontend de referência, anexos, banco e material de certificado.

## Preparado, mas não executado

- Seis testes de integração PostgreSQL em `tests/postgres.integration.test.ts`: isolamento dos repositories reais, seleção da versão atual, FKs de tenant, evidência de assinatura, autenticação persistente e rotação concorrente.
- A inicialização de um servidor PostgreSQL descartável foi bloqueada pelas permissões de usuário do ambiente. Portanto, migration e transações não foram verificadas contra PostgreSQL nesta sessão. A suíte normal reporta esses seis testes como skipped.
- Provisionamento LabMoura e usuários: scripts disponíveis, não executados contra banco real.
- Transporte de e-mail: interface e testes com adapter em memória; adapter SMTP/provedor ainda ausente na factory real. Recuperação retorna 503 enquanto não configurado.
- Teste de navegador com frontend e política de cookies entre origens: pendente dos domínios/ambiente de homologação e do ajuste de download autenticado.
- Assinatura A1 e validação criptográfica, emissão, importação e migração: módulos futuros, sem endpoints habilitados.

Nenhum serviço de produção foi alterado, nenhum certificado foi baixado e nenhum dado dos PDFs anexos foi incorporado ao código.

## Evolução do backend — 19/11/2026

Aplicadas as migrations inicial e de operações de laboratório em PostgreSQL 18.6 local descartável. Executados typecheck, build e 37 testes, incluindo sete cenários de integração com PostgreSQL e 30 testes HTTP/armazenamento sem banco real. A nova suíte de integração exercita dois laboratórios, três usuários, cadastro e isolamento, revisão concorrente, trilha de auditoria e importação de PDF sem exposição como assinado. O PDF da suíte de upload é um conteúdo sintético para testar o tratamento de bytes do fluxo.

O ambiente publicado do Sites e os serviços de produção do LabMoura ficaram fora da execução. A abertura de PDF no navegador continua dependente do ajuste descrito no guia. Os testes de leitura validam autorização e integridade dos bytes. Não certificam a assinatura criptográfica do PDF.

## Piloto de leitura — API v0.2.1

O processo Node executou a API compilada após a correção das importações de bcryptjs.
Com duas organizações fictícias em PostgreSQL descartável, os serviços do painel
confirmaram login, renovação única concorrente, logout, listagem, detalhe, leitura
autenticada de um PDF sintético e bloqueio de leitura cruzada. A interface compilou
e a rota do painel respondeu pelo Vite. A execução visual em Chromium ficou
pendente porque o ambiente bloqueou a inicialização do navegador.
