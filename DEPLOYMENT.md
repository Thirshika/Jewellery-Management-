# Digital Diary deployment

The diary uses the Next.js server APIs with managed PostgreSQL. Order records, unique per-order reminder schedules, push subscriptions, and notification history are stored in PostgreSQL; the browser does not use local storage as the order database.

## Database and API

The migration creates:

- `orders` for customer/jewellery details, advance, dates, notes, and completion state.
- `order_reminders` with a unique `order_id`, IST reminder timestamp, delivery state, lease/retry fields, and schedule version.
- `notification_history` for scheduling, rescheduling, push attempts, popup display, dismissal, and completion events.
- `push_subscriptions` for opted-in browsers.

By default, the dashboard and order APIs open without a sign-in. **Anyone who can access the deployed site can view, add, change, and complete orders.** Keep the deployment private or set `APP_AUTH_ENABLED=true` to require the single-admin password. When authentication is enabled, the JSON endpoints below require a signed session except for login/logout and the separately protected cron endpoint.

The JSON endpoints are:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in when `APP_AUTH_ENABLED=true` |
| `GET` | `/api/auth/session` | Check the signed session |
| `POST` | `/api/auth/logout` | Clear the session |
| `GET`, `POST` | `/api/orders` | List/search saved orders; create an order |
| `GET`, `PATCH` | `/api/orders/:id` | View or edit an order |
| `POST` | `/api/orders/:id/complete` | Mark an order completed |
| `PATCH` | `/api/orders/:id/reschedule` | Change the deadline and reschedule its reminder |
| `POST` | `/api/orders/:id/reminder/dismiss` | Dismiss an order reminder |
| `GET`, `POST` | `/api/reminders/due` | Poll due reminders; record an in-app popup |
| `GET` | `/api/push/public-key` | Get the public VAPID key |
| `POST`, `DELETE` | `/api/push/subscribe` | Add or remove a browser push subscription |
| `GET` | `/api/cron/reminders` | Claim due reminders and deliver push notifications; requires `CRON_SECRET` |

The database calculates `overdue` from the current `Asia/Kolkata` date instead of storing a stale overdue flag. Input validation is applied on the server as well as in the form.

## 1. Create the database

1. Create a PostgreSQL database through the Vercel Marketplace (for example, Neon).
2. Copy its **pooled** connection string into the `DATABASE_URL` environment variable. Keep the password private.
3. In that database's SQL editor, run [`database/migrations/001_digital_diary.sql`](./database/migrations/001_digital_diary.sql) once. This creates the orders, reminders, push subscriptions, indexes, and notification history tables.

## 2. Configure Vercel environment variables

Set these variables for the Production deployment (and Preview only if preview deployments should contain real business data):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled PostgreSQL connection string |
| `APP_AUTH_ENABLED` | Optional. Set to `true` to require sign-in; leave unset or `false` to open the app without a login |
| `APP_PASSWORD` | Required only when authentication is enabled; use at least 12 characters |
| `APP_SESSION_SECRET` | Required only when authentication is enabled; random signing secret, at least 32 characters |
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

Keep the private key and all passwords in Vercel's encrypted environment-variable settings; never commit real values or put them in `NEXT_PUBLIC_*` variables.

## 3. Deploy and enable reminders

Deploy the project to Vercel. [`vercel.json`](./vercel.json) schedules `GET /api/cron/reminders` daily at 03:30 UTC (09:00 Asia/Kolkata). Vercel cron expressions use UTC. Hobby cron jobs run at most once per day and can be delayed by up to 59 minutes; Pro/Enterprise support per-minute scheduling. On Hobby, reminders due after that day's run can be delayed until the next run. For faster retries and more precise delivery on Pro/Enterprise, change the schedule to `* * * * *` after confirming the plan's function limits.

If an order is created or rescheduled after its 09:00 IST reminder time has already passed, the API also attempts an immediate backend dispatch. This reduces late notifications on Hobby, but failed push delivery still waits for the next daily run to retry.

The job authenticates using the `CRON_SECRET` environment variable and claims due reminders using database row locks, so overlapping invocations do not normally dispatch the same reminder. Failed push attempts are recorded and retried by a later invocation. Check Vercel Function logs for scheduler errors and execution results.

## 4. Enable browser notifications

Open the website and choose **Enable push** in the Digital Diary. The browser asks for notification permission and stores a subscription on the server. Push requires HTTPS (localhost is allowed for development), a supported browser, permission from the user, and the VAPID variables above. If the website is open, due reminders are also polled and shown in the in-app popup.

## Optional password protection

The app opens directly without a login by default, as requested. This also leaves all order data and order-changing APIs publicly accessible on a public deployment. To enable the admin login, set `APP_AUTH_ENABLED=true` and configure a strong `APP_PASSWORD` plus an `APP_SESSION_SECRET` of at least 32 characters, then redeploy. To remove sign-in, unset `APP_AUTH_ENABLED` (or set it to `false`) and redeploy.

For sound, click **Enable sound** once in each browser tab/session. Browsers block audio that starts without a user gesture; operating-system notification sounds are controlled by the browser and device and cannot be guaranteed by the website.

## Local development

Copy `.env.example` to `.env.local`, set `DATABASE_URL`, `CRON_SECRET`, and any optional push keys, run the SQL migration, then use:

```powershell
corepack pnpm install --frozen-lockfile
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
