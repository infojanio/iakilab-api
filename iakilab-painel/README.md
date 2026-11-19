# IAkiLab — Frontend Fase 1

Evolução do projeto **LabMoura Laudos**, no mesmo projeto Sites `appgprj_6a74967194f48191adef9a62bfcc50ed`.

## Entrega

- React 19 + TypeScript + Vite, React Router e Lucide.
- Identidade IAkiLab; LabMoura como contexto de laboratório.
- Sidebar fixa no desktop e menu móvel, breadcrumbs e menu de perfil.
- Painel do laboratório: seis indicadores, gráficos, atividade, últimas emissões e exportação CSV demonstrativa.
- Laudos: busca por cliente/identificação, período, status, paginação, detalhes, coleta, resultados e histórico.
- Formulário em quatro etapas: cliente, amostra, análises e revisão; parâmetros dinâmicos e prévia sem emissão.
- Validação de CPF/CNPJ (dígitos verificadores), obrigatoriedade, e-mail e coerência de datas.
- Consulta pública independente da API administrativa. Código de exemplo: `DEMO-IAKILAB`. QR pode abrir `/consulta?code=...`.
- Clientes e amostras: tabelas, pesquisa, filtros, formulários de cadastro/edição e estrutura do histórico. Gravação indisponível.
- SaaS: dashboard, laboratórios, editor de estrutura de planos, assinaturas, usuários e configurações.
- Modais com Escape, retenção de foco e restauração de foco; labels, mensagens e navegação por teclado.
- AuthContext: user, isAuthenticated, isLoading, signIn, signOut, refreshSession.
- Rotas privadas com perfis; acesso administrativo real exige validação do servidor.
- Clientes HTTP e serviços separados de páginas; DTOs com laboratoryId e campos Report preservados do pacote anterior.
- Normalização de arrays, reports, items, data e metadados paginados; respostas incompatíveis produzem erro explícito.

## Acessos

| Rota | Finalidade |
|---|---|
| `/` | Redireciona à demonstração identificada |
| `/login` | Interface de autenticação e recuperação |
| `/consulta` | Consulta pública demonstrativa |
| `/demo/app` | Demonstração do laboratório sem sessão |
| `/demo/app/reports` | Lista filtrável de exemplos |
| `/demo/app/reports/new` | Cadastro sem persistência |
| `/demo/app/reports/demo-1` | Detalhes de exemplo |
| `/demo/platform` | Demonstração SaaS |
| `/app/*` | Área privada ADMIN/ANALISTA, login obrigatório |
| `/platform/*` | Área privada SUPER_ADMIN, login obrigatório |

Aliases anteriores (`laudos`, `novo`, `clientes`, `amostras`, `validacao`, `configuracoes`) foram preservados com redirecionamento às rotas novas. Os aliases privados continuam privados.

## Estado da integração

**Nenhuma funcionalidade está conectada à produção nesta entrega.** Os endpoints da API atual não possuem contrato de autenticação e isolamento multi-tenant validado para este frontend. A disponibilidade pública de uma rota não comprova autorização para expor registros privados.

`VITE_API_URL` exige um endereço explícito para a API do IAkiLab. A configuração local está em `../README-HOMOLOGACAO.md`.

`VITE_SECURE_API_ENABLED=false` é o padrão. A flag só deve ser habilitada depois de validar os contratos e configurar a **nova API autenticada**. Não basta ativá-la na API legada. A flag é uma proteção de configuração; não substitui as verificações de autorização do servidor.

Tokens de acesso ficam somente na memória; refresh espera cookie HttpOnly seguro do backend. Resposta 401 limpa a sessão e redireciona as rotas protegidas. Não há senhas, tokens, dados de formulários, certificados A1 ou chaves em localStorage, sessionStorage ou banco interno do Sites.

POST /reports, POST /reports/upload-pdf, validação e assinatura permanecem bloqueados inclusive na camada de serviços, sem dependência dos botões. PDFs demonstrativos não são emitidos. O componente de PDF real aceita apenas URLs `/pdf/` da origem configurada; a API autoriza cada leitura pelo token da sessão, e o painel usa o PDF recebido como Blob. Autenticidade de assinatura não é inferida da existência de uma URL de PDF.

## Contratos pendentes (propostas a confirmar)

Os caminhos a seguir são propostas do frontend para a nova API, **não endpoints existentes confirmados**:

| Recurso | Contratos necessários |
|---|---|
| Autenticação | POST /sessions, POST /sessions/refresh, POST /sessions/logout, GET /users/me |
| Recuperação | POST /password/forgot; confirmação/reset a definir no backend |
| Usuário autenticado | id, name, email, role (SUPER_ADMIN/ADMIN/ANALISTA), laboratoryId e laboratoryName |
| Laudos | GET /reports paginado com search, status, datas e laboratório; GET /reports/:id |
| Rascunhos | POST /reports/drafts e PATCH /reports/:id, sem geração/assinatura automática |
| Validação | PATCH /reports/:id/validate com autorização e trilha de auditoria |
| Assinatura | POST /reports/:id/sign; execução A1 exclusivamente no servidor |
| PDF privado | GET /reports/:id/pdf com autorização, política de download e expiração |
| Consulta pública | GET /public/reports/verify/:code; resposta mínima sem PII, situação criptográfica e permissão de download |
| Dashboard | GET /dashboard/metrics com totais agregados, série mensal, distribuição e atividades |
| Clientes | CRUD /clients, histórico /clients/:id/reports |
| Amostras | CRUD /samples, recebimento, situação e análises vinculadas |
| SaaS | CRUD /laboratories, /plans, /subscriptions e /users; renovação e permissões SUPER_ADMIN |
| Contexto | Lista de laboratórios autorizados, identificação do tenant pela sessão, validação servidor em todas as consultas |

