-- Bagged marketplace role preferences.
-- Every account chooses whether they mainly buy, sell, or do both.
-- The preference changes what marketplace prompts and seller-focused UI they see.

create table if not exists public.marketplace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'buyer'
    check (role in ('buyer','seller','both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_preferences_role_idx
  on public.marketplace_preferences(role);

alter table public.marketplace_preferences enable row level security;

drop policy if exists "Users view their marketplace preference"
on public.marketplace_preferences;

create policy "Users view their marketplace preference"
on public.marketplace_preferences
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists "Users manage their marketplace preference"
on public.marketplace_preferences;

create policy "Users manage their marketplace preference"
on public.marketplace_preferences
for all
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_admin())
)
with check (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

create or replace function public.set_marketplace_role(
  p_role text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user uuid := (select auth.uid());
  normalized_role text := lower(btrim(coalesce(p_role, '')));
begin
  if current_user is null then
    raise exception 'Sign in before saving your marketplace preference.'
      using errcode = '28000';
  end if;

  if normalized_role not in ('buyer','seller','both') then
    raise exception 'Choose buyer, seller, or both.'
      using errcode = '22023';
  end if;

  insert into public.marketplace_preferences (
    user_id,
    role,
    updated_at
  )
  values (
    current_user,
    normalized_role,
    now()
  )
  on conflict (user_id)
  do update set
    role = excluded.role,
    updated_at = now();

  return normalized_role;
end;
$$;

revoke all
on function public.set_marketplace_role(text)
from public, anon, authenticated;

grant execute
on function public.set_marketplace_role(text)
to authenticated;
