-- Bagged boost monetization MVP.
-- Sellers can request paid visibility packages. Admin confirms payment and activates the boost.
-- Once activated, the existing discovery engine automatically places the listing in Featured.

create table if not exists public.boost_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  days integer not null check (days between 1 and 90),
  price numeric(12,2) not null check (price >= 0),
  priority integer not null default 1 check (priority between 1 and 100),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.boost_plans (name, days, price, priority, description)
values
  ('Starter Boost', 7, 1000, 1, '7 days of boosted placement'),
  ('Plus Boost', 14, 2500, 2, '14 days with stronger Featured priority'),
  ('Max Boost', 30, 5000, 3, '30 days with the strongest Featured priority')
on conflict (name) do nothing;

create table if not exists public.boost_orders (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  plan_id uuid not null references public.boost_plans(id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','active','cancelled')),
  payment_reference text not null default '',
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boost_orders_seller_idx
  on public.boost_orders(seller_id, created_at desc);

create index if not exists boost_orders_product_idx
  on public.boost_orders(product_id, created_at desc);

create index if not exists boost_orders_status_idx
  on public.boost_orders(status, created_at desc);

alter table public.boost_plans enable row level security;
alter table public.boost_orders enable row level security;

drop policy if exists "Boost plans are public" on public.boost_plans;
create policy "Boost plans are public"
  on public.boost_plans for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Sellers view their boost orders" on public.boost_orders;
create policy "Sellers view their boost orders"
  on public.boost_orders for select
  to authenticated
  using (seller_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins manage boost orders" on public.boost_orders;
create policy "Admins manage boost orders"
  on public.boost_orders for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create or replace function public.guard_seller_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seller_id is not null
     and new.seller_id = (select auth.uid())
     and not (select public.is_admin()) then
    new.is_featured := false;
    new.boosted_until := null;
    new.boost_priority := 0;
    new.status := 'published';
    new.is_active := true;
  end if;
  return new;
end;
$$;

drop function if exists public.create_boost_request(uuid, uuid);

create or replace function public.create_boost_request(
  p_product_id uuid,
  p_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user uuid := (select auth.uid());
  selected_product public.products%rowtype;
  selected_plan public.boost_plans%rowtype;
  new_order public.boost_orders%rowtype;
begin
  if current_user is null then
    raise exception 'Sign in before requesting a boost.' using errcode = '28000';
  end if;

  select *
  into selected_product
  from public.products
  where id = p_product_id
    and seller_id = current_user
    and status = 'published'
    and is_active = true
    and is_sold = false
    and stock > 0;

  if not found then
    raise exception 'That listing is not eligible for a boost.' using errcode = 'P0001';
  end if;

  select *
  into selected_plan
  from public.boost_plans
  where id = p_plan_id
    and is_active = true;

  if not found then
    raise exception 'That boost package is unavailable.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.boost_orders
    where product_id = p_product_id
      and status = 'pending'
  ) then
    raise exception 'This listing already has a pending boost request.' using errcode = '23505';
  end if;

  insert into public.boost_orders (
    seller_id,
    product_id,
    plan_id,
    amount,
    status
  ) values (
    current_user,
    selected_product.id,
    selected_plan.id,
    selected_plan.price,
    'pending'
  )
  returning * into new_order;

  return jsonb_build_object(
    'id', new_order.id,
    'product_id', new_order.product_id,
    'plan_id', new_order.plan_id,
    'amount', new_order.amount,
    'status', new_order.status,
    'message', 'Boost request received. Complete payment with the Bagged admin, then your boost will be activated.'
  );
end;
$$;

revoke all on function public.create_boost_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_boost_request(uuid, uuid) to authenticated;

create or replace function public.admin_activate_boost(
  p_boost_order_id uuid,
  p_payment_reference text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.boost_orders%rowtype;
  plan_row public.boost_plans%rowtype;
  product_row public.products%rowtype;
  start_at timestamptz;
  next_until timestamptz;
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select *
  into order_row
  from public.boost_orders
  where id = p_boost_order_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'That boost request is no longer pending.' using errcode = 'P0001';
  end if;

  select * into plan_row from public.boost_plans where id = order_row.plan_id;
  select * into product_row from public.products where id = order_row.product_id for update;

  if not found or product_row.status <> 'published' or not product_row.is_active or product_row.is_sold or product_row.stock <= 0 then
    raise exception 'The listing is no longer eligible for a boost.' using errcode = 'P0001';
  end if;

  start_at := greatest(now(), coalesce(product_row.boosted_until, now()));
  next_until := start_at + make_interval(days => plan_row.days);

  update public.products
  set boosted_until = next_until,
      boost_priority = greatest(coalesce(boost_priority, 0), plan_row.priority),
      updated_at = now()
  where id = product_row.id;

  update public.boost_orders
  set status = 'active',
      payment_reference = left(btrim(coalesce(p_payment_reference, '')), 120),
      activated_at = now(),
      updated_at = now()
  where id = order_row.id;

  return jsonb_build_object(
    'id', order_row.id,
    'product_id', order_row.product_id,
    'status', 'active',
    'boosted_until', next_until
  );
end;
$$;

revoke all on function public.admin_activate_boost(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_activate_boost(uuid,text) to authenticated;

create or replace function public.admin_cancel_boost(
  p_boost_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  update public.boost_orders
  set status = 'cancelled',
      updated_at = now()
  where id = p_boost_order_id
    and status = 'pending';

  return found;
end;
$$;

revoke all on function public.admin_cancel_boost(uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_boost(uuid) to authenticated;
