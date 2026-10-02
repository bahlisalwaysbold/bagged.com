alter table public.categories
  add column if not exists icon text not null default '🛍️',
  add column if not exists description text not null default '';

alter table public.products
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists is_active boolean not null default true;

update public.products
set image_urls = images
where coalesce(cardinality(images), 0) > 0
  and cardinality(image_urls) = 0;

update public.products
set is_active = (status = 'published')
where is_active is distinct from (status = 'published') and is_active = true;

drop policy if exists "Available products are public" on public.products;
create policy "Available products are public"
  on public.products for select to anon, authenticated
  using (status = 'published' and is_active = true and is_sold = false);

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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
    ) then
      alter publication supabase_realtime add table public.products;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
    ) then
      alter publication supabase_realtime add table public.categories;
    end if;
  end if;
end;
$$;