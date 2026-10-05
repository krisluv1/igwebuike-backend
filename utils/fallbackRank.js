// Used when the ML service is unavailable: exact skill overlap (Jaccard).
// This is the SAME keyword baseline that the offline evaluation measures, so we know how much weaker it is.
const norm = (s) => String(s).trim().toLowerCase();

function fallbackRank(profile, jobs, k = 10) {
  const p = new Set((profile.skills || []).map(norm));
  const out = [];
  for (const j of jobs) {
    const s = (j.skills || []).map(norm);
    const matched = s.filter((x) => p.has(x));
    const union = new Set([...p, ...s]).size;
    const score = union ? matched.length / union : 0;
    if (score > 0) out.push({ id: j.id, score: Number(score.toFixed(4)), matched: matched.slice(0, 3) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}

module.exports = { fallbackRank };
