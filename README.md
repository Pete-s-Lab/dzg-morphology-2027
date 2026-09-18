# DZG Morphology Meeting 2027 — website prototype

Static HTML/CSS/JavaScript prototype for GitHub Pages or equivalent hosting.

## Open locally
Open `index.html` in a browser.

## Change colours
Edit the CSS variables at the top of `assets/site.css`:

- `--green: #048769`
- `--magenta: #c8285e`
- `--pale-green: #d7e7c5`
- `--cream: #f3dda1`
- `--ink: #17191a`
- `--paper: #f7f6f1`

## Current status
- Responsive homepage: implemented
- Abstract form UI: implemented, including multiple authors, corresponding author, 200-word live counter, presentation preference, career status, keywords and comments
- Registration form UI: implemented, including email, dinner, dietary and accessibility fields
- Form sending/storage: deliberately NOT connected yet
- Programme: data-driven and supports any number of sessions per day via `assets/programme-data.js`
- Invited speakers: two speaker placeholders with portrait slots
- Privacy and imprint pages: structural drafts only; must be completed before launch
- No analytics, external webfonts, third-party embeds, cookies or localStorage are used in this prototype

## Form backend plan
Recommended architecture for the final version:

1. GitHub Pages serves the public site over HTTPS.
2. Abstract and registration forms POST to a small HTTPS API endpoint.
3. The API validates all fields server-side, rate-limits abuse and assigns a submission ID.
4. Structured records are written to a protected database in an EU/EEA region where feasible.
5. The API sends a confirmation email to the submitter and a notification to the organisers.
6. Organiser access is authenticated; the public website never contains database or mail credentials.
7. Retention/deletion rules are configured before launch.

Provider choice should be made before finalising the privacy notice. Prefer providers that offer suitable data-processing terms and EU/EEA hosting where practical.

## Deployment
The folder can be committed directly to a GitHub repository and published with GitHub Pages. A Namecheap domain can then point to GitHub Pages with the usual DNS records. Configure HTTPS before enabling the live forms.
