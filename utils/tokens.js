const jwt = require("jsonwebtoken");
const cfg = require("../config");

function signToken(user) {
  // Keep the payload minimal: who (sub) and which session generation (tv).
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion }, cfg.jwtSecret, {
    algorithm: "HS256",
    expiresIn: cfg.jwtExpiresIn,
  });
}

function cookieOptions() {
  return {
    httpOnly: true,                       // JavaScript cannot read it => XSS cannot steal it
    secure: cfg.isProd,                   // HTTPS only in production
    sameSite: cfg.isProd ? "none" : "lax",// "none" needed because Netlify & Render are different sites
    maxAge: 2 * 60 * 60 * 1000,           // 2 hours, matches the JWT
    path: "/",
  };
}

function setAuthCookie(res, user) {
  res.cookie(cfg.cookieName, signToken(user), cookieOptions());
}

function clearAuthCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(cfg.cookieName, opts);
}

module.exports = { signToken, setAuthCookie, clearAuthCookie };
