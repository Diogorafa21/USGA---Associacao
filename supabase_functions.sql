-- Supabase / PostgreSQL functions to manage numero_socio assignments atomically
-- Add these in the Supabase SQL editor or via psql connected to your DB.

-- 1) get_next_numero_socio(): returns the smallest positive integer > 0 not currently assigned
create or replace function get_next_numero_socio()
returns integer language sql stable as $$
with nums as (
  select (numero_socio::int) as n
  from utilizadores
  where numero_socio ~ '^[0-9]+$'
), maxn as (
  select coalesce(max(n),0) as m from nums
)
select coalesce((
  select i from generate_series(1, (select m from maxn) + 1) as gs(i)
  left join nums on gs.i = nums.n
  where nums.n is null
  order by i
  limit 1
), 1);
$$;

-- 2) assign_numero_socio(p_user_id uuid, p_num integer):
--    atomically assigns p_num to the specified user, clears that number from any other user,
--    and returns the previous numero_socio of the target user (text) or NULL.
create or replace function assign_numero_socio(p_user_id uuid, p_num integer)
returns text language plpgsql as $$
declare
  current_owner uuid;
  old_num text;
begin
  if p_num is null then
    raise exception 'numero_socio cannot be null';
  end if;
  if p_num <= 0 then
    raise exception 'numero_socio must be > 0';
  end if;

  -- find current owner of the target number (only numeric stored values)
  select id into current_owner
  from utilizadores
  where numero_socio ~ '^[0-9]+$' and (numero_socio::int) = p_num
  limit 1
  for update;

  -- lock the target user row and read their old number
  select numero_socio into old_num from utilizadores where id = p_user_id for update;

  -- if someone else owns this number, clear theirs
  if current_owner is not null and current_owner <> p_user_id then
    update utilizadores set numero_socio = null where id = current_owner;
  end if;

  -- assign the number to target user (store as text)
  update utilizadores set numero_socio = p_num::text, estado = 'ativo' where id = p_user_id;

  return old_num;
exception when others then
  raise;
end;
$$;

-- 3) assign_next_numero_socio(p_user_id uuid): convenience wrapper that picks next and assigns it
create or replace function assign_next_numero_socio(p_user_id uuid)
returns text language plpgsql as $$
declare
  next_num integer;
begin
  next_num := get_next_numero_socio();
  return assign_numero_socio(p_user_id, next_num);
end;
$$;
