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

## Customer authentication

Customer accounts use Supabase Auth email/password sign-up and sign-in. Email verification is enabled in the current project settings. The Supabase client persists the session; the account page reads the display name from Auth user metadata. No customer profile table or custom password storage is used, and customer sign-up does not add anyone to `admin_users`. Guest checkout remains available without signing in.

In Supabase **Authentication → URL Configuration**, set the Site URL for the deployed site and add these Redirect URLs (adjust the deployed host/path as needed):

```text
http://localhost:8000/**
https://YOUR_DEPLOYED_HOST/**
```

The local URL is used by email verification and password recovery. Add the production URL before deploying.

### Enable Google sign-in

Google OAuth is currently disabled for this project. To enable it:

1. In Google Cloud Console, configure the OAuth consent screen and create an OAuth client ID of type **Web application**.
2. Add the local/deployed site origins to **Authorized JavaScript origins**, for example `http://localhost:8000` and `https://YOUR_DEPLOYED_HOST`.
3. Set the Google client's **Authorized redirect URI** to `https://sqaiwhbzsczamdbpowig.supabase.co/auth/v1/callback`.
4. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the Google client ID and client secret. Keep the secret in the Supabase dashboard only; never put it in `js/config.js` or other frontend files.
5. Confirm the Bagged site URLs are in Supabase **Authentication → URL Configuration**. The app sends users back to `/account.html` after Google sign-in.

The account page checks whether Google is enabled before starting OAuth and shows a readable message if it is not. Successful Google sign-in cannot be tested until the provider is configured.

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

Customer sign-up/sign-in and password recovery use Supabase Auth; account display names are stored in Auth user metadata, not a separate profile table. Google OAuth requires provider setup in Supabase and Google Cloud Console. Checkout currently creates pay-on-delivery orders only; card processing, delivery pricing, and refunds are not implemented.

## Data and security

- `categories`: open category names, publicly readable; admin writes only.
- `products`: descriptions, condition, base/sale pricing, stock, images, feature/sale/sold flags, and publication status. Public reads are limited to published, in-stock, not-sold products.
- `orders` and `order_items`: guest delivery details and purchased item/price snapshots; admin read/write only.
- `admin_users`: Auth user IDs allowed to administer the store; each admin can read only their own membership row.
- `create_order`: locks current product rows, validates availability and quantities, calculates server-side prices/totals, stores order/items, and decrements stock in one transaction.
- `bagged_cart`: the only app data retained in local storage; it contains product IDs and quantities, not authoritative prices or order records.

Order delivery details are stored in the database for fulfillment. Do not collect or add customer tracking cookies without a clear requirement.
