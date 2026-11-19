# Schema e contratos da primeira entrega

## Evidência inspecionada em 30/10/2026

- `infojanio/labmoura-api`: package.json, schema, upload, download, rotas e wrappers de PDF/assinatura. Árvore consultada: `19c5b884580bd5af568f8881ce99405808d7622f`.
- `infojanio/iaki_backend`, branch `stackblitz`: autenticação, refresh, middlewares e recuperação. Árvore consultada: `ca275cbc7584ead43d0b18d1f08c4b0c0263e5b8`.
- Fonte do Site `appgprj_6a74967194f48191adef9a62bfcc50ed`, branch `main`: DTOs Report/User/StructuredReportDraftDTO, serviços auth/reports/api e telas. Apenas leitura, sem push ou deploy.
- Dois modelos anexados de água e solo foram extraídos e visualizados. Serviram apenas à análise de estrutura; os arquivos e seus dados não integram o repositório.

O backend antigo ainda contém modelos de comércio e não aplica isolamento de laboratório ao Report. O upload usa QR sobre coordenadas fixas e pode persistir `signedPdfUrl` após falha de assinatura; o assinador registra comando com senha e verifica apenas existência/tamanho do arquivo. O nome da propriedade não prova assinatura criptográfica. Reaproveitar a finalidade dessas integrações requer novos adapters e testes.

## Modelo inicial (`prisma/schema.prisma`)

| Modelo | Finalidade e restrições |
|---|---|
| Laboratory | Tenant, slug único, identificação e bloqueio ativo |
| User | Identidade global e senha hash; apenas SUPER_ADMIN é papel global privilegiado |
| LaboratoryMembership | Chave composta laboratório/usuário, ADMIN ou ANALISTA, vínculo ativo |
| Session / RefreshUse | Escopo da sessão, hash atual de refresh, hashes consumidos para detectar replay |
| PasswordReset | Token por hash, prazo e consumo único; reset revoga sessões |
| Report | UUID, tenant, identificação única no tenant, tipo, estágio, snapshot de rascunho e revisão |
| ReportVersion | Versão, snapshot congelado, validação e emissão separadas; evidência da assinatura |
| ReportFile | Original, emitido ou assinado; chave privada, tamanho e SHA-256; FK composta com tenant |
| Plan / Subscription | Estrutura reservada para adaptar o módulo SaaS do IAkí; sem cobrança na primeira fase |

FKs compostas impedem uma versão de apontar para laudo de outro laboratório e um arquivo de apontar para versão de outro tenant. Usuários e planos são globais; acesso aos usuários do laboratório passa pelos vínculos. IDs de autoria em versões são reservados; o módulo de gravação deverá validar autor e vínculo, e criar histórico auditável em transação.

`Report.stage`: DRAFT → AWAITING_VALIDATION → VALIDATED → ISSUED. `ReportVersion.signatureStatus`: NOT_REQUESTED / PENDING / FAILED / VERIFIED, independente do estágio. Nenhum endpoint implementado nesta entrega executa essas transições.

A compatibilidade visual do painel mapeia DRAFT para RASCUNHO, AWAITING_VALIDATION para AGUARDANDO_VALIDACAO e VALIDATED/ISSUED ainda sem assinatura para VALIDADO. ASSINADO exige a versão mais recente emitida, estado VERIFIED, data de verificação e arquivo assinado com hash correspondente. `emissionStatus` e `signatureStatus` mantêm a distinção que os quatro estados atuais do frontend não conseguem representar integralmente.

## Evolução dos dados analíticos

O JSON de rascunho comporta o DTO efetivamente encontrado no painel; não é um contrato de gravação liberado. Na autoria, adicionar validação Zod específica por tipo e tabelas com FK composta por laboratório:

- Client e CollectionPoint; OrderOfService e Sample com código, matriz, coleta, recebimento, município, origem, coletor, coordenadas e chuva.
- WaterReportData com referência normativa e enquadramento. AnalysisResult por amostra, parâmetro, grupo físico-químico/bacteriológico, resultado textual original, valor numérico opcional, unidade, referência, método e data. Valores como `<0,1`, `Ausente` e vírgula decimal não devem perder sua representação original.
- SoilReportData com propriedade, solicitante, cultura e envio de resultados; SoilSample com código analítico, identificação/talhão e profundidade. Relação 1:N: não limitar o banco a três amostras; três é a paginação visual do modelo anexado. Resultados por amostra e parâmetro, com unidades distintas mesmo quando o nome se repete.
- PDF_UPLOAD preserva o arquivo original e hash. Dados ausentes permanecem ausentes; não preencher resultados inferidos por OCR ou IA como confirmados. QR em área aprovada/página adicional, nunca cobrindo o conteúdo do cliente; assinatura sempre depois da inclusão do QR. PDFs já assinados precisam de política específica antes de qualquer alteração.
- ReportVersion.snapshot mantém identidade do laboratório/cliente e o conteúdo usado naquela emissão; atualizações cadastrais posteriores não reescrevem laudos emitidos.

## Endpoints implementados

