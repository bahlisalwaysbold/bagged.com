create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  description text not null default '',
  condition text not null default 'New',
  price numeric(12, 2) not null check (price >= 0),
  sale_price numeric(12, 2) check (sale_price >= 0 and sale_price <= price),
  stock integer not null default 0 check (stock >= 0),
  images text[] not null default '{}',
  badge text not null default '',
  is_featured boolean not null default false,
  is_sale boolean not null default false,
  is_sold boolean not null default false,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('BG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  delivery_address text not null,
  payment_method text not null,
  total numeric(12, 2) not null check (total >= 0),
  status text not null default 'New' check (status in ('New', 'Processing', 'Shipped', 'Completed', 'Cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12, 2) generated always as (unit_price * quantity) stored
);

create index if not exists products_public_catalog_idx on public.products(status, is_sold, stock);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.admin_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Categories are readable by everyone" on public.categories;
create policy "Categories are readable by everyone"
  on public.categories for select to anon, authenticated using (true);
drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories"
  on public.categories for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Available products are public" on public.products;
create policy "Available products are public"
  on public.products for select to anon, authenticated
  using (status = 'published' and is_sold = false and stock > 0);
drop policy if exists "Admins read all products" on public.products;
create policy "Admins read all products"
  on public.products for select to authenticated using ((select public.is_admin()));
drop policy if exists "Admins insert products" on public.products;
create policy "Admins insert products"
  on public.products for insert to authenticated with check ((select public.is_admin()));
drop policy if exists "Admins update products" on public.products;
create policy "Admins update products"
  on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Admins delete products" on public.products;
create policy "Admins delete products"
  on public.products for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Admins read their membership" on public.admin_users;
create policy "Admins read their membership"
  on public.admin_users for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Admins manage orders" on public.orders;
create policy "Admins manage orders"
  on public.orders for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage order items"
  on public.order_items for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

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

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  select created_order.id, line.product_id, line.product_name, line.unit_price, line.quantity
  from jsonb_to_recordset(order_lines) as line(
    product_id uuid, product_name text, unit_price numeric, quantity integer
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

revoke all on function public.create_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Product images are publicly readable" on storage.objects;
create policy "Product images are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));
drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));