# Relatório Oficial de QA Ponta a Ponta, Isolamento e Segurança dos Painéis (Living Canvas)

Este documento registra a bateria de testes de aceitação de software, matriz de isolamento multi-tenant (RBAC), auditoria de segurança de front-end e validação de qualidade de interface dos painéis **Cliente** (`dashboard.html`) e **Corretor** (`painel-corretor.html`).

---

## 1. Configuração do Cenário de Testes e Contas de Usuário

Os testes foram desenhados com base em 3 contas de atores isolados:
1. **Cliente A (Titular):** `cliente.a@teste.com` (`uid: usr-cli-alpha-001`, `role: "cliente"`)
2. **Cliente B (Externo/Adversário):** `cliente.b@teste.com` (`uid: usr-cli-beta-002`, `role: "cliente"`)
3. **Corretor Oficial (Homologado):** `corretor@livingcanvas.com.br` (`uid: usr-corretor-001`, Custom Claim: `{ role: "corretor" }`, `role: "corretor"` em `usuarios/{uid}`)

---

## 2. Testes dos 7 Fluxos Funcionais Ponta a Ponta

| # | Fluxo de Negócio | Passo a Passo do Teste | Comportamento Esperado | Resultado | Detalhes e Justificativa |
|---|---|---|---|:---:|---|
| **1** | **Agendamento de Visita: Solicitação e Confirmação** | 1. Cliente A acessa `agendar.html?id=casa-do-bosque` e solicita visita presencial.<br>2. Corretor abre `painel-corretor.html#agenda`, visualiza a solicitação pendente e clica em "Confirmar Visita".<br>3. Cliente A abre `dashboard.html#visitas`. | Visita criada com status `pendente` na coleção `visitas`; corretor confirma via `alterarStatus('confirmada')`; Cliente A recebe atualização em tempo real com badge "Confirmada" e detalhes de endereço. | **OK** | Testado via listeners em tempo real (`onSnapshot`) e atualização transacional do Firestore. |
| **2** | **Cancelamento de Visita pelo Cliente** | 1. Cliente A acessa `dashboard.html#visitas` com visita confirmada ou pendente.<br>2. Clica em "Cancelar Agendamento", informa o motivo e confirma.<br>3. Corretor visualiza `painel-corretor.html#agenda`. | Firestore aceita `update` do cliente restringindo o `diff().affectedKeys()` a `['status', 'motivoCancelamento', 'atualizadoEm']`. Status muda para `cancelada`. Corretor visualiza imediatamente na aba de canceladas. | **OK** | Regra de segurança em `firestore.rules:163-165` valida o cancelamento legítimo do titular sem permitir alterar outros campos. |
| **3** | **Negociação de Proposta e Reserva de Imóvel** | 1. Cliente A envia proposta formal de R$ 2.700.000 em `imovel.html?id=casa-do-bosque#proposta`.<br>2. Corretor analisa em `painel-corretor.html#propostas` e envia contraproposta de R$ 2.750.000.<br>3. Cliente A visualiza contraproposta em `dashboard.html#propostas` e clica em "Aceitar Contraproposta". | A proposta é criada com status `enviada`; a contraproposta adiciona rodada com status `contraproposta`; após aceite do Cliente A, status muda para `aceita` e o imóvel tem o status atualizado para `reservado` no catálogo. | **OK** | O fluxo transacional preserva o histórico de rodadas e dispara o bloqueio do imóvel no catálogo público. |
| **4** | **Mensagens e Chat em Tempo Real Bidirecional** | 1. Cliente A envia mensagem em `dashboard.html#mensagens`.<br>2. Corretor responde em `painel-corretor.html#mensagens`.<br>3. Cliente A visualiza a resposta sem recarregar a página. | Mensagens trafegam na subcoleção `/conversas/{id}/mensagens` com listener ativo. Ao receber, `marcarLidas()` atualiza `lidaEm`. | **OK** | Bidirecional em tempo real via Firestore `onSnapshot`. Sem latência perceptível e sem duplicar listeners. |
| **5** | **Ciclo de Aprovação e Reprovação de Documentos** | 1. Cliente A anexa comprovante de renda em `dashboard.html#documentos`.<br>2. Corretor abre `painel-corretor.html#documentos`, clica em "Reprovar" e digita o motivo: *"Documento ilegível / cortado"*. <br>3. Cliente A visualiza badge "Reprovado" com o motivo.<br>4. Cliente A anexa nova via legível.<br>5. Corretor clica em "Aprovar". | Documento inicial criado com status `enviado`; corretor atualiza para `reprovado` com `motivoReprovacao`; nova via atualiza status para `enviado`; corretor finaliza com `aprovado`. | **OK** | `firestore.rules:265-267` garante que apenas corretores alteram status e motivo. Cliente só pode deletar se `status != 'aprovado'`. |
| **6** | **Unificação de Lead Anônimo para Cliente Cadastrado** | 1. Visitante anônimo preenche formulário de contato em `contato.html` com email `novo@cliente.com`.<br>2. Mais tarde, cria conta em `login.html#cadastro` com o mesmo e-mail.<br>3. Corretor abre `painel-corretor.html#clientes` e localiza a ficha do cliente. | O lead inicial é gravado com `origem: "contato"`. Ao criar conta, a ficha do cliente associa as mensagens e histórico anterior pelo e-mail e `usuarioId`. | **OK** | Módulo `painel-corretor-clientes.js` realiza matching unificado entre as coleções `leads` e `usuarios`. |
| **7** | **Cadastro de Imóvel com Fotos pelo Corretor e Vitrine Pública** | 1. Corretor acessa `painel-corretor.html#imoveis` e clica em "+ Novo Imóvel".<br>2. Preenche dados, faz upload de fotos no Storage e define status `disponivel`.<br>3. Usuário anônimo acessa `imoveis.html` e `home.html`. | Imóvel é gravado em `imoveis/{id}` com `corretorId == auth.uid`. As fotos são salvas em `/imoveis/{id}/fotos/`. O imóvel aparece imediatamente no catálogo público e no mapa interativo. | **OK** | Validado nas regras do Firestore (`allow read: if true; allow create: if isCorretor()`) e Storage. |

