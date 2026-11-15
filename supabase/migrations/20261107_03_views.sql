-- Reorganização, passo 4: as contas moram em views (security_invoker: a chave pública continua sem ver nada).
-- Semana começa na segunda. "Gasto" = categoria com natureza 'gasto', pela data da compra.

create view v_gastos with (security_invoker = on) as
select t.id, t.data, t.valor, t.conta_id, co.nome as conta, t.categoria_id,
  coalesce(p.nome, c.nome) as categoria, case when p.id is not null then c.nome end as subcategoria,
  t.descricao, t.estabelecimento, t.status, t.origem
from transacoes t
join categorias c on c.id = t.categoria_id
left join categorias p on p.id = c.pai_id
join contas co on co.id = t.conta_id
where c.natureza = 'gasto' and t.direcao = 'saida';

create view v_semana with (security_invoker = on) as
with g as (
  select date_trunc('week', data)::date as semana, categoria, sum(valor) as gasto, count(*) as n
  from v_gastos group by 1, 2),
lim as (
  select o.mes, o.limite_semanal from orcamentos o where o.categoria_id is null)
select g.semana, g.categoria, g.gasto, g.n,
  sum(g.gasto) over (partition by g.semana) as gasto_semana,
  (select l.limite_semanal from lim l where l.mes = date_trunc('month', g.semana)::date) as limite_semanal
from g;

create view v_mes with (security_invoker = on) as
select x.mes, x.categoria, x.gasto, x.n,
  (select o.valor from orcamentos o join categorias c on c.id = o.categoria_id
    where o.mes = x.mes and c.nome = x.categoria and c.pai_id is null) as orcado
from (select date_trunc('month', g.data)::date as mes, g.categoria, sum(g.valor) as gasto, count(*) as n
      from v_gastos g group by 1, 2) x;

create view v_saldos with (security_invoker = on) as
select c.id as conta_id, c.nome, c.tipo,
  coalesce((select sum(case t.direcao when 'entrada' then t.valor else -t.valor end) from transacoes t where t.conta_id = c.id), 0) as saldo_calculado,
  s.data as ultimo_saldo_em, s.valor as ultimo_saldo_informado,
  s.valor + coalesce((select sum(case t.direcao when 'entrada' then t.valor else -t.valor end) from transacoes t
                      where t.conta_id = c.id and t.data > s.data), 0) as saldo_estimado
from contas c
left join lateral (select data, valor from saldos where conta_id = c.id order by data desc limit 1) s on true
where c.ativa;

create view v_contas_do_mes with (security_invoker = on) as
select 'parcela'::text as tipo, p.id, d.nome as descricao, p.numero as parcela,
  (select count(*) from parcelas x where x.divida_id = d.id and not x.cancelada)::int as total_parcelas,
  p.vencimento, p.valor_previsto, nullif(p.valor_pago, 0) as valor_pago, p.pago_em, p.valor_pago > 0 as pago
from parcelas p join dividas d on d.id = p.divida_id
where not p.cancelada
union all
select 'fatura', f.id, 'Fatura ' || c.nome, null, null, f.vencimento, f.valor, f.valor_pago, f.pago_em, f.pago_em is not null or coalesce(f.valor_pago, 0) > 0
from faturas f join contas c on c.id = f.conta_id
union all
select 'recorrente', r.id || ':' || to_char(m.m, 'YYYY-MM'), r.nome || case when r.variavel then ' (variável)' else '' end, null, null,
  make_date(extract(year from m.m)::int, extract(month from m.m)::int, least(coalesce(r.dia, 1), 28)),
  r.valor_previsto, rp.valor_pago, rp.pago_em, rp.id is not null
from recorrentes r
cross join lateral generate_series(r.inicio::timestamp, date_trunc('month', current_date) + interval '3 months', interval '1 month') m(m)
left join recorrentes_pagamentos rp on rp.recorrente_id = r.id and rp.ano = extract(year from m.m) and rp.mes = extract(month from m.m)
where r.forma <> 'cartao' and (r.ativa or rp.id is not null);

