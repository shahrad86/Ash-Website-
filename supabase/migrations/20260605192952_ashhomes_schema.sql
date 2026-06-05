/*
# AshHomes GTA — Backend Schema

## Summary
Replaces the demo localStorage storage layer with a production Supabase backend.

## New Tables

### profiles
Stores registered user information synced from Supabase Auth on sign-up/sign-in.
- id (uuid, FK to auth.users) — primary key
- name (text) — display name
- email (text) — user email
- provider (text) — 'email' or 'google'
- created_at (timestamptz) — when account was created
- is_admin (boolean, default false) — admin flag, only set server-side

### saved_listings
One row per saved MLS listing per user.
- id (uuid, PK)
- user_id (uuid, FK auth.users, defaults to auth.uid())
- mls (text) — MLS number
- addr (text) — property address
- price (text) — price string
- saved_at (timestamptz)
- UNIQUE(user_id, mls) to prevent duplicates

### activity
Event log for every tracked interaction site-wide (all visitors, including anonymous).
- id (uuid, PK)
- ts (timestamptz) — event timestamp
- event (text) — event name e.g. 'page_view', 'lead_submitted'
- page (text) — page filename
- user_email (text, nullable) — user email or null for anonymous
- session_id (text) — browser session ID
- data (jsonb) — event-specific payload

### leads
Every form submission from every page.
- id (uuid, PK)
- ts (timestamptz)
- type (text) — 'consultation', 'valuation', 'newsletter', 'showing_request', etc.
- name (text)
- email (text)
- phone (text)
- message (text)
- payload (jsonb) — full form payload
- source_page (text) — page where form was submitted

## Security
- RLS enabled on all tables
- profiles: users read/write their own row; admin can read all (via service role in edge functions)
- saved_listings: users CRUD only their own rows
- activity: anon + authenticated INSERT only (nobody reads own activity client-side); admin reads via service role
- leads: anon + authenticated INSERT only; admin reads via service role

## Notes
- activity and leads use service-role-only SELECT (no SELECT policy for client roles) — admin reads them through the edge function which uses the service role key
- The is_admin column is NEVER updatable by the user's own RLS policy
*/

-- ─── profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text,
  email      text,
  provider   text DEFAULT 'email',
  created_at timestamptz DEFAULT now(),
  is_admin   boolean NOT NULL DEFAULT false
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id AND is_admin = false);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND is_admin = false);

DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ─── saved_listings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_listings (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mls      text NOT NULL,
  addr     text,
  price    text,
  saved_at timestamptz DEFAULT now(),
  UNIQUE(user_id, mls)
);

ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_select_own" ON saved_listings;
CREATE POLICY "saved_select_own" ON saved_listings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_insert_own" ON saved_listings;
CREATE POLICY "saved_insert_own" ON saved_listings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_update_own" ON saved_listings;
CREATE POLICY "saved_update_own" ON saved_listings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_delete_own" ON saved_listings;
CREATE POLICY "saved_delete_own" ON saved_listings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── activity ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts         timestamptz DEFAULT now(),
  event      text NOT NULL,
  page       text,
  user_email text,
  session_id text,
  data       jsonb
);

ALTER TABLE activity ENABLE ROW LEVEL SECURITY;

-- anyone (anon or authenticated) can INSERT; nobody can SELECT via anon key
DROP POLICY IF EXISTS "activity_insert_anon" ON activity;
CREATE POLICY "activity_insert_anon" ON activity FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- ─── leads ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts          timestamptz DEFAULT now(),
  type        text NOT NULL,
  name        text,
  email       text,
  phone       text,
  message     text,
  payload     jsonb,
  source_page text
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- anyone can INSERT a lead; nobody reads leads via anon key (admin uses service role)
DROP POLICY IF EXISTS "leads_insert_anon" ON leads;
CREATE POLICY "leads_insert_anon" ON leads FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS activity_ts_idx     ON activity(ts DESC);
CREATE INDEX IF NOT EXISTS activity_event_idx  ON activity(event);
CREATE INDEX IF NOT EXISTS activity_email_idx  ON activity(user_email);
CREATE INDEX IF NOT EXISTS leads_ts_idx        ON leads(ts DESC);
CREATE INDEX IF NOT EXISTS leads_type_idx      ON leads(type);
CREATE INDEX IF NOT EXISTS saved_user_idx      ON saved_listings(user_id);
