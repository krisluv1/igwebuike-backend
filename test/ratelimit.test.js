// Separate FILE = separate process, so rate limiting stays ON here (it is OFF in
// integration.test.js). Needs no database: invalid bodies are rejected with 400
// BEFORE any DB access, and failed requests still count toward the limit.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.FRONTEND_URL = "http://localhost:5500";
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/igwebuike_test";
delete process.env.DISABLE_RATE_LIMIT;

const { it } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const app = require("../app");

it("login is rate limited: the 11th failed attempt from one IP gets 429", async () => {
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await request(app).post("/api/auth/login").send({})).status);
  }
  assert.deepStrictEqual(statuses.slice(0, 10), Array(10).fill(400));
  assert.strictEqual(statuses[10], 429);
});
