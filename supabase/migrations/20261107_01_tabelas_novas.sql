-- Reorganização do banco, passo 2: tabelas novas ao lado das antigas (aprovado em 07/11/2026).
-- Desenho em supabase/proposta-reorganizacao.md. Nada antigo é apagado aqui.

create table contas (
  id text primary key default gen_random_uuid()::text,
  nome text not null unique,
  tipo text not null check (tipo in ('corrente','credito','beneficio','dinheiro','investimento')),
  instituicao text,
  dia_fechamento int check (dia_fechamento between 1 and 31),
  dia_vencimento int check (dia_vencimento between 1 and 31),
  limite numeric(12,2) check (limite >= 0),
  ativa boolean not null default true,
  notas text not null default '',
  criado_em timestamptz not null default now()
);

create table categorias (
  id text primary key default gen_random_uuid()::text,
  nome text not null,
  pai_id text references categorias(id),
  natureza text not null check (natureza in ('gasto','receita','transferencia','investimento','pagamento_divida','pagamento_fatura','ajuste')),
  ativa boolean not null default true
);
create unique index categorias_nome_pai on categorias (nome, coalesce(pai_id, ''));

create table faturas (
  id text primary key default gen_random_uuid()::text,
  conta_id text not null references contas(id),
  ano int not null,
  mes int not null check (mes between 1 and 12),
  vencimento date not null,
  valor numeric(12,2) check (valor >= 0),
  pago_em date,
  valor_pago numeric(12,2) check (valor_pago >= 0),
  unique (conta_id, ano, mes)
);

create table recorrentes (
  id text primary key default gen_random_uuid()::text,
  nome text not null,
  valor_previsto numeric(12,2) not null check (valor_previsto >= 0),
  variavel boolean not null default false,
  dia int check (dia between 1 and 31),
  forma text not null check (forma in ('conta','cartao','dinheiro')),
  conta_id text references contas(id),
  categoria_id text references categorias(id),
  inicio date not null default date_trunc('month', current_date)::date,
  ativa boolean not null default true,
  notas text not null default ''
);

create table transacoes (
  id text primary key default gen_random_uuid()::text,
  conta_id text not null references contas(id),
  data date not null,
  valor numeric(12,2) not null check (valor > 0),
  direcao text not null check (direcao in ('entrada','saida')),
  categoria_id text references categorias(id),
  descricao text not null default '',
  estabelecimento text,
  compra_id text,
  parcela_num int,
  parcela_total int,
  fatura_id text references faturas(id),
  par_id text references transacoes(id),
  recorrente_id text references recorrentes(id),
  origem text not null default 'manual' check (origem in ('manual','site','extrato','notificacao','openfinance')),
  id_externo text,
  status text not null default 'confirmada' check (status in ('confirmada','a_confirmar')),
  notas text not null default '',
  criado_em timestamptz not null default now(),
  unique (origem, id_externo)
);
create index transacoes_data on transacoes (data);
create index transacoes_conta_data on transacoes (conta_id, data);

create table dividas (
  id text primary key default gen_random_uuid()::text,
  credor text not null,
  nome text not null unique,
  tipo text not null check (tipo in ('emprestimo','cartao','financiamento','cheque_especial','imposto','outro')),
  grupo text,
  modo text not null default 'fixo' check (modo in ('fixo','livre')),
  juros_mes numeric(7,4) check (juros_mes >= 0),
  cet_ano numeric(7,4) check (cet_ano >= 0),
  aceita_adiantar boolean,
  ativa boolean not null default true,
  notas text not null default ''
);

create table parcelas (
  id text primary key default gen_random_uuid()::text,
  divida_id text not null references dividas(id) on delete cascade,
  numero int not null,
  vencimento date not null,
  valor_previsto numeric(12,2) not null check (valor_previsto >= 0),
  pago_em date,
  valor_pago numeric(12,2) not null default 0 check (valor_pago >= 0),
  cancelada boolean not null default false,
  transacao_id text references transacoes(id),
  unique (divida_id, numero)
);

