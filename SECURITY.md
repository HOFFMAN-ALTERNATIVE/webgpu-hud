# Security policy

## Reporting
Use GitHub "Report a vulnerability" on this repository to open a private advisory.
Please do not open public issues for security problems. First answer within 5 working days.

## Scope
This is a static client-side demo served from GitHub Pages. It has no backend, no
cookies, no user input beyond URL parameters and keyboard shortcuts, and loads nothing
from third-party origins (fonts are bundled).

## Threat model
- Asset: the visitor's browser session on the Pages origin.
- Entry points: URL query parameters (`renderer`, `quality`, `seed`, `motion`).
- Risks and mitigations:
  - Script injection: query parameters are parsed against fixed allowlists; `seed` is
    only hashed, never written to the DOM. The production build sets a CSP with
    `script-src 'self'`, no inline scripts, `object-src 'none'` and `base-uri 'none'`.
    The Playwright suite fails on any CSP violation.
  - Referrer leakage: `<meta name="referrer" content="no-referrer">`.
  - Supply chain: exact versions for three.js, Vite and TypeScript, `npm ci` from the
    lockfile in CI, `npm audit` reports 0 vulnerabilities as of 2026-10-17.
- Not covered: `frame-ancestors` and HSTS cannot be set from a `<meta>` tag on GitHub
  Pages. Self-host behind a server that sends those headers if clickjacking matters.