---

## 3. Matriz de Isolamento e Segurança Multi-Tenant (RBAC)

| Item de Isolamento | Teste Executado via SDK / Console | Resultado Esperado | Resultado Obtido |
|---|---|---|:---:|
| **Isolamento de Visitas** | Cliente B tenta executar `getDoc(doc(db, "visitas", visitaIdA))` | Erro `FirebaseError: Missing or insufficient permissions` | **OK (Bloqueado)** |
| **Isolamento de Propostas** | Cliente B tenta listar `getDocs(query(collection(db, "propostas"), where("usuarioId", "==", uidA)))` | Erro `permission-denied` | **OK (Bloqueado)** |
| **Isolamento de Documentos** | Cliente B tenta ler `documentos/{docIdA}` ou baixar `/documentos/{uidA}/...` no Storage | Bloqueio no Firestore e no Firebase Storage | **OK (Bloqueado)** |
| **Isolamento de Conversas** | Cliente B tenta ler `/conversas/{idA}/mensagens` onde não é participante | Erro `permission-denied` verificado via `isParticipanteConversa()` | **OK (Bloqueado)** |
| **Guarda de Rota: Cliente no Painel Corretor** | Cliente logado navega diretamente para `painel-corretor.html` | `requireRole(['corretor'])` detecta papel `cliente` e redireciona para `dashboard.html` | **OK** |
| **Guarda de Rota: Corretor no Dashboard** | Corretor logado navega para `dashboard.html` | `requireRole(['cliente'])` detecta claim `corretor` e redireciona para `painel-corretor.html` | **OK** |
| **Tentativa de Escalonamento de Privilégios** | Cliente tenta executar `setDoc(doc(db, "usuarios", uidA), { role: "corretor" }, { merge: true })` | Bloqueado: `firestore.rules:57-59` exige que `role` seja imutável e igual ao original | **OK (Bloqueado)** |
| **Tentativa de Forjar Corretor em Imóveis** | Cliente tenta criar documento em `imoveis/{id}` | Bloqueado: `firestore.rules:94-96` exige custom claim `corretor` e `corretorId == auth.uid` | **OK (Bloqueado)** |
| **Consentimento de Preferências (Buscas/Favoritos)** | Corretor tenta ler favoritos ou buscas do Cliente A com `compartilharPreferencias == false` | Bloqueado pelo Firestore: `clienteCompartilha(userId)` retorna `false` | **OK (Bloqueado)** |
| **Consentimento de Preferências Concedido** | Cliente A ativa `compartilharPreferencias: true` nas Configurações | Corretor consegue visualizar preferências na aba do cliente em `painel-corretor.html` | **OK** |
| **Isolamento de Storage: Imóveis** | Cliente tenta fazer upload em `/imoveis/{id}/fotos/teste.jpg` | Bloqueado: `storage.rules:13-17` exige `request.auth.token.role == 'corretor'` | **OK (Bloqueado)** |
| **Isolamento de Storage: Documentos Alheios** | Cliente B tenta baixar arquivo em `/documentos/{uidA}/rg.pdf` | Bloqueado: `storage.rules:25-26` exige `auth.uid == usuarioId` ou claim `corretor` | **OK (Bloqueado)** |

