# SETUP GUIDE — AshHomes GTA

The manual steps only you (or Ash) can do, after Bolt deploys the site.

## 1. Google Analytics 4
1. Go to analytics.google.com → Admin → Create Property → "AshHomes GTA".
2. Add a Web data stream with the live site URL → copy the **Measurement ID** (starts with `G-`).
3. Replace `G-XXXXXXXXXX` (it appears **twice** in the head of every HTML page) with the real ID. In Bolt, ask: *"Replace all occurrences of G-XXXXXXXXXX with G-YOURID"*.
4. Verify: open the site, then GA4 → Reports → Realtime should show your visit.
   Bonus: site events (cta_click, lead_submitted, listing_saved, sign_up…) already flow into GA4 automatically.

## 2. Google Search Console
1. Go to search.google.com/search-console → Add property → Domain (needs the custom domain).
2. Verify via the DNS TXT record (your domain registrar) — or use "URL prefix" + the GA4 verification since Analytics is installed.
3. Submit the sitemap: ask Bolt to generate `/sitemap.xml` listing all 17 pages, then submit `https://yourdomain.com/sitemap.xml`.
4. The 8 community pages are the SEO priority — once Ash's real content replaces the placeholder copy, request indexing for each.

## 3. BoldTrail (kvCORE) CRM
Option A — API: BoldTrail dashboard → Settings/Marketplace → API → generate key → set `BOLDTRAIL_API_KEY` in Bolt's env vars.
Option B — Lead email (simplest): BoldTrail → Lead Engine → find your unique **lead parsing email address** → set `BOLDTRAIL_LEAD_EMAIL`.
Every site form (consultation, valuation, newsletter, showing requests) then lands in BoldTrail automatically.

## 4. Google Sign-In (OAuth)
1. console.cloud.google.com → New project "AshHomes" → APIs & Services → OAuth consent screen (External, add logo + domain).
2. Credentials → Create OAuth Client ID (Web) → add the Supabase callback URL (Supabase → Auth → Providers → Google shows it).
3. Paste Client ID + Secret into Supabase → Auth → Providers → Google → Enable.

## 5. Before launch checklist
- [ ] Replace placeholder phone `416 520 65XX` everywhere with Ash's real number
- [ ] Swap demo listings in `assets/site.js` (LISTINGS array) for real ones, or hide Sold samples
- [ ] Replace community page placeholder stats/copy with Ash's content (marked with visible notes on each page)
- [ ] Replace blog placeholder posts with real articles
- [ ] Sign IDX/VOW agreement with TRREB + an IDX provider (IDX Broker / iHomefinder / BoldTrail's built-in IDX) → embed in `mls-search.html` `#idx-container`
- [ ] Set the real admin email and remove the demo PIN note from admin
- [ ] Privacy policy page is included (`privacy-policy.html`, linked in every footer, with CASL consent wording on the newsletter form) — have Ash's brokerage/lawyer confirm the final wording and add the brokerage name before launch
