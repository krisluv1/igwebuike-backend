// INTEGRATION TESTS: the real Express app + a real MongoDB (never your production DB).
// Each test below maps to a finding in docs/SECURITY.md.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.DISABLE_RATE_LIMIT = "true";
// SAFETY: tests DROP the database. Use ONLY MONGO_URI_TEST, never MONGO_URI.
process.env.MONGO_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/igwebuike_test";

const { describe, it, before, after } = require("node:test");
const assert   = require("node:assert");
const request  = require("supertest");
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");

const app    = require("../app");
const Alumni = require("../models/Alumni");
const Booking = require("../models/Booking");

const PASSWORD = "correct horse battery";
const newUser = (n, extra = {}) => ({
  firstName: "Ada", lastName: "Obi", email: `ada${n}@example.com`, password: PASSWORD,
  gradYear: 2020, department: "Computer Science", consent: true, ...extra,
});
const cookieOf = (res) => res.headers["set-cookie"];

before(async () => {
  // Each integration file uses its OWN database: node runs test files in parallel.
  await mongoose.connect(process.env.MONGO_URI, { dbName: "igwebuike_auth_test" });
  if (!mongoose.connection.name.endsWith("_test")) {
    throw new Error("Refusing to run: database name must end with _test");
  }
  await mongoose.connection.dropDatabase();
  await Alumni.init();    // build the UNIQUE indexes before testing duplicates
  await Booking.init();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("registration", () => {
  it("creates an account, hashes the password, logs the user in", async () => {
    const res = await request(app).post("/api/alumni/register").send(newUser(1));
    assert.strictEqual(res.status, 201);
    assert.match(res.body.alumniCode, /^IWU-CSC-20-\d{4}$/);
    assert.ok(cookieOf(res).join(";").includes("HttpOnly"), "auth cookie must be HttpOnly");
    const stored = await Alumni.findOne({ email: "ada1@example.com" }).select("+password");
    assert.notStrictEqual(stored.password, PASSWORD);
    assert.ok(stored.password.startsWith("$2"), "must be a bcrypt hash");
    assert.ok(stored.consentAt instanceof Date);
  });

  it("ignores a client-supplied role (mass assignment)", async () => {
    await request(app).post("/api/alumni/register").send(newUser(2, { role: "admin" })).expect(201);
    const u = await Alumni.findOne({ email: "ada2@example.com" });
    assert.strictEqual(u.role, "alumni");
  });

  it("rejects duplicate emails with 409", async () => {
    await request(app).post("/api/alumni/register").send(newUser(1)).expect(409);
  });

  it("rejects weak password, missing consent, and injection objects", async () => {
    await request(app).post("/api/alumni/register").send(newUser(3, { password: "short" })).expect(400);
    await request(app).post("/api/alumni/register").send(newUser(3, { consent: false })).expect(400);
    await request(app).post("/api/alumni/register").send(newUser(3, { email: { $gt: "" } })).expect(400);
  });

  it("never lets an attacker pick the alumniCode", async () => {
    await request(app).post("/api/alumni/register").send(newUser(4, { alumniCode: "IWU-ADM-00-0000" })).expect(201);
    const u = await Alumni.findOne({ email: "ada4@example.com" });
    assert.notStrictEqual(u.alumniCode, "IWU-ADM-00-0000");
  });
});

describe("login", () => {
  it("gives the SAME generic error for unknown email and wrong password", async () => {
    const a = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "whatever-long-1" });
    const b = await request(app).post("/api/auth/login").send({ email: "ada1@example.com", password: "wrong-password-1" });
    assert.strictEqual(a.status, 401);
    assert.strictEqual(b.status, 401);
    assert.deepStrictEqual(a.body, b.body);          // no user enumeration
  });

  it("rejects NoSQL injection in login", async () => {
    await request(app).post("/api/auth/login").send({ email: { $gt: "" }, password: { $gt: "" } }).expect(400);
  });

  it("succeeds with correct credentials and never returns the password hash", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "ada1@example.com", password: PASSWORD });
    assert.strictEqual(res.status, 200);
    assert.ok(!JSON.stringify(res.body).includes("$2"));
    assert.strictEqual(res.body.user.role, "alumni");
  });

  it("locks the account after 5 failures, even for the correct password", async () => {
    await request(app).post("/api/alumni/register").send(newUser(5)).expect(201);
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/login").send({ email: "ada5@example.com", password: "wrong-password-1" }).expect(401);
    }
    const locked = await request(app).post("/api/auth/login").send({ email: "ada5@example.com", password: PASSWORD });
    assert.strictEqual(locked.status, 401);
    const u = await Alumni.findOne({ email: "ada5@example.com" });
    assert.ok(u.lockUntil > new Date());
  });
});

