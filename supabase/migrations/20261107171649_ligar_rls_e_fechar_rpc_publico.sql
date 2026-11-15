-- Aplicada em 07/11/2026 (aprovada).
-- Fecha o acesso pela chave pública (o site finance-app saiu do ar).
-- Sem políticas: a chave pública não lê nem altera nada; o acesso administrativo continua.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- A função do site roda como dona do banco (security definer) e passaria por cima do RLS.
revoke execute on function public.update_transaction_v2(text, text, text, numeric, text, text, text, text, text, integer, integer, text) from public, anon, authenticated;
