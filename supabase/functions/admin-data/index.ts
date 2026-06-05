import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "ashhomesgta@gmail.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Verify the caller is authenticated and is the admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role key for reading all data
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const table = url.searchParams.get("table") || "activity";
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");
    const eventFilter = url.searchParams.get("event");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000"), 5000);

    let result: { data: unknown; error: unknown; count: number | null } = { data: null, error: null, count: null };

    if (table === "activity") {
      let q = admin.from("activity").select("*", { count: "exact" }).order("ts", { ascending: false }).limit(limit);
      if (dateFrom) q = q.gte("ts", dateFrom);
      if (dateTo) q = q.lte("ts", dateTo);
      if (eventFilter) q = q.eq("event", eventFilter);
      const r = await q;
      result = { data: r.data, error: r.error, count: r.count };
    } else if (table === "leads") {
      let q = admin.from("leads").select("*", { count: "exact" }).order("ts", { ascending: false }).limit(limit);
      if (dateFrom) q = q.gte("ts", dateFrom);
      if (dateTo) q = q.lte("ts", dateTo);
      if (eventFilter) q = q.eq("type", eventFilter);
      const r = await q;
      result = { data: r.data, error: r.error, count: r.count };
    } else if (table === "users") {
      let q = admin.from("profiles").select("*", { count: "exact" }).order("created_at", { ascending: false }).limit(limit);
      if (dateFrom) q = q.gte("created_at", dateFrom);
      if (dateTo) q = q.lte("created_at", dateTo);
      const r = await q;
      result = { data: r.data, error: r.error, count: r.count };
    } else if (table === "saved") {
      let q = admin.from("saved_listings").select("*, profiles(name, email)", { count: "exact" }).order("saved_at", { ascending: false }).limit(limit);
      if (dateFrom) q = q.gte("saved_at", dateFrom);
      if (dateTo) q = q.lte("saved_at", dateTo);
      const r = await q;
      result = { data: r.data, error: r.error, count: r.count };
    } else if (table === "kpis") {
      const [actR, leadsR, usersR, savedR, viewsR] = await Promise.all([
        admin.from("activity").select("id", { count: "exact", head: true }),
        admin.from("leads").select("id", { count: "exact", head: true }),
        admin.from("profiles").select("id", { count: "exact", head: true }),
        admin.from("saved_listings").select("id", { count: "exact", head: true }),
        admin.from("activity").select("id", { count: "exact", head: true }).eq("event", "page_view"),
      ]);
      return new Response(JSON.stringify({
        total_events: actR.count ?? 0,
        page_views: viewsR.count ?? 0,
        leads: leadsR.count ?? 0,
        users: usersR.count ?? 0,
        saved: savedR.count ?? 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      return new Response(JSON.stringify({ error: "Unknown table" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ data: result.data, count: result.count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-data error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
