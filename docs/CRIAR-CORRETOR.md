# Guia de Provisionamento de Corretores (Firebase Admin)

Este guia orienta o administrador sobre como cadastrar ou promover corretores oficiais no **Living Canvas** utilizando o Firebase Authentication, Custom Claims e Firestore.

---

## 1. Por que este processo é necessário?

No Living Canvas, a distinção entre **Clientes** e **Corretores** é fundamentada em segurança real:
- O formulário público de cadastro (`login.html`) cria exclusivamente contas de clientes (`role: "cliente"`).
- O papel de **corretor** é protegido contra auto-atribuição e requer o Custom Claim `{ role: "corretor" }` inserido no token JWT do Firebase Auth, validado pelas regras de segurança (`firestore.rules`).
- O script `scripts/criar-corretor.mjs` é a ferramenta administrativa para criar a conta oficial, definir o claim `{ role: "corretor" }` e inicializar o cadastro nas coleções `usuarios` e `corretoresPublicos`.

---

## 2. Como obter a chave da Service Account (Conta de Serviço)

Para executar o script localmente, é necessário obter a chave privada de administrador do Firebase:

1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Selecione o projeto do Living Canvas (`climbing-starlight-m8gvj`).
3. Clique no ícone de engrenagem ⚙️ (ao lado de *Visão geral do projeto*) e selecione **Configurações do projeto**.
4. Acesse a aba **Contas de serviço** (*Service accounts*).
5. Certifique-se de que o ambiente **Node.js** está selecionado e clique em **Gerar nova chave privada** (*Generate new private key*).
6. Salve o arquivo JSON baixado na raiz do projeto como `service-account.json` (ou caminho de sua preferência).
   > **Segurança:** O arquivo `.gitignore` do projeto já está configurado para ignorar `service-account*.json` e evitar o envio acidental para o controle de versão. Nunca suba essa chave para o repositório.

---

## 3. Execução do Script

No seu terminal local, exporte a variável de ambiente apontando para o arquivo de credenciais e execute o script:

```bash
# 1. Defina a variável com o caminho da chave JSON
export GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"

# 2. Execute o script com os dados do corretor
node scripts/criar-corretor.mjs \
  --email "corretor@imobiliaria.com" \
  --nome "Nome do Corretor" \
  --creci "12345-F" \
  --telefone "(11) 98765-4321"
```

### Parâmetros Suportados:
- `--email`: E-mail oficial do corretor (*obrigatório*).
- `--nome`: Nome completo do corretor (*obrigatório*).
- `--creci`: Registro no CRECI (*obrigatório*).
- `--telefone`: Telefone comercial / WhatsApp com DDD (*opcional*).

---

## 4. O que o Script Executa Automaticamente:

1. **Validação e Conexão:** Conecta ao Firebase Auth e ao banco Firestore especificado em `firebase-applet-config.json` (`ai-studio-imobiliariabase-9b8dd04f-184a-4ea2-acf4-aadee30e202e`).
2. **Criação / Atualização no Auth:**
   - Se o usuário não existir: gera uma **senha temporária aleatória segura** de 16 caracteres e cria o usuário com e-mail verificado.
   - Se já existir: mantém a conta existente e atualiza os papéis.
3. **Geração de Link de Redefinição:** Gera um link seguro do Firebase Auth para que o corretor possa definir sua senha definitiva diretamente no e-mail.
4. **Custom User Claim:** Aplica `{ role: "corretor" }` no token de segurança do usuário.
5. **Coleção `usuarios`:** Cria/atualiza o documento `usuarios/{uid}` com `role: "corretor"`, dados de contato e timestamp.
6. **Coleção `corretoresPublicos`:** Cria/atualiza o documento `corretoresPublicos/{uid}` com `visivel: true` para exibição pública na vitrine da imobiliária.

---

## 5. Aviso Importante sobre Atualização de Sessão (Token Refresh)

> ⚠️ **ATENÇÃO:** O token JWT de autenticação do Firebase armazena os Custom Claims no momento da emissão.
>
> Se o corretor já estiver conectado ou com uma aba aberta no navegador no momento em que o script for executado:
> - O navegador manterá o token anterior até a sua expiração ou refresh forçado.
> - O corretor deve **fazer logout** e **fazer login novamente** na página `login.html`.
> - Ao relogar, a função `LivingCanvasAuth.getRole()` forçará a renovação do token (`getIdTokenResult(true)`) e direcionará o corretor automaticamente para o painel oficial (`painel-corretor.html`).
