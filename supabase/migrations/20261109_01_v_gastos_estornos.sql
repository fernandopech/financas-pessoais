-- Estornos descontam do gasto (aprovado em 09/11/2026, proposta em dados/proposta-importacao.md; auditor: aprovar com ajustes).
-- v_gastos passa a trazer também as ENTRADAS com categoria de gasto (estorno no cartão, Pix devolvido, reembolso).
-- `valor` continua positivo; a coluna nova `valor_liquido` (no fim, para o create or replace aceitar) é negativa nos estornos.
-- As views que somam gasto passam a somar `valor_liquido`; o "fora do padrão" da v_vigia olha só as saídas.
-- Segurança: todas as views com security_invoker e sem acesso pela chave pública (o padrão do schema public dava select ao anon).

create or replace view v_gastos with (security_invoker = on) as
select t.id, t.data, t.valor, t.conta_id, co.nome as conta, t.categoria_id,
  coalesce(p.nome, c.nome) as categoria, case when p.id is not null then c.nome end as subcategoria,
  t.descricao, t.estabelecimento, t.status, t.origem,
  case t.direcao when 'saida' then t.valor else -t.valor end as valor_liquido
from transacoes t
join categorias c on c.id = t.categoria_id
left join categorias p on p.id = c.pai_id
join contas co on co.id = t.conta_id
where c.natureza = 'gasto';

create or replace view v_semana with (security_invoker = on) as
with g as (
  select date_trunc('week', data)::date as semana, categoria, sum(valor_liquido) as gasto, count(*) as n
  from v_gastos group by 1, 2),
lim as (
  select o.mes, o.limite_semanal from orcamentos o where o.categoria_id is null)
select g.semana, g.categoria, g.gasto, g.n,
  sum(g.gasto) over (partition by g.semana) as gasto_semana,
  (select l.limite_semanal from lim l where l.mes = date_trunc('month', g.semana)::date) as limite_semanal
from g;

create or replace view v_mes with (security_invoker = on) as
select x.mes, x.categoria, x.gasto, x.n,
  (select o.valor from orcamentos o join categorias c on c.id = o.categoria_id
    where o.mes = x.mes and c.nome = x.categoria and c.pai_id is null) as orcado
from (select date_trunc('month', g.data)::date as mes, g.categoria, sum(g.valor_liquido) as gasto, count(*) as n
      from v_gastos g group by 1, 2) x;

create or replace view v_previsao with (security_invoker = on) as
with base as (
  select
    (select coalesce(sum(t.valor), 0) / 3 from transacoes t join categorias c on c.id = t.categoria_id
      where c.natureza = 'receita' and t.data >= date_trunc('month', current_date) - interval '3 months' and t.data < date_trunc('month', current_date)) as receita_media,
    (select coalesce(sum(g.valor_liquido), 0) / 3 from v_gastos g
      where g.data >= date_trunc('month', current_date) - interval '3 months' and g.data < date_trunc('month', current_date)) as gasto_medio),
meses as (select generate_series(date_trunc('month', current_date), date_trunc('month', current_date) + interval '11 months', interval '1 month')::date as mes)
select m.mes, b.receita_media, b.gasto_medio,
  (select coalesce(sum(p.valor_previsto), 0) from parcelas p where not p.cancelada and p.valor_pago = 0
     and date_trunc('month', p.vencimento) = m.mes) as parcelas,
  (select coalesce(sum(r.valor_previsto), 0) from recorrentes r where r.ativa and r.forma <> 'cartao') as recorrentes_fora_do_cartao,
  b.receita_media - b.gasto_medio
    - (select coalesce(sum(p.valor_previsto), 0) from parcelas p where not p.cancelada and p.valor_pago = 0 and date_trunc('month', p.vencimento) = m.mes)
    - (select coalesce(sum(r.valor_previsto), 0) from recorrentes r where r.ativa and r.forma <> 'cartao') as sobra_prevista
from meses m cross join base b;

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
select 'a_confirmar', t.id, t.data, t.valor, t.descricao from transacoes t where t.status = 'a_confirmar';

-- nenhuma view lê nada pela chave pública
revoke all on v_gastos, v_semana, v_mes, v_saldos, v_contas_do_mes, v_dividas, v_patrimonio, v_previsao, v_ciclos, v_vigia
  from anon, authenticated;
