# Digital Diary deployment

The diary uses the Next.js server APIs with managed PostgreSQL. Order records, unique per-order reminder schedules, push subscriptions, and notification history are stored in PostgreSQL; the browser does not use local storage as the order database.

## Database and API

The migration creates:

- `orders` for customer/jewellery details, advance, dates, notes, and completion state, scoped to a workspace.
- `order_reminders` with a unique `order_id`, IST reminder timestamp, delivery state, lease/retry fields, and schedule version.
- `notification_history` for scheduling, rescheduling, push attempts, popup display, dismissal, and completion events.
- `push_subscriptions` for opted-in browsers.
- `saved_bills` for immutable bill snapshots linked to an order when available and scoped to a workspace.
- `user_accounts` for email or phone-based sign-in, with salted password hashes.
- `workspaces` for isolated business data owned by one account.

The dashboard and business APIs require an account. Anyone can create an account using the sign-up page; each new account receives its own workspace, and its orders, reminders, bills, catalogue, and notification subscriptions are isolated from other accounts. Existing data is retained in a legacy workspace and assigned to the earliest existing account, or to the first account created after the workspace migration. Passwords are stored as salted scrypt hashes. Keep `APP_SESSION_SECRET` private; it signs 12-hour HTTP-only sessions.

The JSON endpoints are:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in with email and password |
| `POST` | `/api/auth/signup` | Create an account and sign in |
| `GET` | `/api/auth/session` | Check the signed session |
| `POST` | `/api/auth/logout` | Clear the session |
| `GET`, `POST` | `/api/orders` | List/search saved orders; create an order |
| `GET`, `POST` | `/api/bills` | List saved bills; save a bill |
| `PATCH` | `/api/bills/:id` | Update an existing saved bill |
| `GET`, `PATCH` | `/api/orders/:id` | View or edit an order |
| `POST` | `/api/orders/:id/complete` | Mark an order completed |
| `PATCH` | `/api/orders/:id/reschedule` | Change the deadline and reschedule its reminder |
| `POST` | `/api/orders/:id/reminder/dismiss` | Dismiss an order reminder |
| `GET`, `POST` | `/api/reminders/due` | Poll due reminders; record an in-app popup |
| `GET` | `/api/push/public-key` | Get the public VAPID key |
| `POST`, `DELETE` | `/api/push/subscribe` | Add or remove a browser push subscription |
| `GET` | `/api/metals/rates` | Get indicative INR-per-gram gold and silver spot rates; requires sign-in |
| `GET` | `/api/cron/reminders` | Claim due reminders and deliver push notifications; requires `CRON_SECRET` |

The database calculates `overdue` from the current `Asia/Kolkata` date instead of storing a stale overdue flag. Input validation is applied on the server as well as in the form.

