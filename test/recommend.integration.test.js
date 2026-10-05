// Recommendation + profile endpoints against a FAKE ML service (real MongoDB, own database).
const PORT = 40000 + Math.floor(Math.random() * 10000);
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.DISABLE_RATE_LIMIT = "true";
process.env.MONGO_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/igwebuike_test";
process.env.ML_SERVICE_URL = `http://127.0.0.1:${PORT}`;       // must be set BEFORE the app is required
process.env.ML_INTERNAL_KEY = "k".repeat(32);

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../app");
const Alumni = require("../models/Alumni");
const Job = require("../models/Job");
const RecEvent = require("../models/RecEvent");

const PASSWORD = "correct horse battery";
let fake, mlMode = "ok", lastMlBody = null, lastMlHeaders = null;
const agents = {}, users = {}, jobIds = {};

async function makeUser(key, name, role) {
  const email = `${key}@example.com`;
  await request(app).post("/api/alumni/register").send({ firstName: name, lastName: "Tester", email, password: PASSWORD,
    gradYear: 2020, department: "Computer Science", consent: true }).expect(201);
  if (role) await Alumni.updateOne({ email }, { role });
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ email, password: PASSWORD }).expect(200);
  agents[key] = a; users[key] = await Alumni.findOne({ email });
}
const post = (a, title, skills) => a.post("/api/jobs").send({ title, company: "Co", location: "Lagos", type: "full-time",
  description: "A sufficiently long description for validation to pass here.", skills }).expect(201);

before(async () => {
  fake = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => {
      lastMlBody = b; lastMlHeaders = req.headers;
      if (mlMode === "down") { res.writeHead(500); return res.end(); }
      const { jobs } = JSON.parse(b);
      const results = jobs.map((j) => ({ id: j.id, score: j.skills.includes("react") ? 0.9 : 0.1, matched: j.skills.includes("react") ? ["react"] : [] }))
                          .sort((x, y) => y.score - x.score);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ model: "lsa-20@fake", results }));
    });
  });
  await new Promise((r) => fake.listen(PORT, "127.0.0.1", r));

  await mongoose.connect(process.env.MONGO_URI, { dbName: "igwebuike_rec_test" });
  if (!mongoose.connection.name.endsWith("_test")) throw new Error("Refusing to run: database name must end with _test");
  await mongoose.connection.dropDatabase();
  await Promise.all([Alumni.init(), Job.init(), RecEvent.init()]);
  await makeUser("seeker", "Zebediah");
  await makeUser("employer", "Emp", "employer");
  jobIds.react = (await post(agents.employer, "React Developer", ["react", "css"])).body.id;
  jobIds.audit = (await post(agents.employer, "Auditor", ["auditing"])).body.id;
  jobIds.py    = (await post(agents.employer, "Python Dev", ["python", "css"])).body.id;
});
after(async () => { fake.close(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

describe("profile endpoints", () => {
  it("require login", async () => {
    await request(app).get("/api/alumni/me").expect(401);
    await request(app).patch("/api/alumni/me").send({ bio: "x" }).expect(401);
  });
  it("validate input, ignore foreign fields, normalise skills", async () => {
    await agents.seeker.patch("/api/alumni/me").send({ skills: { $ne: 1 } }).expect(400);
    await agents.seeker.patch("/api/alumni/me").send({ skills: ["<script>"] }).expect(400);
    await agents.seeker.patch("/api/alumni/me").send({}).expect(400);
    const res = await agents.seeker.patch("/api/alumni/me").send({ skills: ["React", "CSS ", "react"], role: "admin", email: "evil@x.com" }).expect(200);
    assert.deepStrictEqual(res.body.skills, ["react", "css"]);
    const u = await Alumni.findById(users.seeker._id);
    assert.strictEqual(u.role, "alumni");
    assert.strictEqual(u.email, "seeker@example.com");
    const me = await agents.seeker.get("/api/alumni/me").expect(200);
    assert.deepStrictEqual(me.body.skills, ["react", "css"]);
  });
});

describe("recommendations", () => {
  it("requires login", async () => { await request(app).get("/api/jobs/recommended").expect(401); });

  it("asks for a profile when it is empty", async () => {
    await makeUser("blank", "Blank");
    const res = await agents.blank.get("/api/jobs/recommended").expect(200);
    assert.strictEqual(res.body.needsProfile, true);
    assert.deepStrictEqual(res.body.recommendations, []);
  });

  it("uses the ML service, sends NO identifiers, and returns safe public jobs", async () => {
    mlMode = "ok";
    const res = await agents.seeker.get("/api/jobs/recommended").expect(200);
    assert.strictEqual(res.body.model, "lsa-20@fake");
    assert.strictEqual(res.body.recommendations[0].job.id, jobIds.react);
    assert.strictEqual(res.body.recommendations[0].rank, 1);
    assert.deepStrictEqual(res.body.recommendations[0].matched, ["react"]);
    assert.strictEqual(lastMlHeaders["x-internal-key"], "k".repeat(32));
    assert.ok(!lastMlBody.includes("Zebediah") && !lastMlBody.includes("@example.com"), "no name/email may reach the ML service");
    assert.ok(!JSON.stringify(res.body).includes("@example.com"));
  });

  it("never recommends your own jobs or jobs you already applied to", async () => {
    const own = await agents.employer.get("/api/jobs/recommended").expect(200);       // employer has no profile yet
    assert.strictEqual(own.body.needsProfile, true);
    await agents.employer.patch("/api/alumni/me").send({ skills: ["react"] }).expect(200);
    const mine = await agents.employer.get("/api/jobs/recommended").expect(200);
    assert.ok(!mine.body.recommendations.some((r) => [jobIds.react, jobIds.audit, jobIds.py].includes(r.job.id)));

    await agents.seeker.post(`/api/jobs/${jobIds.react}/apply`).send({ coverNote: "I would love to join this team because of my React skills." }).expect(201);
    const after = await agents.seeker.get("/api/jobs/recommended").expect(200);
    assert.ok(!after.body.recommendations.some((r) => r.job.id === jobIds.react));
  });

  it("falls back to keyword matching when the ML service is down", async () => {
    mlMode = "down";
    const res = await agents.seeker.get("/api/jobs/recommended").expect(200);
    assert.strictEqual(res.body.model, "fallback-keyword");
    assert.strictEqual(res.body.recommendations[0].job.id, jobIds.py);        // shares "css"
    assert.deepStrictEqual(res.body.recommendations[0].matched, ["css"]);
    mlMode = "ok";
  });
});

describe("recommendation feedback events", () => {
  const ev = (o = {}) => ({ jobId: jobIds.py, action: "view", rank: 1, model: "lsa-20@fake", ...o });
  it("anonymous cannot log events", async () => { await request(app).post("/api/jobs/recommendations/events").send(ev()).expect(401); });
  it("stores valid events with the session user", async () => {
    await agents.seeker.post("/api/jobs/recommendations/events").send(ev({ user: "someone-else" })).expect(201);
    const e = await RecEvent.findOne({});
    assert.strictEqual(String(e.user), String(users.seeker._id));
  });
  it("rejects invalid actions, ranks, ids and models", async () => {
    for (const bad of [{ action: "purchase" }, { rank: 0 }, { rank: 99 }, { rank: "1" }, { jobId: "nope" }, { model: "" }, { model: "m".repeat(61) }, { jobId: { $ne: 1 } }]) {
      await agents.seeker.post("/api/jobs/recommendations/events").send(ev(bad)).expect(400);
    }
  });
});
