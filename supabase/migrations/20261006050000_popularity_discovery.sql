-- Bagged discovery v2.
-- Public "Popular on Bagged" is based on real marketplace activity.
-- Paid boosts can influence ranking, but they do not define the section.

create or replace function public.get_marketplace_discovery(
  p_user_id uuid default null,
  p_visitor_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  p_user_id := (select auth.uid());

  with user_category_scores as (
    select
      p.category_id,
      sum(
        case e.event_type
          when 'purchase' then 8
          when 'cart_add' then 5
          when 'save' then 4
          when 'view' then 2
          else 0
        end
      )::numeric as score
    from public.marketplace_events e
    join public.products p on p.id = e.product_id
    where e.created_at >= now() - interval '30 days'
      and (
        (p_user_id is not null and e.user_id = p_user_id)
        or
        (p_user_id is null and p_visitor_id is not null and e.visitor_id = p_visitor_id)
      )
      and e.event_type in ('view','save','cart_add','purchase')
    group by p.category_id
  ),
  personalized as (
    select
      p.id,
      (
        coalesce(ucs.score,0)
        + case when p.boosted_until > now() then 3 else 0 end
        + greatest(
            0,
            14 - extract(epoch from (now() - p.created_at)) / 86400
          )::numeric
      ) as score
    from public.products p
    left join user_category_scores ucs on ucs.category_id = p.category_id
    where p.status = 'published'
      and p.is_active = true
      and p.is_sold = false
      and p.stock > 0
      and (
        ucs.category_id is not null
        or not exists (select 1 from user_category_scores)
      )
    order by score desc, p.created_at desc
    limit 12
  ),
  trending_terms as (
    select lower(trim(e.search_term)) as term, count(*)::int as score
    from public.marketplace_events e
    where e.created_at >= date_trunc('week', now())
      and e.event_type = 'search'
      and e.search_term is not null
      and length(trim(e.search_term)) >= 2
    group by lower(trim(e.search_term))
    order by score desc
    limit 8
  ),
  trending_categories as (
    select p.category_id, count(*)::int as score
    from public.marketplace_events e
    join public.products p on p.id = e.product_id
    where e.created_at >= date_trunc('week', now())
      and e.event_type in ('view','save','cart_add','purchase')
    group by p.category_id
    order by score desc
    limit 6
  ),
  engagement_scores as (
    select
      p.id,
      p.seller_id,
      p.created_at,
      (
        coalesce(sum(
          case e.event_type
            when 'purchase' then 8
            when 'cart_add' then 5
            when 'save' then 4
            when 'view' then 2
            else 0
          end
        ),0)
        + case
            when p.boosted_until > now()
              then greatest(coalesce(p.boost_priority,0),1) * 2
            else 0
          end
        + greatest(
            0,
            14 - extract(epoch from (now() - p.created_at)) / 86400
          )::numeric
      ) as score
    from public.products p
    left join public.marketplace_events e
      on e.product_id = p.id
      and e.created_at >= date_trunc('week', now())
      and e.event_type in ('view','save','cart_add','purchase')
    where p.status = 'published'
      and p.is_active = true
      and p.is_sold = false
      and p.stock > 0
    group by p.id, p.seller_id, p.created_at, p.boosted_until, p.boost_priority
  ),
  popular_ranked as (
    select
      es.id,
      row_number() over (
        partition by coalesce(es.seller_id::text, es.id::text)
        order by es.score desc, es.created_at desc
      ) as seller_rank,
      es.score,
      es.created_at
    from engagement_scores es
  ),
  popular as (
    select id
    from popular_ranked
    where seller_rank <= 2
    order by score desc, created_at desc
    limit 12
  ),
  fresh as (
    select p.id
    from public.products p
    where p.status = 'published'
      and p.is_active = true
      and p.is_sold = false
      and p.stock > 0
    order by p.created_at desc
    limit 12
  )
  select jsonb_build_object(
    'trending_terms', coalesce((select jsonb_agg(t) from trending_terms t), '[]'::jsonb),
    'trending_categories', coalesce((select jsonb_agg(tc) from trending_categories tc), '[]'::jsonb),
    'trending_ids',
      coalesce((
        select jsonb_agg(tp.id)
        from (
          select p.id,
            sum(
              case e.event_type
                when 'purchase' then 8
                when 'cart_add' then 5
                when 'save' then 4
                else 2
              end
            )::numeric as score
          from public.marketplace_events e
          join public.products p on p.id = e.product_id
          where e.created_at >= date_trunc('week', now())
            and e.event_type in ('view','save','cart_add','purchase')
            and p.status = 'published'
            and p.is_active = true
            and p.is_sold = false
            and p.stock > 0
          group by p.id
          order by score desc, p.created_at desc
          limit 12
        ) tp
      ), '[]'::jsonb),
    'popular_ids',
      coalesce((select jsonb_agg(p.id) from popular p), '[]'::jsonb),
    'personalized_ids',
      coalesce((select jsonb_agg(p.id) from personalized p), '[]'::jsonb),
    'boosted_ids',
      coalesce((select jsonb_agg(p.id) from popular p), '[]'::jsonb),
    'fresh_ids',
      coalesce((select jsonb_agg(f.id) from fresh f), '[]'::jsonb)
  )
  into result;

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_marketplace_discovery(uuid,text) from public, anon, authenticated;
grant execute on function public.get_marketplace_discovery(uuid,text) to public, anon, authenticated;