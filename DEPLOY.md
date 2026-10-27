# Guia de Deploy — Living Canvas (Cloudflare Pages)

Este projeto utiliza **TanStack Start + Nitro** integrado ao preset **Cloudflare Pages** (via `@lovable.dev/vite-tanstack-config`). As rotas server-side e funcionalidades de Inteligência Artificial (`/api/vibe-search`, `/api/compare-verdict`, `/api/chat-assistant`, `/api/match-properties`) rodam nativamente como Cloudflare Workers em Edge.

---

## 1. Conexão do Repositório no Cloudflare Pages

1. Acesse o [Cloudflare Dashboard](https://dash.cloudflare.com/) com a sua conta.
2. No menu lateral esquerdo, vá em **Workers & Pages** > **Overview**.
3. Clique no botão **Create application** e selecione a aba **Pages**.
4. Clique em **Connect to Git** e selecione o repositório do projeto (GitHub ou GitLab).

---

## 2. Configuração de Build no Painel da Cloudflare

Durante o assistente de configuração (ou em **Settings** > **Builds & deployments** do projeto):

- **Project name:** `living-canvas` (ou o nome do seu cliente/imobiliária)
- **Production branch:** `main` (ou a branch padrão do seu projeto)
- **Framework preset:** `None`
- **Build command:** `npm run build`
- **Build output directory:** `.output/public`
- **Node.js version (opcional, se solicitado):** `18.x` ou superior (adicione em variáveis de ambiente se necessário: `NODE_VERSION = 20`).

O Nitro compila automaticamente:
- Assets e HTML estáticos para `.output/public`.
- O Worker do servidor (com todas as rotas `/api/*`) para `.output/server/_worker.js`.

---

## 3. Configuração Segura da `GEMINI_API_KEY` (Secret)

Para que as rotas de IA funcionem em produção sem expor a chave no código-fonte:

1. No painel do seu projeto no Cloudflare Pages, acesse a aba **Settings**.
2. Clique na seção **Environment variables**.
3. Na seção **Production** (e **Preview**, se desejar), clique em **Add variable**.
4. Configure a chave:
   - **Variable name:** `GEMINI_API_KEY`
   - **Value:** Cole a sua chave de API gerada no Google AI Studio.
   - **Type:** Selecione **Encrypt** (Secret / Criptografado).
5. Clique em **Save**.
6. Realize um novo deploy (ou clique em **Retry deployment**) para que o Worker carregue a variável criptografada.

> ⚠️ **Importante:** Nunca versione arquivos com chaves reais no repositório. O arquivo `.gitignore` já está configurado para ignorar `.env`, `.env.local` e derivados.

---

## 4. Deploy da Infraestrutura Firebase (Firestore, Storage e Functions)

O backend do **Living Canvas** opera integrado aos serviços gerenciados do Firebase, com **banco de dados Firestore customizado** (`ai-studio-imobiliariabase-9b8dd04f-184a-4ea2-acf4-aadee30e202e`) configurado explicitamente em `firebase.json` e `firebase-applet-config.json`.

### 4.1 Comandos de Deploy com Firebase CLI
Para publicar as regras de segurança, índices e funções na nuvem:

```bash
# 1. Autenticar e selecionar o projeto
firebase login
firebase use climbing-starlight-m8gvj

# 2. Deploy completo de regras, índices, storage e Cloud Functions
firebase deploy --only firestore,storage,functions

# Ou deploy seletivo apenas de regras e storage:
firebase deploy --only firestore:rules,storage
```

> **Atenção ao Database ID customizado:** O arquivo `firebase.json` já define `"database": "ai-studio-imobiliariabase-9b8dd04f-184a-4ea2-acf4-aadee30e202e"`. O Firebase CLI aplica as regras diretamente no banco correto sem sobrescrever o banco `(default)`.

---

### 4.2 Como Criar o Primeiro Corretor Homologado
No Living Canvas, corretores possuem privilégios administrativos e validação por Custom Claim JWT (`role: "corretor"`). Para criar ou homologar o primeiro corretor da imobiliária:

1. Obtenha a chave de serviço administrativa (`service-account.json`) no Firebase Console (*Configurações do Projeto > Contas de Serviço*).
2. Execute o provisionador oficial com o banco customizado:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
   node scripts/criar-corretor.mjs \
     --email "corretor@suaimobiliaria.com.br" \
     --nome "Nome do Corretor" \
     --creci "12345-F" \
     --telefone "(11) 98765-4321"
   ```
3. O script criará o usuário no Auth, atribuirá a Custom Claim `role: "corretor"`, inicializará `usuarios/{uid}` e `corretoresPublicos/{uid}` e gerará o link para definição de senha.
4. Ao logar em `login.html`, o corretor será redirecionado automaticamente para `painel-corretor.html`.

---

### 4.3 Alerta Crítico de Segurança: Rotação de Senhas e Chaves
> 🚨 **AVISO OBRIGATÓRIO DE SEGURANÇA:**
> - Qualquer senha provisória, e-mail de teste ou chave de serviço temporária utilizada em etapas de desenvolvimento ou testes **deve ser imediatamente rotacionada** antes da publicação em produção.
> - O arquivo `service-account.json` deve ser mantido fora do repositório Git (já listado no `.gitignore`).
> - Em caso de qualquer vazamento de credenciais, revogue imediatamente as chaves no console do GCP / Firebase e emita novas chaves criptografadas.

---

## 5. Para Novos Clientes / Reskins (White-Label)

A arquitetura do **Living Canvas** foi construída de forma modular para que a mesma base de código sirva múltiplos clientes/imobiliárias mantendo deploys independentes:

1. **Customização Visual e de Marca (`public/config.js`):**
   - Todas as informações da imobiliária (nome, slogan, WhatsApp, e-mail, CRECI, `siteUrl`, bairros atendidos e paleta de cores) estão centralizadas em `public/config.js`.
   - Para um novo cliente, edite `public/config.js` com o novo domínio canônico em `siteUrl` (ex: `https://suaimobiliaria.com.br`).

2. **Propagação do Domínio Canônico (`scripts/aplicar-site-url.mjs`):**
   - Execute o script de sincronização de URL canônica:
     ```bash
     node scripts/aplicar-site-url.mjs
     ```
   - O script lê `siteUrl` de `public/config.js` e atualiza automaticamente tags `<link rel="canonical">`, `<meta property="og:url">`, `<meta name="twitter:url">`, `public/sitemap.xml` e `public/robots.txt`.

3. **Validação de Integridade de Rotas (`scripts/audit-rotas.mjs`):**
   - Antes de realizar o deploy, execute a auditoria de rotas:
     ```bash
     node scripts/audit-rotas.mjs
     ```
   - O script valida que todos os links locais, âncoras (`#hash`), parâmetros obrigatórios (`imovel.html?id=`, `bairro.html?b=`) e atributos de segurança (`rel="noopener"`) estão estritamente corretos (código de saída 0).

4. **Configuração do Google Analytics 4 (GA4) e Privacidade LGPD:**
   - Em `public/config.js`, defina o Measurement ID do cliente no campo `gaMeasurementId: "G-XXXXXXXXXX"`.
   - Se deixado vazio, nenhum script externo é injetado.
   - Quando configurado, a tag opera em estrita conformidade com a LGPD e o Google Consent Mode v2 (`analytics_storage: denied` por padrão até autorização, `anonymize_ip: true`, sem coleta de Google Signals de publicidade, e respeito absoluto à diretiva Do Not Track).

5. **Identificador do Projeto (`wrangler.toml`):**
   - Atualize a linha `name = "living-canvas"` para o identificador do novo cliente (ex: `name = "imobiliaria-aurora"`).

6. **Deploy Independente:**
   - Crie um novo projeto no Cloudflare Pages apontando para a branch ou repositório do cliente.
   - Configure a `GEMINI_API_KEY` (podendo ser a mesma chave geral da agência ou uma chave isolada por cliente).

---

## 6. Roteamento e Preservação de Query Parameters no Cloudflare Pages

1. **Redirecionamentos Estáticos e Tratamento 404 (`public/_redirects`):**
   - O arquivo `public/_redirects` gerencia os roteamentos de entrada em nível de CDN no Cloudflare Pages:
     ```text
     # Rotas principais
     / /home.html 302
     /abertura /home.html 301
     /home /home.html 301
     /imoveis /imoveis.html 301
     /bairros /bairros.html 301
     /contato /contato.html 301
     /sobre /sobre.html 301
     /dashboard /dashboard.html 301

     # Tratamento e fallback para páginas não encontradas (404)
     /* /404.html 404
     ```
   - No Cloudflare Pages, os query parameters (`?id=...`, `?b=...`) são preservados automaticamente nos redirecionamentos para manter deep linking intacto.
   - Qualquer URL inexistente é interceptada pela regra `/* /404.html 404`, exibindo a interface personalizada de luxo `public/404.html` com código de resposta HTTP 404.

---

## 7. Desenvolvimento Local

Para rodar localmente com acesso às rotas de IA:

1. Crie um arquivo local `.env` na raiz do projeto (ele será ignorado pelo Git):
   ```env
   GEMINI_API_KEY=sua_chave_aqui
   ```
2. Execute o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
3. A aplicação estará disponível na porta local `3000`.
