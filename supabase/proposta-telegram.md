# Proposta: confirmar os lançamentos das notificações pelo Telegram

Status: **aprovada pelo usuário em 15/11/2026 e aplicada** (migração `20261115_01_telegram`, funções `notificacao` v9 e `telegram` v1). Auditada: aprovar com ajustes (incorporados). Webhook e chat ligados em 15/11 (8 atrasados enviados). Falta: fusão notificação × extrato (passo 5).

## Problema
1. Ele não sabe o que a função `notificacao` está gravando.
2. Os lançamentos ficam `a_confirmar` até uma sessão aqui (revisão de domingo).

## O que muda (decidido com o usuário em 15/11/2026)
A cada notificação lida, o bot manda uma mensagem no Telegram com dois botões. O clique grava no banco na hora.

### Formato da mensagem (escolhido: curto, valor na primeira linha)
```
🛒 R$ 42,90 · Mercado Exemplo
C6 débito · Alimentação · hoje 13:39

[✅ Confirmar]  [⚠️ Algo errado]
```
- Emoji pela natureza da categoria: 🛒 gasto · 💰 entrada (receita) · 🔁 transferência entre contas · 📈 aplicação/resgate.
- Linha 1: valor + lugar (`estabelecimento`; sem lugar → descrição curta, ex. "Pix recebido").
- Linha 2: conta + forma (débito / crédito / Pix, lida do texto) · categoria · quando ("hoje 13:39", "ontem 22:30" ou "14/11 22:30"), fuso America/Sao_Paulo, pela hora em que a notificação chegou.
- Entrada: `💰 R$ 100,00 · Fulano de Tal` / `C6 Pix · Outras receitas · ontem 22:30`.
- Transferência: `🔁 R$ 8,00 · entre suas contas` / `C6 Pix · Transferência (não conta como gasto) · hoje 11:36`.
- Sem texto original na mensagem (decisão do usuário). O bruto continua em `notificacoes`.

### Depois do clique (a mensagem é editada)
- **✅ Confirmar** → `status = 'confirmada'`; mensagem vira `✅ R$ 42,90 · Mercado Exemplo · confirmado` com um botão pequeno **[↩ Desfazer]**.
- **⚠️ Algo errado** → menu na mesma mensagem:
  - Saída: as 11 categorias de gasto (Alimentação, Transporte, Saúde, Compras, Lazer, Moradia, Educação, Assinaturas, Cuidados pessoais, Presentes, Outros gastos) + **Transferência minha** + **[Não é gasto]** + **[Valor errado]** + **[↩ Voltar]**.
  - Entrada: Família, Outras receitas, Salário, Rendimentos, Transferência minha + **[Não é entrada]** + **[Valor errado]** + **[↩ Voltar]**.
  - Categoria escolhida → troca a categoria e confirma (`✏️ R$ 42,90 · Mercado Exemplo · Transporte · confirmado` + [↩ Desfazer]). O menu só tem categorias-mãe: trocar a categoria tira a subcategoria que a leitura tinha posto (aceito).
  - **Não é gasto / Não é entrada** (teste, duplicado, propaganda lida como compra) → **não apaga**: categoria vira `cat-ajuste` (natureza `ajuste`, fora de todas as somas), `status='confirmada'`, nota "descartado pelo usuário no Telegram". Mensagem: `🗑️ descartado` + [↩ Desfazer]. Saldo da Flash lido daquela notificação fica (é o número do próprio app).
  - **Valor errado** (ou estorno, caso estranho) → `status = 'revisar'`; mensagem: `🔎 fica para revisar na sessão` + [↩ Desfazer].
- **↩ Desfazer** → volta a categoria que a leitura tinha posto (guardada em `notificacoes.categoria_lida`), `status='a_confirmar'`, e mostra de novo os dois botões. Vale enquanto o lançamento ainda for `origem='notificacao'`.
- Cada gravação é um update condicional (`where` no estado esperado, contando as linhas afetadas): toque duplo ou mensagem antiga já resolvida/substituída pelo extrato responde "já resolvido" e não muda nada.

### O que NÃO gera mensagem
- Notificação sem valor (propaganda do banco, ex. "Antecipe o saque-aniversário" de 15/11), app do Uber, repetição em 10 min: **nada**.
- Compra negada/cancelada e pagamento de fatura: mensagem **sem som e sem botões**: `🔕 Ignorei: compra negada · C6` / `🔕 Ignorei: pagamento de fatura (vem pelo extrato)`.

### Comando `/semana`
Placar da semana atual (segunda a domingo), saído da `v_semana` na hora:
```
📊 Semana de 10/11 a 16/11
Gasto: R$ X de R$ Y · sobram R$ Z
Alimentação R$ … · Transporte R$ … · …
(inclui N lançamentos ainda a confirmar ou a revisar)
```
Sem limite cadastrado no mês → só o gasto e "sem limite cadastrado". Outros comandos (`/mes`, `/pendentes`, `/hoje`) ficam para depois, se ele quiser.

