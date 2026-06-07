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
    const { type, name, email, phone, message, payload, source_page } = body;
    const turnstileToken: string | undefined =
      body["cf-turnstile-response"] ||
      body.payload?.["cf-turnstile-response"] ||
      body.token ||
      undefined;

    if (!type) {
      return new Response(JSON.stringify({ error: "type is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify Turnstile token before accepting the lead
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (turnstileSecret) {
      console.log("token present:", !!turnstileToken, "len:", turnstileToken ? turnstileToken.length : 0);
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
      console.log("turnstile result:", JSON.stringify(verifyData));
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

    // 2. Forward to kvCORE API whenever BOLDTRAIL_API_KEY is set
    const boldtrailApiKey = Deno.env.get("BOLDTRAIL_API_KEY");
    if (boldtrailApiKey) {
      const kvContact = {
        first_name: name ? name.split(" ")[0] : "",
        last_name: name ? name.split(" ").slice(1).join(" ") : "",
        email: email || "",
        cell_phone: phone || "",
        source: "ashhomesgta.ca website",
        notes: [
          `Lead type: ${type}`,
          message ? `Message: ${message}` : "",
          source_page ? `Page: ${source_page}` : "",
        ].filter(Boolean).join("\n"),
      };
      const kvHeaders = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${boldtrailApiKey}`,
      };
      try {
        let resp = await fetch("https://api.kvcore.com/v2/public/contact", {
          method: "POST",
          headers: kvHeaders,
          body: JSON.stringify(kvContact),
        });
        if (resp.status === 404) {
          resp = await fetch("https://api.kvcore.com/v2/public/contacts", {
            method: "POST",
            headers: kvHeaders,
            body: JSON.stringify(kvContact),
          });
        }
        console.log("kvcore api result:", resp.status, await resp.text());
      } catch (e) {
        console.error("kvCORE API error:", e);
      }
    }

    // 3. Forward to BoldTrail via email whenever both env vars are set
    const boldtrailLeadEmail = Deno.env.get("BOLDTRAIL_LEAD_EMAIL");
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (boldtrailLeadEmail && resendKey) {
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
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "AshHomes <noreply@ashhomesgta.ca>",
            to: boldtrailLeadEmail,
            subject: `New lead: ${type} — ${name || email || "anonymous"}`,
            text: leadBody,
          }),
        });
        const rjson = await resp.json();
        console.log("boldtrail email result:", resp.status, JSON.stringify(rjson));
      } catch (e) {
        console.error("BoldTrail email error:", e);
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
              from: "noreply@ashhomesgta.ca",
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
