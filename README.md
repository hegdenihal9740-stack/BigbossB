# Big B Watch Boutique

https://github.com/hegdenihal9740-stack/bigbwatches run

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://big-b-watch-boutique.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/29078dc8-ad52-4af3-872b-b1f1c50a70c2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Backend setup

The store backend uses Supabase for customer accounts, profiles, orders, inventory, products, reviews, review-image storage, and signed-in customer cart/wishlist sync. Server-side seller and order operations run through TanStack Start server functions and require `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and a server-only `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`). Copy `.env.example` to `.env` for local development; `.env` files are git-ignored. Never use a secret/service-role key in a `VITE_` variable or expose it to browser code.

Before deploying backend changes, apply the SQL migrations in `drizzle/migrations` to the intended Supabase database with `npm run db:migrate`. The command reads `LOVABLE_DB_MIGRATION_URL`; use a database URL for the correct project and never expose it in client-side variables. In Lovable, apply migrations through the connected project's database migration workflow or SQL editor if a migration URL is unavailable. Migration `0001_server_validated_orders` validates COD prices and stock, moves seller writes behind authenticated server functions, restricts direct table writes, adds per-customer cart and wishlist storage, and validates review ownership and delivered purchases.

Configure `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) only as a server-side secret in the local `.env` or hosting environment. COD checkout uses the signed-in customer's authenticated Supabase connection and does not require this key; seller management uses the server key. Do not paste secrets into chat, commit them, or add a `VITE_` prefix.

Order email and SMS use Resend and Twilio, respectively. Set `RESEND_API_KEY` and a Resend-verified `RESEND_FROM_EMAIL`; set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`. Add these only as server-side secrets. Email confirmations go to the customer's signed-in account email, and SMS confirmations go to the 10-digit Indian mobile number provided at checkout. A COD placement sends a confirmation, and seller status changes (including cancellations) send updates. If delivery fails, the order remains placed/updated and the UI explicitly reports which notification channel failed. Before enabling SMS, configure Twilio's India geo-permissions and sender/service compliance; trial accounts may only send to verified recipient numbers.

Google sign-in uses Supabase Auth directly. In Supabase, enable Google under Authentication → Providers and enter the Google OAuth client ID and secret. In Google Cloud Console, add Supabase's callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI. Add `http://127.0.0.1:8081/**` and `https://big-b-watch-boutique.lovable.app/**` to Supabase Authentication → URL Configuration → Redirect URLs.

Run `npm test` and `npm run build` before deploying. These commands validate the local application; they do not apply migrations or confirm production Supabase configuration.
