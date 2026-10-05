# Security Design & Threat Model — IgwebuIke Alumni Platform

Methodology: STRIDE-style review of the original v1 code, fixes mapped to OWASP Top 10 (2021).

## Assets
User credentials, personal data (names, email, phone, location), session tokens, booking records, admin functions.

## Findings in v1 and fixes in v2

| # | Weakness in v1 | Attack | OWASP | Fix (file) |
|---|---|---|---|---|
| 1 | `GET /api/events/bookings` had no auth | Anyone downloads all bookings + phone numbers | A01 Broken Access Control | `requireRole("admin")` (routes/events.js, middleware/auth.js) |
| 2 | Booking trusted `alumniCode` from request body | Impersonate anyone who knows/guesses a code | A01 / A07 | Identity from verified session `req.user` |
| 3 | No login system | No real authentication | A07 Auth Failures | JWT in httpOnly cookie, bcrypt cost 12, lockout (routes/auth.js) |
| 4 | Inputs not type-checked | NoSQL injection `{"email":{"$gt":""}}` | A03 Injection | Strict string validation + express-mongo-sanitize |
| 5 | `role` could be mass-assigned | Register as admin | A01 / A04 | Role set server-side; admins via CLI only |
| 6 | Timeline used `innerHTML` with user data | Stored XSS: name `<img onerror=...>` | A03 Injection | Output escaping (frontend script.js) |
| 7 | Weak password rule (6 chars) | Credential guessing | A07 | NIST-style: 10+ chars, blocklist, 72-byte bcrypt limit |
| 8 | Public API returned full names, codes, locations | Privacy leak / enumeration | A01, GDPR minimisation | Masked output in `/recent` |
| 9 | Check-then-insert booking | Race condition: double booking | A04 Insecure Design | Unique DB index (models/Booking.js) |
| 10 | `Math.random()` for IDs | Predictable codes | A02 Crypto Failures | `crypto.randomInt` |
| 11 | No security headers, wide CORS | Clickjacking, sniffing, CSRF | A05 Misconfiguration | helmet, exact CORS allow-list, Origin guard |
| 12 | Rate limiter behind proxy | All users share one IP | A05 | `trust proxy` |
| 13 | No secret validation | App runs with weak/missing secret | A02 | Fail-fast config |
| 14 | Job posts from anyone | Fake jobs / phishing links aimed at alumni | A04 Insecure Design | Moderation queue: member posts are `pending` until an admin approves; only `employer`/`admin` publish directly (routes/jobs.js, routes/admin.js) |
| 15 | Applicant data reachable by job id | IDOR: change an ID in the URL to read other people's applicants | A01 Broken Access Control | Ownership check on every object; strangers get 404 (not 403) so IDs cannot be probed |
| 16 | Applicant edits own application status | Self-promote to "hired" | A01 | Only job owner/admin may change status; legal transitions enforced by a state machine (utils/jobRules.js) |
| 17 | User-supplied links in job/CV fields | `javascript:` URL => XSS on click | A03 Injection | https-only URL validation on server AND client; moderator sees links as plain text |
| 18 | Job/applicant text rendered in the page | Stored XSS via titles, cover notes, names | A03 | Server validation + UI built only with `textContent` (never innerHTML) + strict CSP |
| 19 | Search and filter parameters | Regex injection / ReDoS / operator injection (`?q[$ne]=`) | A03 | MongoDB `$text` search (query is data), escaped regex, type checks, pagination caps (limit <= 20) |
| 20 | Spam / scraping | Flood of posts or applications | A05 | Per-IP limits: 10 posts/hour, 30 applications/15 min; max body size 10 KB |
| 21 | Double application | Race condition creates duplicates | A04 | Unique index (job, applicant) |
| 22 | Role stored in token | Stale privileges after demotion | A01 | Role is read from the DB on every request; `set-role` also bumps `tokenVersion` |
| 23 | Matching service reachable by others | Anonymous use or DoS of the ML service | A05 Misconfiguration | Private network (no published port), shared-secret header with constant-time compare, fails closed if the key is missing, input size caps (ml-service/app.py) |
| 24 | Pickled model file | Code execution when the model is loaded (insecure deserialisation) | A08 Integrity Failures | Model loads only if its SHA-256 matches a trusted hash; refuses if none; trained at image build (ml-service/matcher/service.py) |
| 25 | Backend trusts the ML reply | A compromised service injects unknown ids, huge strings, bad scores | A08 / A03 | Reply sanitised: only ids we sent, scores in 0..1, max 5 terms of max 40 chars (utils/mlClient.js) |
| 26 | Profile text leaves the main app | PII leaks to another service | GDPR data minimisation | Only skills/occupation/bio and job text are sent; a test asserts no name or email is in the outbound body |
| 27 | ML slow or down | Site hangs, feature breaks | A04 Insecure Design | 2.5 s timeout, never throws, keyword fallback, honestly labelled in the UI |
| 28 | Profile update endpoint | Mass assignment of role/email | A01 | Whitelisted fields only (skills, occupation, bio); tested |
| 29 | Behaviour logging of recommendations | Privacy / consent | GDPR | Disclosed in the privacy notice; stores ids, rank and model version only; validated and rate limited |

