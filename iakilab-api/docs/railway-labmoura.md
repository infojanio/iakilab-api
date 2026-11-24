# IAkiLab na Railway e migração do LabMoura

Use um ambiente de homologação da Railway com API, painel e PostgreSQL separados da operação da Hostinger. A homologação inicial usa credenciais e laudos sintéticos. O corte depende de autorização e de um novo laudo emitido com o A1 real, verificação do PDF baixado e consulta por QR em um aparelho sem sessão.

## Serviços

| Serviço | Configuração |
|---|---|
| PostgreSQL | Use a rede privada do projeto. Crie um banco vazio chamado `iakilab` ou `iaki_lab` e um usuário dedicado com permissão para migrations no seu schema. Em `DATABASE_URL`, use o endpoint privado e o nome exato desse banco, com senha escapada para URL. |
| API | Root Directory `/iakilab-api`, Dockerfile desse diretório, health check `/health` e volume em `/data/pdfs`. A imagem inclui Node 22, Prisma, Python, pyHanko, o script assinador e as fontes do gerador. A inicialização usa o CMD, com host `0.0.0.0` e `PORT` fornecida pela Railway. |
| Painel | Root Directory `/iakilab-painel`, Dockerfile desse diretório, `VITE_API_URL=https://api.exemplo.test` sem barra final e `VITE_SECURE_API_ENABLED=true` no build. O Caddy serve a SPA e aceita acesso direto a `/consulta`. Configure HTTPS na borda da Railway. |