create view v_dividas with (security_invoker = on) as
select d.id, d.credor, d.nome, d.tipo, d.juros_mes, d.cet_ano, d.aceita_adiantar,
  count(*) filter (where p.valor_pago = 0 and not p.cancelada) as parcelas_abertas,
  sum(p.valor_previsto) filter (where p.valor_pago = 0 and not p.cancelada) as total_aberto,
  min(p.vencimento) filter (where p.valor_pago = 0 and not p.cancelada) as proximo_vencimento,
  max(p.vencimento) filter (where p.valor_pago = 0 and not p.cancelada) as ultima_parcela,
  -- valor presente das parcelas abertas descontadas pelos juros (o que custaria quitar hoje, se o credor der o desconto legal)
  case when d.juros_mes is not null then
    round(sum(p.valor_previsto / power(1 + d.juros_mes / 100.0,
      greatest((p.vencimento - current_date) / 30.0, 0))) filter (where p.valor_pago = 0 and not p.cancelada), 2)
  end as quitar_hoje_estimado
from dividas d left join parcelas p on p.divida_id = d.id
group by d.id;

create view v_patrimonio with (security_invoker = on) as
with meses as (
  select generate_series(date_trunc('month', (select min(data) from transacoes)), date_trunc('month', current_date), interval '1 month')::date as mes),
fim as (select mes, (mes + interval '1 month - 1 day')::date as fim from meses)
select f.mes,
  (select coalesce(sum(case t.direcao when 'entrada' then t.valor else -t.valor end), 0) from transacoes t where t.data <= f.fim) as contas_calculado,
  (select coalesce(sum(s.valor), 0) from investimentos_saldos s
     where s.data = (select max(s2.data) from investimentos_saldos s2 where s2.investimento_id = s.investimento_id and s2.data <= f.fim)) as investimentos,
  (select coalesce(sum(p.valor_previsto), 0) from parcelas p
     where not p.cancelada and ((p.pago_em is null and p.valor_pago = 0) or p.pago_em > f.fim)) as dividas_abertas
from fim f;

create view v_previsao with (security_invoker = on) as
with base as (
  select
    (select coalesce(sum(t.valor), 0) / 3 from transacoes t join categorias c on c.id = t.categoria_id
      where c.natureza = 'receita' and t.data >= date_trunc('month', current_date) - interval '3 months' and t.data < date_trunc('month', current_date)) as receita_media,
    (select coalesce(sum(g.valor), 0) / 3 from v_gastos g
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

create view v_ciclos with (security_invoker = on) as
with ev as (
  select ciclo_id, data, valor, data - lag(data) over (partition by ciclo_id order by data) as intervalo
  from ciclo_eventos),
r as (
  select c.id, c.nome, c.tipo, c.custo_tipico, c.estimativa_dias,
    max(e.data) as ultima_vez,
    count(e.intervalo) as intervalos_medidos,
    percentile_cont(0.5) within group (order by e.intervalo) as mediana_dias
  from ciclos c left join ev e on e.ciclo_id = c.id
  where c.ativo group by c.id)
select r.*, coalesce(r.mediana_dias, r.estimativa_dias) as intervalo_usado,
  r.ultima_vez + coalesce(r.mediana_dias, r.estimativa_dias)::int as proxima_prevista
from r;

create view v_vigia with (security_invoker = on) as
select 'possivel_duplicado'::text as alerta, t.id, t.data, t.valor, t.descricao
from transacoes t
where exists (select 1 from transacoes x where x.id <> t.id and x.conta_id = t.conta_id and x.data = t.data
                and x.valor = t.valor and x.direcao = t.direcao and x.descricao = t.descricao)
union all
select 'fora_do_padrao', g.id, g.data, g.valor, g.categoria || ': ' || g.descricao
from v_gastos g
where g.valor > 3 * (select avg(g2.valor) from v_gastos g2 where g2.categoria = g.categoria)
  and (select count(*) from v_gastos g2 where g2.categoria = g.categoria) >= 5
union all
select 'a_confirmar', t.id, t.data, t.valor, t.descricao from transacoes t where t.status = 'a_confirmar';
