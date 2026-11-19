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

## Integração do fluxo de laudos em 19/11/2026

A branch local `trabalho/laudos-homologacao` parte da API v0.2.1 e do painel do pacote de homologação. A API já segue a organização do IAkí em controllers, casos de uso, repositórios e middlewares. A estrutura e o histórico de migrations do piloto foram preservados.

| Tela | Endpoint | Contrato | Verificação local |
|---|---|---|---|
| Sessão e perfil | `POST /sessions`, `POST /sessions/refresh`, `POST /sessions/logout`, `GET /users/me` | Credenciais no login, cookie HttpOnly rotativo, perfil e token de acesso | Suíte da API |
| Lista e detalhe | `GET /reports`, `GET /reports/:id` | Lista paginada, detalhe com revisão, dados do rascunho e histórico | Suíte da API e contratos do painel |
| PDF assinado | `GET /pdf/:id` | Bytes autenticados, abertos como Blob | Suíte da API com dados sintéticos |
| Novo rascunho e edição | `POST /reports/drafts`, `PATCH /reports/:id` | Rascunho de água ou solo, edição com `{revision,draft}` | Contratos do painel e integração PostgreSQL |
| Importar PDF | `POST /reports/drafts/import-pdf` | Multipart com `file`, `identification`, `customerName` e `notes` | Contratos do painel e integração PostgreSQL |
| Revisão técnica | `POST /reports/:id/submit`, `PATCH /reports/:id/validate`, `POST /reports/:id/return` | `{revision}`, devolução para rascunho e conflito HTTP 409 | Contratos do painel e integração PostgreSQL |

O painel autenticado expõe revisão para ADMIN. ANALISTA pode preparar e enviar. SUPER_ADMIN continua na área de plataforma no painel e segue as regras de escopo da API para ações laboratoriais. O modo demonstrativo usa prévias locais.

As duas migrations originais foram aplicadas em PostgreSQL 16 local, no banco `iakilab_test`. Os builds passaram. Foram executados 37 testes de API e 14 testes do painel. Os casos com dois laboratórios cobrem leitura e edição cruzadas, perfil sem permissão, edição desatualizada, validação concorrente, histórico e importação de PDF privado.

Pendente confirmar o fluxo visual no navegador, a sessão entre as origens publicadas e a emissão com A1. O original importado tem prévia local antes do envio. A API existente de download serve o PDF final verificado.

## Consolidação do IAkiLab em 19/11/2026

A branch `trabalho/iaki-lab` conserva os dois pacotes do piloto:

- `iakilab-api/` reúne Fastify, Prisma, PostgreSQL, autenticação, permissões por vínculo, operação laboratorial e gestão SaaS.
- `iakilab-painel/` é a exportação React/Vite conectada a essa API pelas variáveis `VITE_API_URL` e `VITE_SECURE_API_ENABLED`.

Referências consultadas: `infojanio/iaki_backend:stackblitz` (estrutura em camadas, autenticação, planos e assinaturas), `infojanio/iaki_painel:stackblitz` (cadastro, edição e escolha de plano), `infojanio/labmoura-api:main` (PDF, assinatura e QR) e `infojanio/labmoura-web:vps` (consulta histórica por ID e download). O destino `infojanio/iakilab-api` estava sem branch remota na inspeção.

| Área autenticada | Operações |
|---|---|
| Plataforma | `GET/POST /laboratories`, `GET/POST /plans`, `PATCH /plans/:id`, `GET/POST /subscriptions`, exclusivos de SUPER_ADMIN |
| Laboratório | Lista, criação e edição de clientes e amostras conforme perfil, `GET /dashboard/metrics` e listagem recente de laudos |
| Equipe | `GET /users?laboratoryId=…`. ADMIN consulta a própria equipe. SUPER_ADMIN seleciona um laboratório ativo |
| Laudos | Rascunho, importação privada, revisão e histórico do piloto. O detalhe permite reabrir o original importado em `GET /pdf/:id?variant=original` com bearer e validação de integridade |

O preço é recebido como decimal textual e persistido como Decimal. A configuração de armazenamento usa GB decimais. A vigência da assinatura usa datas UTC com início inclusivo e fim exclusivo. Uma renovação pode ser cadastrada como outro período, mantendo o histórico. O cadastro recusa sobreposições entre períodos ativos do mesmo laboratório e conflitos concorrentes. Os limites são cadastrais nesta etapa.

A branch `vps` do LabMoura consulta laudos por `/reports/:id` e monta URLs legadas de PDF por nome. Antes de migrar, verificar na homologação os dois formatos de URL contra dados sintéticos e conferir um QR histórico, sem reaproveitar arquivos reais como fixtures. Os links existentes continuam atendidos pelo legado. A nova consulta pública, emissão A1, convites de usuários, suspensão comercial e aplicação de franquias têm implementação pendente.

Validação local em PostgreSQL 16: schema com as duas migrations do piloto, build e 37 testes da API, build e 14 testes do painel. A integração verificou recusa de operações de plataforma para ADMIN local, bloqueio de sobreposição concorrente, acesso autenticado ao PDF original e recusa entre laboratórios. A interface no navegador e o ambiente da Hostinger não foram validados nesta etapa.

## Organização do backend no padrão IAkí em 19/11/2026

A comparação com `infojanio/iaki_backend:stackblitz` mostrou que o piloto concentrava validação, entrada HTTP e execução em arquivos `routes.ts`. O backend agora registra as rotas por módulo e delega cada operação a um controller próprio. Os controllers tratam Zod, status e resposta HTTP. Os casos de uso resolvem vínculo e permissão e delegam a persistência às interfaces de repositório. A composição em `src/use-cases/_factories/` injeta os repositórios Prisma no servidor e as dependências de teste nas suítes.

Exemplos de fluxo:

- Planos: `http/controllers/plans/routes.ts` → `create-plan.ts` → `use-cases/plans/manage-plans.ts` → `repositories/platform-repository.ts` → `repositories/prisma/prisma-platform-repository.ts`.
- Revisão de laudos: `http/controllers/report-drafts/routes.ts` → `validate-report.ts` → `use-cases/reports/manage-report-drafts.ts` → transição condicional no repositório Prisma, com histórico e escopo por laboratório.

A composição mantém casos de uso relacionados agrupados por domínio e compartilha os repositórios Prisma existentes. Foram preservados URLs, payloads, status HTTP, configuração de sessão, schema, migrations e consumo pelo painel. Validação local com TypeScript, build e 37 testes da API, incluindo PostgreSQL com contas de dois laboratórios.
