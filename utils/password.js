// Password policy. Follows NIST SP 800-63B: favour LENGTH and a blocklist of
// known-bad passwords over forced "must have a symbol" rules.
const COMMON = new Set([
  "password", "password1", "password123", "1234567890", "12345678910",
  "qwertyuiop", "qwerty12345", "iloveyou123", "admin12345", "welcome123",
  "letmein123", "abcdefghij", "0123456789", "1q2w3e4r5t", "passw0rd123",
]);

// bcrypt silently ignores everything after 72 BYTES, so we reject longer
// inputs instead of letting two different passwords hash the same.
const MAX_BYTES = 72;
const MIN_LEN = 10;

function validatePassword(pw, ctx = {}) {
  if (typeof pw !== "string") return "Password must be text.";
  if (pw.length < MIN_LEN) return `Password must be at least ${MIN_LEN} characters.`;
  if (Buffer.byteLength(pw, "utf8") > MAX_BYTES) return "Password is too long (max 72 bytes).";
  if (COMMON.has(pw.toLowerCase())) return "That password is too common. Choose another.";

  const lower = pw.toLowerCase();
  const localPart = String(ctx.email || "").split("@")[0].toLowerCase();
  if (localPart.length >= 4 && lower.includes(localPart)) {
    return "Password must not contain your email name.";
  }
  if (/^(.)\1+$/.test(pw)) return "Password cannot be one repeated character.";
  return null; // null = OK
}

module.exports = { validatePassword, MIN_LEN };
