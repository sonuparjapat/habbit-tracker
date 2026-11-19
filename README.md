# Anchor — keep the promises you make to yourself

A discipline app for everyone. Users choose what they want to work on, set **their own limits**,
and Anchor stops them *before* they break those limits. It then shows honestly what discipline was worth.

| Area | What users can do |
|---|---|
| **Trading & investing** (any market: stocks, options, crypto, forex…) | Max trades/day, profit target, daily loss limit, pre-trade checklist. The day **locks** once a limit is hit. Breaking the lock needs a breathing pause and a written reason, and it's recorded. Reports show P&L within rules vs. rule-breaking P&L, overconfidence after winning streaks, and P&L by emotion and by weekday. |
| **Money & spending** | Daily and monthly budgets, no-spend days, categories, month-end projection, over-budget alerts |
| **Habits** | **Build** (do it), **Quit** (stay clean), or **Limit** (stay under N a day). Yes/no, amount or minutes, any weekdays, streaks, calendar heatmap |
| **Everyone** | Daily / weekly / monthly / yearly reports, plain-language insights, journal, reminders (opt-in) |

## Repository

```
backend/   Node.js + Express 5 + PostgreSQL — plain JavaScript (ESM)
mobile/    Expo SDK 58 app (Android / iOS) — Expo Router, TanStack Query
web/       Next.js 16 website (JavaScript) — public site + admin panel at /admin (+ user web app later)
```

## Admin panel — run everything without code changes

| Page | What you can do |
|---|---|
| Dashboard | Members, active today/week/month, 30-day retention, sign-ups & activity charts, top templates, badges earned |
| Users | Search, filter by role, suspend, make admin, verify email, sign out everywhere, delete |
| Feedback | Inbox of bug reports / ideas from the app — reply by email, notes, resolve |
| Templates | The ready-made trackers users pick from |
| Announcements | Banners in the app, with optional button and schedule |
| App settings | Support email, links, maintenance mode, sign-ups on/off, min/latest app version, feature switches, daily quotes, XP points, limits |
| System | API/database health, migrations, email provider + send test email |
| Audit log | Every admin action |

Add a setting: one entry in `backend/src/services/settings.js`. It appears in **App settings** and in the apps automatically.

## Game: XP, levels, badges
Members earn XP for check-ins, clean trades, journals and within-budget expenses, and **lose XP for rule breaks**. XP is calculated from real activity, so it can't drift. 16 badges (streaks, clean trading, budgets, honesty…) unlock with an animated celebration. The app also warns when a streak is at risk and says plainly when one was lost. Points per action are admin settings.

**Deploying & building the app → see [DEPLOYMENT.md](DEPLOYMENT.md)** (AWS options, EAS build, Play Store steps).

## Privacy & permissions (by design)

- **First run:** welcome → choose interests → permissions screen. Notifications are **never requested** until the user taps “Allow”.
- The app needs **no** contacts, location, camera, microphone or photo access.
- **Sign-up** requires an explicit Terms & Privacy checkbox. Product emails are a separate, optional opt-in. Every consent is stored with a timestamp in `consents`.
- Users can **export** all their data and **delete** their account (password-confirmed) from Profile.
- **Admins see counts, not content.** The admin panel never shows a user's trades, expenses or journal.
- When the Terms change, bump `TERMS_VERSION`. Users are asked to re-accept on next launch.
- ⚠️ Have the starter Privacy Policy and Terms (`mobile/src/app/legal/[doc].tsx`) reviewed for your launch countries (India DPDP, EU GDPR, …) and replace the contact email.

---

## 1. Backend

```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET, BREVO_API_KEY, MAIL_FROM
npm install
npm run dev               # http://localhost:4000
npm test                  # 20 test groups (~200 checks) against a throw-away in-memory database
```

New to the code? Read [backend/README.md](backend/README.md) first. It's a 10-minute map of the whole backend.

**Every push is checked** by GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)): backend tests, mobile typecheck and lint, website lint and build. A red ❌ on GitHub means something broke. Fix it before building the app.

**The database sets itself up.** Every time the server starts, it:
1. runs every new file in `src/db/migrations/*.sql`, in order, once (tracked in `schema_migrations`, protected by a Postgres advisory lock so parallel instances are safe)
2. seeds the default templates (never overwrites edits made in the admin panel)