### Atrasados
Ao ligar, o bot manda de uma vez os 8 `a_confirmar` com `origem='notificacao'` que já existem (14 e 15/11; conferido pelo auditor).

## Como funciona por dentro
- **`notificacao`** (existente): depois de gravar, manda a mensagem (`sendMessage` com `inline_keyboard`) **em segundo plano** (`EdgeRuntime.waitUntil`, fetch com timeout de 5 s): a resposta ao MacroDroid não espera o Telegram. Guarda `telegram_msg_id` e a categoria lida; se falhar, grava `telegram_erro` e o lançamento fica `a_confirmar` (plano B = domingo).
- **`telegram`** (nova, `verify_jwt = false`): webhook do bot (cliques e comandos).
  - Recusa tudo (503) se `TELEGRAM_WEBHOOK_SECRET` tiver menos de 16 caracteres; compara o header `X-Telegram-Bot-Api-Secret-Token` com o segredo em tempo constante.
  - Com `TELEGRAM_CHAT_ID` vazio, só responde a `/start` (diz o número do chat); nenhum clique nem comando funciona. Depois de configurado, qualquer outro chat é ignorado em silêncio.
  - Não tem rota de configuração: o `setWebhook` é feito uma vez, à mão (passo 2).
  - `callback_data` com códigos curtos (ex. `c:<id da notificação>`, `k:3:<id>` para a 3ª categoria do menu), abaixo dos 64 bytes.
  - Só mexe em transações `origem='notificacao'` ligadas à notificação do botão.
- Segredos (criados pelo usuário no painel do Supabase → Edge Functions → Secrets; nunca no chat nem no repositório): `TELEGRAM_TOKEN` (do @BotFather), `TELEGRAM_WEBHOOK_SECRET` (texto aleatório de 32+ caracteres), `TELEGRAM_CHAT_ID`.

## Notificação × extrato (pendência que esta proposta fecha)
Hoje **nada** funde notificação com extrato: `scripts/gravar.py` só tratava `origem='site'`. Sem isso, a próxima importação duplica os lançamentos e perde a categoria corrigida no Telegram. Regra nova na importação (`scripts/gravar.py`/`classificar.py`), antes do próximo extrato:
- Par = mesma conta, mesma direção, mesmo valor, data ±1 dia, `origem='notificacao'`.
- A linha do extrato fica; herda a categoria da notificação quando `decisao in ('confirmada','corrigida')`; descartada (`cat-ajuste`) com par no extrato vira dúvida para ele olhar.
- Antes de apagar a linha da notificação, aponta `notificacoes.transacao_id` para a linha do extrato (a FK não tem `on delete`).

## Mudança no banco (migração `20261115_01_telegram.sql`, numa transação)
```sql
alter table transacoes drop constraint transacoes_status_check;
alter table transacoes add constraint transacoes_status_check check (status in ('confirmada','a_confirmar','revisar'));
alter table notificacoes add column telegram_msg_id bigint;
alter table notificacoes add column telegram_erro text;
alter table notificacoes add column categoria_lida text references categorias(id);
alter table notificacoes add column decisao text check (decisao in ('confirmada','corrigida','descartada','revisar'));
alter table notificacoes add column decidida_em timestamptz;
-- v_vigia: o item 'a_confirmar' passa a incluir status 'revisar'
```
- Nenhuma tabela nova; RLS de `transacoes` e `notificacoes` já ligado e sem acesso pela chave pública.
- `v_gastos`, `v_semana`, `v_mes` não filtram status: `revisar` conta como gasto até ser resolvido (igual ao `a_confirmar`).
- Quem fala em `a_confirmar` (grep de 15/11): `v_vigia` e o texto das skills `contas`, `planejador`, `posso-comprar`; scripts de importação só escrevem `a_confirmar`. Painel e `status.py` não filtram status.
- Volta atrás: tirar as 5 colunas e voltar a constraint antiga (só sem nenhum `revisar`).

## Privacidade e riscos
- Valor, lugar, banco e **nomes de quem manda/recebe Pix** passam a ficar também nos servidores do Telegram (conversa com bot não tem criptografia de ponta a ponta). Desliga apagando o webhook.
- Quem conseguir o token do bot consegue mandar mensagens como o bot, mas não grava no banco: a função exige o segredo do webhook e o chat dele.

## Passos
1. O usuário: criar o bot no @BotFather; pôr `TELEGRAM_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` nos segredos do Supabase.
2. Claude: migração (com ok), código das duas funções, deploy. O usuário: abrir no navegador o link do `setWebhook` que eu montar (ele mesmo cola o token no link; o token não passa por aqui).
3. O usuário: `/start` no bot → o bot responde o número do chat → pôr em `TELEGRAM_CHAT_ID`.
4. Teste: notificação de teste pelo MacroDroid → mensagem chega → confirmar → desfazer → conferir no banco. Depois, os 8 atrasados.
5. Regra notificação × extrato nos scripts de importação; atualizar `supabase/README.md`, skill `contas` (domingo inclui `revisar`) e `ideias.md`.