URLs sem prefixo `/v1` para compatibilidade com os serviços do Site. JSON em UTF-8; datas ISO 8601. Erros `{code, message?}`. 400 entrada inválida, 401 sessão/token inválido, 403 papel/tenant negado, 404 registro fora do tenant ou inexistente, 409 conflito/arquivo assinado indisponível, 429 limite e 503 adapter de recuperação ausente.

| Método e rota | Entrada | Resposta / autorização |
|---|---|---|
| GET /health | — | 200 `{status:"ok",environment:"homologation"}` |
| POST /sessions | `{email,password,laboratoryId?}` | 200 `{accessToken}` + refresh HttpOnly em cookie. Origin obrigatório e permitido |
| POST /sessions/refresh | Cookie; sem JSON | 200 `{accessToken}`, cookie rotacionado; Origin obrigatório |
| POST /sessions/logout | Cookie | 204, revoga sessão e apaga cookie; Origin obrigatório |
| POST /password/forgot | `{email}` | 202 genérico quando transporte configurado; 503 sem adapter |
| POST /password/reset | `{token,newPassword}` | 204, token consumido uma vez e sessões revogadas |
| GET /users/me | Bearer | 200 User do frontend, sem hash ou refresh token |
| GET /laboratories/me | Bearer; `laboratoryId?` para SUPER_ADMIN | 200 `{id,name,active}`; contrato novo, distinto do LaboratoryDTO comercial completo |
| GET /users | Bearer, `laboratoryId?` | 200 `{users:[{id,name,email,role,active}]}`; ADMIN/SUPER_ADMIN apenas |
| GET /reports | Bearer; filtros abaixo | 200 `{reports,total,totalPages}` |
| GET /reports/:id | Bearer; `laboratoryId?` | 200 Report diretamente, conforme normalização atual |
| GET /pdf/:id | Bearer; `laboratoryId?` | 200 bytes application/pdf, private/no-store; 409 quando sem assinatura verificada |

`laboratoryId` nunca concede acesso: para ADMIN/ANALISTA deve coincidir com a sessão; discrepância gera 403. SUPER_ADMIN precisa indicar tenant explícito na sessão ou query e não obtém leitura global por omissão.

Usuário com mais de um vínculo ativo precisa informar `laboratoryId` no login; sem seleção recebe 409 LABORATORY_SELECTION_REQUIRED. O seletor de laboratório ainda precisa ser acrescentado ao frontend se esse cenário for habilitado. Para o administrador inicial do LabMoura há um único vínculo.

Filtros `/reports`: `page` inteiro >=1 (padrão 1), `perPage` 1..100 (padrão 20), `search` até 200 caracteres, `status` do DTO atual, `startDate` e `endDate` YYYY-MM-DD válidos, `laboratoryId` UUID opcional. Datas de filtro usam criação; limite final é inclusivo em dias UTC, implementado como início exclusivo do dia seguinte. O frontend deve comunicar essa convenção ou ajustar o fuso em versão futura.

Exemplo de perfil:

```json
{"id":"<user-uuid>","name":"Administrador","email":"<email>","role":"ADMIN","laboratoryId":"<laboratory-uuid>","laboratoryName":"LabMoura"}
```

O Report devolve os campos legados permitidos existentes no snapshot (cliente, contato, coleta, análise e notas), mais id, tenant, identificação, tipo, status visual, estado de emissão e assinatura, criação e `draftData`. `signedPdfUrl` é relativo (`/pdf/<report-id>`) e aparece apenas com evidência válida. Não retorna storageKey nem links públicos irrestritos. O frontend atual ignora os campos novos, mas já normaliza esse formato.

## Próximos módulos e critérios de aceite

1. **Homologação persistente**: executar testes PostgreSQL, configurar banco/armazenamento novos e transporte de e-mail. Provisionar usuários reais somente no ambiente separado.
2. **Integração do painel em cópia de homologação**: CORS/cookies, login, expiração, download Blob e dados reais sem habilitar rotas simuladas. Teste no navegador, principalmente política de cookies entre domínios.
3. **Autoria**: POST/PATCH /reports/drafts, tipos água/solo, importação multipart e limite de 20 MB, revisão otimista e histórico. Não reutilizar POST legado que emite automaticamente.
4. **Validação**: ação separada por ADMIN, snapshot e trilha de revisão; ANALISTA salva rascunho e solicita validação. Critério técnico de independência do revisor deve ser definido pelo laboratório antes de ativar essa regra.
5. **Emissão**: versão imutável, QR seguro e idempotência. Original permanece intacto.
6. **Assinatura A1**: worker isolado, secret store e verificação criptográfica. Falha permanece FAILED sem URL de documento assinado e sem publicação silenciosa de versão anterior.
7. **Público e legado**: resolvedor por IDs antigos, URLs antigas mantidas e respostas mínimas aprovadas; nenhum documento antigo será reprocessado automaticamente. A integridade e assinatura de arquivos migrados precisam ser verificadas, não presumidas por signedPdfUrl.
8. **SaaS**: adaptar planos, limites e assinaturas por laboratório, sem relação com Store/cashback.

## Atualização de 19/11/2026

A segunda migration adiciona Client, Sample e ReportEvent. Para os endpoints acrescentados e os ajustes do painel, consulte [integração do painel](integracao-painel.md). Os contratos e os itens futuros descritos acima registram a entrega original de 30/10.
