# Emissão e compatibilidade com o LabMoura

O administrador do laboratório pode emitir um laudo validado pelo painel ou por `POST /reports/:id/issue`, com bearer, `{ "revision": 3 }` e `laboratoryId` opcional na query para quem tiver escopo para selecioná-lo. A emissão de laboratório exige que o ID corresponda ao certificado configurado. O servidor gera o documento estruturado de água ou solo a partir dos dados validados. Para upload, ele deriva uma cópia do PDF original e acrescenta uma página de verificação. PDFs originais já assinados devem seguir a importação histórica para preservar suas assinaturas.

O QR contém o endereço do painel em `/consulta?code=…`. O servidor assina o PDF depois de inserir o QR e valida que o certificado esperado assinou todo o arquivo. A versão, o hash, o evento e a publicação entram na mesma transação. Em erro o laudo continua validado e privado. O detalhe informa a nova revisão para reenviar. O bloqueio de dois minutos permite recuperar uma execução interrompida. Uma chamada repetida depois da publicação devolve a versão já emitida. Falhas de conexão com o banco após gravar o arquivo podem deixar uma cópia órfã no armazenamento privado, mantida para evitar excluir bytes de uma transação com resultado desconhecido.

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
| `A1_PYTHON` | Caminho para o Python com o pyHanko instalado |
| `PUBLIC_REPORT_ORIGIN` | Origem do frontend. Use HTTPS ou HTTP localhost em teste |

O PKCS#12 deve incluir os intermediários necessários. O verificador usa a raiz configurada e valida o PDF localmente. Carimbo de tempo e consulta on-line de revogação precisam de definição e homologação antes da operação produtiva. O painel usa `VITE_API_URL` e `VITE_SECURE_API_ENABLED=true`.

A consulta pública aceita o código aleatório no `GET /public/reports/:code` e retorna identificação, datas, situação e caminho para o PDF. O `GET /public/reports/:code/pdf` serve somente os bytes do documento publicado cujo hash e tamanho correspondem à evidência da versão. A consulta não devolve dados cadastrais em JSON. O PDF final fica acessível a quem tiver o código.

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

`--check` verifica os PDFs sem gravar. `--apply` verifica novamente e importa os elegíveis em transações individuais. Uma repetição com o mesmo ID, metadados de identificação e bytes retorna como já importada. Qualquer falha produz código de saída diferente de zero, inclusive quando parte do lote foi importada. Arquivos sem assinatura íntegra ou sem cadeia aceita permanecem no acervo de origem para avaliação. Nenhum PDF histórico é reescrito ou assinado novamente.

As URLs externas de fotos históricas ficam fora da importação.

A API disponibiliza `GET /legacy/reports/:id` e `GET /legacy/pdf/:filename`. O segundo atende tanto o nome antigo registrado quanto `laudo-<UUID>.pdf`, usado pela branch `vps` do frontend. Na troca de operação, o proxy do **host legado** deve mapear suas URLs de laudo e PDF para esses endpoints. A API atual mantém leitura privada nas rotas autenticadas. Confira o destino de um QR já entregue, o download por nome e a correspondência byte a byte em homologação antes de mudar a Hostinger.
