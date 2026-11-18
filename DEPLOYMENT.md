# Deploying Anchor & building the app

## What runs where

| Part | What it is | Runs on | Needs |
|---|---|---|---|
| **Database** | PostgreSQL 13+ | AWS RDS (or Neon / Supabase) | — |
| **API** (`backend/`) | Node.js + Express | AWS App Runner / Elastic Beanstalk / EC2 / Lightsail (or Render / Railway) | `DATABASE_URL`, `JWT_SECRET`, `BREVO_API_KEY`, `MAIL_FROM` |
| **Website + admin** (`web/`) | Next.js 16 | AWS Amplify (or Vercel) | `NEXT_PUBLIC_API_URL` |
| **Android app** (`mobile/`) | Expo SDK 58 | Built by EAS, published on Google Play | `EXPO_PUBLIC_API_URL` |
| **Email** | Verification / reset codes | **Brevo** (not AWS) | `BREVO_API_KEY` |

## Where AWS is used

**Right now, nothing in the code needs AWS.** Email goes through Brevo. The `AWS_*` keys in `backend/.env` are reserved for S3 file storage, which no feature uses yet, so you can leave them empty.

If you host **on** AWS, these are the services to use (region **ap-south-1, Mumbai**, is closest to India):

| Need | AWS service | Notes |
|---|---|---|
| Database | **RDS for PostgreSQL** | `db.t4g.micro` is enough to start (free tier for 12 months on new accounts). Turn on automated backups. Set `DB_SSL=true`. |
| API | **App Runner** (simplest) | Builds from the `backend/Dockerfile` image in ECR, gives you HTTPS automatically, scales by itself. Health check path: `/health`. |
| Website + admin | **Amplify Hosting** | Connect the Git repo, set the app root to `web`, add the env vars. Supports Next.js server features. |
| Domain / DNS | **Route 53** (or your domain registrar) | `api.yourdomain.com` → App Runner, `yourdomain.com` → Amplify. |
| Files (later) | **S3** | Only when a feature needs uploads. Create an IAM user limited to one bucket, never the root keys. |

A cheaper non-AWS setup that works the same way: **Neon** (database) + **Render** or **Railway** (API, from the same Dockerfile) + **Vercel** (website).

---

## 1. Database
1. Create a PostgreSQL 15+ database (RDS / Neon / Supabase).
2. Copy its connection string into `DATABASE_URL`.

You don't need to create any tables: the API creates and upgrades them on every start.

## 2. API
```bash
# Option A — Docker (App Runner, Render, Railway, any server)
docker build -t anchor-api ./backend
docker run -p 4000:4000 --env-file backend/.env anchor-api

# Option B — plain Node (EC2 / Lightsail)
cd backend && npm ci --omit=dev && NODE_ENV=production node src/index.js   # keep it running with pm2 or systemd
```
Required env: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `BACKEND_URL`, `BREVO_API_KEY`, `MAIL_FROM`, `CORS_ORIGIN` (your website address).

**Create the first super admin once:**
```bash
npm run create-admin -- you@yourdomain.com "a-long-strong-password"
```
Then check email works: `npm run email:test -- you@gmail.com`, or use **Admin → System → Send test email**.

## 3. Website + admin panel
- **Amplify / Vercel:** connect the repo, set the root to `web`, and add env vars `NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api` and `NEXT_PUBLIC_SITE_URL=https://yourdomain.com`. Then add the website address to the backend’s `CORS_ORIGIN`.
- **Docker:** `docker build -t anchor-web --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api ./web`, then `docker run -p 3000:3000 anchor-web`.

Then open `https://yourdomain.com/admin`, sign in, and go to **App settings**. Fill in:
- **Support email**
- **Website URL**
- **Google Play link** (after launch)
- **Minimum** and **Latest app version**

## 4. Android app (EAS Build)
```bash
cd mobile
npm install -g eas-cli          # or use npx eas-cli@latest
eas login                       # free Expo account
eas init                        # links the project (adds a projectId to app.json)
```
In `mobile/eas.json`, set `EXPO_PUBLIC_API_URL` (`https://api.yourdomain.com/api`) and `EXPO_PUBLIC_SUPPORT_EMAIL` in both profiles.

**Test on your phone (APK):**
```bash
eas build -p android --profile preview
```
EAS gives you a link. Open it on your Android phone and install. Test the full flow: sign-up, the verification email, trackers, a rule break, a badge, and the maintenance switch.

**Play Store build (AAB):**
```bash
eas build -p android --profile production     # build number goes up automatically
```

**Google Play Console** (one-time $25 developer account):
1. **Create app.** Name: Anchor. Free app.
2. **App content:**
   - **Privacy policy:** `https://yourdomain.com/privacy`
   - **Account deletion:** `https://yourdomain.com/delete-account`
   - **Data safety:** collects email, name, app activity. Encrypted in transit. Users can request deletion. Not shared, not sold.
   - **Content rating** questionnaire.
   - **Target audience:** 13+.
   - **Ads:** "No" until AdMob is added.
3. **First upload by hand:** Testing → Internal testing → create a release → upload the `.aab` from EAS. Google requires the first upload to be manual.
4. **Later uploads:** create a Google Play service-account key, save it as `mobile/play-service-account.json` (gitignored), and run `eas submit -p android --profile production`.
5. Move the release from Internal → Closed → Production when ready. New personal developer accounts must run a closed test (currently 12 testers for 14 days) before production.

**Releasing an update:**
1. Run `eas build --profile production` (and submit).
2. After it's live on Play, set **Admin → App settings → Latest app version**. Users on older versions see a gentle "Update available" banner.
3. Only if the old version must stop working (for example after a breaking API change), also raise **Minimum app version**. Older apps then show an "Update required" screen.

## 5. Go-live checklist
- [ ] `JWT_SECRET` is long and random (48+ bytes) and different from development
- [ ] Database backups on (RDS automated backups / Neon point-in-time restore)
- [ ] Brevo: sender verified, ideally your own domain with the DNS records Brevo shows (so mail isn't spam)
- [ ] `npm run create-admin` done; test email received
- [ ] Admin → App settings filled in (support email, website URL, versions)
- [ ] Privacy, Terms and Delete-account pages reviewed for your launch countries
- [ ] Preview APK tested end to end on a real phone
- [ ] Play listing: icon (`mobile/assets/images/icon.png`), screenshots, description, privacy URL, data safety
