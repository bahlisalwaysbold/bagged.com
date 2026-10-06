-- ============================================================
-- BAGGED AUTHENTICATED CHECKOUT
-- ============================================================
-- Only signed-in Bagged accounts may create orders.
-- The browser also redirects guests, but this database check is
-- the real security boundary.
-- ============================================================

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
  if (select auth.uid()) is null then
    raise exception 'Sign in to Bagged before placing an order.'
      using errcode = '28000';
  end if;

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
  )
  values (
    btrim(p_customer->>'name'),
    btrim(p_customer->>'phone'),
    nullif(btrim(p_customer->>'email'), ''),
    btrim(p_customer->>'address'),
    btrim(p_customer->>'payment'),
    order_total
  )
  returning * into created_order;

  insert into public.order_items (
    order_id, product_id, seller_id, product_name, unit_price, quantity
  )
  select
    created_order.id,
    line.product_id,
    line.seller_id,
    line.product_name,
    line.unit_price,
    line.quantity
  from jsonb_to_recordset(order_lines) as line(
    product_id uuid,
    seller_id uuid,
    product_name text,
    unit_price numeric,
    quantity integer
  );

  update public.products as product
  set
    stock = product.stock - line.quantity,
    is_sold = (product.stock - line.quantity = 0),
    updated_at = now()
  from jsonb_to_recordset(order_lines) as line(
    product_id uuid,
    quantity integer
  )
  where product.id = line.product_id;

  return jsonb_build_object(
    'id', created_order.id,
    'order_number', created_order.order_number,
    'total', created_order.total,
    'status', created_order.status
  );
end;
$$;

revoke all
on function public.create_order(jsonb, jsonb)
from public, anon, authenticated;

grant execute
on function public.create_order(jsonb, jsonb)
to authenticated;

-- ============================================================
-- DONE
-- ============================================================
