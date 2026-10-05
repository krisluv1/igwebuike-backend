const test = require("node:test");
const assert = require("node:assert");
const r = require("../utils/jobRules");

const goodJob = { title: "Frontend Developer", company: "TechNova", location: "Lagos", type: "full-time",
  description: "Build accessible interfaces with React and TypeScript for our alumni.", skills: ["React", " TypeScript "] };

test("job: valid input passes and skills are normalised", () => {
  const v = r.validateJob(goodJob).value;
  assert.deepStrictEqual(v.skills, ["react", "typescript"]);
});
test("job: javascript: and http: apply links are rejected", () => {
  assert.ok(r.validateJob({ ...goodJob, applyUrl: "javascript:alert(1)" }).errors);
  assert.ok(r.validateJob({ ...goodJob, applyUrl: "http://example.com" }).errors);
  assert.ok(r.validateJob({ ...goodJob, applyUrl: "data:text/html,<script>1</script>" }).errors);
  assert.ok(r.validateJob({ ...goodJob, applyUrl: "https://example.com/apply" }).value);
});
test("job: object injection in fields is rejected", () => {
  assert.ok(r.validateJob({ ...goodJob, title: { $ne: "" } }).errors);
  assert.ok(r.validateJob({ ...goodJob, type: { $gt: "" } }).errors);
});
test("job: bad type, short description, too many skills rejected", () => {
  assert.ok(r.validateJob({ ...goodJob, type: "slave-labour" }).errors);
  assert.ok(r.validateJob({ ...goodJob, description: "too short" }).errors);
  assert.ok(r.validateJob({ ...goodJob, skills: Array.from({ length: 16 }, (_, i) => "s" + i) }).errors);
});
test("job: client cannot set status or owner (fields are simply not read)", () => {
  const v = r.validateJob({ ...goodJob, status: "published", postedBy: "x" }).value;
  assert.strictEqual(v.status, undefined);
  assert.strictEqual(v.postedBy, undefined);
});
test("skills: c++, c#, node.js allowed; markup rejected; duplicates merged", () => {
  assert.deepStrictEqual(r.normalizeSkills(["C++", "c#", "Node.js", "c++"]), ["c++", "c#", "node.js"]);
  assert.strictEqual(r.normalizeSkills(["<script>"]), null);
  assert.strictEqual(r.normalizeSkills([{ a: 1 }]), null);
  assert.deepStrictEqual(r.normalizeSkills("python, sql ,  python"), ["python", "sql"]);
});
test("application: cover note length and link rules", () => {
  assert.ok(r.validateApplication({ coverNote: "short" }).errors);
  assert.ok(r.validateApplication({ coverNote: "I am excited to apply for this role because..." , cvUrl: "javascript:1" }).errors);
  assert.ok(r.validateApplication({ coverNote: "I am excited to apply for this role because...", referrerCode: "IWU-CSC-20-4821" }).value);
  assert.ok(r.validateApplication({ coverNote: "I am excited to apply for this role because...", referrerCode: "'; drop" }).errors);
});
test("state machine: only legal transitions, final states are final", () => {
  assert.ok(r.canTransition("submitted", "reviewing"));
  assert.ok(r.canTransition("shortlisted", "hired"));
  assert.ok(!r.canTransition("submitted", "hired"));
  assert.ok(!r.canTransition("rejected", "reviewing"));
  assert.ok(!r.canTransition("hired", "rejected"));
  assert.ok(!r.canTransition("bogus", "hired"));
});
test("objectId: only 24 hex chars accepted", () => {
  assert.ok(r.isObjectId("507f1f77bcf86cd799439011"));
  assert.ok(!r.isObjectId("not-an-id"));
  assert.ok(!r.isObjectId({ $gt: "" }));
  assert.ok(!r.isObjectId("507f1f77bcf86cd79943901"));
});
test("pagination: caps limit at 20 and ignores attacker-supplied objects/arrays", () => {
  assert.deepStrictEqual(r.parsePagination({ page: "2", limit: "500" }), { page: 2, limit: 20, skip: 20 });
  assert.deepStrictEqual(r.parsePagination({ limit: { $gt: "1" }, page: ["1"] }), { page: 1, limit: 10, skip: 0 });
  assert.strictEqual(r.parsePagination({ page: "-5" }).page, 1);
});
test("escapeRegex neutralises regex metacharacters (no ReDoS / regex injection)", () => {
  assert.strictEqual(r.escapeRegex("(a+)+$"), "\\(a\\+\\)\\+\\$");
  assert.ok(new RegExp(r.escapeRegex(".*")).test(".*") && !new RegExp(r.escapeRegex(".*")).test("abc"));
});
