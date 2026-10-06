# Bagged Marketplace

Bagged is a responsive multi-vendor marketplace backed by Supabase. Customers can browse and buy listings, while authenticated sellers can create a seller profile, publish listings, upload photos, manage stock and hide/delete their own listings. The guest shopping bag stays in the browser.

## Requirements

- A Supabase project
- A modern browser
- Python 3 for the simple local static server, or VS Code Live Server
- Supabase CLI only if applying migrations from the terminal

## Supabase configuration

The browser uses the official Supabase JavaScript client from a pinned CDN release. The project URL and **publishable** key are in `js/config.js`. These values are intentionally public and are protected by database RLS. Never place a secret/service-role key in this repository or browser code. `.env.example` documents the equivalent deployment variables; static pages do not read `.env` files at runtime.

To change projects, update `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `js/config.js`.

## Customer and seller authentication

Customer accounts and seller accounts use Supabase Auth email/password sign-up and sign-in. Email verification is enabled in the current project settings. The Supabase client persists the session; the account page reads the display name from Auth user metadata. No customer profile table or custom password storage is used, and customer sign-up does not add anyone to `admin_users`. Guest checkout remains available without signing in.

In Supabase **Authentication → URL Configuration**, set the Site URL to `https://baggedcom.vercel.app` and add these Redirect URLs:

```text
http://localhost:8000/**
https://baggedcom.vercel.app/**
```

The Vercel deployment does not need environment variables for these values because the public project URL and publishable key are shipped in `js/config.js`. Never add a Supabase secret/service-role key to Vercel client-side variables or frontend files.

### Enable Google sign-in

For a new Supabase project, configure Google OAuth as follows. The current Bagged production flow has been verified to reach Google's sign-in page.

1. In Google Cloud Console, configure the OAuth consent screen and create an OAuth client ID of type **Web application**.
2. Add the local/deployed site origins to **Authorized JavaScript origins**, including `http://localhost:8000` and `https://baggedcom.vercel.app`.
3. Set the Google client's **Authorized redirect URI** to `https://sqaiwhbzsczamdbpowig.supabase.co/auth/v1/callback`.
4. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the Google client ID and client secret. Keep the secret in the Supabase dashboard only; never put it in `js/config.js` or other frontend files.
5. Confirm `https://baggedcom.vercel.app/**` and `http://localhost:8000/**` are in Supabase **Authentication → URL Configuration**. The app sends users back to the current site's `/account.html` after Google sign-in.

The account page checks whether Google is enabled and shows a readable message if it is not. Production OAuth was confirmed to redirect to Google's sign-in page with `https://baggedcom.vercel.app/account.html` as the return URL; completing consent requires the customer's Google account.

## Marketplace database migration

The initial migrations create the storefront tables, Storage bucket, RLS policies and atomic `create_order` RPC. The shop-management migration adds category/product management fields. The `20261006000000_marketplace.sql` migration adds seller profiles, seller-owned products, seller photo uploads, multi-seller order snapshots and broad marketplace categories. The `20261006010000_discovery_engine.sql` migration adds boosted placement, privacy-safe marketplace behavior signals, weekly trending products/searches, and personalized product recommendations for both signed-in users and guests.
The initial migration creates `categories`, `products`, `orders`, `order_items`, and `admin_users`; the `product-images` Storage bucket; RLS/storage policies; and the atomic `create_order` RPC. The shop-management migration adds category icons/descriptions, product active state and canonical `image_urls`, ensures secure Storage policies, and enables catalog Realtime updates. It also avoids resetting existing admin-controlled active values on migration reruns.

The Supabase CLI is not installed in the implementation environment, and only the publishable key was supplied. A publishable key cannot apply DDL or link a project, so pending migrations must be applied by an authorized project owner. The live project currently has the five base tables but no public catalog rows and no `product-images` bucket; apply the shop-management migration before using the expanded admin UI.

Apply it once using either method:

1. In Supabase Dashboard, open **SQL Editor**, create a query, paste the contents of each unapplied migration in timestamp order, and run it. For the current installation, apply `supabase/migrations/20261003000000_shop_management.sql`, then `supabase/migrations/20261006000000_marketplace.sql`, and finally `supabase/migrations/20261006010000_discovery_engine.sql` after the existing initial migration.
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

## Marketplace monetization roadmap

Basic seller listings are intentionally free. The application UI is prepared for the next revenue layers: paid listing boosts, Pro/Business seller plans, and transaction/service fees once Bagged controls secure checkout and delivery. Those paid flows are not falsely activated yet; payment processing still needs a provider integration and a payout/reconciliation workflow.

## Deployment

Deploy the contents of this folder to any static host (for example, Netlify, Vercel, or Cloudflare Pages). Set the site's root/output directory to this folder, configure your Supabase URL and publishable key in `js/config.js`, and allow the deployed origin in Supabase **Authentication → URL Configuration**. Apply the migration and create an admin before expecting catalog or dashboard data.

Customer sign-up/sign-in and password recovery use Supabase Auth; account display names are stored in Auth user metadata, not a separate profile table. Google OAuth requires provider setup in Supabase and Google Cloud Console. Checkout currently creates pay-on-delivery orders only; card processing, delivery pricing, and refunds are not implemented.

## Data and security

- `categories`: open category names, publicly readable; admin writes only.
- `products`: descriptions, condition, base/sale pricing, stock, images, feature/sale/sold flags, publication status and optional `seller_id` ownership. Public reads are limited to published, in-stock, not-sold products.
- `orders` and `order_items`: guest delivery details and purchased item/price snapshots; admin read/write only.
- `admin_users`: Auth user IDs allowed to administer the store; each admin can read only their own membership row.
- `create_order`: locks current product rows, validates availability and quantities, calculates server-side prices/totals, stores order/items, and decrements stock in one transaction.
- `bagged_cart`: the only app data retained in local storage; it contains product IDs and quantities, not authoritative prices or order records.

Order delivery details are stored in the database for fulfillment. Do not collect or add customer tracking cookies without a clear requirement.

- `seller_profiles`: seller store name, contact details, location, verification state and plan tier.
- `marketplace_events`: privacy-safe anonymous/member interaction signals used only to calculate aggregate trends and personalized discovery. Raw event rows are not publicly readable.
- Seller Storage policies scope uploads/updates/deletes to the authenticated seller's own folder.