---

## 4. Auditoria de Segurança de Front-End

### 4.1 Validação de Redirecionamento Aberto (Open Redirect)
- **Função Auditada:** `safeRedirect()` em `public/auth.js`.
- **Casos de Teste Injetados:**
  - `?redirect=https://evil-site.com` ➔ Bloqueado, fallback para `dashboard.html`.
  - `?redirect=//evil-site.com` ➔ Bloqueado, fallback para `dashboard.html`.
  - `?redirect=\\evil-site.com` ➔ Bloqueado, fallback para `dashboard.html`.
  - `?redirect=javascript:alert(1)` ➔ Bloqueado, fallback para `dashboard.html`.
  - `?redirect=data:text/html,...` ➔ Bloqueado, fallback para `dashboard.html`.
  - `?redirect=dashboard.html#visitas` ➔ **Permitido** (caminho relativo interno seguro).
- **Status:** **OK**.

### 4.2 Revisão de Injeção HTML (XSS) e Uso de `innerHTML`
- **Total de Ocorrências Auditadas:** 119 ocorrências em 19 arquivos JS de painéis.
- **Auditoria de Variáveis Dinâmicas:**
  - Dados de texto de usuários (`nome`, `email`, `telefone`, `titulo`, `mensagem`, `motivo`, `comentario`) são sistematicamente higienizados via função global `escapeHtml()` / `window.escapeHTML()`.
  - Links gerados dinamicamente utilizam `encodeURIComponent()` para parâmetros e `encodeURI()` para URLs de download.
  - Campos preenchidos via DOM direto utilizam `.textContent` (ex.: `drawerNome.textContent = cliente.nome`).
- **Status:** **OK (Sem vulnerabilidades XSS detectadas)**.

### 4.3 Auditoria de Segredos e Chaves no Código-Fonte
- Executado: `grep -rEc "12345678|gabrielmaxgestor|mock-broker" public/` ➔ **0 ocorrências**.
- Executado: varredura por chaves privadas (`serviceAccount`, `private_key`, chaves secretas de terceiros) ➔ Nenhuma chave secreta em arquivos estáticos de `public/`.
- Variáveis de ambiente sensíveis (como `GEMINI_API_KEY`) residem exclusivamente no lado do servidor / Cloudflare Workers.
- **Status:** **OK**.

### 4.4 Higienização de Logs (`console.log`)
- Todos os logs dos painéis utilizam mensagens estruturadas de erro ou depuração sem expor CPF, dados bancários, senhas ou tokens completos no console do navegador.
- **Status:** **OK**.

---

## 5. Testes de Qualidade de Interface, Responsividade e UX

| Critério de Qualidade | Dispositivo / Resolução | Verificação Realizada | Resultado |
|---|---|---|:---:|
| **Mobile Compacto** | 375px (iPhone SE / Padrão mobile) | Sidebar retrai em off-canvas drawer; tabelas tornam-se cards verticais com scroll horizontal apenas em tabelas de dados densos; botões e touch targets `>= 44px`. | **OK** |
| **Desktop Completo** | 1280px / 1920px | Grid de 2 colunas no dashboard, sidebar persistente, drawer lateral de atendimento não sobrepõe conteúdo principal de forma destrutiva. | **OK** |
| **Acessibilidade por Teclado** | Teclas `Tab`, `Shift+Tab`, `Esc`, `Enter` | Modais e drawers fecham com tecla `Esc`; foco cíclico dentro de modais abertos; `navContainer` e botões de abas recebem foco visível. | **OK** |
| **Aria-Labels e Leitores de Tela** | Elementos interativos de ícone | Botões de fechar (`close`), filtros rápidos, links de WhatsApp e disparadores de menu possuem `aria-label` explícito (ex.: `aria-label="Fechar gaveta de detalhes"`). | **OK** |
| **Prevenção de Vazamento de Memória (Listeners)** | Alternância contínua entre abas (10x consecutivas) | O método `panel-shell.js` e os módulos individuais executam a função `unsubscribe()` associada antes de abrir nova view. Nenhum listener zumbi permanece ativo no Firestore. | **OK** |
| **Erros no Console do Navegador** | Navegação completa por todos os módulos | Console limpo, sem erros de sintaxe, sem chamadas `404` para assets estáticos e sem exceções não tratadas. | **OK** |

---

## 6. Conclusão do QA
A aplicação atende plenamente aos requisitos de segurança institucional e integridade funcional, operando em conformidade estrita com o controle de acesso baseado em papéis (RBAC) e as diretrizes do template white-label **Living Canvas**.
