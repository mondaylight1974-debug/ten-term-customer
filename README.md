# Ten Term — Customer and Admin Portals

This repository deploys the customer portal at `/` and the private admin portal at `/admin`. Both use one server and the dedicated Ten Term Supabase project.

## Backend configuration

Set these environment variables on Render:
- `SUPABASE_URL=https://ryucqteaazvlsshqcybc.supabase.co`
- `SUPABASE_SECRET_KEY` — create/copy a server-only Supabase secret key; never put it in browser code or GitHub.
- `SESSION_SECRET` — a random value of at least 32 characters.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` — admin login; store only a bcrypt hash.
- `PAYSTACK_ENABLED=false` until Paystack confirms the business category and DVA eligibility.
- `PAYSTACK_SECRET_KEY` — server-only, add only after approval.

## Money safety
The database has a signed wallet ledger. Verified Paystack deposits credit it once; withdrawal requests reserve funds atomically; rejected requests refund the reserved amount. Never mark a withdrawal paid until the bank transfer has actually been completed. Daily task rewards are not automatic or guaranteed and must be configured and reviewed by the administrator.

## Paystack webhook
Only after Paystack is approved and funding is enabled, configure:
`https://YOUR-RENDER-DOMAIN/api/paystack/webhook`

Do not accept live deposits until both portals, webhook verification, and wallet reconciliation have been tested.
