const test = require("node:test");
const assert = require("node:assert");
const { validatePassword } = require("../utils/password");
const { validateLogin, validateRegistration } = require("../utils/validators");
const { originGuard } = require("../middleware/originGuard");

const good = { firstName: "Ada", lastName: "Obi", email: "ada@example.com",
  password: "correct horse battery", gradYear: 2020, department: "Computer Science", consent: true };

test("password: too short rejected", () => assert.ok(validatePassword("short1")));
test("password: common rejected", () => assert.ok(validatePassword("Password123")));
test("password: >72 bytes rejected (bcrypt truncation)", () => assert.ok(validatePassword("a1".repeat(40))));
test("password: contains email name rejected", () =>
  assert.ok(validatePassword("adaobi-rocks-2024", { email: "adaobi@x.com" })));
test("password: long passphrase accepted", () => assert.strictEqual(validatePassword("correct horse battery"), null));

test("login: NoSQL injection object rejected", () => {
  assert.ok(validateLogin({ email: { $gt: "" }, password: { $gt: "" } }).error);
});
test("register: valid input passes", () => assert.ok(validateRegistration(good).value));
test("register: role field is ignored (no mass assignment)", () => {
  const r = validateRegistration({ ...good, role: "admin" });
  assert.strictEqual(r.value.role, undefined);
});
test("register: consent required", () =>
  assert.ok(validateRegistration({ ...good, consent: false }).errors.length));
test("register: object email rejected", () =>
  assert.ok(validateRegistration({ ...good, email: { $ne: null } }).errors.length));

function run(method, origin) {
  let status = null, nexted = false;
  const req = { method, get: () => origin };
  const res = { status(s) { status = s; return this; }, json() {} };
  originGuard(["https://app.example"])(req, res, () => { nexted = true; });
  return { status, nexted };
}
test("originGuard: evil origin POST blocked", () => assert.strictEqual(run("POST", "https://evil.com").status, 403));
test("originGuard: trusted origin POST allowed", () => assert.ok(run("POST", "https://app.example").nexted));
test("originGuard: GET always allowed", () => assert.ok(run("GET", "https://evil.com").nexted));