You can also run it by hand with `npm run db:setup`. To change the schema later, **add** a new file like `002_xxx.sql`. Never edit one that has already been applied.

### Roles: everyone is in the `members` table

| `members.role` | Who | Can do |
|---|---|---|
| `1` | Super admin | Everything, including making or removing admins, deleting accounts and reading the audit log |
| `2` | Admin | Dashboard, view and suspend/reactivate normal users, manage templates |
| `3` | User | The app only (every sign-up starts here) |

The role names are in the `member_roles` lookup table. Rights per role live in `backend/src/services/roles.js` (`ROLE_PERMISSIONS`). Change them there; no database change is needed. Super admins can only be created from the server:

```bash
npm run create-admin -- you@example.com "strong-password"            # super admin (1)
npm run create-admin -- teammate@example.com "strong-password" --admin  # admin (2)
npm run create-admin -- someone@example.com --user                   # back to normal user (3)
```

Other scripts: `npm run email:test -- you@example.com` sends a real test email.

### Email (verification + password reset)

Set `EMAIL_PROVIDER`:

| Value | Use | Needs |
|---|---|---|
| `brevo` | **used in production** — picked automatically when `BREVO_API_KEY` is set | `BREVO_API_KEY`, `MAIL_FROM` (a verified sender in Brevo) |
| `console` | development: codes are printed in the server log | nothing |
| `ses` | AWS SES | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (or an IAM role), a verified sender domain in SES, and SES production access |
| `smtp` | any SMTP provider (SendGrid, Mailgun, Brevo, Zoho…) | `SMTP_HOST/PORT/USER/PASS` |

`MAIL_FROM` must be a verified sender in Brevo (*Senders, Domains & Dedicated IPs*).

### API overview (all under `/api`)

| | |
|---|---|
| Public | `GET /meta`, `GET /templates`, `GET /health` |
| Auth | `POST /auth/register` · `login` · `verify-email` · `resend-verification` · `forgot-password` · `reset-password` · `change-password` · `logout-all` · `accept-terms` |
| Account | `GET/PATCH/DELETE /auth/me`, `GET /auth/me/export` |
| Trackers | `GET/POST /trackers`, `GET/PATCH/DELETE /trackers/:id`, `/:id/today`, `/:id/stats?period=week\|month\|90d\|year`, `/:id/entries[/:date]`, `/:id/rule-breaks` |
| Trading | `GET/POST /trackers/:id/trades`, `GET /trackers/:id/status`, `PATCH/DELETE /trades/:id` |
| Spending | `GET/POST /trackers/:id/expenses`, `PATCH/DELETE /expenses/:id` |
| Admin | `/admin/overview`, `/admin/users[/:id]` (suspend, role, verify, logout, delete), `/admin/templates`, `/admin/audit-logs` |

Security: bcrypt passwords, JWT with server-side revocation (`token_version`), rate-limited auth, hashed single-use 6-digit codes (15-minute expiry, 5 attempts), helmet, and suspended accounts blocked immediately.

## 2. Website & admin panel (Next.js)

```bash
cd web
cp .env.example .env.local   # set API_URL to your backend
npm install
npm run dev                  # http://localhost:3000  ·  admin at http://localhost:3000/admin
npm run build && npm start   # production
```

```
web/src/app/
  (site)/page.js              public homepage
  admin/login/                admin sign-in
  admin/(panel)/              dashboard · users · feedback · templates · announcements · settings · system · audit
web/src/lib/api.js            axios: get / post / put / patch / del → returns the response (use res.data)
web/src/lib/useApi.js         small hooks for loading data and running actions in admin pages
web/src/components/admin/kit.js  shared admin UI (tables, forms, modals, toasts)
```

The website calls the backend directly with axios. After admin login the token is saved in `localStorage` and sent as `Authorization: Bearer …`; the backend checks the role on every request. The backend must allow the website's address in `CORS_ORIGIN`. To add the **user web app** later, create pages under a new route group (e.g. `src/app/(app)/today/page.js`) and call the same `get/post/…` functions.

