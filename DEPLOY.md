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

## 4. Para Novos Clientes / Reskins (White-Label)

A arquitetura do **Living Canvas** foi construída de forma modular para que a mesma base de código sirva múltiplos clientes/imobiliárias mantendo deploys independentes:

1. **Customização Visual e de Marca (`public/config.js`):**
   - Todas as informações da imobiliária (nome, slogan, WhatsApp, e-mail, CRECI, bairros atendidos e paleta de cores) estão centralizadas em `public/config.js`.
   - Para um novo cliente, basta duplicar o projeto (ou criar uma branch) e editar `public/config.js` com a identidade do cliente.

2. **Identificador do Projeto (`wrangler.toml`):**
   - Atualize a linha `name = "living-canvas"` para o identificador do novo cliente (ex: `name = "imobiliaria-aurora"`).

3. **Deploy Independente:**
   - Crie um novo projeto no Cloudflare Pages apontando para a branch ou repositório do cliente.
   - Configure a `GEMINI_API_KEY` (podendo ser a mesma chave geral da agência ou uma chave isolada por cliente).

---

## 5. Desenvolvimento Local

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
