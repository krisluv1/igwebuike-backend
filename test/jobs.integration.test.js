// Job-portal integration tests (real MongoDB, own database). Each block maps to a threat in docs/SECURITY.md.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.DISABLE_RATE_LIMIT = "true";
process.env.MONGO_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/igwebuike_test";

const { describe, it, before, after } = require("node:test");
const assert   = require("node:assert");
const request  = require("supertest");
const mongoose = require("mongoose");

const app = require("../app");
const Alumni = require("../models/Alumni");
const Job = require("../models/Job");
const Application = require("../models/Application");

const PASSWORD = "correct horse battery";
const JOB = { title: "Frontend Developer", company: "TechNova", location: "Lagos, Nigeria", type: "full-time",
  description: "Build accessible interfaces with React and TypeScript for the alumni community.",
  skills: ["React", "TypeScript"] };
const APPLY = { coverNote: "I would love to join because I have two years of React experience." };

const agents = {};
async function makeUser(key, role) {
  const email = `${key}@example.com`;
  await request(app).post("/api/alumni/register").send({ firstName: key, lastName: "Tester", email,
    password: PASSWORD, gradYear: 2020, department: "Computer Science", consent: true }).expect(201);
  if (role) await Alumni.updateOne({ email }, { role });          // role changes only via DB, like the real setRole script
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ email, password: PASSWORD }).expect(200);
  agents[key] = a;
  return Alumni.findOne({ email });
}

let users = {}, pendingId, publishedId;

before(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: "igwebuike_jobs_test" });
  if (!mongoose.connection.name.endsWith("_test")) throw new Error("Refusing to run: database name must end with _test");
  await mongoose.connection.dropDatabase();
  await Promise.all([Alumni.init(), Job.init(), Application.init()]);   // build unique + text indexes first
  users.poster   = await makeUser("poster");
  users.applicant = await makeUser("applicant");
  users.other    = await makeUser("other");
  users.employer = await makeUser("employer", "employer");
  users.admin    = await makeUser("admin", "admin");
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

describe("posting & moderation", () => {
  it("anonymous cannot post a job", async () => {
    await request(app).post("/api/jobs").send(JOB).expect(401);
  });

  it("a regular member's job is PENDING and invisible to the public", async () => {
    const res = await agents.poster.post("/api/jobs").send(JOB).expect(201);
    assert.strictEqual(res.body.status, "pending");
    pendingId = res.body.id;
    const list = await request(app).get("/api/jobs").expect(200);
    assert.ok(!list.body.jobs.some((j) => j.id === pendingId));
    await request(app).get(`/api/jobs/${pendingId}`).expect(404);
  });

  it("client cannot force status=published or choose the owner (mass assignment)", async () => {
    const res = await agents.poster.post("/api/jobs")
      .send({ ...JOB, title: "Sneaky Job", status: "published", postedBy: String(users.admin._id) }).expect(201);
    const job = await Job.findById(res.body.id);
    assert.strictEqual(job.status, "pending");
    assert.strictEqual(String(job.postedBy), String(users.poster._id));
  });

  it("an employer's job is published immediately", async () => {
    const res = await agents.employer.post("/api/jobs").send({ ...JOB, title: "Backend Engineer", skills: ["node.js", "mongodb"] }).expect(201);
    assert.strictEqual(res.body.status, "published");
    publishedId = res.body.id;
  });

  it("rejects javascript: links, bad types and injection objects", async () => {
    await agents.poster.post("/api/jobs").send({ ...JOB, applyUrl: "javascript:alert(1)" }).expect(400);
    await agents.poster.post("/api/jobs").send({ ...JOB, type: "scam" }).expect(400);
    await agents.poster.post("/api/jobs").send({ ...JOB, title: { $ne: "" } }).expect(400);
  });

  it("moderation endpoints are admin-only (401 / 403)", async () => {
    await request(app).get("/api/admin/jobs/pending").expect(401);
    await agents.poster.get("/api/admin/jobs/pending").expect(403);
    await agents.employer.patch(`/api/admin/jobs/${pendingId}/moderate`).send({ action: "approve" }).expect(403);
  });

  it("admin sees the queue, approves once, and a second moderation is refused", async () => {
    const q = await agents.admin.get("/api/admin/jobs/pending").expect(200);
    assert.ok(q.body.some((j) => j.id === pendingId));
    await agents.admin.patch(`/api/admin/jobs/${pendingId}/moderate`).send({ action: "approve" }).expect(200);
    await agents.admin.patch(`/api/admin/jobs/${pendingId}/moderate`).send({ action: "reject" }).expect(409);
    await request(app).get(`/api/jobs/${pendingId}`).expect(200);
  });
});

describe("public listing & search", () => {
  it("never exposes emails; poster is shown as a masked name", async () => {
    const res = await request(app).get("/api/jobs").expect(200);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes("@example.com"));
    assert.ok(res.body.jobs.every((j) => /\s[A-Z]\.$/.test(j.postedBy)));
  });

  it("full-text search, type and skill filters work", async () => {
    const byText = await request(app).get("/api/jobs?q=backend").expect(200);
    assert.ok(byText.body.jobs.some((j) => j.id === publishedId));
    assert.ok(byText.body.jobs.every((j) => j.title !== "Frontend Developer"));
    const bySkill = await request(app).get("/api/jobs?skill=MongoDB").expect(200);
    assert.strictEqual(bySkill.body.total, 1);
    const byType = await request(app).get("/api/jobs?type=internship").expect(200);
    assert.strictEqual(byType.body.total, 0);
  });

  it("survives attacker-shaped query strings (no 500)", async () => {
    await request(app).get("/api/jobs?limit[$gt]=1&page[]=1&q[$ne]=x&type[$ne]=a").expect(200);
    await request(app).get("/api/jobs?location=(a%2B)%2B%24").expect(200);          // regex metacharacters
    const big = await request(app).get("/api/jobs?limit=5000").expect(200);
    assert.ok(big.body.limit <= 20);
  });

  it("malformed job ids return 404, not 500", async () => {
    await request(app).get("/api/jobs/not-an-id").expect(404);
    await request(app).get("/api/jobs/%7B%22%24gt%22%3A%22%22%7D").expect(404);
  });
});

