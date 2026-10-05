// Client for the internal matching service (Python/FastAPI). A FACTORY so it is easy to test
// and has no hidden dependency on global config.
//  - sends NO personal identifiers: only skills / occupation / bio text and job text
//  - hard timeout: a slow ML service must never make the website slow
//  - never throws: returns null on any problem, and the caller falls back
//  - SANITISES the reply: even a compromised internal service cannot inject unknown ids,
//    huge strings or out-of-range scores into our API responses.
function sanitize(data, validIds) {
  if (!data || !Array.isArray(data.results)) return null;
  const results = [];
  for (const r of data.results) {
    if (!r || typeof r.id !== "string" || !validIds.has(r.id)) continue;
    const score = Number(r.score);
    if (!Number.isFinite(score) || score < 0 || score > 1) continue;
    const matched = Array.isArray(r.matched)
      ? r.matched.filter((m) => typeof m === "string").slice(0, 5).map((m) => m.slice(0, 40)) : [];
    results.push({ id: r.id, score, matched });
  }
  return { model: typeof data.model === "string" ? data.model.slice(0, 60) : "unknown", results };
}

function createMlClient({ url, key, timeoutMs = 2500, fetchImpl } = {}) {
  const doFetch = fetchImpl || fetch;
  return {
    enabled: Boolean(url && key),
    async rank({ profile, jobs, k = 10 }) {
      if (!url || !key) return null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await doFetch(`${url.replace(/\/$/, "")}/rank`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Internal-Key": key },
          body: JSON.stringify({ profile, jobs, k }),
          signal: ctrl.signal,
        });
        if (!res.ok) return null;
        return sanitize(await res.json(), new Set(jobs.map((j) => j.id)));
      } catch (_) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

module.exports = { createMlClient, sanitize };
