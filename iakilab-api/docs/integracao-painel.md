# Integração com o painel IAkiLab

O painel de referência é a exportação `IAkiLab_painel_completo_v2`. Ela já tem serviços de login e leitura de laudos. Alguns componentes e botões usam dados de demonstração e funções que devolvem indisponibilidade. Ligar o cliente HTTP habilita as leituras já integradas. Os demais componentes precisam chamar os serviços correspondentes.

## Configuração de homologação

Em uma cópia do painel React/Vite, configure:

```dotenv
VITE_API_URL=http://localhost:3333
VITE_SECURE_API_ENABLED=true
```

Use o endereço explícito da nova API. O valor padrão do frontend exportado aponta para o LabMoura antigo. Em publicação de homologação, use a URL HTTPS da API e informe a origem exata do painel em `WEB_ORIGINS`. Teste login, recarga, renovação, logout e bloqueio de cookies antes da publicação. O backend espera cookies de sessão nas rotas de refresh e logout e bearer nas rotas privadas. Se os hosts estiverem em sites distintos, valide cookies no navegador alvo ou aproxime a origem da API à do painel.

## Serviços e rotas

As rotas privadas usam `Authorization: Bearer <token>`. `laboratoryId` pode ser enviado na query quando o operador seleciona o laboratório. A API resolve o vínculo no servidor. Em login de usuário vinculado a mais de um laboratório, o formulário precisa oferecer seleção ou encaminhar um `laboratoryId` conhecido e autorizado no POST de login.

| Uso | Rota | Contrato |
|---|---|---|
| Sessão | POST /sessions, POST /sessions/refresh, POST /sessions/logout, GET /users/me | Mesmo contrato do AuthContext exportado |
| Laudos | GET /reports, GET /reports/:id | Lista `{reports,total,totalPages}` e detalhe incluindo `revision` |
| PDF | GET /pdf/:id | Bytes privados. Use fetch autenticado e Blob. Veja `integration/frontend-pdf-example.ts` |
| Clientes | GET/POST /clients, GET/PATCH/DELETE /clients/:id | Lista em array. Create com name, document, email, phone e address. Campos sem valor podem ser strings vazias. DELETE arquiva. Gravação por ADMIN ou SUPER_ADMIN |
| Amostras | GET/POST /samples, GET/PATCH/DELETE /samples/:id | Lista em array. identification, type, origin, collectedAt, status e analyses. DELETE arquiva e exige ADMIN ou SUPER_ADMIN |
| Indicadores | GET /dashboard/metrics | `{total,clients,samples,byStage:[{stage,count}]}`. Associar cartões apenas a contadores equivalentes |
| Criar rascunho | POST /reports/drafts | DTO de água ou solo com identification, customerName e templateVersion 1 |
| Editar rascunho | PATCH /reports/:id | `{revision,draft}` com o DTO completo; atualização concorrente devolve 409 |
| Importar PDF | POST /reports/drafts/import-pdf | Multipart com file, identification, customerName e notes opcional. Limite 20 MiB |
| Revisão | POST /reports/:id/submit, PATCH /reports/:id/validate, POST /reports/:id/return | Corpo `{revision}`. Validar ou devolver exige ADMIN ou SUPER_ADMIN |
| Plataforma | GET /laboratories, GET /plans, GET /subscriptions | Listas em array e acesso exclusivo de SUPER_ADMIN |

No serviço HTTP do painel, defina `Content-Type: application/json` apenas para corpos JSON. Ao enviar `FormData`, deixe o navegador incluir o delimitador multipart. Para o serviço de edição, obtenha a revisão atual no detalhe e envie essa revisão nas ações. Em 409, recarregue o laudo antes de reenviar. O painel exportado ainda precisa substituir handlers de demonstração em clientes, amostras, dashboard, rascunhos e plataforma para mostrar os dados da API.

## Aceite do primeiro teste

Entre como usuário do laboratório A, crie um cliente e um laudo fictício, e confirme listagem e detalhe. Repita como usuário de B e confira que A não aparece. Confira a recusa de consulta por ID de A a partir de B. Percorra a revisão como analista e administrador. Para download do PDF final, use um laudo de homologação com evidência de assinatura aceita pela aplicação. Um PDF importado fica privado como original e não gera link de laudo assinado.
