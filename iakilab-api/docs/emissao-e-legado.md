# Emissão e compatibilidade com o LabMoura

O administrador do laboratório pode emitir um laudo validado pelo painel ou por `POST /reports/:id/issue`, com bearer, `{ "revision": 3 }` e `laboratoryId` opcional na query para quem tiver escopo para selecioná-lo. A API seleciona o certificado pelo UUID do laboratório do laudo após conferir o escopo do administrador. O servidor gera o documento estruturado de água ou solo a partir dos dados validados. Para upload, ele deriva uma cópia do PDF original e acrescenta uma página de verificação. PDFs originais já assinados devem seguir a importação histórica para preservar suas assinaturas.

O QR contém o endereço do painel em `/consulta?code=…`. O servidor assina o PDF depois de inserir o QR e valida que o certificado esperado assinou todo o arquivo. A versão, o hash, o evento e a publicação entram na mesma transação. Em erro o laudo continua validado e privado. O detalhe informa a nova revisão para reenviar. O bloqueio de dois minutos permite recuperar uma execução interrompida. Uma chamada repetida depois da publicação devolve a versão já emitida. Falhas de conexão com o banco após gravar o arquivo podem deixar uma cópia órfã no armazenamento privado, mantida para evitar excluir bytes de uma transação com resultado desconhecido.

## Importação de laudos manuais

No painel, use **Importar PDF pronto** para laudos novos elaborados no Word ou no LibreOffice e exportados como PDF. A API confere o formato, recusa PDFs com assinatura incorporada e guarda o original como rascunho privado. Depois da validação, a emissão acrescenta o QR e aplica a assinatura A1 a uma cópia. Reserve esse fluxo para documentos ainda não publicados.

Para água e solo, a prévia autenticada usa o mesmo PDF que serve de base para a emissão. `POST /reports/drafts/preview` gera uma prévia dos dados em edição sem gravar. `GET /reports/:id/preview` usa os dados da revisão salva. A prévia exibe um aviso de conferência em cada página. A emissão usa a revisão validada, inclui a página de verificação e só publica o arquivo após assinar e verificar.

## Configuração de homologação

