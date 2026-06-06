import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://ashhomesgta.ca",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type, name, email, phone, message, payload, source_page, "cf-turnstile-response": turnstileToken } = body;

    if (!type) {
      return new Response(JSON.stringify({ error: "type is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Turnstile token before accepting the lead
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (turnstileSecret) {
      if (!turnstileToken) {
        return new Response(JSON.stringify({ error: "Missing CAPTCHA token" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(turnstileSecret)}&response=${encodeURIComponent(turnstileToken)}`,
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return new Response(JSON.stringify({ error: "CAPTCHA verification failed" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Insert lead into leads table
    const { error: insertErr } = await supabase.from("leads").insert({
      type,
      name: name || null,
      email: email || null,
      phone: phone || null,
      message: message || null,
      payload: payload || null,
      source_page: source_page || null,
    });

    if (insertErr) {
      console.error("leads insert error:", insertErr);
    }

    // 2. Forward to BoldTrail/kvCORE — try API key first, then email
    const boldtrailApiKey = Deno.env.get("BOLDTRAIL_API_KEY");
    const boldtrailLeadEmail = Deno.env.get("BOLDTRAIL_LEAD_EMAIL");

    if (boldtrailApiKey) {
      try {
        await fetch("https://api.boldtrail.com/api/v1/leads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${boldtrailApiKey}`,
          },
          body: JSON.stringify({
            first_name: name ? name.split(" ")[0] : "",
            last_name: name ? name.split(" ").slice(1).join(" ") : "",
            email: email || "",
            phone: phone || "",
            notes: message || JSON.stringify(payload || {}),
            lead_type: type,
            source: source_page || "ashhomesgta.com",
          }),
        });
      } catch (e) {
        console.error("BoldTrail API error:", e);
      }
    } else if (boldtrailLeadEmail) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        const leadBody = [
          `Lead type: ${type}`,
          `Name: ${name || "—"}`,
          `Email: ${email || "—"}`,
          `Phone: ${phone || "—"}`,
          `Message: ${message || "—"}`,
          `Page: ${source_page || "—"}`,
          payload ? `\nPayload:\n${JSON.stringify(payload, null, 2)}` : "",
        ].filter(Boolean).join("\n");

        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: "leads@ashhomesgta.com",
              to: boldtrailLeadEmail,
              subject: `New lead: ${type} — ${name || email || "anonymous"}`,
              text: leadBody,
            }),
          });
        } catch (e) {
          console.error("BoldTrail email error:", e);
        }
      }
    }

    // 3. If showing_request, also email Ash directly with the listing list
    if (type === "showing_request") {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const agentEmail = Deno.env.get("ADMIN_EMAIL") || "ashhomesgta@gmail.com";

      if (resendKey) {
        const listings: string[] = payload?.listings_text || [];
        const emailBody = [
          `Hi Ash,`,
          ``,
          `${name || "A client"} would like to book showings for the following homes:`,
          ``,
          ...(listings.length ? listings : [`(no listing details provided)`]),
          ``,
          `Client: ${name || "—"}`,
          `Email: ${email || "—"}`,
          `Phone: ${phone || "—"}`,
          ``,
          `This lead has been saved to your admin dashboard.`,
        ].join("\n");

        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: "noreply@ashhomesgta.com",
              to: agentEmail,
              subject: `Showing request from ${name || email || "a visitor"}`,
              text: emailBody,
            }),
          });
        } catch (e) {
          console.error("Showing request email error:", e);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-lead error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