create table recorrentes_pagamentos (
  id text primary key default gen_random_uuid()::text,
  recorrente_id text not null references recorrentes(id) on delete cascade,
  ano int not null,
  mes int not null check (mes between 1 and 12),
  valor_pago numeric(12,2) not null check (valor_pago >= 0),
  pago_em date not null,
  conta_id text references contas(id),
  transacao_id text references transacoes(id),
  unique (recorrente_id, ano, mes)
);

create table notificacoes (
  id text primary key default gen_random_uuid()::text,
  recebida_em timestamptz not null,
  app text not null,
  titulo text,
  texto text not null,
  bruto jsonb,
  transacao_id text references transacoes(id),
  processada boolean not null default false,
  unique (app, recebida_em, texto)
);

create table importacoes (
  id text primary key default gen_random_uuid()::text,
  arquivo text not null,
  conta_id text references contas(id),
  periodo_inicio date,
  periodo_fim date,
  linhas int,
  novas int,
  duplicadas int,
  importado_em timestamptz not null default now()
);

create table saldos (
  id text primary key default gen_random_uuid()::text,
  conta_id text not null references contas(id),
  data date not null,
  valor numeric(12,2) not null,
  origem text not null default 'informado',
  unique (conta_id, data)
);

create table potes (
  id text primary key default gen_random_uuid()::text,
  nome text not null unique,
  objetivo text,
  meta numeric(12,2),
  prazo date,
  conta_id text references contas(id),
  ativo boolean not null default true
);

create table orcamentos (
  id text primary key default gen_random_uuid()::text,
  mes date not null check (extract(day from mes) = 1),
  categoria_id text references categorias(id),
  valor numeric(12,2) not null check (valor >= 0),
  limite_semanal numeric(12,2) check (limite_semanal >= 0),
  notas text not null default ''
);
create unique index orcamentos_mes_categoria on orcamentos (mes, coalesce(categoria_id, ''));

create table investimentos (
  id text primary key default gen_random_uuid()::text,
  nome text not null,
  tipo text not null,
  conta_id text references contas(id),
  pote_id text references potes(id),
  indexador text,
  taxa text,
  vencimento date,
  liquidez text,
  aplicado_em date,
  ativo boolean not null default true,
  notas text not null default ''
);

create table investimentos_saldos (
  id text primary key default gen_random_uuid()::text,
  investimento_id text not null references investimentos(id) on delete cascade,
  data date not null,
  valor numeric(12,2) not null check (valor >= 0),
  unique (investimento_id, data)
);

create table ciclos (
  id text primary key default gen_random_uuid()::text,
  nome text not null unique,
  tipo text not null check (tipo in ('produto','servico','cuidado')),
  categoria_id text references categorias(id),
  custo_tipico numeric(12,2),
  estimativa_dias int check (estimativa_dias > 0),
  ativo boolean not null default true,
  notas text not null default ''
);

create table ciclo_eventos (
  id text primary key default gen_random_uuid()::text,
  ciclo_id text not null references ciclos(id) on delete cascade,
  data date not null,
  valor numeric(12,2),
  transacao_id text references transacoes(id),
  notas text not null default ''
);

create table cambio (
  id text primary key default gen_random_uuid()::text,
  data date not null,
  moeda text not null check (moeda in ('EUR','GBP','USD')),
  quantidade numeric(12,2) not null check (quantidade > 0),
  cotacao numeric(10,4) not null check (cotacao > 0),
  custo_total_brl numeric(12,2) not null check (custo_total_brl > 0),
  onde text,
  pote_id text references potes(id),
  notas text not null default ''
);

-- Toda tabela nasce trancada para a chave pública.
do $$
declare t text;
begin
  foreach t in array array['contas','categorias','faturas','recorrentes','transacoes','dividas','parcelas',
    'recorrentes_pagamentos','notificacoes','importacoes','saldos','potes','orcamentos','investimentos',
    'investimentos_saldos','ciclos','ciclo_eventos','cambio'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