Execute os comandos no diretório `iakilab-api`:

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements-a1.txt
npm ci
npm run db:generate
npm run db:migrate:homolog
```

Carregue a configuração de homologação habitual e configure as variáveis abaixo no servidor. Use arquivos de segredo com acesso restrito à conta do processo.

| Variável | Valor |
|---|---|
| `A1_LABORATORY_ID` | UUID do laboratório vinculado ao certificado |
| `A1_CERTIFICATE_PATH` | Caminho absoluto do PKCS#12 do laboratório |
| `A1_PASSWORD_FILE` | Caminho absoluto do arquivo contendo apenas a senha |
| `A1_TRUST_ROOT` | Caminho absoluto do certificado raiz PEM ou DER aceito |
| `A1_INTERMEDIATE_CHAIN` | Caminho opcional para os intermediários em um arquivo PEM |
| `A1_PYTHON` | Caminho para o Python com o pyHanko instalado |
| `PUBLIC_REPORT_ORIGIN` | Origem do frontend. Use HTTPS ou HTTP localhost em teste |

Para vários laboratórios, use `A1_LABORATORIES_JSON` em vez das variáveis individuais do certificado. Cada item da lista tem `laboratoryId`, `certificate`, `passwordFile`, `trustRoot` e, opcionalmente, `intermediateChain` e `python`. Monte o A1 e o arquivo de senha próprios de cada laboratório. `PUBLIC_REPORT_ORIGIN` vale para todos e deve apontar para o painel acessível no dispositivo que vai ler o QR. Com a lista, configure explicitamente `LEGACY_A1_TRUST_ROOT` para importar o acervo histórico.

Antes de emitir, execute com a mesma conta e as mesmas variáveis da API. Para uma configuração local em `.env`, use:

```bash
node --env-file=.env --import tsx scripts/check-report-a1.ts UUID_DO_LABORATORIO
```

O comando confere o UUID no banco, lê o período de validade do certificado e assina e verifica um PDF temporário sem publicar laudos. O painel consulta `GET /reports/a1/status` no detalhe de um laudo validado. A rota exige administrador com escopo no laboratório e retorna somente o estado do A1, as datas de validade e os dias restantes, quando disponíveis. A partir de 30 dias restantes o estado é `EXPIRING_SOON`.

| Código de emissão | Situação |
|---|---|
| `LABORATORY_SIGNER_UNAVAILABLE` (503) | Ausência de configuração para o UUID autorizado. |
| `LABORATORY_SIGNER_INVALID_CONFIGURATION` (503) | Dados de configuração inválidos, arquivos ilegíveis, senha incorreta ou dependências do assinador indisponíveis. |
| `A1_CERTIFICATE_EXPIRED` (422) | O período de validade terminou. |
| `A1_CERTIFICATE_NOT_YET_VALID` (422) | O período de validade ainda vai começar. |
| `REPORT_SIGNING_FAILED` (502) | Falha ao produzir o PDF assinado. |
| `REPORT_SIGNATURE_VERIFICATION_FAILED` (502) | A assinatura ou a cadeia do PDF produzido falhou na verificação. |
| `REPORT_PUBLICATION_FAILED` (502) | A persistência da publicação falhou. Abra o laudo para consultar o estado atual. |
| `REPORT_PUBLICATION_STATE_UNKNOWN` (503) | Uma falha de comunicação impediu confirmar o resultado da transação. Consulte o laudo antes de repetir. |

O diagnóstico de validade não substitui a verificação criptográfica da emissão. A API permanece acessível com configuração A1 estruturalmente inválida e bloqueia a emissão até corrigi-la. A última causa fica disponível na revisão atual do laudo sem caminhos, senha ou saída do assinador. Para tentar novamente use a revisão atual retornada pelo detalhe.

Os intermediários podem vir no PKCS#12 ou no PEM configurado para o laboratório. O assinador inclui a cadeia no PDF e grava o motivo da assinatura com o nome do laboratório. A assinatura usa o subfiltro PAdES `ETSI.CAdES.detached`. O verificador usa a raiz configurada e valida o PDF localmente. Carimbo de tempo e consulta on-line de revogação precisam de definição e homologação antes da operação produtiva. O painel usa `VITE_API_URL` e `VITE_SECURE_API_ENABLED=true`.

A consulta pública aceita o código aleatório no `GET /public/reports/:code` e retorna identificação, datas, situação e caminho para o PDF. O `GET /public/reports/:code/pdf` serve somente os bytes do documento publicado cujo hash e tamanho correspondem à evidência da versão. A consulta não devolve dados cadastrais em JSON. O PDF final fica acessível a quem tiver o código.

Na homologação, emita um laudo estruturado de água e efluentes, um de solo e um PDF importado sem assinatura. Compare os PDFs baixados com os modelos aprovados pelo laboratório e confira identificação, dados das amostras, métodos, unidades, resultados e paginação. Use o Python e a raiz configurados para o laboratório para verificar cada arquivo baixado:

```bash
.venv/bin/python scripts/pdf-a1.py verify /caminho/laudo-baixado.pdf /caminho/raiz.pem
```

Leia o QR em outro dispositivo sem sessão e confira a identificação do laudo e o download nessa consulta.

## Migração do acervo

Parta de um backup restaurado em homologação. Prepare um manifesto JSON junto aos PDFs exportados. Use um nome relativo para cada arquivo, com o UUID antigo e, quando conhecido, o nome exato servido no endereço histórico. A identificação pode usar o UUID antigo quando a origem não tem numeração. O cliente pode ficar vazio nos uploads históricos sem cadastro. Os campos opcionais em `data` guardam metadados antigos no snapshot privado.

```json
{
  "laboratoryId": "33333333-3333-4333-8333-333333333333",
  "reports": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "identification": "LM-2025-0148",
      "customerName": "Cliente fictício",
      "createdAt": "2025-01-01T10:00:00Z",
      "pdf": "arquivos/LM-2025-0148.pdf",
      "legacyPdfFilename": "signed-LM-2025-0148.pdf"
    }
  ]
}
```

Configure `LEGACY_A1_TRUST_ROOT` para a cadeia legada e rode primeiro:

```bash
npm exec -- tsx scripts/import-legacy-reports.ts manifesto.json --check
npm exec -- tsx scripts/import-legacy-reports.ts manifesto.json --apply
```

`--check` verifica os PDFs sem gravar. `--apply` verifica novamente e importa os elegíveis em transações individuais. Uma repetição com o mesmo ID, metadados de identificação e bytes retorna como já importada. Qualquer falha produz código de saída diferente de zero, inclusive quando parte do lote foi importada. Arquive as linhas por UUID. `PDF_HAS_NO_SIGNATURE` identifica ausência de assinatura. `SIGNATURE_VERIFICATION_FAILED` identifica falha de verificação criptográfica ou de cadeia, inclusive análise inconclusiva pelo verificador. `INVALID_OR_UNREADABLE_PDF` identifica arquivo indisponível ou fora dos limites, e `STORAGE_OR_MANIFEST_CONFLICT` identifica falha ao gravar ou divergência em relação a uma importação anterior. Arquivos sem assinatura íntegra ou sem cadeia aceita permanecem no acervo de origem para avaliação. Nenhum PDF histórico é reescrito ou assinado novamente.

As URLs externas de fotos históricas ficam fora da importação.

A API disponibiliza `GET /legacy/reports/:id` e `GET /legacy/pdf/:filename`. O segundo atende tanto o nome antigo registrado quanto `laudo-<UUID>.pdf`, usado pela branch `vps` do frontend. Na troca de operação, o proxy do **host legado** deve mapear suas URLs de laudo e PDF para esses endpoints. A API atual mantém leitura privada nas rotas autenticadas. Confira o destino de um QR já entregue, o download por nome e a correspondência byte a byte em homologação antes de mudar a Hostinger.

## Cadastro do A1 pelo painel

O administrador do laboratório pode abrir **Certificado A1** pelo menu ou pelo detalhe do laudo validado. Para habilitar o cadastro, configure `A1_MANAGEMENT_KEY` com 32 bytes em hexadecimal e defina `PUBLIC_REPORT_ORIGIN`. Fora do desenvolvimento local, sirva a API e o painel por HTTPS. Gere a chave em um ambiente controlado com `openssl rand -hex 32` e mantenha-a no cofre de segredos.

Informe o PKCS#12, a senha, a raiz de confiança do laboratório e, conforme a cadeia, os intermediários. A API assina e verifica um PDF temporário antes de ativar o certificado. Se houver uma configuração por arquivo no ambiente, o A1 cadastrado pelo painel passa a ter precedência para aquele laboratório. Uma tentativa de cadastro rejeitada preserva o A1 ativo.

O PKCS#12, a senha e a cadeia ficam criptografados com AES-256-GCM no subdiretório privado `.a1` de `STORAGE_ROOT`. Preserve esse diretório no backup do volume. Guarde a chave separadamente no cofre e recupere a mesma chave ao restaurar. A troca do certificado pelo painel não exige trocar a chave de armazenamento. As credenciais ficam legíveis para o assinador apenas em arquivos temporários privados durante o processamento.
