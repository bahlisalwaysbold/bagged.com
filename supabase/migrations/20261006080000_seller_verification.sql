-- ============================================================
-- BAGGED SELLER VERIFICATION (FREE / MANUAL LAUNCH SYSTEM)
-- ============================================================
-- Sellers submit a verification request. A Bagged admin reviews
-- the seller's identity outside the database (for example by
-- checking an ID during a call/meeting), then approves or rejects.
--
-- We store only the minimum review record here:
-- legal name, contact/location, ID type and optional last digits.
-- Never ask sellers to paste a full NIN/BVN into the app.
-- ============================================================

alter table public.seller_profiles
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified','pending','verified','rejected')),
  add column if not exists verified_at timestamptz,
  add column if not exists verification_reviewed_at timestamptz;

update public.seller_profiles
set verification_status = case
  when verified then 'verified'
  else 'unverified'
end
where verification_status is null
   or (verification_status = 'unverified' and verified = true);

create index if not exists seller_profiles_verification_idx
  on public.seller_profiles(verification_status, created_at desc);

create table if not exists public.seller_verification_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  legal_name text not null,
  phone text not null,
  location text not null,
  id_type text not null,
  id_last4 text,
  seller_note text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','withdrawn')),
  rejection_reason text,
  reviewed_by uuid references public.admin_users(user_id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists seller_verification_requests_seller_idx
  on public.seller_verification_requests(seller_id, created_at desc);

create index if not exists seller_verification_requests_status_idx
  on public.seller_verification_requests(status, created_at desc);

create unique index if not exists seller_verification_one_pending_idx
  on public.seller_verification_requests(seller_id)
  where status = 'pending';

alter table public.seller_verification_requests enable row level security;

drop policy if exists "Sellers can read their verification requests" on public.seller_verification_requests;
create policy "Sellers can read their verification requests"
  on public.seller_verification_requests
  for select
  to authenticated
  using (seller_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Sellers can submit verification requests" on public.seller_verification_requests;
create policy "Sellers can submit verification requests"
  on public.seller_verification_requests
  for insert
  to authenticated
  with check (seller_id = (select auth.uid()));

drop policy if exists "Admins manage seller verification requests" on public.seller_verification_requests;
create policy "Admins manage seller verification requests"
  on public.seller_verification_requests
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins delete seller verification requests" on public.seller_verification_requests;
create policy "Admins delete seller verification requests"
  on public.seller_verification_requests
  for delete
  to authenticated
  using ((select public.is_admin()));

revoke all on public.seller_verification_requests from anon, authenticated;
grant select, insert on public.seller_verification_requests to authenticated;
grant update, delete on public.seller_verification_requests to authenticated;

-- Protect verification fields from seller-side profile edits.
create or replace function public.guard_seller_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id = (select auth.uid())
     and not (select public.is_admin()) then
    new.verified := old.verified;
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.verification_reviewed_at := old.verification_reviewed_at;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_seller_profile_verification() from public, anon, authenticated;

drop trigger if exists protect_seller_verification_fields on public.seller_profiles;
create trigger protect_seller_verification_fields
before update on public.seller_profiles
for each row
execute function public.guard_seller_profile_verification();

-- Only verified sellers may publish or activate listings.
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

    if not exists (
      select 1
      from public.seller_profiles sp
      where sp.user_id = new.seller_id
        and sp.verified = true
        and sp.verification_status = 'verified'
    ) then
      raise exception 'Verify your seller identity before publishing listings.'
        using errcode = '42501';
    end if;

    new.is_featured := false;
    new.status := 'published';
    new.is_active := true;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_seller_product() from public, anon, authenticated;

drop trigger if exists seller_product_guard on public.products;
create trigger seller_product_guard
before insert or update on public.products
for each row
execute function public.guard_seller_product();

-- Seller image uploads also require verification. Existing images
-- can still be managed/deleted by the normal seller policies.
drop policy if exists "Seller images upload" on storage.objects;
create policy "Seller images upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.seller_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.verified = true
        and sp.verification_status = 'verified'
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
    and exists (
      select 1
      from public.seller_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.verified = true
        and sp.verification_status = 'verified'
    )
  );

-- ------------------------------------------------------------
-- Admin review helper. Approving/rejecting is atomic and also
-- updates the seller's public verification state.
-- ------------------------------------------------------------
create or replace function public.review_seller_verification(
  p_request_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_request public.seller_verification_requests%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
begin
  if v_admin is null or not (select public.is_admin()) then
    raise exception 'Admin access required.'
      using errcode = '42501';
  end if;

  if v_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected.'
      using errcode = '22023';
  end if;

  select *
  into v_request
  from public.seller_verification_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Verification request not found.'
      using errcode = 'P0001';
  end if;

  update public.seller_verification_requests
  set
    status = v_decision,
    rejection_reason = case
      when v_decision = 'rejected' then nullif(btrim(coalesce(p_rejection_reason,'')), '')
      else null
    end,
    reviewed_by = v_admin,
    reviewed_at = now()
  where id = p_request_id;

  update public.seller_profiles
  set
    verified = (v_decision = 'approved'),
    verification_status = case
      when v_decision = 'approved' then 'verified'
      else 'rejected'
    end,
    verified_at = case
      when v_decision = 'approved' then now()
      else null
    end,
    verification_reviewed_at = now(),
    updated_at = now()
  where user_id = v_request.seller_id;

  return jsonb_build_object(
    'id', v_request.id,
    'seller_id', v_request.seller_id,
    'status', v_decision
  );
end;
$$;

revoke all
on function public.review_seller_verification(uuid,text,text)
from public, anon, authenticated;

grant execute
on function public.review_seller_verification(uuid,text,text)
to authenticated;

-- ============================================================
-- DONE
-- ============================================================
