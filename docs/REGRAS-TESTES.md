# Matriz de Segurança e Testes de Regras (Firestore & Storage)

Este documento descreve detalhadamente a matriz de autorização e controle de acesso baseada em papéis (RBAC) implementada no **Living Canvas** através de `firestore.rules` e `storage.rules`.

---

## 1. Atores do Sistema

| Ator | Descrição e Identificação no Token JWT |
|---|---|
| **Anônimo** | Visitante sem autenticação (`request.auth == null`). |
| **Cliente Dono** | Usuário autenticado que é o titular do registro (`request.auth.uid == usuarioId`). |
| **Cliente Outro** | Usuário autenticado com papel `cliente`, mas que **não** é o proprietário do registro. |
| **Corretor** | Profissional homologado com Custom Claim verificado no token (`request.auth.token.role == 'corretor'`). |

---

## 2. Matriz de Permissões do Firestore

### Legenda de Resultados
- **Permitido**: Operação autorizada pelas regras.
- **Bloqueado**: Operação negada (erro `permission-denied`).
- **Condicional**: Permitido sob validação estrita de campos, status ou consentimento.

---

### Tabela Matriz (12+ Coleções e Subcoleções)

| Coleção / Subcoleção | Operação | Anônimo | Cliente Dono | Cliente Outro | Corretor | Condições e Restrições de Negócio |
|---|---|---|---|---|---|---|
| **`usuarios`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | **Permitido** | Corretor tem visibilidade geral de clientes; cliente só lê o próprio perfil. |
| | `create` | Bloqueado | **Condicional** | Bloqueado | Bloqueado | Apenas no auto-cadastro via Auth; exige `uid == auth.uid` e `role == 'cliente'`. |
| | `update` | Bloqueado | **Condicional** | Bloqueado | Bloqueado | `uid` e `role` imutáveis. Permite `avatarUrl`, `preferenciasNotif`, `compartilharPreferencias`. |
| | `delete` | Bloqueado | Bloqueado | Bloqueado | Bloqueado | Deleção direta desabilitada (sujeita a fluxo LGPD). |
| **`usuarios/.../notasCorretor`** | `read` / `write` | Bloqueado | Bloqueado | Bloqueado | **Permitido** | Exclusivo para equipe de corretores. Cliente nunca tem acesso. |
| **`corretoresPublicos`** | `get` / `list` | **Permitido** | **Permitido** | **Permitido** | **Permitido** | Leitura pública para exibição no catálogo institucional. |
| | `create`/`update`/`delete` | Bloqueado | Bloqueado | Bloqueado | **Condicional** | Apenas o próprio corretor titular (`uid == auth.uid` e claim `corretor`). |
| **`imoveis`** | `get` / `list` | **Permitido** | **Permitido** | **Permitido** | **Permitido** | Catálogo imobiliário público para qualquer visitante. |
| | `create` | Bloqueado | Bloqueado | Bloqueado | **Condicional** | Exige claim `corretor`, `corretorId == auth.uid` e status válido no enum. |
| | `update` | Bloqueado | Bloqueado | Bloqueado | **Condicional** | Apenas o corretor responsável pelo imóvel (`corretorId == auth.uid`). Status restrito ao enum. |
| | `delete` | Bloqueado | Bloqueado | Bloqueado | **Condicional** | Apenas o corretor responsável pelo imóvel (`corretorId == auth.uid`). |
| **`leads`** | `get` / `list` | Bloqueado | **Condicional** | Bloqueado | **Permitido** | Cliente dono pode ler apenas onde `usuarioId == auth.uid`. Corretor lê todos. |
| | `create` | **Condicional** | **Condicional** | **Condicional** | **Condicional** | Criação pública; exige campos obrigatórios; chaves permitidas restritas; proíbe campos de gestão. |
| | `update` / `delete` | Bloqueado | Bloqueado | Bloqueado | **Permitido** | Apenas corretores podem alterar status, etapa, prioridade ou excluir leads. |
| **`leads/.../notas`** | `read` / `write` | Bloqueado | Bloqueado | Bloqueado | **Permitido** | Anotações internas do CRM exclusivas para corretores. |
| **`visitas`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | **Permitido** | Cliente lê as próprias visitas; corretor visualiza toda a agenda. |
| | `create` | Bloqueado | **Condicional** | Bloqueado | Bloqueado | Cliente cria para si com `status == 'pendente'` e `imovelId` válido. |
| | `update` | Bloqueado | **Condicional** | Bloqueado | **Permitido** | Cliente só cancela, responde reagendamento ou envia avaliação pós-visita realizada. |
| | `delete` | Bloqueado | Bloqueado | Bloqueado | **Permitido** | Apenas corretores podem excluir agendamentos. |
| **`propostas`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | **Permitido** | Cliente acompanha propostas enviadas por ele; corretor acompanha todas. |
| | `create` | Bloqueado | **Condicional** | Bloqueado | Bloqueado | Cliente cria com `status == 'enviada'` e valor positivo (`> 0`). |
| | `update` | Bloqueado | **Condicional** | Bloqueado | **Permitido** | Cliente só cancela proposta aberta ou responde contraproposta recebida. Corretor gere negociações. |
| | `delete` | Bloqueado | Bloqueado | Bloqueado | **Permitido** | Exclusão restrita a corretores. |
| **`conversas`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | **Permitido** | Cliente participante acessa suas conversas; corretor tem acesso geral. |
| | `create` | Bloqueado | **Condicional** | Bloqueado | Bloqueado | Cliente inicia canal associando `usuarioId == auth.uid`. |
| | `update` | Bloqueado | **Condicional** | Bloqueado | **Permitido** | Atualização de data de atividade e contador de mensagens não lidas. |
| | `delete` | Bloqueado | Bloqueado | Bloqueado | **Permitido** | Exclusão restrita a corretores. |
| **`conversas/.../mensagens`** | `read` | Bloqueado | **Permitido** | Bloqueado | **Permitido** | Apenas participantes do canal (verificado via `get()` no documento pai). |
| | `create` | Bloqueado | **Condicional** | Bloqueado | **Condicional** | Participante enviando com `autorId == auth.uid`. |
| | `update` | Bloqueado | **Condicional** | Bloqueado | **Condicional** | Restrito estritamente a marcar a leitura (`diff().affectedKeys().hasOnly(['lidaEm'])`). |
| | `delete` | Bloqueado | Bloqueado | Bloqueado | Bloqueado | Mensagens de histórico não podem ser excluídas. |
| **`documentos`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | **Permitido** | Cliente acompanha seus documentos; corretor audita todos os processos. |
| | `create` | Bloqueado | **Condicional** | Bloqueado | **Condicional** | Cliente cria com status `'enviado'`. Corretor pode criar solicitação com status `'pendente'`. |
| | `update` | Bloqueado | Bloqueado | Bloqueado | **Condicional** | Apenas corretor altera status, motivo de reprovação e data de revisão. |
| | `delete` | Bloqueado | **Condicional** | Bloqueado | **Permitido** | Cliente só pode excluir seus documentos se `status != 'aprovado'`. |
| **`atividades`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | **Permitido** | Dono e corretores consultam histórico de linha do tempo. |
| | `create` | Bloqueado | **Condicional** | Bloqueado | **Permitido** | Cliente registra evento para seu próprio `usuarioId`; corretor registra livremente. |
| | `update` / `delete` | Bloqueado | Bloqueado | Bloqueado | Bloqueado | Histórico de auditoria imutável. |
| **`simulacoes`** | `CRUD completo` | Bloqueado | **Permitido** | Bloqueado | Bloqueado | Totalmente privado: somente o cliente titular pode criar, ler, editar ou deletar. |
| **`solicitacoesLgpd`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | **Permitido** | Titular acompanha seu pedido; corretor visualiza para cumprimento legal. |
| | `create` | Bloqueado | **Condicional** | Bloqueado | Bloqueado | Titular abre solicitação vinculando `usuarioId == auth.uid`. |
| | `update` / `delete` | Bloqueado | Bloqueado | Bloqueado | Bloqueado | Registros formais de protocolo não editáveis. |
| **`favoritos`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | **Condicional** | Corretor lê **somente** se o cliente marcou `compartilharPreferencias == true`. |
| | `create` / `delete` | Bloqueado | **Permitido** | Bloqueado | Bloqueado | Apenas o titular adiciona ou remove seus imóveis favoritos. |
| | `update` | Bloqueado | Bloqueado | Bloqueado | Bloqueado | Imutável (criação e deleção apenas). |
| **`buscasDesejadas`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | **Condicional** | Corretor lê **somente** se o cliente marcou `compartilharPreferencias == true`. |
| | `create` / `update` / `delete` | Bloqueado | **Permitido** | Bloqueado | Bloqueado | Gestão privada do titular sobre seus critérios e filtros. |
| **`notificacoes`** | `get` / `list` | Bloqueado | **Permitido** | Bloqueado | Bloqueado | Privado do cliente destinatário. |
| | `create` | Bloqueado | Bloqueado | Bloqueado | Bloqueado | Geradas exclusivamente pela Cloud Function / backend. |
| | `update` | Bloqueado | **Condicional** | Bloqueado | Bloqueado | Apenas o cliente marcando leitura (`lida == true`). |
| | `delete` | Bloqueado | **Permitido** | Bloqueado | Bloqueado | Cliente pode descartar suas notificações lidas. |

