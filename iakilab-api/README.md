# IAkiLab API

Backend multi-tenant para o painel IAkiLab criado no ChatGPT Sites. O LabMoura é a organização piloto. A base segue a arquitetura do IAkí com Node.js, TypeScript, Fastify, Prisma e PostgreSQL, usando controllers, casos de uso, factories e repositórios de domínio laboratorial.

## O que está disponível

| Módulo | Entrega |
|---|---|
| Sessão | Login, refresh com rotação, logout, perfil, papéis e escopo de laboratório |
| Operação | Cadastro, leitura, edição e arquivamento de clientes e amostras |
| Laudos | Listagem paginada, detalhe, rascunhos de água e solo, revisão otimista, envio para validação, validação e devolução com trilha |
| PDF | Importação privada como rascunho, preservação dos bytes originais e leitura privada de laudo emitido com evidência de assinatura já verificada |
| Painel | Contadores por laboratório e leitura de laboratórios, planos e assinaturas para SUPER_ADMIN |

A emissão prepara o QR, assina e verifica o PDF antes da publicação. O acervo histórico tem um importador próprio com conferência sem gravação. Veja [emissão e legado](docs/emissao-e-legado.md) e [implantação na Railway e migração da Hostinger](docs/railway-labmoura.md).

## Rodar no Linux e VS Code

Requisitos: Node.js 22 ou superior, npm e PostgreSQL. Com Docker Compose, o serviço opcional usa a porta local 5433.

1. Abra a pasta `iakilab-api` no VS Code. No terminal, defina `IAKILAB_DATABASE_PASSWORD` com uma senha nova e rode `docker compose -f compose.homolog.yaml up -d`. Também é possível usar uma instância PostgreSQL separada com banco `iakilab`.
2. Copie `.env.example` para `.env`. Use a senha configurada no PostgreSQL e gere um JWT secret exclusivo, por exemplo com `openssl rand -hex 32`. A configuração padrão aponta para a instância local. Revise o host antes de aplicar migrations.
3. Instale as dependências e prepare a API:

```bash
npm ci --ignore-scripts
npm run db:generate
node --env-file=.env --import tsx scripts/migrate-homolog.ts
```

4. Defina `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` no ambiente. A senha deve ter ao menos 12 caracteres e no máximo 72 bytes.

```bash
node --env-file=.env --import tsx scripts/bootstrap.ts
node --env-file=.env --import tsx src/server.ts
```

A API sobe em `http://localhost:3333`. Use `GET /health` para confirmar a inicialização. Para outro usuário de homologação, confira as variáveis de `scripts/create-member.ts`. O bootstrap cria o LabMoura com administrador e recusa redefinir uma conta existente.

Se um volume de Compose já foi inicializado com `iakilab_homolog`, a troca de `POSTGRES_DB` no YAML só afeta novas inicializações. Preserve o volume existente e crie o banco de homologação aceito antes de executar migrations.

## Integrar com o painel do Sites

Veja [integração do painel](docs/integracao-painel.md) para rotas, a configuração do frontend e o ajuste do PDF autenticado. Valide a cópia do painel primeiro e preserve a operação da VPS. Use dados fictícios no primeiro teste de isolamento.

## Verificação

```bash
npm run typecheck
npm run build
npm test -- --maxWorkers=1 --minWorkers=1
```

Em um PostgreSQL local exclusivo chamado `iakilab_test`, aplique as migrations e execute a suíte com a variável `RUN_POSTGRES_TESTS=true` e `DATABASE_URL` configurada. Confira [as verificações realizadas](docs/verificacao.md).


Para incluir os cenários A1 nessa suíte, gere credenciais sintéticas em um diretório temporário privado, usando o Python preparado conforme [emissão e legado](docs/emissao-e-legado.md):

```bash
export RUN_POSTGRES_TESTS=true
export TEST_A1_DIRECTORY="$(mktemp -d)"
export TEST_A1_PYTHON="$PWD/.venv/bin/python"
"$TEST_A1_PYTHON" tests/create-a1-fixtures.py "$TEST_A1_DIRECTORY"
npm test -- --maxWorkers=1 --minWorkers=1
```
