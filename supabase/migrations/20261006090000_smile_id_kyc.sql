alter table public.seller_verification_requests
  add column if not exists provider text not null default 'manual'
    check (provider in ('manual','smile_id')),
  add column if not exists provider_user_id text,
  add column if not exists provider_job_id text,
  add column if not exists provider_smile_job_id text,
  add column if not exists provider_status text,
  add column if not exists provider_action_result_code text,
  add column if not exists provider_id_result_code text,
  add column if not exists provider_result_code text,
  add column if not exists provider_result_text text,
  add column if not exists provider_verified_at timestamptz;

create unique index if not exists seller_verification_provider_job_idx
  on public.seller_verification_requests(provider_job_id)
  where provider_job_id is not null;
create unique index if not exists seller_verification_provider_user_idx
  on public.seller_verification_requests(provider_user_id)
  where provider_user_id is not null;
create index if not exists seller_verification_provider_status_idx
  on public.seller_verification_requests(provider, provider_status, created_at desc);

create or replace function public.guard_seller_verification_provider_fields()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.seller_id = (select auth.uid()) and not (select public.is_admin()) then
    new.provider := old.provider;
    new.provider_user_id := old.provider_user_id;
    new.provider_job_id := old.provider_job_id;
    new.provider_smile_job_id := old.provider_smile_job_id;
    new.provider_status := old.provider_status;
    new.provider_action_result_code := old.provider_action_result_code;
    new.provider_id_result_code := old.provider_id_result_code;
    new.provider_result_code := old.provider_result_code;
    new.provider_result_text := old.provider_result_text;
    new.provider_verified_at := old.provider_verified_at;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_seller_verification_provider_fields() from public, anon, authenticated;
drop trigger if exists protect_seller_verification_provider_fields on public.seller_verification_requests;
create trigger protect_seller_verification_provider_fields
before update on public.seller_verification_requests
for each row execute function public.guard_seller_verification_provider_fields();