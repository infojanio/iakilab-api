# IAkiLab — piloto de leitura do LabMoura

O pacote traz a API e uma cópia local do painel. O fluxo em homologação inclui sessão, listagem de laudos do laboratório, detalhe e acesso autenticado ao PDF. A demonstração continua disponível em /demo/app. O uso com dados da API começa em /login.

## Executar localmente

1. Extraia o pacote e abra a pasta no VS Code. Na pasta iakilab-api, siga o README para preparar o PostgreSQL independente, preencher o .env, instalar, aplicar migrations e criar o primeiro usuário.
2. Padronize o hostname local. Para o painel em http://localhost:5173, use WEB_ORIGINS=http://localhost:5173 e COOKIE_SECURE=false na API. Inicie a API na porta 3333.
3. Na pasta iakilab-painel, copie .env.example para .env.local. Defina VITE_API_URL=http://localhost:3333 e VITE_SECURE_API_ENABLED=true. Execute npm ci e npm run dev. Abra http://localhost:5173/login.
4. Entre com a conta de homologação criada no bootstrap. Se o banco estiver vazio, a lista de laudos deve aparecer vazia. Para popular a listagem, use dados fictícios na API de homologação. O endpoint POST /reports/drafts do backend aceita rascunhos autenticados conforme docs/integracao-painel.md na pasta da API.
5. Para testar um PDF disponível no painel, use uma versão emitida com evidência de verificação existente na API. Um PDF importado como rascunho ainda não dá acesso ao botão de download do laudo emitido.

## Estado desta entrega

A API preserva o contrato v0.2.0 e recebe a correção de importação do bcryptjs para executar o build em Node. O painel elimina a URL padrão da API legada e requer endereço explícito para habilitar a integração. O download usa o token da sessão. A renovação de sessão compartilha a mesma requisição durante as montagens duplicadas do React StrictMode.

Os testes usam ambiente local, dois laboratórios fictícios e um PDF sintético. O estado de assinatura do PDF de teste é uma fixture de leitura no banco. O teste comprova autorização e entrega do arquivo, sem executar assinatura A1. A etapa de emissão, QR público, compatibilidade com o histórico e publicação do novo painel fica para os próximos ciclos.