The dashboard and bill pages show indicative 24K gold, derived 22K gold, and 999 silver prices per gram. Rates come from the public [Gold API](https://gold-api.com/docs), using its XAU/INR and XAG/INR spot prices converted from troy ounces; requests are cached for 15 minutes and open pages refresh at that interval. The rates panel also links to a Google search for Tamil Nadu gold and silver rates. Search results may show different sources and locations and are not guaranteed to be verified quotations. The displayed spot prices are not Tamil Nadu jeweller rates; prices exclude local taxes, GST, and making charges. Verify the shop's actual rate before preparing or agreeing to a bill.

The current application stores customer and jewellery names directly on each order. It does not define or query separate products, customers, payments, or inventory tables, so migrations do not add unrelated entities or alter those names into foreign-key relationships.

## 1. Create and migrate the database

1. Create a PostgreSQL database through the Vercel Marketplace (for example, Neon).
2. Set `DATABASE_URL` to the database's **pooled** PostgreSQL connection string for the application. The application reads it from the environment; no database host or credentials are hardcoded.
3. Before deploying, apply the migrations explicitly. The runner uses the same `pg` library as the application, serializes concurrent migration runs with a transaction-scoped PostgreSQL advisory lock, records applied files in `schema_migrations`, and runs each migration in a transaction. It never drops tables or deletes orders. Database migrations are not run by `next build` or Vercel's build step.

For local development, put the local connection string in the ignored `.env.local` file and run:

```powershell
npm run db:migrate
```

To migrate the **Neon production database**, first link the Vercel project and pull its Production variables to the ignored `.env.production.local` file, then run the same migration command:

```powershell
vercel link
vercel env pull .env.production.local --environment=production
npm run db:migrate
```

The migration runner loads `.env.production.local` before `.env.local` when `DATABASE_URL` is not already set in the process. Confirm the Vercel Production `DATABASE_URL` is the intended Neon database before pulling variables or applying migrations. Do not add either local env file to source control.

Migration `001_digital_diary.sql` creates or repairs the four tables used by the current application: `orders`, `order_reminders`, `notification_history`, and `push_subscriptions`. Migration `002_ensure_digital_diary_schema.sql` is a versioned, idempotent safety migration that ensures those tables, their keys and relationships, defaults, checks, and query indexes exist even if an earlier deployment recorded version `001` but the tables are absent. The order table stores customer and jewellery names as text; there are no separate product, customer, payment, or inventory models in the current application.

Migration `003_order_sample_image.sql` adds a nullable `sample_image` column to `orders` for the customer's reference jewellery photo. Apply it with the same explicit migration command before deploying the photo-upload UI. The form resizes supported JPEG, PNG, or WebP uploads and limits the stored image to 1 MB; order-list responses omit image data, and the photo is returned only when an individual order is opened.

Migration `004_saved_bills.sql` creates the `saved_bills` table. In Digital Diary, **Save bill** stores a bill snapshot in PostgreSQL; saved bills appear in Reports and can be reopened and updated. Apply all pending migrations with `npm run db:migrate` before using bill saving in a deployment.

Migration `005_user_accounts.sql` creates the account table and unique email index. Migration `006_account_phone_login.sql` adds optional phone-number identifiers and a unique phone index while preserving existing email accounts. Run `npm run db:migrate` before deploying these authentication features; schema changes are never run automatically during build or app startup.

Migration `007_isolated_workspaces.sql` creates per-account workspaces, assigns preserved existing orders and bills to the legacy workspace, and adds workspace scope to orders, bills, and push subscriptions. Apply it before deploying the per-account workspace changes.

The migrations preserve existing records: they do not drop tables or delete rows. If an existing table has incompatible data or a conflicting schema, the migration fails and rolls back instead of guessing how to change business data. Review and resolve any reported conflict before retrying.

## 2. Configure Vercel environment variables

Set these variables for the Production deployment (and Preview only if preview deployments should contain real business data):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled PostgreSQL connection string |
| `APP_SESSION_SECRET` | Required. Random session-signing secret, at least 32 characters |
| `CRON_SECRET` | A different random secret, at least 32 characters |
| `VAPID_PUBLIC_KEY` | Public Web Push key |
| `VAPID_PRIVATE_KEY` | Private Web Push key; do not expose it to the browser |
| `VAPID_SUBJECT` | A contact URI such as `mailto:owner@your-domain.com` |

Generate separate session and cron secrets in PowerShell with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Generate the Web Push key pair with:

```powershell
npx web-push generate-vapid-keys
```

Keep the private key and session secret in Vercel's encrypted environment-variable settings; never commit real values or put them in `NEXT_PUBLIC_*` variables. Users set their own account passwords through sign-up; account passwords are not environment variables.

## 3. Deploy and enable reminders

After the production migration succeeds, deploy the project to Vercel. [`vercel.json`](./vercel.json) schedules `GET /api/cron/reminders` daily at 03:30 UTC (09:00 Asia/Kolkata). Vercel cron expressions use UTC. Hobby cron jobs run at most once per day and can be delayed by up to 59 minutes; Pro/Enterprise support per-minute scheduling. On Hobby, reminders due after that day's run can be delayed until the next run. For faster retries and more precise delivery on Pro/Enterprise, change the schedule to `* * * * *` after confirming the plan's function limits.

If an order is created or rescheduled after its 09:00 IST reminder time has already passed, the API also attempts an immediate backend dispatch. This reduces late notifications on Hobby, but failed push delivery still waits for the next daily run to retry.

The job authenticates using the `CRON_SECRET` environment variable and claims due reminders using database row locks, so overlapping invocations do not normally dispatch the same reminder. Failed push attempts are recorded and retried by a later invocation. Check Vercel Function logs for scheduler errors and execution results.

## 4. Enable browser notifications

Open the website and choose **Enable push** in the Digital Diary. The browser asks for notification permission and stores a subscription on the server. Push requires HTTPS (localhost is allowed for development), a supported browser, permission from the user, and the VAPID variables above. If the website is open, due reminders are also polled and shown in the in-app popup.

## Account sign-in and sign-up

Set `APP_SESSION_SECRET` to a newly generated random value of at least 32 characters in the local `.env.local` file and Vercel Production settings. For local development, copy `.env.example` to `.env.local` and generate the value in PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Run pending migrations with `npm run db:migrate`, including `008_account_display_name.sql`, then deploy. Visitors sign up with their name, an email address or phone number, and a password of at least 12 characters. The signup name is shown in the dashboard greeting. Sign in using the same identifier; Indian 10-digit phone numbers are normalized to `+91`, and international numbers may be entered with a `+` country code. Each account receives a separate workspace. The earliest existing account retains the existing workspace data; if no account exists yet, the first new account claims the preserved legacy workspace. Phone sign-in uses the account password; SMS verification and password reset are not implemented.

For sound, click **Enable sound** once in each browser tab/session. Browsers block audio that starts without a user gesture; operating-system notification sounds are controlled by the browser and device and cannot be guaranteed by the website.

## Local development

Copy `.env.example` to `.env.local`, set `DATABASE_URL`, `APP_SESSION_SECRET`, `CRON_SECRET`, and any optional push keys, run `npm run db:migrate`, then use:

```powershell
corepack pnpm install --frozen-lockfile
npm run db:migrate
corepack pnpm dev
```

Vercel Cron does not run as a local background scheduler. To exercise the scheduled handler locally, invoke it manually with the configured secret:

```powershell
$cronSecret = Read-Host 'CRON_SECRET'
Invoke-WebRequest -Method Get -Uri 'http://localhost:3000/api/cron/reminders' -Headers @{ Authorization = "Bearer $cronSecret" }
```

## Checks

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
```

The test command uses Node's built-in TypeScript stripping and requires Node.js 22.6 or newer.
