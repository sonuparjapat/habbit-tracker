# Anchor — discipline tracker

A habit tracker built for people who know their rules and still break them.
It started from one trading problem: *"I decided on one trade a day. After a week of
green days I got overconfident, took extra trades, and gave everything back."*

Anchor doesn't just record that. It **steps in at the moment you're about to break a rule**,
and afterwards it **shows in money what breaking rules cost you**.

## What it does

| Feature | What it means |
|---|---|
| **Trading plans** | Max trades/day, daily profit target, max daily loss, trading days, checklist, personal rules |
| **Day lock** | Hitting the target, the loss limit or the trade limit closes the day. The app shows a lock screen with your own "why" and the clean streak you would lose |
| **Friction to break a rule** | A breathing cooldown, then a written reason, then typing *"I am breaking my rule"*. The server refuses the trade (409) without it |
| **Automatic rule-break detection** | Overtrading, trading after target, revenge trading after max loss, exceeding the loss limit, trading off-plan, skipped checklist |
| **Cost of indiscipline** | Equity curve: what you actually made vs. what the trades within your rules made |
| **Overconfidence detector** | Compares how often you break rules after 3+ green days with how often you break them otherwise. Live warning when you're on a streak |
| **Emotion analytics** | Tag how you feel before and after each trade, then see P&L and win rate by emotion |
| **Reports** | Week / month / 90 days / year: win rate, profit factor, drawdown, weekday analysis, calendar heatmap, insights in plain language |
| **Journal** | Daily reflection: market view, what went well, mistakes, one lesson |
| **Habits** | Build or quit habits, yes/no, count or minutes, custom days, streaks, heatmap |
| **Reminders** | Pre-market rules, end-of-day journal, habit reminders, and a "stay away" nudge after the day locks |

## Structure

```
backend/   Node + Express 5 + PostgreSQL (TypeScript, zod, JWT)
mobile/    Expo SDK 58 + Expo Router + TanStack Query + Zustand
```

Tracker settings live in a `config` JSONB column validated by zod. New tracker types
(fitness, finance, study, ...) need a schema plus a stats service, not a database migration.

## Run it locally

### 1. Postgres
Use one of these:
- **Local:** install PostgreSQL 13+ and run `createdb discipline`
- **Free hosted:** create a database on [Neon](https://neon.tech) or Supabase, copy the connection string, and set `DB_SSL=true`

### 2. Backend
```bash
cd backend
cp .env.example .env        # set DATABASE_URL and JWT_SECRET
npm install
npm run dev                 # runs migrations, then listens on :4000
```

### 3. Mobile
```bash
cd mobile
npm install
npx expo start              # scan the QR code with Expo Go
```
In development the app calls the backend on the same machine that runs Metro, at
`http://<your-LAN-IP>:4000/api`. Your phone and laptop must be on the same Wi-Fi.
To use a different backend, set `EXPO_PUBLIC_API_URL`.

## API (all under `/api`, Bearer token)

| Method | Path | |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | |
| GET / PATCH / DELETE | `/auth/me` | DELETE removes the account (required by Play Store) |
| GET | `/dashboard` | Everything the Today screen needs |
| GET / POST | `/trackers` | |
| GET / PATCH / DELETE | `/trackers/:id` | |
| GET | `/trackers/:id/today` | Live status, streaks, alerts |
| GET | `/trackers/:id/stats?period=week\|month\|90d\|year` | Full analytics and insights |
| GET / PUT | `/trackers/:id/entries[/:date]` | Habit check-ins and journal |
| GET | `/trackers/:id/status` | Is the trading day locked? |
| GET / POST | `/trackers/:id/trades` | POST returns 409 `DAY_LOCKED` unless `override` and `breakReason` are sent |
| PATCH / DELETE | `/trades/:id` | Recomputes that day's rule breaks |
| GET | `/trackers/:id/rule-breaks` | Every break, with the reason given at the time |

## Shipping to the Play Store

1. `npm i -g eas-cli && eas login`
2. Deploy the backend (Railway, Render, Fly, or a VPS) with a hosted Postgres, then set `EXPO_PUBLIC_API_URL`
3. `eas build -p android --profile production` produces an `.aab`
4. `eas submit -p android`

**Ads:** AdSense is for websites. Android apps use **AdMob** (same Google account).
See [mobile/src/components/AdSlot.tsx](mobile/src/components/AdSlot.tsx) for the steps.
Ads need a development or production build because they don't work in Expo Go.
Keep ads off the trade and lock screens.

## Roadmap ideas
- Google sign-in, push notifications from the server (weekly report every Sunday)
- Broker import (Zerodha/Upstox CSV) so trades log themselves
- Home-screen widget showing today's lock status
- Accountability partner who gets notified when you break a rule
- Premium tier (in-app subscription) next to ads
- Light theme
