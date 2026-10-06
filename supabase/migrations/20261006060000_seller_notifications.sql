-- ============================================================
-- BAGGED SELLER NOTIFICATIONS
-- ============================================================
-- A seller gets a persistent in-app notification whenever one of
-- their listings is included in a new order.
-- ============================================================

create table if not exists public.seller_notifications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  order_number text not null,
  title text not null default '🎉 You made a sale!',
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists seller_notifications_seller_idx
  on public.seller_notifications(seller_id, created_at desc);

create index if not exists seller_notifications_unread_idx
  on public.seller_notifications(seller_id, read_at, created_at desc);

alter table public.seller_notifications enable row level security;

drop policy if exists "Sellers can read their notifications" on public.seller_notifications;
create policy "Sellers can read their notifications"
  on public.seller_notifications
  for select
  to authenticated
  using (seller_id = (select auth.uid()));

drop policy if exists "Sellers can update their notifications" on public.seller_notifications;
create policy "Sellers can update their notifications"
  on public.seller_notifications
  for update
  to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

revoke all on public.seller_notifications from anon, authenticated;
grant select, update on public.seller_notifications to authenticated;

create or replace function public.notify_seller_of_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_number text;
begin
  if new.seller_id is null then
    return new;
  end if;

  select o.order_number
    into v_order_number
  from public.orders o
  where o.id = new.order_id;

  if v_order_number is null then
    return new;
  end if;

  insert into public.seller_notifications (
    seller_id,
    order_id,
    order_item_id,
    product_id,
    product_name,
    quantity,
    order_number,
    title,
    body
  )
  values (
    new.seller_id,
    new.order_id,
    new.id,
    new.product_id,
    new.product_name,
    new.quantity,
    v_order_number,
    '🎉 You made a sale!',
    format(
      '%s × %s was just ordered. Order %s.',
      new.quantity,
      new.product_name,
      v_order_number
    )
  );

  return new;
end;
$$;

revoke all on function public.notify_seller_of_order_item() from public, anon, authenticated;

drop trigger if exists notify_seller_after_order_item on public.order_items;
create trigger notify_seller_after_order_item
after insert on public.order_items
for each row
execute function public.notify_seller_of_order_item();

-- Enable Supabase Realtime for instant Seller Center alerts.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'seller_notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.seller_notifications';
  end if;
exception
  when undefined_object then
    null;
end;
$$;

-- ============================================================
-- DONE
-- ============================================================
