// Pure business rules for jobs & applications. No database, no Express: easy to
// unit-test and easy to reason about (and to defend in an interview).
const { str } = require("./validators");

const JOB_TYPES = ["full-time", "part-time", "contract", "internship", "remote"];
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const CODE_RE = /^IWU-[A-Z]{3}-\d{2}-\d{4}$/;

// IDs come from the URL. Anything that is not exactly 24 hex chars is rejected
// BEFORE it reaches the database (prevents CastError 500s and odd query objects).
const isObjectId = (v) => typeof v === "string" && OBJECT_ID_RE.test(v);

// Only https: links. A "javascript:alert(1)" or "data:" URL placed in href is an XSS vector.
function isHttpsUrl(v, max = 300) {
  if (typeof v !== "string" || v.length > max) return false;
  try { const u = new URL(v); return u.protocol === "https:" && u.hostname.length > 0; }
  catch (_) { return false; }
}

// Skills are normalised (lowercase, trimmed, de-duplicated). This matters later:
// the ML matcher compares these strings, so "React" and "react " must be identical.
function normalizeSkills(input) {
  const arr = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : null;
  if (!arr) return null;
  const out = [];
  for (const s of arr) {
    if (typeof s !== "string") return null;
    const t = s.trim().toLowerCase().replace(/\s+/g, " ");
    if (!t) continue;
    if (t.length > 30 || !/^[a-z0-9+#.\- ]+$/.test(t)) return null;   // allows c++, c#, node.js
    if (!out.includes(t)) out.push(t);
  }
  return out.length <= 15 ? out : null;
}

function validateJob(body = {}) {
  const errors = [];
  const title       = str(body.title, 100);
  const company     = str(body.company, 80);
  const location    = str(body.location, 80);
  const description = str(body.description, 5000);
  const type        = JOB_TYPES.includes(body.type) ? body.type : null;
  const skills      = body.skills === undefined ? [] : normalizeSkills(body.skills);
  const applyUrl    = body.applyUrl ? body.applyUrl : "";

  if (!title) errors.push("Title is required (max 100 characters).");
  if (!company) errors.push("Company is required (max 80 characters).");
  if (!location) errors.push("Location is required (max 80 characters).");
  if (!type) errors.push("Type must be one of: " + JOB_TYPES.join(", ") + ".");
  if (!description || description.length < 30) errors.push("Description must be 30-5000 characters.");
  if (skills === null) errors.push("Skills must be at most 15 short items (letters, digits, + # . -).");
  if (applyUrl && !isHttpsUrl(applyUrl)) errors.push("Apply link must be a valid https:// URL.");

  return errors.length ? { errors } : { value: { title, company, location, type, description, skills, applyUrl } };
}

function validateApplication(body = {}) {
  const errors = [];
  const coverNote = str(body.coverNote, 2000);
  const cvUrl = body.cvUrl ? body.cvUrl : "";
  const referrerCode = body.referrerCode ? body.referrerCode : "";

  if (!coverNote || coverNote.length < 20) errors.push("Cover note must be 20-2000 characters.");
  if (cvUrl && !isHttpsUrl(cvUrl)) errors.push("CV link must be a valid https:// URL.");
  if (referrerCode && !(typeof referrerCode === "string" && CODE_RE.test(referrerCode))) {
    errors.push("Referrer code format is invalid.");
  }
  return errors.length ? { errors } : { value: { coverNote, cvUrl, referrerCode } };
}

// Application lifecycle as a tiny state machine. Invalid jumps (e.g. submitted -> hired)
// are impossible, and "rejected"/"hired" are final.
const TRANSITIONS = {
  submitted:   ["reviewing", "rejected"],
  reviewing:   ["shortlisted", "rejected"],
  shortlisted: ["hired", "rejected"],
  rejected:    [],
  hired:       [],
};
const STATUSES = Object.keys(TRANSITIONS);
const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

// Query strings are attacker-controlled and may be arrays/objects (?limit[$gt]=1).
function parsePagination(query = {}) {
  const num = (v, d) => (typeof v === "string" && /^\d{1,4}$/.test(v) ? parseInt(v, 10) : d);
  const page  = Math.max(1, num(query.page, 1));
  const limit = Math.min(20, Math.max(1, num(query.limit, 10)));
  return { page, limit, skip: (page - 1) * limit };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { JOB_TYPES, STATUSES, isObjectId, isHttpsUrl, normalizeSkills, validateJob,
                   validateApplication, canTransition, parsePagination, escapeRegex };
