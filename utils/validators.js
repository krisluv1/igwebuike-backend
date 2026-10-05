// Input validation. KEY IDEA: never trust the TYPE of input, not just its value.
// An attacker can send {"email": {"$gt": ""}} - a JSON OBJECT. If it reaches
// Mongo's findOne it matches the first user (NoSQL injection). Requiring
// strings everywhere blocks that whole class of attack.
const { validatePassword } = require("./password");

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function str(v, max) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
}

function validateEmail(v) {
  const e = str(v, 254);
  return e && EMAIL_RE.test(e) ? e.toLowerCase() : null;
}

function validateLogin(body = {}) {
  const email = validateEmail(body.email);
  const password = typeof body.password === "string" && body.password.length > 0 &&
                   body.password.length <= 128 ? body.password : null;
  return email && password ? { value: { email, password } } : { error: "Invalid email or password." };
}

function validateRegistration(body = {}) {
  const errors = [];
  const firstName  = str(body.firstName, 50);
  const lastName   = str(body.lastName, 50);
  const email      = validateEmail(body.email);
  const department = str(body.department, 80);
  const gradYear   = Number.isInteger(body.gradYear) ? body.gradYear : parseInt(body.gradYear, 10);
  const phone      = body.phone      ? str(body.phone, 20)       : "";
  const location   = body.location   ? str(body.location, 80)    : "Nigeria";
  const occupation = body.occupation ? str(body.occupation, 80)  : "";

  if (!firstName)  errors.push("First name is required.");
  if (!lastName)   errors.push("Last name is required.");
  if (!email)      errors.push("A valid email is required.");
  if (!department) errors.push("Department is required.");
  const thisYear = new Date().getFullYear();
  if (!(gradYear >= 1960 && gradYear <= thisYear + 6)) errors.push("Graduation year is invalid.");
  if (phone === null)      errors.push("Phone is invalid.");
  if (location === null)   errors.push("Location is invalid.");
  if (occupation === null) errors.push("Occupation is invalid.");
  if (body.consent !== true) errors.push("You must accept the privacy policy to register.");

  const pwError = validatePassword(body.password, { email });
  if (pwError) errors.push(pwError);

  if (errors.length) return { errors };
  // NOTE: 'role' is never read from the request => no privilege escalation
  // ("mass assignment") by sending {"role":"admin"}.
  return {
    value: { firstName, lastName, email, department, gradYear, phone, location, occupation,
             password: body.password },
  };
}

module.exports = { validateLogin, validateRegistration, validateEmail, str };
