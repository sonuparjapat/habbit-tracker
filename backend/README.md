# Anchor backend: how it works

Node.js + Express + PostgreSQL, in plain JavaScript (ES modules). This page explains the whole backend in about 10 minutes of reading.

## Run it

```bash
cd backend
cp .env.example .env        # fill in DATABASE_URL and JWT_SECRET (and BREVO_API_KEY for email)
npm install
npm run dev                 # starts on http://localhost:4000. Tables are created automatically.
npm run create-admin -- you@example.com YourPassword   # make yourself a super admin
npm run email:test -- you@example.com                  # check that email sending works
```

## Folder map

```
src/
  index.js          starts the server: runs migrations, seeds, then listens on PORT
  app.js            the Express app: middleware + every route group (read this first: it has a route map)
  config.js         reads .env once; everything else imports `config` from here

  db/
    pool.js         the Postgres connection: query(sql, params) and withTransaction(fn)
    migrate.js      runs every file in migrations/ once, in order (tracked in schema_migrations)
    migrations/     001_init.sql, 002_…: the database schema. Never edit an old file; add a new one.
    seed.js         default templates (safe to run many times)

  middleware/
    auth.js         requireAuth (reads the Bearer token), requireAdmin, requirePermission
    errors.js       HttpError, parse() for zod validation, the error → JSON handler
    maintenance.js  blocks member routes while the admin's maintenance mode is on

  routes/           one file per area. Each file lists its endpoints at the top.
    meta.js           public: /api/config, /api/templates, /api/feedback
    auth.js           sign up / in, email codes, passwords, my profile
    dashboard.js      Today screen, forest, games
    trackers.js       trackers, daily check-ins, stats
    trackerTrades.js  trades of a trading tracker (+ "is the day locked?")
    trackerExpenses.js expenses of a money tracker
    entries.js        edit / delete one trade or expense
    admin.js          admin: users, roles, templates, audit log
    adminContent.js   admin: settings, announcements, feedback, analytics, system

  services/         the actual logic (routes stay thin and call these)
    rules.js          THE RULE ENGINE: when is a day locked, which rules did a trade / expense break
    trackers.js       load a tracker, build its "today" card
    trackerConfig.js  the settings each tracker type has (with defaults), validated by zod
    habitStats.js, tradingStats.js, spendingStats.js   the reports
    gamification.js   XP, levels and badges
    forest.js, games.js  the forest, weekly boss, piggy bank, fortress, money saved
    settings.js       admin-managed settings (add one entry → it appears in the admin panel)
    roles.js          roles (1 super admin, 2 admin, 3 member) and their permissions
    email.js          sends email through Brevo / SMTP / SES / console
    codes.js          6-digit email codes
    audit.js          writes the admin audit log
    catalog.js        fixed lists: categories, markets, emotions

  utils/
    date.js           dates are 'YYYY-MM-DD' strings in the member's timezone
    validation.js     small shared validators (date, colour)
```

## What happens on a request

Example: the app logs a trade with `POST /api/trackers/abc/trades`.

1. **app.js**: helmet, cors and the JSON body parser run, then the request is matched to `/api/trackers`.
2. **middleware/auth.js** `requireAuth`: reads `Authorization: Bearer <token>` and loads the member into `req.user`. No valid token means a 401.
3. **middleware/maintenance.js**: if maintenance mode is on, members get a 503.
4. **routes/trackerTrades.js**: the handler.
   - `getTracker()` makes sure the tracker belongs to this member (404 otherwise).
   - `parse(schema, req.body)` validates the input (400 with a readable message otherwise).
   - Inside one database transaction: check whether the day is locked, save the trade, then run the rule engine.
5. **services/rules.js** `reevaluateTradingDay()`: replays the whole day trade by trade and records every rule broken. Days are always re-judged as a whole, so editing or deleting a trade can never leave stale rule breaks behind.
6. The reply is JSON. If anything throws an `HttpError`, **middleware/errors.js** turns it into `{ error: { code, message } }`.

## Key ideas

- **Each member only sees their own data.** Every query filters by `user_id`, and `getTracker(userId, id)` is the gate for anything under a tracker.
- **Nothing derived is stored.** Streaks, XP, the forest and the games are calculated from what was logged, so they can never get out of sync.
- **Rule breaks are re-judged after every change.** For trades it's the whole day plus later days that depend on it (weekly / monthly limits, cool-off). For expenses it's the whole month.
- **The admin controls behaviour without code.** Settings live in `services/settings.js`. Add an entry there and it appears in the admin panel and in `GET /api/config`.
- **Errors are thrown, not returned.** Write `throw new HttpError(400, 'Message', 'CODE')` anywhere in a handler.

## How to…

**Add an endpoint**
1. Pick the route file for that area (or create one and mount it in `app.js`).
2. Add the handler and validate the body with `parse(z.object({...}), req.body)`.
3. Add it to the endpoint list at the top of the file.

**Change the database**
Add `src/db/migrations/00X_what_it_does.sql`. It runs automatically on the next start. Don't edit old migration files.

**Add an admin setting**
Add one entry to `SETTINGS` in `services/settings.js`. Set `public: true` if the app needs to read it.

**Add a trading / spending rule**
1. Add its label to `RULE_LABELS` in `services/rules.js`.
2. Add the check in `computeDayStatus()` (if it locks the day) and/or `evaluateTrade()` (if a trade breaks it).

## Environment variables

See `.env.example`. Each one is explained there. Only `DATABASE_URL` and `JWT_SECRET` are required. Email needs `BREVO_API_KEY` and `MAIL_FROM` (a sender verified in Brevo).

## Security (services/security.js)

| Protection | How |
|---|---|
| Password guessing | Rate limits per account and per IP, then an **account lock** after N wrong passwords (Admin → App settings → Security). The owner is emailed a code and unlocks it in the app (`/auth/unlock`). Resetting the password also unlocks. |
| Mass attacks from one network | An IP failing sign-ins on many accounts is **auto-blocked** for a while. Admins can block or unblock IPs and ranges (Admin → Security). You can never block your own IP. In an emergency, run `npm run unblock-ip -- <ip>` (or `-- --all`) on the server. |
| Flooding | At most 600 API requests per minute per IP (`API_RATE_LIMIT`). |
| Stolen / forged sessions | Login tokens accept only HS256. Every lock, suspension, password change and "sign out everywhere" bumps `token_version`, which kills old tokens at once. |
| Weak passwords | Common passwords, repeated characters and passwords containing the email name are refused. |
| Account discovery | Unknown email and wrong password give the same reply and take the same time. Forgot-password and unlock requests always answer the same way. |
| Admin decisions | **Lock**: the member can unlock it themselves by email. **Suspend**: only an admin can lift it, and the reason is shown and emailed. Everything is in the audit log. |
| Injection | Every SQL query uses `$1` placeholders, and all input is validated with zod. Names in emails are HTML-escaped. |
| Privacy | Admins see counts, never the content of trades, journals or expenses. Members can export or delete everything. |
