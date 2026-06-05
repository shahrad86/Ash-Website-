# BOLT INSTRUCTIONS — AshHomes GTA

## How to get the files into Bolt (it does NOT accept zip uploads)

Bolt imports projects from GitHub. No coding needed — it's all in the browser:

1. Create a free account at **github.com** (if you don't have one).
2. Top-right **+** → **New repository** → name it `ashhomes-gta` → set it **Public** → Create.
3. On the new repo page, click **"uploading an existing file"** (or Add file → Upload files).
4. Open your "Ash website" folder on your computer and **drag everything in** — all the .html files, the `assets` folder and the `communities` folder (drag the folders themselves; GitHub keeps the structure). Skip the .zip and the two .md guides if you like.
5. Click **Commit changes** and copy the repo URL from the address bar (e.g. `https://github.com/yourname/ashhomes-gta`).
6. In **bolt.new**, click the **GitHub icon → Import from URL**, paste the repo URL, and choose the repository.
7. Once the project loads, paste **THE PROMPT** below as your first message.

(Bonus: with the GitHub link, Bolt auto-commits its changes back, so you'll always have a backup of the code.)

---

## THE PROMPT

This repo is a finished, client-approved multi-page real estate website (19 HTML pages including `privacy-policy.html` and `admin.html`, plus `assets/site.css` + `assets/site.js`).

**RULE #1 — DO NOT CHANGE THE DESIGN.** The HTML structure, CSS (colors, fonts Cormorant Garamond + Jost, spacing, animations) and all page content are final and approved by the client. Your job is ONLY to replace the demo storage layer (localStorage) with a real backend. Every UI element for the features below already exists and works as a front-end demo — keep the exact same look and behaviour.

### Stack
- Keep the site as static pages (or migrate to a framework only if file structure and rendered output stay pixel-identical).
- Use **Supabase** for: Auth, Postgres database, and row-level security.
- Deploy-ready for a custom domain.

### 1. Authentication (replace the demo in `assets/site.js`)
The login/signup modal already exists (`AH.openModal()` in site.js — keep its exact UI).
- Email + password sign-up/sign-in via Supabase Auth.
- **Google OAuth** via `supabase.auth.signInWithOAuth({provider:'google'})` — wire it to the existing "Continue with Google" button (currently a demo stub in `AH.signInGoogle`).
- On auth state change, call the existing `refreshAuthUI()` behaviour (greeting + sign-out link in the nav).
- Store profiles in a `profiles` table: id (auth uid), name, email, provider, created_at.

### 2. Saved listings → showing requests
Hearts on listing cards and the slide-out drawer already work (see `AH.toggleSave`, `AH.sendListToAsh`).
- Persist saves to a `saved_listings` table: user_id, mls, addr, price, saved_at. Anonymous saves stay in localStorage and merge into the account on login.
- "Send List to Ash" must: insert a `showing_request` lead (see §4), email Ash the list (Supabase Edge Function + Resend or similar), and keep the existing toast confirmation.

### 3. Activity tracking → admin database
`AH.track(event, data)` in site.js already fires on: page views, CTA clicks, searches, calculator use, listing saves/unsaves, auth events, drawer opens, blog clicks, lead submissions.
- Mirror every `track()` call to an `activity` table: ts, event, page, user_email (or 'anonymous'), session_id, data (jsonb). Batch/queue writes so browsing stays fast.
- This is the funnel database the owner will analyze later — capture everything.

### 4. Leads → BoldTrail CRM
`AH.lead(type, payload)` is the single funnel for all forms (consultation, valuation, newsletter, showing_request).
- Insert every lead into a `leads` table: ts, type, name, email, phone, message/payload (jsonb), source_page.
- Then forward each lead to **BoldTrail (kvCORE) CRM** from a server-side function. Implement BOTH delivery options behind env vars so the owner can pick:
  a. `BOLDTRAIL_API_KEY` → POST to the BoldTrail/kvCORE leads API.
  b. `BOLDTRAIL_LEAD_EMAIL` → send a lead-formatted email to the BoldTrail lead-parsing address (every kvCORE account has one).
- Keep the existing on-page success states exactly as they are.

### 5. Admin dashboard (`admin.html`)
The dashboard UI exists with tabs (Activity, Leads, Users, Saved), KPI cards, CSV/JSON export.
- Replace the demo PIN gate with Supabase Auth + an `admin` role check (admin email: ashhomesgta@gmail.com).
- Point the tables at the real `activity`, `leads`, `profiles`, `saved_listings` tables (all visitors, not just this browser). Keep the same table rendering and exports. Add simple date-range and event-type filters in the existing design language.
- RLS: users read/write only their own rows; admin reads everything.

### 6. Analytics
GA4 snippet is already on every page with placeholder `G-XXXXXXXXXX` — leave it; the owner will replace the ID (see SETUP-GUIDE.md).

### 7. IDX
`mls-search.html` has a clearly marked `#idx-container` placeholder. Do NOT build a fake MLS feed — leave the placeholder; the IDX provider embed goes there once the owner's TRREB IDX agreement is active.

### Config (env vars)
SUPABASE_URL, SUPABASE_ANON_KEY, BOLDTRAIL_API_KEY, BOLDTRAIL_LEAD_EMAIL, ADMIN_EMAIL, RESEND_API_KEY (or equivalent), GA4 stays in HTML.

### Acceptance checklist
- [ ] All 19 pages render pixel-identical to the imported files
- [ ] Sign-up/sign-in with email AND Google works; nav greeting updates
- [ ] Hearts persist across devices for logged-in users; drawer "Send List to Ash" emails Ash + creates a lead
- [ ] Every form writes to `leads` AND forwards to BoldTrail (when keys are set)
- [ ] Every interaction lands in `activity`; admin dashboard shows all-visitor data with CSV export
- [ ] Admin page only accessible to the admin account
- [ ] No design, copy, font or color changes anywhere

---

## Notes for Shahrad (not for Bolt)
- The site works right now as a local demo — open `index.html`, click around, save listings, sign in (Google button simulates), submit forms, then open `admin.html` (PIN 2026) to see everything that was captured.
- Bolt's only job is swapping localStorage → Supabase. If it tries to redesign anything, repeat RULE #1.
- After Bolt finishes, complete SETUP-GUIDE.md (GA4 ID, Search Console, BoldTrail keys, Google OAuth credentials).
