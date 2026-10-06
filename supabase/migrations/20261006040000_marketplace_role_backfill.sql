-- Backfill marketplace roles for legacy Bagged sellers.
-- Only accounts without an explicit marketplace preference are changed.

insert into public.marketplace_preferences (
  user_id,
  role
)
select
  sp.user_id,
  'seller'
from public.seller_profiles sp
left join public.marketplace_preferences mp
  on mp.user_id = sp.user_id
where mp.user_id is null
on conflict (user_id) do nothing;
