-- Bagged marketplace foundation.
-- Sellers own their listings. Free listings are the default; paid boosts/subscriptions can be layered on later.
create table if not exists public.seller_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_name text not null check (char_length(btrim(store_name)) between 2 and 120),
  phone text not null default '',
  location text not null default '',
  bio text not null default '',
  verified boolean not null default false,
  plan text not null default 'free' check (plan in ('free','pro','business')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists seller_id uuid references public.seller_profiles(user_id) on delete set null;

alter table public.order_items
  add column if not exists seller_id uuid references public.seller_profiles(user_id) on delete set null;

create index if not exists products_seller_idx on public.products(seller_id, created_at desc);
create index if not exists seller_profiles_location_idx on public.seller_profiles(location);
create index if not exists order_items_seller_idx on public.order_items(seller_id);

alter table public.seller_profiles enable row level security;

drop policy if exists "Seller profiles are publicly readable" on public.seller_profiles;
create policy "Seller profiles are publicly readable"
  on public.seller_profiles for select to anon, authenticated using (true);

drop policy if exists "Sellers manage their profile" on public.seller_profiles;
create policy "Sellers manage their profile"
  on public.seller_profiles for all to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Sellers can create listings" on public.products;
create policy "Sellers can create listings"
  on public.products for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and exists (
      select 1 from public.seller_profiles
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "Sellers can manage their listings" on public.products;
create policy "Sellers can manage their listings"
  on public.products for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

drop policy if exists "Sellers can delete their listings" on public.products;
create policy "Sellers can delete their listings"
  on public.products for delete to authenticated
  using (seller_id = (select auth.uid()));

drop policy if exists "Seller images upload" on storage.objects;
create policy "Seller images upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.seller_profiles
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "Seller images update" on storage.objects;
create policy "Seller images update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Seller images delete" on storage.objects;
create policy "Seller images delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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
    new.status := 'published';
    new.is_active := true;
  end if;
  return new;
end;
$$;

drop trigger if exists seller_product_guard on public.products;
create trigger seller_product_guard
before insert or update on public.products
for each row execute function public.guard_seller_product();

-- Rebuild the order RPC so multi-seller orders retain the seller on every line.
create or replace function public.create_order(p_customer jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested record;
  item_product public.products%rowtype;
  created_order public.orders%rowtype;
  order_lines jsonb := '[]'::jsonb;
  order_total numeric(12, 2) := 0;
  current_price numeric(12, 2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Your bag must contain a list of products.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Your bag is empty.' using errcode = '22023';
  end if;
  if nullif(btrim(p_customer->>'name'), '') is null
     or nullif(btrim(p_customer->>'phone'), '') is null
     or nullif(btrim(p_customer->>'address'), '') is null
     or nullif(btrim(p_customer->>'payment'), '') is null then
    raise exception 'Complete the required delivery details.' using errcode = '22023';
  end if;

  for requested in
    select item.id, sum(item.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as item(id uuid, quantity integer)
    group by item.id
    order by item.id
  loop
    if requested.quantity is null or requested.quantity < 1 then
      raise exception 'Product quantities must be positive.' using errcode = '22023';
    end if;

    select * into item_product
    from public.products
    where id = requested.id
      and status = 'published'
      and is_active = true
      and is_sold = false
    for update;

    if not found then
      raise exception 'A product in your bag is no longer available.' using errcode = 'P0001';
    end if;
    if item_product.stock < requested.quantity then
      raise exception 'Not enough stock for %.', item_product.name using errcode = 'P0001';
    end if;

    current_price := case
      when item_product.is_sale and item_product.sale_price is not null then item_product.sale_price
      else item_product.price
    end;
    order_total := order_total + (current_price * requested.quantity);
    order_lines := order_lines || jsonb_build_array(jsonb_build_object(
      'product_id', item_product.id,
      'seller_id', item_product.seller_id,
      'product_name', item_product.name,
      'quantity', requested.quantity,
      'unit_price', current_price
    ));
  end loop;

  if jsonb_array_length(order_lines) = 0 then
    raise exception 'No available products were found in your bag.' using errcode = 'P0001';
  end if;

  insert into public.orders (
    customer_name, customer_phone, customer_email, delivery_address,
    payment_method, total
  ) values (
    btrim(p_customer->>'name'),
    btrim(p_customer->>'phone'),
    nullif(btrim(p_customer->>'email'), ''),
    btrim(p_customer->>'address'),
    btrim(p_customer->>'payment'),
    order_total
  ) returning * into created_order;

  insert into public.order_items (
    order_id, product_id, seller_id, product_name, unit_price, quantity
  )
  select created_order.id, line.product_id, line.seller_id, line.product_name, line.unit_price, line.quantity
  from jsonb_to_recordset(order_lines) as line(
    product_id uuid, seller_id uuid, product_name text, unit_price numeric, quantity integer
  );

  update public.products as product
  set stock = product.stock - line.quantity,
      is_sold = (product.stock - line.quantity = 0),
      updated_at = now()
  from jsonb_to_recordset(order_lines) as line(product_id uuid, quantity integer)
  where product.id = line.product_id;

  return jsonb_build_object(
    'id', created_order.id,
    'order_number', created_order.order_number,
    'total', created_order.total,
    'status', created_order.status
  );
end;
$$;

insert into public.categories (name, icon, description) values
  ('Phones & Tablets', '📱', 'Phones, tablets & mobile gear'),
  ('Computers & Tech', '💻', 'Laptops, PCs & electronics'),
  ('Gaming', '🎮', 'Consoles, games & gaming gear'),
  ('Fashion', '👕', 'Clothes, shoes & accessories'),
  ('Home & Living', '🏠', 'Furniture, appliances & home finds'),
  ('Vehicles', '🚗', 'Cars, bikes & vehicle parts'),
  ('Beauty & Care', '✨', 'Beauty, grooming & everyday care'),
  ('Books & School', '📚', 'Books, stationery & school gear'),
  ('Food & Groceries', '🍽️', 'Food, drinks & grocery items'),
  ('Services', '🛠️', 'Services, skills & local offers'),
  ('Other', '🛍️', 'Anything else worth bagging')
on conflict (name) do nothing;
