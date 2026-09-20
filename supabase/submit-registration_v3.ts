import { withSupabase } from "npm:@supabase/server@^1"

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const optional = (value: unknown): string | null => {
  const v = clean(value)
  return v === "" ? null : v
}

const validEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")

  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not configured")
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret,
        response: token,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Turnstile returned HTTP ${response.status}`)
  }

  const result = await response.json()
  return result.success === true
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405 },
      )
    }

    let body: Record<string, unknown>

    try {
      body = await req.json() as Record<string, unknown>
    } catch {
      return Response.json(
        { error: "Invalid JSON" },
        { status: 400 },
      )
    }

    const turnstileToken = clean(body.turnstile_token)

    if (!turnstileToken) {
      return Response.json(
        { error: "Bot verification is required" },
        { status: 400 },
      )
    }

    try {
      const validTurnstile = await verifyTurnstile(turnstileToken)

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

    const dietary_requirements =
      optional(body.dietary_requirements)

    const accessibility_requirements =
      optional(body.accessibility_requirements)

    const comments =
      optional(body.comments)

    const dzg_member =
      typeof body.dzg_member === "boolean"
        ? body.dzg_member
        : null

    const conference_dinner =
      typeof body.conference_dinner === "boolean"
        ? body.conference_dinner
        : null

    const sensitive_data_consent =
      body.sensitive_data_consent === true

    if (
      !first_name ||
      !last_name ||
      !email ||
      !institution ||
      !country
    ) {
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
        { error: "Privacy consent is required" },
        { status: 400 },
      )
    }

    if (
      (dietary_requirements || accessibility_requirements) &&
      !sensitive_data_consent
    ) {
      return Response.json(
        {
          error:
            "Explicit consent is required when dietary or accessibility information is provided",
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
      (dietary_requirements?.length ?? 0) > 3000 ||
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
        dietary_requirements,
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
          {
            error:
              "A registration with this email address already exists",
          },
          { status: 409 },
        )
      }

      console.error("Registration insert failed:", error)

      return Response.json(
        { error: "Registration could not be stored" },
        { status: 500 },
      )
    }

    return Response.json(
      {
        ok: true,
        registration_id: data.id,
      },
      { status: 201 },
    )
  }),
}