Configure a API com `APP_ENV=homologation`, `JWT_SECRET` aleatório com pelo menos 48 caracteres, `COOKIE_SECURE=true`, `WEB_ORIGINS=https://painel.exemplo.test`, `PUBLIC_REPORT_ORIGIN=https://painel.exemplo.test`, `STORAGE_ROOT=/data/pdfs` e `RAILWAY_RUN_UID=0`. Use origens exatas, sem caminhos nem barra final. O inicializador prepara o diretório do volume e baixa os privilégios para o usuário `node` antes de carregar segredos ou iniciar a API. Use um domínio próprio com subdomínios de API e painel sob o mesmo domínio registrável e teste login, refresh e logout em navegadores reais. O cookie atual é `HttpOnly`, `Secure`, `SameSite=None` e exige que o navegador aceite seu envio. A origem pública é gravada permanentemente nos novos QR Codes. [Dockerfiles](https://docs.railway.com/builds/dockerfiles) · [Monorepo](https://docs.railway.com/deployments/monorepo) · [Volumes](https://docs.railway.com/volumes)

Configure como comando de pré-implantação da API:

```bash
node build/scripts/migrate-homolog.js
```

Ele roda `prisma migrate deploy` explicitamente sem precisar do volume. Faça backup antes de migrar um banco existente. A API aceita `iakilab_test` somente para a suíte local, com `RUN_POSTGRES_TESTS=true` e host loopback. A migração do legado usa uma base IAkiLab com schema próprio. [Volumes e pré-implantação](https://docs.railway.com/volumes)

## Segredos e troca do A1

Use uma variável selada `A1_SECRET_FILES_JSON` na API. O valor é um objeto com nomes simples de arquivo como chaves e o conteúdo de cada arquivo em Base64 como valores. Inclua o PKCS#12, o arquivo com apenas a senha, a raiz e, se houver, o PEM dos intermediários. Base64 é transporte. A proteção vem da variável selada. O inicializador materializa os arquivos em `/run/iakilab-a1` com permissão 0600, antes de iniciar a API. A variável fica fora do Git, dos argumentos de build, dos logs e do volume dos PDFs. [Variáveis seladas](https://docs.railway.com/variables)

Configure `A1_LABORATORIES_JSON` com um registro por UUID e caminhos como `/run/iakilab-a1/labmoura-2026.p12`, ou use as variáveis individuais em [Emissão e legado](emissao-e-legado.md). Para a importação assinada legada use `LEGACY_A1_TRUST_ROOT` explícita, independente da troca do emissor. O Python da imagem vem de `/opt/a1/bin/python3` no PATH. Um exemplo de mapeamento de produção deve usar os UUIDs confirmados no banco de destino.

Para habilitar o cadastro do A1 pelo painel, configure também `A1_MANAGEMENT_KEY` como variável selada, com 32 bytes aleatórios em hexadecimal. Inclua o subdiretório criptografado `.a1` no backup do volume e preserve a chave em um cofre separado. O A1 cadastrado pelo administrador tem precedência sobre o A1 fornecido por arquivos para o mesmo laboratório. [Cadastro pelo painel](emissao-e-legado.md#cadastro-do-a1-pelo-painel)

Para trocar o A1, prepare arquivos com nomes versionados, atualize o segredo e as referências no mesmo deploy e confira o estado do certificado em um laudo validado. Rode a checagem no contêiner da API com `node build/scripts/check-report-a1.js UUID` e faça uma emissão de teste. Guarde a evidência da troca e remova as credenciais antigas do ambiente ativo. Preserve as âncoras públicas necessárias para o acervo. Mantenha a nova emissão bloqueada se a assinatura ou a cadeia falhar. PDFs já entregues permanecem como foram emitidos.

## Persistência, backup e restauração

1. Mantenha uma réplica da API com o volume persistente. Separe o volume dos PDFs do volume de PostgreSQL. Dimensione e monitore espaço livre e ensaie a janela de reinicialização. [Limitações dos volumes](https://docs.railway.com/volumes/reference)
2. Agende backups do PostgreSQL e do volume. Para uma cópia consistente do par, suspenda gravações e espere as emissões em curso terminarem. Exporte `pg_dump -Fc` e copie a árvore de `/data/pdfs` preservando nomes e diretórios. Gere inventário SHA-256, identifique o par com data e commit e mantenha cópia criptografada fora do serviço, com acesso restrito. Faça backup dos segredos separadamente no cofre aprovado. [Volumes](https://docs.railway.com/volumes)
3. Restaure em ambiente isolado. Use `pg_restore` em um banco vazio e recoloque os PDFs nos mesmos caminhos relativos do volume, com dono UID/GID 1000 e permissões privadas. Aplique migrations pendentes. Valide a relação entre metadados e bytes com downloads, hashes, consulta sem sessão e restauração de um PDF original. Promova a cópia após essa validação e conserve a origem para rollback.

## Ensaio com o acervo da Hostinger

1. Após aprovação, exporte em janela consistente o banco legado com `pg_dump -Fc`, a árvore dos PDFs efetivamente servidos e o roteamento ativo do domínio legado. Trabalhe em uma cópia de acesso restrito e registre hashes. Restaure o dump com `pg_restore` num banco separado para leitura da estrutura legada. Use outro banco vazio e migrado para a API nova.
2. Exporte um manifesto a partir da tabela de laudos do legado e dos arquivos efetivamente baixados. Compare endereço do QR e UUID do banco, nome original servido, identificação e data de criação com fuso. Use o UUID antigo em `id`, a data original em `createdAt`, o caminho relativo dentro da pasta do manifesto em `pdf` e, se conhecido, o nome servido exatamente em `legacyPdfFilename`. Copie os bytes sem conversão. Trate `signedPdfUrl` como referência de localização.
3. Rode `--check` com a raiz legada e arquive a saída por UUID. Trate separadamente `PDF_HAS_NO_SIGNATURE`, `SIGNATURE_VERIFICATION_FAILED`, `INVALID_OR_UNREADABLE_PDF` e problemas de configuração. Preserve os arquivos rejeitados na origem e entregue a triagem à responsável técnica. A validade histórica precisa de evidência e análise próprias quando a cadeia atual não aceita o certificado. QR e nome do arquivo não provam assinatura.
4. Rode `--apply` em homologação após revisar a triagem. Historicidade, identificadores e bytes permanecem os da origem. Repita a importação e confira a contagem. Use os mesmos hashes no arquivo de origem, no volume novo e nos downloads. Preserve as versões entregues e as datas.
5. Inventarie URLs reais escaneando amostras de QR em aparelho sem sessão. O código legado gera `/reports/<UUID>` com `PUBLIC_REPORT_URL` e também contém referência a `https://labmoura-web-production.up.railway.app/reports/<UUID>`. O campo de download aponta para `/pdf/<nome>`. A compatibilidade da API nova cobre nomes gravados e o alias `laudo-<UUID>.pdf`. Confirme hosts e caminhos com uma amostra de cada formato e registre exceções. [Upload do LabMoura](https://github.com/infojanio/labmoura-api/blob/19c5b884580bd5af568f8881ce99405808d7622f/src/use-cases/reports/upload-pdf.ts)
6. No corte autorizado, mantenha o domínio antigo e seu HTTPS. Encaminhe a rota de metadados legada ao `GET /legacy/reports/<UUID>` e o download antigo ao `GET /legacy/pdf/<nome>` da API. Encaminhe também `/public/reports/<UUID>/pdf` no host legado se clientes antigos seguirem o caminho relativo devolvido nos metadados. Por hostname, identifique as rotas que exibem uma página e encaminhe-as à consulta do painel novo em `/consulta?code=<UUID>`. Preserve nomes com espaços, acentos e o encoding. Configure inicialmente roteamento reversível, mantenha disponível a origem dos casos em triagem e teste o QR e o SHA-256 do PDF antes de encerrar a VPS.

Na imagem da API, use o importador compilado com os arquivos da cópia de homologação acessíveis ao contêiner:

```bash
node build/scripts/import-legacy-reports.js /caminho/manifesto.json --check
node build/scripts/import-legacy-reports.js /caminho/manifesto.json --apply
```
