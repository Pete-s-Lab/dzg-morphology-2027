import { withSupabase } from "npm:@supabase/server@^1"

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const optional = (value: unknown): string | null => {
  const v = clean(value)
  return v === "" ? null : v
}

const validEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? ""
const EMAIL_FROM =
  Deno.env.get("EMAIL_FROM") ??
  "DZG Morphology Meeting 2027 <onboarding@resend.dev>"
const ORGANISER_EMAIL =
  Deno.env.get("ORGANISER_EMAIL") ?? "peter.ruehr@gmail.com"

async function verifyTurnstile(token: string, expectedAction: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not configured")

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    },
  )
  if (!response.ok) throw new Error(`Turnstile returned HTTP ${response.status}`)

  const result = await response.json()
  const allowedHostnames = new Set(
    (Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES") ?? "pete-s-lab.github.io")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  )

  if (!result.success) {
    console.error("Turnstile rejected token:", result["error-codes"] ?? [])
    return false
  }
  if (result.action !== expectedAction) {
    console.error("Turnstile action mismatch:", result.action)
    return false
  }
  if (!allowedHostnames.has(result.hostname)) {
    console.error("Turnstile hostname mismatch:", result.hostname)
    return false
  }
  return true
}

async function sendEmail(args: {
  to: string
  subject: string
  html: string
  replyTo?: string
  idempotencyKey: string
}): Promise<{ ok: boolean; id?: string; error?: unknown }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is not configured" }
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Idempotency-Key": args.idempotencyKey,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        reply_to: args.replyTo ? [args.replyTo] : undefined,
      }),
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      return { ok: false, error: result }
    }

    return { ok: true, id: result.id }
  } catch (error) {
    return { ok: false, error }
  }
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 })
    }

    let body: Record<string, unknown>

    try {
      body = await req.json() as Record<string, unknown>
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const turnstileToken = clean(body.turnstile_token)

    if (!turnstileToken) {
      return Response.json(
        { error: "Bot verification is required" },
        { status: 400 },
      )
    }

    try {
      const validTurnstile = await verifyTurnstile(turnstileToken, "registration")

      if (!validTurnstile) {
        return Response.json(
          { error: "Bot verification failed" },
          { status: 403 },
        )
      }
    } catch (error) {
      console.error("Turnstile verification error:", error)
      return Response.json(
        { error: "Bot verification could not be completed" },
        { status: 500 },
      )
    }

    const first_name = clean(body.first_name)
    const last_name = clean(body.last_name)
    const email = clean(body.email).toLowerCase()
    const institution = clean(body.institution)
    const department = optional(body.department)
    const city = optional(body.city)
    const country = clean(body.country)
    const career_stage = optional(body.career_stage)
    const accessibility_requirements = optional(body.accessibility_requirements)
    const comments = optional(body.comments)

    const dzg_member =
      typeof body.dzg_member === "boolean" ? body.dzg_member : null

    const conference_dinner =
      typeof body.conference_dinner === "boolean"
        ? body.conference_dinner
        : null

    const sensitive_data_consent = body.sensitive_data_consent === true

    if (!first_name || !last_name || !email || !institution || !country) {
      return Response.json(
        { error: "Required fields are missing" },
        { status: 400 },
      )
    }

    if (!validEmail(email)) {
      return Response.json(
        { error: "Invalid email address" },
        { status: 400 },
      )
    }

    if (body.privacy_accepted !== true) {
      return Response.json(
        { error: "Privacy acknowledgement is required" },
        { status: 400 },
      )
    }

    if (
      accessibility_requirements &&
      !sensitive_data_consent
    ) {
      return Response.json(
        {
          error:
            "Explicit consent is required when accessibility information is provided",
        },
        { status: 400 },
      )
    }

    if (
      first_name.length > 150 ||
      last_name.length > 150 ||
      email.length > 320 ||
      institution.length > 300 ||
      (department?.length ?? 0) > 300 ||
      (city?.length ?? 0) > 150 ||
      country.length > 150 ||
      (career_stage?.length ?? 0) > 150 ||
      (accessibility_requirements?.length ?? 0) > 3000 ||
      (comments?.length ?? 0) > 5000
    ) {
      return Response.json(
        { error: "One or more fields exceed the permitted length" },
        { status: 400 },
      )
    }

    const { data, error } = await ctx.supabaseAdmin
      .from("registrations")
      .insert({
        first_name,
        last_name,
        email,
        institution,
        department,
        city,
        country,
        career_stage,
        dzg_member,
        conference_dinner,
        accessibility_requirements,
        comments,
        privacy_accepted: true,
        sensitive_data_consent,
        sensitive_data_consent_at:
          sensitive_data_consent ? new Date().toISOString() : null,
      })
      .select("id")
      .single()

    if (error) {
      if (error.code === "23505") {
        return Response.json(
          { error: "A registration with this email address already exists" },
          { status: 409 },
        )
      }

      console.error("Registration insert failed:", error)
      return Response.json(
        { error: "Registration could not be stored" },
        { status: 500 },
      )
    }

    const registrationId = data.id
    const fullName = `${first_name} ${last_name}`
    const dinnerLabel =
      conference_dinner === true
        ? "Yes"
        : conference_dinner === false
          ? "No"
          : "Not specified"

    const organiserHtml = `
      <h2>New registration — DZG Morphology Meeting 2027</h2>
      <table cellpadding="5" cellspacing="0" border="0">
        <tr><td><strong>Name</strong></td><td>${escapeHtml(fullName)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
        <tr><td><strong>Institution</strong></td><td>${escapeHtml(institution)}</td></tr>
        <tr><td><strong>Department</strong></td><td>${escapeHtml(department ?? "")}</td></tr>
        <tr><td><strong>City</strong></td><td>${escapeHtml(city ?? "")}</td></tr>
        <tr><td><strong>Country</strong></td><td>${escapeHtml(country)}</td></tr>
        <tr><td><strong>Career status</strong></td><td>${escapeHtml(career_stage ?? "")}</td></tr>
        <tr><td><strong>DZG member</strong></td><td>${dzg_member === null ? "Not specified" : dzg_member ? "Yes" : "No"}</td></tr>
        <tr><td><strong>Conference dinner</strong></td><td>${escapeHtml(dinnerLabel)}</td></tr>
        <tr><td><strong>Accessibility requirements</strong></td><td>${escapeHtml(accessibility_requirements ?? "Not specified").replaceAll("\n", "<br>")}</td></tr>
        <tr><td><strong>Comments</strong></td><td>${escapeHtml(comments ?? "Not specified").replaceAll("\n", "<br>")}</td></tr>
        <tr><td><strong>Registration ID</strong></td><td>${escapeHtml(registrationId)}</td></tr>
      </table>
    `

    const organiserMail = await sendEmail({
      to: ORGANISER_EMAIL,
      subject: `New DZG Morphology Meeting 2027 registration — ${fullName}`,
      html: organiserHtml,
      replyTo: email,
      idempotencyKey: `registration-organiser/${registrationId}`,
    })

    if (organiserMail.ok) {
      await ctx.supabaseAdmin
        .from("registrations")
        .update({ organiser_notified_at: new Date().toISOString() })
        .eq("id", registrationId)
    } else {
      console.error("Registration organiser email failed:", organiserMail.error)
    }

    return Response.json(
      {
        ok: true,
        registration_id: registrationId,
        email: {
          participant_confirmation_sent: false,
          organiser_notification_sent: organiserMail.ok,
        },
      },
      { status: 201 },
    )
  }),
}
