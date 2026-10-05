// CSRF defence for cookie-based auth across sites (Netlify -> Render).
// Browsers ALWAYS attach an Origin header to cross-site POST/PUT/DELETE and
// attackers' pages cannot forge it. So: if a state-changing request carries an
// Origin we don't trust, reject it. (Plus CORS + SameSite cookies = defence in depth.)
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function originGuard(allowedOrigins) {
  return function (req, res, next) {
    if (SAFE.has(req.method)) return next();
    const origin = req.get("Origin");
    if (origin && !allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: "Forbidden origin." });
    }
    next();
  };
}

module.exports = { originGuard };
