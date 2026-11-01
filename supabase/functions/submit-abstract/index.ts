import { withSupabase } from "npm:@supabase/server@^1"

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const optional = (value: unknown): string | null => {
  const v = clean(value)
  return v === "" ? null : v
}

const validEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const wordCount = (text: string): number => {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

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
      const validTurnstile = await verifyTurnstile(turnstileToken, "abstract")

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

    const submitter_email = clean(body.submitter_email).toLowerCase()
    const title = clean(body.title)
    const authors = clean(body.authors)
    const affiliations = clean(body.affiliations)
    const presenting_author = clean(body.presenting_author)
    const invited_speaker_contest = body.invited_speaker_contest === true
    const presenter_career_stage = optional(body.presenter_career_stage)
    const presentation_type = clean(body.presentation_type)
    const abstract_text = clean(body.abstract_text)
    const keywords = optional(body.keywords)
    const comments = optional(body.comments)

    if (
      !submitter_email ||
      !title ||
      !authors ||
      !affiliations ||
      !presenting_author ||
      !presentation_type ||
      !abstract_text
    ) {
      return Response.json(
        { error: "Required fields are missing" },
        { status: 400 },
      )
    }

    if (!validEmail(submitter_email)) {
      return Response.json(
        { error: "Invalid email address" },
        { status: 400 },
      )
    }

    if (presentation_type !== "talk" && presentation_type !== "poster") {
      return Response.json(
        { error: "Presentation type must be talk or poster" },
        { status: 400 },
      )
    }

    const abstract_word_count = wordCount(abstract_text)

    if (abstract_word_count > 200) {
      return Response.json(
        {
          error: "Abstract exceeds the 200-word limit",
          word_count: abstract_word_count,
        },
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
      submitter_email.length > 320 ||
      title.length > 500 ||
      authors.length > 5000 ||
      affiliations.length > 5000 ||
      presenting_author.length > 500 ||
      (presenter_career_stage?.length ?? 0) > 150 ||
      (keywords?.length ?? 0) > 1500 ||
      (comments?.length ?? 0) > 5000
    ) {
      return Response.json(
        { error: "One or more fields exceed the permitted length" },
        { status: 400 },
      )
    }

    const { data: registration, error: registrationError } =
      await ctx.supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("email", submitter_email)
        .maybeSingle()

    if (registrationError) {
      console.error("Registration lookup failed:", registrationError)
      return Response.json(
        { error: "Submission could not be processed" },
        { status: 500 },
      )
    }

    const { data, error } = await ctx.supabaseAdmin
      .from("abstracts")
      .insert({
        registration_id: registration?.id ?? null,
        submitter_email,
        title,
        authors,
        affiliations,
        presenting_author,
        invited_speaker_contest,
        presenter_career_stage,
        presentation_type,
        abstract_text,
        keywords,
        comments,
        privacy_accepted: true,
      })
      .select("id")
      .single()

    if (error) {
      console.error("Abstract insert failed:", error)
      return Response.json(
        { error: "Abstract could not be stored" },
        { status: 500 },
      )
    }

    const abstractId = data.id
    const presentationLabel =
      presentation_type === "talk" ? "Oral presentation" : "Poster"

    const organiserHtml = `
      <h2>New abstract — DZG Morphology Meeting 2027</h2>
      <table cellpadding="5" cellspacing="0" border="0">
        <tr><td><strong>Title</strong></td><td>${escapeHtml(title)}</td></tr>
        <tr><td><strong>Submitter email</strong></td><td>${escapeHtml(submitter_email)}</td></tr>
        <tr><td><strong>Authors</strong></td><td>${escapeHtml(authors)}</td></tr>
        <tr><td><strong>Affiliations</strong></td><td>${escapeHtml(affiliations)}</td></tr>
        <tr><td><strong>Presenting author</strong></td><td>${escapeHtml(presenting_author)}</td></tr>
        <tr><td><strong>Career status</strong></td><td>${escapeHtml(presenter_career_stage ?? "")}</td></tr>
        <tr><td><strong>Invited speaker contest</strong></td><td>${invited_speaker_contest ? "Yes" : "No"}</td></tr>
        <tr><td><strong>Preferred type</strong></td><td>${escapeHtml(presentationLabel)}</td></tr>
        <tr><td><strong>Keywords</strong></td><td>${escapeHtml(keywords ?? "")}</td></tr>
        <tr><td><strong>Comments</strong></td><td>${escapeHtml(comments ?? "Not specified").replaceAll("\n", "<br>")}</td></tr>
        <tr><td><strong>Word count</strong></td><td>${abstract_word_count}</td></tr>
        <tr><td><strong>Abstract ID</strong></td><td>${escapeHtml(abstractId)}</td></tr>
      </table>
      <h3>Abstract</h3>
      <p>${escapeHtml(abstract_text).replaceAll("\n", "<br>")}</p>
    `

    const organiserMail = await sendEmail({
      to: ORGANISER_EMAIL,
      subject: `New DZG Morphology Meeting 2027 abstract — ${title}`,
      html: organiserHtml,
      replyTo: submitter_email,
      idempotencyKey: `abstract-organiser/${abstractId}`,
    })

    if (organiserMail.ok) {
      await ctx.supabaseAdmin
        .from("abstracts")
        .update({ organiser_notified_at: new Date().toISOString() })
        .eq("id", abstractId)
    } else {
      console.error("Abstract organiser email failed:", organiserMail.error)
    }

    return Response.json(
      {
        ok: true,
        abstract_id: abstractId,
        word_count: abstract_word_count,
        email: {
          submitter_confirmation_sent: false,
          organiser_notification_sent: organiserMail.ok,
        },
      },
      { status: 201 },
    )
  }),
}