O laboratório enviado na query não concede autorização: o servidor deve conferir vínculo/perfil e impedir acesso cruzado por ID. Serviços de recursos futuros são contratos tipados; gravações continuam indisponíveis até a fase de integração.

## Arquitetura

- `src/components`: elementos reutilizáveis e shell administrativo.
- `src/pages`: dashboard, laudos, formulário, páginas públicas e módulos SaaS.
- `src/context`: sessão e guardas de rotas.
- `src/types`: DTOs e perfis.
- `src/services`: HTTP, autenticação, laudos, recursos futuros e validação.
- `src/data`: exemplos estáticos, isolados dos serviços reais.
- `tests/contracts.test.mjs`: bloqueios de rede/mutação, normalização, PDFs e documentos.

## Validação e execução

```
npm install
npm run dev
npm test
npm run build
```

TypeScript estrito e build de produção validados. Testes de contratos não acessam a rede. Verificados no navegador: dashboard, listagem, busca por cliente, detalhes e bloqueios, redirecionamento da rota privada ao login, quatro etapas até a revisão e consulta pública fictícia. Breakpoints responsivos definidos para 760, 1000, 1250 e 1500 px; emulação móvel não disponibilizada pelo navegador desta sessão.

## Próximas etapas

1. Fechar o contrato OpenAPI e validar o schema Report no backend.
2. Adaptar autenticação/planos/assinaturas IAkí para laboratórios e perfis IAkiLab.
3. Implementar isolamento multi-tenant, permissões, refresh e auditoria no servidor.
4. Separar rascunho, validação, emissão e assinatura A1.
5. Disponibilizar consulta pública mínima e PDF com acesso autorizado.
6. Conectar em homologação e testar perfis, CORS, sessão, filtros e autorização cruzada.
7. Publicar somente após revisão e autorização do proprietário.

A publicação da interface foi autorizada posteriormente. A audiência configurada no Sites é preservada em cada atualização. Nenhum backend, banco de dados ou configuração da Railway foi alterado.


## Evolução dos modelos — versão 2

A entrada **Novo laudo** oferece três caminhos: água/efluentes, solo e importar PDF pronto. A mudança preserva o painel e os aliases existentes.

### Água e efluentes

Quatro etapas com identificação manual do laudo, cliente/solicitante, município, coleta, coordenadas, recebimento, chuva, referência normativa e enquadramento. Catálogo de 25 ensaios físico-químicos e três bacteriológicos baseado no relatório fornecido. Cada resultado mantém parâmetro, texto do resultado, data do ensaio, unidade, referência/VMP e método em campos separados. Métodos são editáveis; referências começam em branco, sem pressupor conformidade normativa. Também é possível criar ensaios personalizados.

### Solo

Cliente, propriedade, cultura, chegada e envio dos resultados. Várias amostras com código analítico único, identificação/talhão e profundidade. Matriz com 36 parâmetros do modelo original, unidades editáveis e resultados textuais independentes por amostra. A prévia organiza as amostras em grupos de até três e preserva zeros, casas decimais e qualificadores digitados. Nenhuma fórmula de CTC, SB, saturação ou conversão é aplicada automaticamente.

### Prévia dos documentos

O componente ReportPreview apresenta o cabeçalho e a logo LabMoura, os resultados, metodologia, recomendações, observações, responsável técnico e registro profissional. Não inclui imagem de assinatura, QR válido ou código real. A prévia é identificada como documento não emitido e pode ser impressa pelo navegador. É uma conferência HTML dos modelos, sem promessa de reprodução idêntica dos PDFs originais; o PDF definitivo e sua paginação serão validados na integração de emissão do servidor.

A identidade LabMoura está isolada em `laboratoryIdentity` e tipada por `LaboratoryIdentity`, para substituição pela configuração autorizada do tenant. A logo extraída dos documentos não inclui assinatura ou dados de clientes. Os PDFs fornecidos pelo usuário não integram o bundle publicado.

### Importação de PDF

Seleção por botão ou arrastar/soltar, um PDF de até 20 MB, verificação mínima de extensão/tamanho/cabeçalho, visualização via URL temporária no próprio navegador, identificação do laudo, cliente, observações internas e conferência. URLs de objeto são revogadas ao trocar ou desmontar o arquivo. Não há extração automática de conteúdo, verificação criptográfica nem envio à API. A inspeção local não substitui validação do arquivo no servidor. Troca de modelo e remoção de amostra/resultado preenchido pedem confirmação.

### Integração futura

`StructuredReportDraftDTO` distingue WATER e SOIL, inclui templateVersion e mantém os campos Report já existentes. `PdfImportDraftDTO` separa arquivo e metadados do fluxo estruturado. `saveDraft` e `importPdfDraft` estão tipados, mas bloqueados junto com os métodos legados de emissão.

O contrato proposto do servidor deve aceitar rascunhos estruturados e arquivos sem emissão automática. Em seguida, gerar a composição final com QR, assinar A1 no servidor e disponibilizar a consulta autorizada. IDs, documentos assinados e links públicos antigos não foram alterados.

### Validação desta evolução

Build TypeScript/Vite; testes de isolamento dos rascunhos, agrupamento das amostras, bloqueio dos métodos de envio e validação local de PDFs. Fluxos conferidos no navegador: água com catálogo bacteriológico, resultados textuais e prévia; solo com duas amostras e 36 parâmetros; importação e visualização local do PDF original, conferência e emissão desabilitada. Emulação móvel e impressão física não foram verificadas nesta sessão.