The admin panel has four pages:
- **Dashboard:** users, active today/week/month, sign-ups chart, trackers by category, activity
- **Users:** search, suspend/reactivate, make admin, verify email, sign out everywhere, delete. Consent history is shown; trade/expense content is not.
- **Templates:** add, edit or hide the templates users see in "New tracker". Changes go live instantly, with no app update.
- **Audit log:** every admin action

## 3. Mobile app

```bash
cd mobile
npm install
npx expo start        # scan with Expo Go
```

In development the app reaches the backend on the computer running Metro (same Wi-Fi). For builds, set `EXPO_PUBLIC_API_URL=https://api.yourdomain.com/api`.

## Environment variables

| App | File | Variable | Required | Example / notes |
|---|---|---|---|---|
| backend | `backend/.env` | `DATABASE_URL` | ✅ | `postgres://user:pass@host:5432/anchor` |
| | | `JWT_SECRET` | ✅ | 48+ random bytes, hex |
| | | `NODE_ENV` | ✅ | `production` (also turns database SSL on; `DB_SSL=false` to override) |
| | | `BACKEND_URL` | ✅ | `https://api.yourdomain.com` |
| | | `BREVO_API_KEY` | ✅ | Brevo → SMTP & API → API Keys |
| | | `MAIL_FROM` | ✅ | `Anchor <no-reply@yourdomain.com>` (verified sender in Brevo) |
| | | `PORT` | | `4000` |
| | | `TERMS_VERSION` | | bump when Terms/Privacy change |
| | | `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_BUCKET_NAME` | later | reserved for S3 file storage |
| | | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | later | reserved for Premium payments |
| web | `web/.env.local` | `NEXT_PUBLIC_API_URL` | ✅ | `http://localhost:4000/api` · `https://habbit-tracker-sefr.onrender.com/api` |
| | | `NEXT_PUBLIC_APP_NAME` | | `Anchor` |
| | | `NEXT_PUBLIC_SITE_URL` | | `https://yourdomain.com` |
| | | `NEXT_PUBLIC_PLAY_STORE_URL` | | Play Store link once published |
| | | `NEXT_PUBLIC_SUPPORT_EMAIL` | ✅ | shown on /privacy, /terms, /delete-account |
| mobile | `mobile/.env` | `EXPO_PUBLIC_API_URL` | for builds | `https://api.yourdomain.com/api` (empty in dev = auto-detect) |
| | | `EXPO_PUBLIC_ADS_ENABLED` | | `false` until AdMob is set up |
| | | `EXPO_PUBLIC_SUPPORT_EMAIL` | ✅ | Profile → Help & support, in-app legal screens |

Each app has a commented `.env.example`. `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values are baked into the build, so never put secrets in them.

## Deploying (AWS example)

1. **Database:** RDS PostgreSQL 15+ (`DB_SSL=true`)
2. **API:** run `node backend/src/index.js` on Elastic Beanstalk / ECS / Lightsail / EC2 behind HTTPS (e.g. `api.yourdomain.com`). Tables are created on first start.
3. **Website:** deploy `web/` to Vercel or AWS Amplify (or `npm run build && npm start` on a server) at `yourdomain.com`, with `NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api`, and add the website address to the backend’s `CORS_ORIGIN`.
4. **Email:** verify your domain in SES, request production access, and set `EMAIL_PROVIDER=ses`
5. **App:** `npx eas-cli@latest build -p android --profile production`, then `eas submit -p android`

Before you submit to the Play Store:
- Privacy Policy URL: `https://yourdomain.com/privacy`. Account-deletion URL: `https://yourdomain.com/delete-account` (both are on the website).
- Fill in the Data Safety form. Data collected: email, name, app activity. Not sold, deletable in-app.
- Set the content rating.

**Ads:** Android apps use **Google AdMob** (AdSense is for websites). See `mobile/src/components/AdSlot.tsx`. Ads need a development or production build (not Expo Go) and a consent (UMP) prompt for EEA/UK users. Ads are kept off the trade, lock and expense screens.

## Roadmap ideas
- Google / Apple sign-in
- Server push notifications (weekly report every Sunday)
- Broker / bank CSV import
- Home-screen widget showing today's lock status
- Accountability partner
- Premium subscription next to ads
- Light theme
- Offline mode
