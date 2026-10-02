# Bagged Store

Bagged is a responsive, single-store storefront backed by Supabase. The existing Bagged pages and visual design are retained. Catalog data, images, admin access, orders, and inventory live in Supabase; the guest shopping bag stays in the browser.

## Requirements

- A Supabase project
- A modern browser
- Python 3 for the simple local static server, or VS Code Live Server
- Supabase CLI only if applying migrations from the terminal

## Supabase configuration

The browser uses the official Supabase JavaScript client from a pinned CDN release. The project URL and **publishable** key are in `js/config.js`. These values are intentionally public and are protected by database RLS. Never place a secret/service-role key in this repository or browser code. `.env.example` documents the equivalent deployment variables; static pages do not read `.env` files at runtime.

To change projects, update `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `js/config.js`.

## Database migration

The migration creates `categories`, `products`, `orders`, `order_items`, and `admin_users`; the `product-images` Storage bucket; RLS/storage policies; and the atomic `create_order` RPC.

The Supabase CLI is not installed in the implementation environment, and only the publishable key was supplied. A publishable key cannot apply DDL or link a project, so the migration has **not** been applied remotely.

Apply it once using either method:

1. In Supabase Dashboard, open **SQL Editor**, create a query, paste the contents of `supabase/migrations/20261002000000_bagged_store.sql`, and run it.
2. Or install the Supabase CLI on Windows with Scoop, then run these commands from the project directory:

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
supabase login
supabase link --project-ref sqaiwhbzsczamdbpowig
supabase db push
```

The migration also creates the public `product-images` bucket, limits uploads to common image MIME types and 10 MiB per file, allows public image reads, and restricts uploads/updates/deletes to authorized admins.

## Create the first admin

1. In Supabase Dashboard, open **Authentication → Users** and create the admin account with email and password.
2. Run this in **SQL Editor** (replacing the email with the account you created):

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'admin@example.com'
on conflict (user_id) do nothing;
```

Only authenticated user IDs present in `admin_users` can use admin data operations. The browser membership check is only a convenience; RLS policies enforce authorization in the database.

## Local development

Run from the `bagged-store` directory:

```powershell
py -m http.server 8000
```

Open `http://localhost:8000`. Alternatively, open this folder in VS Code and start Live Server. Do not open the HTML pages directly as `file://` URLs; Auth session persistence and browser requests need an HTTP origin.

## Deployment

Deploy the contents of this folder to any static host (for example, Netlify, Vercel, or Cloudflare Pages). Set the site's root/output directory to this folder, configure your Supabase URL and publishable key in `js/config.js`, and allow the deployed origin in Supabase **Authentication → URL Configuration**. Apply the migration and create an admin before expecting catalog or dashboard data.

The provided checkout creates a pay-on-delivery order only. Card processing, delivery pricing, refunds, and customer account/profile workflows are intentionally not represented as completed payment features.

## Data and security

- `categories`: open category names, publicly readable; admin writes only.
- `products`: descriptions, condition, base/sale pricing, stock, images, feature/sale/sold flags, and publication status. Public reads are limited to published, in-stock, not-sold products.
- `orders` and `order_items`: guest delivery details and purchased item/price snapshots; admin read/write only.
- `admin_users`: Auth user IDs allowed to administer the store; each admin can read only their own membership row.
- `create_order`: locks current product rows, validates availability and quantities, calculates server-side prices/totals, stores order/items, and decrements stock in one transaction.
- `bagged_cart`: the only app data retained in local storage; it contains product IDs and quantities, not authoritative prices or order records.

Order delivery details are stored in the database for fulfillment. Do not collect or add customer tracking cookies without a clear requirement.