describe("applying & referrals", () => {
  it("applying requires login", async () => {
    await request(app).post(`/api/jobs/${publishedId}/apply`).send(APPLY).expect(401);
  });

  it("applies once; the duplicate is blocked", async () => {
    await agents.applicant.post(`/api/jobs/${publishedId}/apply`).send(APPLY).expect(201);
    await agents.applicant.post(`/api/jobs/${publishedId}/apply`).send(APPLY).expect(409);
  });

  it("cannot apply to your own job, to a pending job, or with a javascript: CV link", async () => {
    await agents.employer.post(`/api/jobs/${publishedId}/apply`).send(APPLY).expect(400);
    const pending = await agents.poster.post("/api/jobs").send({ ...JOB, title: "Another pending" }).expect(201);
    await agents.applicant.post(`/api/jobs/${pending.body.id}/apply`).send(APPLY).expect(404);
    await agents.other.post(`/api/jobs/${publishedId}/apply`).send({ ...APPLY, cvUrl: "javascript:alert(1)" }).expect(400);
  });

  it("referrer code: valid accepted, unknown rejected, self-referral rejected", async () => {
    await agents.other.post(`/api/jobs/${publishedId}/apply`)
      .send({ ...APPLY, referrerCode: users.poster.alumniCode }).expect(201);
    await agents.admin.post(`/api/jobs/${publishedId}/apply`)
      .send({ ...APPLY, referrerCode: "IWU-ZZZ-99-9999" }).expect(400);
    await agents.admin.post(`/api/jobs/${publishedId}/apply`)
      .send({ ...APPLY, referrerCode: users.admin.alumniCode }).expect(400);
  });

  it("applicants can list their own applications", async () => {
    const res = await agents.applicant.get("/api/applications/mine").expect(200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].job.title, "Backend Engineer");
  });
});

describe("IDOR: object-level authorization", () => {
  it("a stranger cannot read another job's applicants (404, not 403)", async () => {
    await agents.other.get(`/api/jobs/${publishedId}/applications`).expect(404);
    await agents.applicant.get(`/api/jobs/${publishedId}/applications`).expect(404);
  });

  it("the owner and an admin can read applicants (incl. contact + referrer)", async () => {
    const res = await agents.employer.get(`/api/jobs/${publishedId}/applications`).expect(200);
    assert.ok(res.body.length >= 2);
    assert.ok(res.body.some((a) => a.applicant.email === "applicant@example.com"));
    assert.ok(res.body.some((a) => a.referrer && a.referrer.includes(users.poster.alumniCode)));
    assert.ok(!JSON.stringify(res.body).includes("$2"));                     // no password hashes, ever
    await agents.admin.get(`/api/jobs/${publishedId}/applications`).expect(200);
  });

  it("an applicant cannot change their own application status", async () => {
    const app1 = await Application.findOne({ applicant: users.applicant._id });
    await agents.applicant.patch(`/api/applications/${app1._id}/status`).send({ status: "hired" }).expect(404);
    await agents.other.patch(`/api/applications/${app1._id}/status`).send({ status: "hired" }).expect(404);
  });

  it("the owner follows the state machine; illegal jumps and bad values are refused", async () => {
    const a = await Application.findOne({ applicant: users.applicant._id });
    const url = `/api/applications/${a._id}/status`;
    await agents.employer.patch(url).send({ status: "hired" }).expect(409);        // submitted -> hired is illegal
    await agents.employer.patch(url).send({ status: "reviewing" }).expect(200);
    await agents.employer.patch(url).send({ status: "shortlisted" }).expect(200);
    await agents.employer.patch(url).send({ status: "rejected" }).expect(200);
    await agents.employer.patch(url).send({ status: "reviewing" }).expect(409);    // final state
    await agents.employer.patch(url).send({ status: { $ne: "" } }).expect(400);
    await agents.employer.patch(url).send({ status: "promoted" }).expect(400);
    await agents.employer.patch("/api/applications/zzz/status").send({ status: "reviewing" }).expect(404);
  });
});

describe("CORS", () => {
  it("allows the PATCH method from the trusted frontend (needed for status/close/moderate)", async () => {
    const res = await request(app).options("/api/jobs/507f1f77bcf86cd799439011/close")
      .set("Origin", "http://localhost:5500").set("Access-Control-Request-Method", "PATCH");
    assert.ok(/PATCH/.test(res.headers["access-control-allow-methods"] || ""));
  });
});

describe("dashboards & closing", () => {
  it("/jobs/mine shows the owner's jobs with application counts", async () => {
    const res = await agents.employer.get("/api/jobs/mine").expect(200);
    const mine = res.body.find((j) => j.id === publishedId);
    assert.ok(mine.applicationCount >= 2);
    assert.strictEqual(mine.status, "published");
  });

  it("only the owner or an admin can close; closing hides the job and blocks applying", async () => {
    await agents.other.patch(`/api/jobs/${publishedId}/close`).expect(404);
    await agents.employer.patch(`/api/jobs/${publishedId}/close`).expect(200);
    await request(app).get(`/api/jobs/${publishedId}`).expect(404);
    await agents.admin.post(`/api/jobs/${publishedId}/apply`).send(APPLY).expect(404);
  });
});