describe("sessions & token security", () => {
  it("/me requires login", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const u = await Alumni.findOne({ email: "ada1@example.com" });
    const bad = jwt.sign({ sub: String(u._id), tv: 0 }, "attacker-secret-attacker-secret-1234");
    await request(app).get("/api/auth/me").set("Cookie", `iw_token=${bad}`).expect(401);
  });

  it("rejects an unsigned alg:none token", async () => {
    const u = await Alumni.findOne({ email: "ada1@example.com" });
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: String(u._id), tv: 0 })}.`;
    await request(app).get("/api/auth/me").set("Cookie", `iw_token=${forged}`).expect(401);
  });

  it("logout revokes the token server-side (a stolen cookie stops working)", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "ada2@example.com", password: PASSWORD });
    const cookie = cookieOf(login);
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(200);
    await request(app).post("/api/auth/logout").set("Cookie", cookie).expect(200);
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);   // same OLD cookie
  });
});

describe("access control (RBAC)", () => {
  it("booking requires login", async () => {
    await request(app).post("/api/events/book").send({ eventName: "Tech Career Fair", phone: "+2348000000000" }).expect(401);
  });

  it("books using the SESSION identity, ignoring spoofed body fields", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "ada4@example.com", password: PASSWORD }).expect(200);
    await agent.post("/api/events/book").send({
      eventName: "Tech Career Fair", phone: "+2348000000000",
      fullName: "Evil Hacker", alumniCode: "IWU-ADM-00-0000",     // spoof attempt
    }).expect(201);
    const real = await Alumni.findOne({ email: "ada4@example.com" });
    const b = await Booking.findOne({ eventName: "Tech Career Fair", alumniCode: real.alumniCode });
    assert.ok(b, "booking must be stored under the real user's code");
    assert.strictEqual(b.fullName, "Ada Obi");
  });

  it("blocks double booking (unique index, no race condition)", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "ada4@example.com", password: PASSWORD }).expect(200);
    await agent.post("/api/events/book").send({ eventName: "Tech Career Fair", phone: "+2348000000000" }).expect(409);
  });

  it("handles 10 simultaneous identical bookings: exactly one wins", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "ada1@example.com", password: PASSWORD }).expect(200);
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      agent.post("/api/events/book").send({ eventName: "Alumni Homecoming 2026", phone: "+2348000000000" })));
    const codes = results.map((r) => r.status).sort();
    assert.strictEqual(codes.filter((c) => c === 201).length, 1);
    assert.strictEqual(codes.filter((c) => c === 409).length, 9);
  });

  it("bookings list: anonymous 401, alumni 403, admin 200", async () => {
    await request(app).get("/api/events/bookings").expect(401);

    const alumni = request.agent(app);
    await alumni.post("/api/auth/login").send({ email: "ada1@example.com", password: PASSWORD }).expect(200);
    await alumni.get("/api/events/bookings").expect(403);

    await Alumni.create({ firstName: "Site", lastName: "Admin", email: "admin@example.com",
      password: await bcrypt.hash(PASSWORD, 4), gradYear: 2020, department: "Administration",
      alumniCode: "IWU-ADM-00-0001", role: "admin", consentAt: new Date() });
    const admin = request.agent(app);
    await admin.post("/api/auth/login").send({ email: "admin@example.com", password: PASSWORD }).expect(200);
    const res = await admin.get("/api/events/bookings").expect(200);
    assert.ok(Array.isArray(res.body) && res.body.length >= 1);
  });
});

describe("privacy & hardening", () => {
  it("public /recent masks names and codes and exposes no email/phone", async () => {
    const res = await request(app).get("/api/alumni/recent").expect(200);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes("@"), "no emails");
    assert.ok(!text.includes("phone"));
    assert.ok(res.body.every((r) => /^IWU-[A-Z]{3}-\d\d-••••$/.test(r.code)));
    assert.ok(res.body.every((r) => /\s[A-Z]\.$/.test(r.name)), "last name reduced to an initial");
  });

  it("blocks state-changing requests from an untrusted Origin (CSRF)", async () => {
    await request(app).post("/api/auth/login").set("Origin", "https://evil.example")
      .send({ email: "ada1@example.com", password: PASSWORD }).expect(403);
  });

  it("allows the trusted frontend Origin and sets CORS credentials", async () => {
    const res = await request(app).get("/").set("Origin", "http://localhost:5500");
    assert.strictEqual(res.headers["access-control-allow-origin"], "http://localhost:5500");
    assert.strictEqual(res.headers["access-control-allow-credentials"], "true");
  });

  it("sends security headers and hides the framework", async () => {
    const res = await request(app).get("/");
    assert.strictEqual(res.headers["x-powered-by"], undefined);
    assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
  });

  it("rejects oversized bodies with 413 and bad JSON with 400 (not 500)", async () => {
    await request(app).post("/api/auth/login").send({ email: "a@b.co", password: "x".repeat(20000) }).expect(413);
    await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{not json").expect(400);
  });

  it("readiness endpoint reports the database is connected", async () => {
    await request(app).get("/healthz").expect(200);
  });
});
