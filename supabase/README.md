# Banco (Supabase)

Postgres no Supabase (plano grátis), acessado pelo Claude com as ferramentas MCP do Supabase. Desenho e SQL nas migrações desta pasta.

## Regras
- **Toda mudança de esquema é uma migração** e ganha cópia em `supabase/migrations/` no mesmo commit.
- **Toda tabela nova nasce com RLS ligado**, sem políticas, e nada exposto à chave pública. A chave pública só alcança `public.ping()`, usada pelo keep-alive.
- **Antes de mudança grande** (reorganizar, apagar ou converter dados): cópia de segurança fora do git.
- **Pausa de 7 dias:** o plano grátis pausa sem uso. O workflow `.github/workflows/supabase-keepalive.yml` chama `public.ping()` duas vezes por semana.

## Tabelas

| Tabela | Para quê |
|---|---|
| `contas` | contas, cartões e benefício; fechamento, vencimento, limite |
| `categorias` | categoria-mãe e subcategoria; **`natureza`** decide o que conta como gasto |
| `transacoes` | lançamentos: valor positivo + `direcao`, data da compra, `par_id` (transferência/fatura), `origem` + `id_externo` (sem duplicar importação), `status` (`a_confirmar`) |
| `faturas` | faturas por mês de vencimento |
| `dividas` + `parcelas` | um modelo só para todas as dívidas; juros ao mês, CET, se aceita adiantar |
| `recorrentes` + `recorrentes_pagamentos` | transporte, internet e assinaturas |
| `saldos` | saldo real informado numa data (ponto de partida dos saldos) |
| `notificacoes`, `importacoes` | texto bruto das notificações do celular; registro de cada extrato importado |
| `orcamentos`, `potes` | orçamento do mês e limite semanal; dinheiro guardado por objetivo |
| `investimentos` + `investimentos_saldos` | aplicações e saldo mensal |
| `ciclos` + `ciclo_eventos` | reposição de produtos, serviços e cuidados |
| `cambio` | compras de moeda estrangeira |

## Views (as contas saem daqui, nunca de cabeça)

| View | Responde |
|---|---|
| `v_gastos` | gastos de verdade, pela data da compra, com estornos descontados |
| `v_semana` / `v_mes` | gasto da semana × limite; mês por categoria × orçado |
| `v_saldos` | saldo por conta, a partir do último saldo informado |
| `v_contas_do_mes` | pendentes: parcelas, faturas, recorrentes |
| `v_dividas` | aberto por dívida e quanto custaria quitar hoje |
| `v_patrimonio` | contas + investimentos − dívidas, mês a mês |
| `v_previsao` | próximos 12 meses (média de 3 meses + parcelas + recorrentes) |
| `v_ciclos` | próxima vez prevista de cada ciclo |
| `v_vigia` | duplicados prováveis, gasto fora do padrão, transações a confirmar |

## Notificações do celular → banco → Telegram

1. O **MacroDroid** no celular encaminha cada notificação dos apps de banco para a Edge Function `notificacao`, com um token no header (`x-token`).
2. A função grava o texto bruto em `notificacoes` e, quando há valor, cria um lançamento em `transacoes` com `status='a_confirmar'` (regras de leitura em `functions/notificacao/ler.ts`). Ignora notificação sem valor, compra negada, pagamento de fatura e a mesma notificação repetida em 10 minutos.
3. Cada lançamento vira mensagem no bot do Telegram com **[✅ Confirmar] [⚠️ Algo errado]**. O clique grava na hora (função `telegram`): confirma, troca a categoria, descarta ou marca para revisar, sempre com **[↩ Desfazer]**.
4. Comandos do bot: `/semana` (gasto × limite semanal), `/hoje`, `/mes`. **O bot não guarda regra nenhuma: lê o banco na hora.** Um limite decidido numa sessão com o Claude vale no bot assim que é gravado.

Segredos (`NOTIF_TOKEN`, `TELEGRAM_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHAT_ID`, `NOME_TITULAR`, `NOMES_FAMILIA`) ficam só no painel do Supabase, nunca no código.

O desenho do fluxo do Telegram, do jeito que foi proposto, auditado e aprovado antes de ser construído, está em [`proposta-telegram.md`](proposta-telegram.md).
