# IAkiLab — painel completo, versão 2

Exportação do código-fonte da versão 2 do projeto LabMoura Laudos.

## O que está incluído

- React + Vite + TypeScript e Lucide.
- Dashboard, login, laudos, detalhes, consulta pública, clientes e amostras.
- Gestão SaaS: laboratórios, planos, assinaturas e usuários.
- Modelos de água/efluentes e solo, incluindo múltiplas amostras.
- Importação e visualização local de PDF; prévias dos documentos.
- Serviços HTTP, autenticação, DTOs, validações e testes.
- package-lock.json, .env.example e .gitignore.

## Executar no computador ou em um ambiente Node.js

Use Node.js 22 ou superior. Abra um terminal dentro da pasta que contém package.json:

```bash
npm ci
npm run dev
```

Para testar e gerar o build:

```bash
npm test
npm run build
```

O Vite gera a pasta dist. Em uma hospedagem estática, configure o retorno de todas as rotas da aplicação para index.html (fallback SPA), pois o projeto usa BrowserRouter.

## Enviar para o GitHub pela interface web

1. Descompacte o ZIP.
2. Crie ou abra o repositório destinado ao frontend. Mantenha o backend em outro repositório.
3. Na interface do GitHub, escolha Add file → Upload files.
4. Envie o CONTEÚDO de dentro da pasta iakilab-painel. package.json, index.html, src e public devem ficar na raiz do repositório. Não envie apenas o arquivo ZIP.
5. Inclua também .gitignore e .env.example; habilite a visualização de arquivos ocultos no seu computador, se necessário.
6. Confira os arquivos e conclua o commit. Se já houver arquivos nesse repositório, revise as substituições antes de confirmar.

O arquivo .openai/hosting.json registra o vínculo com o projeto original do Sites. Não é uma credencial. Ele pode ser mantido; uma hospedagem convencional Vite não depende dele.

## API e estado funcional

O painel permanece em demonstração. O .env.example tem VITE_SECURE_API_ENABLED=false. Nenhum usuário é autenticado ficticiamente; as rotas privadas exigem validação real do backend.

Se precisar de um .env.local, copie o .env.example e ajuste o endereço da API em homologação. Não habilite VITE_SECURE_API_ENABLED antes de alinhar e validar os contratos. Variáveis VITE_ são públicas e nunca podem conter senhas, chaves ou certificados.

Salvar, emitir, inserir QR Code e assinar com A1 ainda exigem a nova API. A seleção local de um PDF não faz upload para o backend. Os dados preenchidos não são persistidos e desaparecem ao sair/recarregar.

Este pacote é somente do FRONTEND. Não contém backend, banco de dados, arquivos de clientes, certificados, histórico Git, node_modules ou dist. A identidade LabMoura e a logo usadas nos modelos estão incluídas.

Consulte README.md para os contratos propostos, os módulos e as etapas de integração. EXPORT_INFO.json identifica o commit de origem e os hashes do código exportado.
