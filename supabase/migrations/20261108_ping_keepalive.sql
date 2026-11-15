-- 08/11/2026: função mínima para o keep-alive (a tabela settings do site vai ser apagada).
-- Não lê nenhuma tabela, só prova que o banco respondeu.
create or replace function public.ping() returns integer
language sql stable security invoker set search_path = '' as $$ select 1 $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon;
