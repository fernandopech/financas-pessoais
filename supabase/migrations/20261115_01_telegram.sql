-- Confirmação dos lançamentos das notificações pelo Telegram (aprovado em 15/11/2026;
-- proposta em supabase/proposta-telegram.md, auditor: aprovar com ajustes, ajustes incorporados).
-- Só adiciona colunas e um status; nenhuma tabela nova (RLS de transacoes e notificacoes já ligado, sem acesso público).

-- novo status: ele marcou "valor errado" no Telegram
alter table transacoes drop constraint transacoes_status_check;
alter table transacoes add constraint transacoes_status_check check (status in ('confirmada','a_confirmar','revisar'));

-- rastreio da mensagem e da decisão
alter table notificacoes add column telegram_msg_id bigint;
alter table notificacoes add column telegram_erro text;
alter table notificacoes add column categoria_lida text references categorias(id);
alter table notificacoes add column decisao text check (decisao in ('confirmada','corrigida','descartada','revisar'));
alter table notificacoes add column decidida_em timestamptz;

-- categoria que a leitura pôs nos lançamentos que já existem (para o "desfazer")
update notificacoes n set categoria_lida = t.categoria_id
from transacoes t where t.id = n.transacao_id and t.origem = 'notificacao';

-- v_vigia: pendentes passam a incluir 'revisar' (o alerta traz o próprio status)
create or replace view v_vigia with (security_invoker = on) as
select 'possivel_duplicado'::text as alerta, t.id, t.data, t.valor, t.descricao
from transacoes t
where exists (select 1 from transacoes x where x.id <> t.id and x.conta_id = t.conta_id and x.data = t.data
                and x.valor = t.valor and x.direcao = t.direcao and x.descricao = t.descricao)
union all
select 'fora_do_padrao', g.id, g.data, g.valor, g.categoria || ': ' || g.descricao
from v_gastos g
where g.valor_liquido > 0
  and g.valor > 3 * (select avg(g2.valor) from v_gastos g2 where g2.categoria = g.categoria and g2.valor_liquido > 0)
  and (select count(*) from v_gastos g2 where g2.categoria = g.categoria and g2.valor_liquido > 0) >= 5
union all
select t.status, t.id, t.data, t.valor, t.descricao from transacoes t where t.status in ('a_confirmar', 'revisar');

revoke all on v_vigia from anon, authenticated;
