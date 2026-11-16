# Ten Term Customer Website

Customer-facing Ten Term portal with Paystack Dedicated Virtual Account integration.

## Payment flow
1. Customer registers with name, phone and email.
2. Server creates a Paystack customer and requests a Dedicated Virtual Account.
3. The customer sees the provider-issued account number in the dashboard.
4. Customer transfers to that account.
5. Paystack sends `charge.success` to `/api/paystack/webhook`.
6. Server verifies `x-paystack-signature` with the Paystack secret key and records the deposit.

Do not generate bank account numbers locally. Do not put the Paystack secret key in frontend JavaScript or GitHub.

## Environment variables
- `PAYSTACK_SECRET_KEY`: Paystack LIVE secret key, server-only.
- `PAYSTACK_PREFERRED_BANK`: `titan-paystack` or another supported provider slug after confirming availability in your Paystack account.
- `PUBLIC_APP_URL`: public customer URL after deployment.
- `SESSION_SECRET`: long random secret.

## Webhook
After deployment, set this in Paystack:
`https://YOUR-RENDER-SERVICE.onrender.com/api/paystack/webhook`

## Withdrawals
Ten Term stores the customer's bank details and withdrawal request. Customer payouts are manual admin payments; this customer service does not use Paystack to send withdrawals.

## Important compliance note
Paystack states that Nigerian businesses in financial services, betting and general services may need customer identity validation before a DVA can be generated. Confirm your exact business category and approval with Paystack before accepting live customer deposits.

## Plans and task rewards
The six amounts requested are shown in the customer architecture: NGN 1,500; 2,500; 3,500; 10,000; 15,000; 3,500. Daily task rewards are deliberately not hard-coded as guaranteed returns. The task UI says the reward is set by admin and should correspond to genuine completed work. Configure the exact reward rules before launch.
