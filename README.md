# DZG Morphology Meeting 2027 website

Static meeting website for the DZG Morphology Meeting 2027, Bonn, 17–20 February 2027.

## Hosting and forms

- Public site: GitHub Pages
- Registration and abstract storage: Supabase (Central EU / Frankfurt)
- Form protection: Cloudflare Turnstile
- Transactional email: Resend

The browser uses only the public Supabase publishable key and Cloudflare Turnstile site key. Secret keys remain in Supabase Edge Function Secrets.

## Updating the programme

Edit `assets/programme-data.js`. Each day may contain any number of sessions and programme items.

## Pending meeting content

The website is ready structurally. These meeting-specific details still need to be inserted when confirmed:

- abstract deadline
- registration deadline
- exact venue and accessibility/arrival details
- two invited speakers and photographs
- final programme
- final vector logo/identity assets
- production email sending domain

## Privacy and legal

`privacy.html` and `imprint.html` contain the current controller/contact information and describe the current technical services. Review them whenever a service, hosting arrangement, email provider, organiser mailbox or domain changes.

Dietary and accessibility details are stored in Supabase and should not be copied into ordinary email notifications. The supplied `submit-registration_v5.ts` implements this data-minimising behaviour.

## Domain changes

When a custom domain is introduced:

1. Add it to GitHub Pages.
2. Add the hostname to the existing Cloudflare Turnstile widget.
3. Set `TURNSTILE_ALLOWED_HOSTNAMES` in Supabase Edge Function Secrets to a comma-separated list containing the GitHub Pages hostname and the custom hostname during transition.
4. Verify the sending domain in Resend and update `EMAIL_FROM`.
5. Recheck `privacy.html` and `imprint.html`.