---

## 3. Matriz de Permissões do Firebase Storage

| Caminho no Storage | Operação | Anônimo | Cliente Dono | Cliente Outro | Corretor | Regras de Validação |
|---|---|---|---|---|---|---|
| **`/imoveis/{id}/fotos/*`** | Leitura | **Permitido** | **Permitido** | **Permitido** | **Permitido** | Acesso público às fotos de imóveis. |
| | Escrita | Bloqueado | Bloqueado | Bloqueado | **Condicional** | Apenas corretores (claim `corretor`); máx. 15MB; `image/*` ou `application/pdf`. |
| **`/imoveis/{id}/planta/*`** | Leitura | **Permitido** | **Permitido** | **Permitido** | **Permitido** | Acesso público às plantas de imóveis. |
| | Escrita | Bloqueado | Bloqueado | Bloqueado | **Condicional** | Apenas corretores (claim `corretor`); máx. 15MB; `image/*` ou `application/pdf`. |
| **`/documentos/{uid}/{proc}/*`** | Leitura | Bloqueado | **Permitido** | Bloqueado | **Permitido** | Cliente titular ou qualquer corretor via custom claim. |
| | Escrita | Bloqueado | **Condicional** | Bloqueado | Bloqueado | Titular (`auth.uid == uid`); máx. 15MB; `image/*` ou `application/pdf`. |
| **`/avatares/{uid}/*`** | Leitura | **Permitido** | **Permitido** | **Permitido** | **Permitido** | Fotos de perfil públicas. |
| | Escrita | Bloqueado | **Condicional** | Bloqueado | Bloqueado | Titular da conta (`auth.uid == uid`); máx. 3MB; apenas `image/*`. |

---

## 4. Testes de Validação e Verificação Automatizada

### Comandos de Validação Local
- Sintaxe JSON dos índices:
  `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json'))"`
- Validação de regras sem chamadas `get()` no Storage:
  `grep -c "get(" storage.rules` (deve retornar 0)
- Presença de custom claims de papel:
  `grep -c "request.auth.token.role" firestore.rules storage.rules`
