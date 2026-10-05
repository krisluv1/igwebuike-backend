const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { createMlClient } = require("../utils/mlClient");
const { fallbackRank } = require("../utils/fallbackRank");
const { validateProfileUpdate } = require("../utils/profileRules");

const ID_A = "a".repeat(24), ID_B = "b".repeat(24);
const JOBS = [{ id: ID_A, title: "Frontend Dev", skills: ["javascript", "react"], description: "x".repeat(40) },
              { id: ID_B, title: "Accountant", skills: ["auditing"], description: "y".repeat(40) }];
const PROFILE = { skills: ["javascript"], occupation: "web dev", bio: "" };

let server, port, mode = "ok", lastReq = null;
before(async () => {
  server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      lastReq = { headers: req.headers, body: JSON.parse(body || "{}"), url: req.url };
      if (mode === "500") { res.writeHead(500); return res.end("boom"); }
      if (mode === "slow") return setTimeout(() => { res.writeHead(200); res.end("{}"); }, 600);
      res.setHeader("Content-Type", "application/json");
      if (mode === "evil") {
        return res.end(JSON.stringify({ model: "m".repeat(500), results: [
          { id: ID_A, score: 0.8, matched: ["javascript", 42, "z".repeat(100), "a", "b", "c", "d"] },
          { id: "c".repeat(24), score: 0.9, matched: [] },       // id we never sent
          { id: ID_B, score: 7, matched: [] },                    // out-of-range score
          { id: ID_B, score: "NaN", matched: [] },                // not a number
          null, "junk"] }));
      }
      res.end(JSON.stringify({ model: "lsa-20@test", results: [{ id: ID_A, score: 0.77, matched: ["javascript"] }] }));
    });
  }).listen(0);
  await new Promise((r) => server.once("listening", r));
  port = server.address().port;
});
after(() => server.close());
const client = (o = {}) => createMlClient({ url: `http://127.0.0.1:${port}`, key: "k".repeat(32), timeoutMs: 3000, ...o });

describe("ml client", () => {
  it("returns ranked results and sends the internal key + only profile text (no identifiers)", async () => {
    mode = "ok";
    const r = await client().rank({ profile: PROFILE, jobs: JOBS, k: 5 });
    assert.deepStrictEqual(r.results, [{ id: ID_A, score: 0.77, matched: ["javascript"] }]);
    assert.strictEqual(lastReq.headers["x-internal-key"], "k".repeat(32));
    assert.strictEqual(lastReq.url, "/rank");
    assert.deepStrictEqual(Object.keys(lastReq.body).sort(), ["jobs", "k", "profile"]);
    assert.deepStrictEqual(Object.keys(lastReq.body.profile).sort(), ["bio", "occupation", "skills"]);
  });

  it("SANITISES a malicious reply: unknown ids, bad scores, junk, oversized strings", async () => {
    mode = "evil";
    const r = await client().rank({ profile: PROFILE, jobs: JOBS });
    assert.strictEqual(r.results.length, 1);
    assert.strictEqual(r.results[0].id, ID_A);
    assert.ok(r.results[0].matched.length <= 5 && r.results[0].matched.every((m) => typeof m === "string" && m.length <= 40));
    assert.ok(r.model.length <= 60);
  });

  it("returns null (never throws) on HTTP 500, timeout, unreachable server, or missing config", async () => {
    mode = "500";  assert.strictEqual(await client().rank({ profile: PROFILE, jobs: JOBS }), null);
    mode = "slow"; const t0 = Date.now();
    assert.strictEqual(await client({ timeoutMs: 100 }).rank({ profile: PROFILE, jobs: JOBS }), null);
    assert.ok(Date.now() - t0 < 500, "must give up at the timeout, not wait for the slow server");
    assert.strictEqual(await createMlClient({ url: "http://127.0.0.1:1", key: "k".repeat(32), timeoutMs: 200 }).rank({ profile: PROFILE, jobs: JOBS }), null);
    assert.strictEqual(await createMlClient({}).rank({ profile: PROFILE, jobs: JOBS }), null);
    assert.strictEqual(createMlClient({}).enabled, false);
  });
});

describe("fallback ranker", () => {
  it("ranks by skill overlap and explains with matched skills", () => {
    const r = fallbackRank({ skills: ["JavaScript ", "css"] }, [
      ...JOBS, { id: "d".repeat(24), title: "UI", skills: ["javascript", "css", "html"] }], 5);
    assert.strictEqual(r[0].id, "d".repeat(24));
    assert.deepStrictEqual(r[0].matched, ["javascript", "css"]);
    assert.ok(!r.some((x) => x.id === ID_B), "zero-overlap jobs are not recommended");
  });
  it("cannot see aliases (documented weakness the ML model fixes)", () => {
    assert.deepStrictEqual(fallbackRank({ skills: ["js"] }, JOBS), []);
  });
  it("handles empty input and caps k", () => {
    assert.deepStrictEqual(fallbackRank({ skills: [] }, JOBS), []);
    assert.ok(fallbackRank({ skills: ["javascript"] }, JOBS, 1).length <= 1);
  });
});

describe("profile validation", () => {
  it("accepts and normalises skills, trims text", () => {
    const v = validateProfileUpdate({ skills: ["JS ", "React", "react"], occupation: " Dev ", bio: "Hello" }).value;
    assert.deepStrictEqual(v.skills, ["js", "react"]);
    assert.strictEqual(v.occupation, "Dev");
  });
  it("rejects injection objects, markup in skills, over-long bio, and empty updates", () => {
    assert.ok(validateProfileUpdate({ skills: { $ne: 1 } }).errors);
    assert.ok(validateProfileUpdate({ skills: ["<script>"] }).errors);
    assert.ok(validateProfileUpdate({ bio: "x".repeat(501) }).errors);
    assert.ok(validateProfileUpdate({}).errors);
  });
  it("ignores fields it does not own (role cannot be set here)", () => {
    const v = validateProfileUpdate({ bio: "hi", role: "admin", email: "x@y.z" }).value;
    assert.deepStrictEqual(Object.keys(v), ["bio"]);
  });
});
