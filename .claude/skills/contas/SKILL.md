---
name: contas
description: Lançamentos do usuário no banco Supabase (Ferramenta Financeira). Use quando ele pedir as contas/dívidas/faturas do mês, informar valor de fatura, disser que pagou algo ("paguei a fatura", "paguei a van", "paguei a parcela"), mandar saldo, print ou extrato para conferir, pedir para importar extrato ou confirmar transações vindas das notificações. Migrada da skill contas-do-mes (07/11/2026).
---

# Contas

Você mexe no livro-caixa. Regras fixas no `CLAUDE.md`; regras de contagem na skill `planejador` (Parte C3). Esquema completo e views em `supabase/README.md`.

## Banco
- Supabase, `project_id = <project_id>` (`mcp__Supabase__*`).
- Se estiver `INACTIVE`: `restore_project` e esperar `ACTIVE_HEALTHY` (~3 min). O keep-alive do repositório evita isso.
- **Usar só as tabelas novas** (em português). As antigas em inglês (`accounts`, `transactions`…) ficam congeladas até serem apagadas (ver `supabase/README.md`); nunca escrever nelas.

## Leitura
- Pendentes do mês: `v_contas_do_mes` (tipo parcela | fatura | recorrente).
```sql
select tipo, descricao, parcela||'/'||total_parcelas p, vencimento, valor_previsto
from v_contas_do_mes
where vencimento between '<AAAA-MM-01>' and '<último dia>' and not pago
order by vencimento;
```
- Saldo: `v_saldos` (`saldo_estimado` parte do último saldo informado; sem saldo informado, só `saldo_calculado`, que não é confiável).
- Dívidas: `v_dividas`. Alertas: `v_vigia`.

## Tabelas que esta skill escreve
- `transacoes`: `valor` sempre positivo + `direcao` (entrada/saida); `data` da compra; `categoria_id` (natureza na tabela `categorias`); `origem` (manual, extrato, notificacao…) + `id_externo` quando vier de arquivo; `status` `a_confirmar` quando a categoria for chute; `revisar` quando ele marcou "valor errado" no Telegram (ver `supabase/README.md`, Notificações). Na revisão de domingo, conferir os dois.
- `faturas` (cartão, ano, mês de **vencimento**, `valor`, `pago_em`, `valor_pago`).
- `parcelas` (de `dividas`): `pago_em`, `valor_pago`, `transacao_id`.
- `recorrentes_pagamentos` (van, ônibus, wi-fi): `ano`, `mes`, `valor_pago`, `pago_em`, `transacao_id`. Recorrentes com `forma='cartao'` (Spotify, Claro, Uber One) já estão na fatura: nunca lançar à parte.
- `saldos`: saldo real informado por ele ou lido do extrato (conta, data, valor).

## Categorias (ids)
Gasto: `cat-alimentacao` (+ `cat-alim-almoco`, `-cafe`, `-lanche`, `-mercado`, `-janta`, `-sobremesa`), `cat-transporte` (+ `cat-transp-onibus`, `-van`, `-uber`, `-catamara`), `cat-moradia`, `cat-saude` (+ `cat-saude-farmacia`), `cat-cuidados`, `cat-lazer`, `cat-educacao`, `cat-assinaturas`, `cat-compras`, `cat-presentes`, `cat-outros-gasto`. Receita: `cat-salario`, `cat-rendimentos`, `cat-outras-receitas`. Não são gasto: `cat-transferencia`, `cat-aplicacao`, `cat-resgate`, `cat-dividas`, `cat-fatura`, `cat-ajuste`. Categoria nova: só com ok dele.

## Regras
- IDs: deixar o banco gerar (default). Escritas de um pedido em `begin; … commit;`.
- Datas: a do extrato quando houver; senão a do aviso. Dizer qual usou.
- Valor pago ≠ previsto: gravar o real. Total de várias parcelas: distribuir proporcionalmente e avisar.
- Perguntar de qual conta saiu, se ele não disser (padrão: a conta principal, id `conta-principal`).
- Regras fixas de Pix (ex.: transferência do próprio usuário no dia do pagamento = salário) ficam aqui, uma por linha.

## Registrar pagamento (as duas coisas, ligadas)
- **Parcela:** inserir `transacoes` (saída, `cat-dividas`, "Dívida <nome> — parcela <n>") e gravar `pago_em`, `valor_pago`, `transacao_id` na parcela. Várias parcelas pagas juntas: uma transação, todas as parcelas apontando para ela.
- **Fatura:** saída na conta de origem (`cat-fatura`, "Fatura <cartão> <mês>/<ano>") + entrada no cartão (`cat-fatura`, "Pagamento de fatura"), com `par_id` uma apontando para a outra; `update faturas set pago_em, valor_pago`.
- **Recorrente:** saída na origem (categoria do recorrente, `recorrente_id`) + linha em `recorrentes_pagamentos` com `transacao_id`. Ônibus = o saque.
- **Transferência entre contas próprias / aplicação / resgate:** par saída + entrada ligado por `par_id` (`cat-transferencia`, `cat-aplicacao`, `cat-resgate`).
Depois de cada registro: o que falta pagar no mês e o saldo da conta usada.

## Conciliação
Com saldo real ou extrato: primeiro devolver tabela com a leitura de cada linha (data, item, categoria, valor) e só gravar após confirmação. Gravar o saldo em `saldos`. Comparar com `v_saldos`; lançar o que falta; explicar a diferença restante.

## Importar extrato
Arquivo (CSV, OFX, PDF) em `dados/brutos/` (fora do git). Ler, mostrar a tabela da leitura, apontar o que já existe no banco (mesma conta, data, valor e direção) e só gravar o que for novo, depois do ok, com `origem='extrato'` e `id_externo` (id da linha no OFX, ou `arquivo:linha`). Registrar em `importacoes`. Compras no cartão entram uma a uma na conta do cartão (é isso que mostra para onde o dinheiro vai); o pagamento da fatura continua sendo `cat-fatura`. **Parcelada:** uma transação por parcela, com a data da fatura em que ela cai, `parcela_num`/`parcela_total` e o mesmo `compra_id`. **Categorias:** usar só as categorias-mãe na importação (decisão de 09/11/2026); subcategorias depois, quando ele pedir. O que não der para categorizar pelo estabelecimento: perguntar **agrupado por estabelecimento**, nunca linha a linha.

## Formato da resposta
Português, direto. Tabela curta com data, item e valor; total em negrito; uma pergunta no fim só se faltar dado.