## Privacy notes for the job portal
Applying shares name, email, department, graduation year and occupation with the poster only (stated in the apply form). Public job pages show the poster as "Ada O.", never an email. Applicants see their own applications only.

## Design decisions (and trade-offs — be ready to defend these)
- **httpOnly cookie vs localStorage token:** cookies can't be read by JS, so XSS can't steal the session. Cost: CSRF risk, mitigated by `SameSite`, strict CORS, and the Origin guard.
- **Revocation:** user is re-fetched each request and `tokenVersion` checked, so logout truly kills stolen tokens. Cost: one DB read per request.
- **Generic login errors + dummy hash:** prevents user enumeration by message and by response time. Cost: slightly less friendly UX.
- **Lockout:** 5 failures -> 15 min lock + per-IP rate limit. Trade-off: attacker can lock a victim out (DoS). Accepted for now; mitigation later = CAPTCHA/step-up.
- **Registration still reveals "email exists"** (409). Common UX trade-off; proper fix = email verification flow.

## Known limitations (honest list — next steps)
Email verification and password reset; 2FA (TOTP); refresh tokens; audit log; dependency scanning (npm audit/Dependabot) in CI; integration tests against a test DB; CSP tuned for the frontend; backups.

## Testing & automation
- **Node unit tests (33):** password policy, injection rejection, mass assignment, Origin guard, job rules (https-only links, skill normalisation, status state machine, pagination caps, regex escaping), ML client (timeout, 500, malicious reply sanitising, no identifiers sent), keyword fallback, profile validation.
- **Node integration tests (58, real MongoDB, three databases):** forged and unsigned (`alg:none`) tokens, logout revocation, lockout, identical errors for unknown email vs wrong password, spoofed identity, RBAC, 10 simultaneous bookings (exactly one wins), CSRF origin block, size limits, privacy masking; job portal moderation, IDOR (strangers get 404), illegal status jumps, query-string injection, referrals, CORS PATCH; recommendations against a fake ML service (no PII sent, own/applied jobs excluded, fallback when ML is down), profile and feedback-event validation.
- **Python tests (18):** metrics, text prep, rankers, model-integrity refusal (tampered or unhashed model), input limits, and **determinism of the data generator under different hash seeds**.
- **Browser tests (51, Playwright, CSP enforced, hostile API data):** run during development against a mocked API; not in CI yet.
- **CI:** Node 20/22 tests, Python tests and a smoke run of the evaluation, `npm audit`, CodeQL, Docker builds for both services, Dependabot.
- **Safety:** integration tests refuse to run unless the database name ends in `_test`.
