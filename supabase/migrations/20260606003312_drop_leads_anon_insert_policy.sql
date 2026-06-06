-- Remove the anon INSERT policy on leads so only the send-lead edge function
-- (which uses the service role key) can create leads.
DROP POLICY IF EXISTS "insert_leads_anon" ON leads;
DROP POLICY IF EXISTS "anon_insert_leads" ON leads;
DROP POLICY IF EXISTS "insert_leads" ON leads;

-- Verify RLS is still enabled
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
