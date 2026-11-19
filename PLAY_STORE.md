# Play Store launch kit

Everything to fill in Google Play Console for **Anchor** (`com.anchor.discipline`), plus the money plan (free → ads → premium).

## 1. Before you upload

- [ ] Backend live on Render, with `BREVO_API_KEY` set → **Admin → System → Send test email** works
- [ ] Website live (Vercel) → `/privacy`, `/terms` and `/delete-account` open
- [ ] **Admin → App settings**: support email, website URL, Play Store URL (after the listing exists)
- [ ] Production build: `npx eas-cli@latest build -p android --profile production` (produces the `.aab`)
- [ ] Install the **preview APK** on a real phone and try: guest browsing → sign up → email code → create habit → check in → forest → quick trading log → light/dark switch → delete account

## 2. Store listing

**App name:** Anchor: Habit & Discipline

**Short description (max 80 characters):**
> Build habits, quit bad ones, set limits that hold — and grow your own forest.

**Full description:**
> Anchor helps you keep the promises you make to yourself.
>
> ✅ HABITS: workouts, reading, sleep, water, meditation and more. Check in daily and build streaks you won't want to break.
> 🚭 QUIT & LIMIT: smoking, alcohol, social media, junk food. Set your own daily limit and see every day you stayed under it.
> 💰 MONEY: daily budgets, no-spend days and spending limits.
> 📈 TRADING DISCIPLINE: trade limits, daily/weekly/monthly loss limits, cool-off after a big loss, tilt alarm and an honest trading journal.
>
> 🌳 GROW YOUR FOREST: every day you keep your promises plants a tree. Break your rules and it withers. Watch a bare field become an ancient forest.
> 🏆 XP, levels and badges for every promise kept.
> 📊 Honest weekly and monthly reports: your best days, your weak spots and where you break your rules.
> 🔔 Gentle reminders, only at the times you choose and only if you allow them.
> 🌗 Light and dark mode.
> 🔒 Private by design: no contacts, no location, no camera. Your data is never sold. Delete your account any time.
>
> Browse freely without an account. Sign up only when you want to save your progress.

**Category:** Health & Fitness (or Productivity) · **Tags:** habit tracker, self-improvement, discipline

**Graphics:** icon 512×512 (`mobile/assets/images/icon.png`) · feature graphic 1024×500 · at least 4 phone screenshots (Today, Forest, a tracker report, the trading lock screen, light mode)

## 3. App content (Policy section)

| Form | Answer |
|---|---|
| Privacy policy | `https://<your-site>/privacy` |
| App access | "All features are available without login (guest mode). To review signed-in features, use: `review@<your-domain>` / `<password>`" (create this account first) |
| Ads | **No** (until you turn on AdMob; see §5) |
| Content rating | Questionnaire → Utility/Productivity, no violence or gambling → likely **Everyone** |
| Target audience | **18+**. Trading and money features are not meant for children, and choosing 18+ avoids the Families policy. |
| News app | No |
| Health apps | Not a medical app. Choose "habit / fitness tracking" if asked. |
| Financial features | None. The app only *records* trades the user made elsewhere. It does not give investment advice or connect to brokers. |
| Account deletion | In-app: Profile → Delete account. Web: `https://<your-site>/delete-account` |

### Data safety form

| Data type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Name | Yes | No | Account management | Required for an account |
| Email address | Yes | No | Account management, communications (verification codes) | Required for an account |
| User IDs | Yes | No | Account management | Required |
| Other financial info (trades / expenses the user types in) | Yes | No | App functionality | Optional (only if they use those trackers) |
| App activity: other user-generated content (habits, journal notes) | Yes | No | App functionality | Optional |
| App info: crash logs / diagnostics | No | — | — | — |
| Location, contacts, photos, audio, device ID | **No** | — | — | — |

- Data is **encrypted in transit**: yes (HTTPS).
- Users **can request deletion**: yes.
- Brevo only *delivers* the emails for us. Google counts that as a service provider, not "sharing".

> The Android build blocks the advertising-ID permission (`AD_ID`) while there are no ads, so the "Advertising ID" declaration is **No**. Remove that block when ads are added (§5).

## 4. Release plan

1. **Internal testing** (you plus up to 100 testers): upload the `.aab` and test for 1–2 days.
2. **Closed testing**: new personal developer accounts **must** run a closed test with **at least 12 testers for 14 days** before production access. Ask friends and family to join and actually open the app.
3. **Production**: staged rollout of 20% → 50% → 100%.
4. After each release, set **Admin → App settings → Latest app version** so older installs see "Update available". If an old version must stop working, raise **Minimum app version**.

## 5. Making money later (already prepared)

The app is free at launch. The switches already exist in the admin panel, so no redesign is needed later.

### Ads (Google AdMob; AdSense is only for websites)
Ad slots are already placed in Profile, Insights and the trackers list (`mobile/src/components/AdSlot.tsx`). There are never ads on logging, lock or expense screens, by design. When you're ready:
1. Create an AdMob account, add the app and create a **Banner** ad unit.
2. Ask the developer (or Claude) to:
   - `npx expo install react-native-google-mobile-ads`
   - add the plugin with your AdMob App ID
   - render `BannerAd` in `AdSlot.tsx`
   - add Google's consent form (UMP), which is required for EU/UK users
   - remove `com.google.android.gms.permission.AD_ID` from `blockedPermissions` in `app.json`
3. Build with `EXPO_PUBLIC_ADS_ENABLED=true` and ship the update.
4. Update Play Console: Ads = **Yes**, Advertising ID = **Yes**, and Data safety → "Device or other IDs" collected and shared for advertising.
5. Turn ads on or off instantly with **Admin → App settings → Show ads**.

### Premium (later)
Good premium perks that don't break the free experience:
- no ads
- unlimited trackers (free can be capped with **Admin → Max trackers per member**)
- streak shields
- advanced reports and export
- forest themes

On Android, digital subscriptions **must use Google Play Billing**, not Razorpay. Razorpay is fine for the website. Plan: RevenueCat (free tier) plus `react-native-purchases`, with the backend storing `members.plan`.

## 6. Push notifications (evening check-in), one-time setup

Email nudges work right away. **Phone** nudges on Android go through Google's Firebase, which needs this one-time setup (about 10 minutes, free):

1. Go to [console.firebase.google.com](https://console.firebase.google.com), select **Add project** (any name, Analytics not needed), then **Add app → Android**. Package name: `com.anchor.discipline`.
2. Download **`google-services.json`** and put it in the `mobile/` folder.
3. In `mobile/app.json`, inside `"android": { … }`, add:
   ```json
   "googleServicesFile": "./google-services.json",
   ```
4. In Firebase, open **Project settings → Service accounts → Generate new private key** to download a JSON key. Keep it private and **don't** commit it.
5. Give that key to Expo:
   ```bash
   cd mobile
   npx eas-cli@latest credentials
   ```
   Choose **Android → production → Google Service Account → Manage your Google Service Account Key for Push Notifications (FCM V1) → Upload**, then pick the JSON from step 4. Do the same for the **preview** profile if asked.
6. Build again. In the app, **Profile → Evening check-in → Phone notification** now works.

Without these steps the app still works. The phone-notification switch just says "not available yet" and members can use the email nudge.

**Admin controls:** App settings → Evening check-in (on/off, hour, email on/off). Admin → System → Evening check-in shows how many members opted in, what the last run did, and has a **Run now** button.
