-- Guards for whatever is added later. These fail the pull request if a new table, view or
-- function is left open, whoever writes it.
begin;

select t.is(
  (select coalesce(string_agg(c.relname, ', '), '') from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'every table has row level security switched on');

select t.is(
  (select coalesce(string_agg(c.relname, ', '), '') from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
     and (has_table_privilege('anon', c.oid, 'SELECT') or (c.relkind <> 'S' and (
          has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE') or has_table_privilege('anon', c.oid, 'TRUNCATE'))))),
  '', 'the signed-out role holds no right on any table, view or sequence');

select t.is(
  (select coalesce(string_agg(c.relname, ', '), '') from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and has_table_privilege('authenticated', c.oid, 'TRUNCATE')),
  '', 'signed-in members cannot empty any table');

select t.is(
  (select coalesce(string_agg(p.proname, ', '), '') from pg_proc p
   where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  '', 'the signed-out role can run no function');

select t.is(
  (select coalesce(string_agg(p.proname, ', '), '') from pg_proc p
   where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg in ('search_path=', 'search_path=""'))),
  '', 'every function that runs with owner rights pins its search path');

select t.is(
  (select coalesce(string_agg(c.relname, ', '), '') from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false)),
  '', 'no view sidesteps row level security');

select t.is(
  (select coalesce(string_agg(c.relname || '.' || pol.polname, ', '), '') from pg_policy pol
   join pg_class c on c.oid = pol.polrelid
   where c.relnamespace = 'public'::regnamespace
     and (pol.polroles = '{0}' or pol.polroles @> array[(select oid from pg_roles where rolname = 'anon')])),
  '', 'no policy applies to signed-out visitors');

select t.finish();
rollback;
