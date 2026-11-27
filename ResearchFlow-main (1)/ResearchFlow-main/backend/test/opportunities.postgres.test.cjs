const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
if (
  process.env.RF_POSTGRES_TEST !== "1" ||
  !/^researchflow_test_[a-z0-9_]+$/.test(process.env.DB_DATABASE || "") ||
  !["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST)
)
  throw new Error("Disposable local test database required");
process.env.JWT_BEARER_SECRET = crypto.randomBytes(32).toString("hex");
process.env.ENABLE_QUEUE = "false";
require("reflect-metadata");
const { DataSource } = require("typeorm");
const { NestFactory } = require("@nestjs/core");
const { JwtService } = require("@nestjs/jwt");
const { ValidationPipe } = require("@nestjs/common");
const argon2 = require("argon2");
const request = require("supertest");
const { dataSourceOptions } = require("../src/config/database.config");
const { AppModule } = require("../src/app.module");
const { User } = require("../src/modules/accounts/entities/user.entity");
const { Profile } = require("../src/modules/profiles/entities/profile.entity");
let source, app, api, jwt, owner, other, student, coordinator, postId;
const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
const details = () => ({
  title: "Bangla NLP research opportunity",
  description: "Study research abstract classification.",
  criteria: "Interest in NLP and availability for weekly research.",
  places: 4,
  deadline: future(),
  areaTags: ["NLP", "Artificial Intelligence"],
  requiredSkills: [" Python "],
  preferredSkills: ["TypeScript"],
});
const auth = (u) => "Bearer " + u.token;
const get = (p, u) => api.get(p).set("Authorization", auth(u));
const post = (p, u, b) => api.post(p).set("Authorization", auth(u)).send(b);
const patch = (p, u, b) => api.patch(p).set("Authorization", auth(u)).send(b);
before(async () => {
  source = await new DataSource(dataSourceOptions).initialize();
  await source.runMigrations({ transaction: "all" });
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(0, "127.0.0.1");
  api = request(app.getHttpServer());
  jwt = app.get(JwtService);
  const passwordHash = await argon2.hash("OpportunityTest@12345");
  async function actor(fullName, role) {
    const u = await source.transaction(async (m) => {
      const saved = await m
        .getRepository(User)
        .save({
          fullName,
          role,
          email: crypto.randomUUID() + "@example.com",
          passwordHash,
        });
      await m.getRepository(Profile).save({ userId: saved.id });
      return saved;
    });
    return {
      ...u,
      token: await jwt.signAsync({ sub: u.id, version: u.tokenVersion }),
    };
  }
  owner = await actor("Demo Research Supervisor", "supervisor");
  other = await actor("Other Research Supervisor", "supervisor");
  student = await actor("Md. Tahmid Abtahee", "student");
  coordinator = await actor("Demo Coordinator", "coordinator");
});
after(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
});
test("only authenticated supervisors can create opportunities", async () => {
  await api.post("/opportunities").send(details()).expect(401);
  for (const u of [student, coordinator])
    await post("/opportunities", u, details()).expect(403);
});
test("DTOs reject invalid fields and forged supervisor ownership or reservations", async () => {
  for (const extra of [
    { title: " " },
    { criteria: "" },
    { description: "" },
    { places: 0 },
    { places: 2.5 },
    { places: "4" },
    { places: 1001 },
    { deadline: "not-date" },
    { areaTags: [] },
    { areaTags: [" "] },
    { requiredSkills: ["Python", " python "] },
    { requiredSkills: null },
    { supervisorId: other.id },
    { reservedPlaces: 1 },
    { status: "open" },
  ])
    await post("/opportunities", owner, { ...details(), ...extra }).expect(400);
});
test("deadline validation requires a future instant with timezone", async () => {
  for (const deadline of [
    "2020-01-01T00:00:00Z",
    "2027-12-31",
    "2027-12-31T23:00:00",
  ])
    await post("/opportunities", owner, { ...details(), deadline }).expect(400);
});
test("draft creation uses shared research and skill vocabulary without leaking account data", async () => {
  const res = (await post("/opportunities", owner, details()).expect(201)).body;
  postId = res.id;
  assert.equal(res.status, "draft");
  assert.equal(res.remainingPlaces, 4);
  assert.equal(res.acceptingApplications, false);
  assert.equal(res.requiredSkills[0].name, "python");
  assert.equal(res.supervisorName, owner.fullName);
  assert.equal("supervisor" in res, false);
  assert.equal("email" in res, false);
  assert.equal("passwordHash" in res, false);
  const [skill] = await source.query("SELECT id FROM skills WHERE name=$1", [
    "python",
  ]);
  assert.equal(res.requiredSkills[0].id, skill.id);
});
test("drafts are owner-only and absent from the public directory", async () => {
  await get("/opportunities/" + postId, owner).expect(200);
  for (const u of [student, other, coordinator])
    await get("/opportunities/" + postId, u).expect(404);
  assert.equal(
    (await get("/opportunities?supervisorId=" + owner.id, student).expect(200))
      .body.total,
    0,
  );
  assert.equal(
    (await get("/opportunities/mine", owner).expect(200)).body.total,
    1,
  );
  await get("/opportunities/mine", student).expect(403);
});
test("only the owning supervisor can edit and open or close a post", async () => {
  await patch("/opportunities/" + postId, other, { title: "Hijack" }).expect(
    403,
  );
  for (const u of [student, coordinator, other])
    await patch(`/opportunities/${postId}/status`, u, {
      status: "open",
    }).expect(403);
  await patch(`/opportunities/${postId}/status`, owner, {
    status: "closed",
  }).expect(409);
  await patch(`/opportunities/${postId}/status`, owner, {
    status: "draft",
  }).expect(400);
  const opened = await patch(`/opportunities/${postId}/status`, owner, {
    status: "open",
  }).expect(200);
  assert.equal(opened.body.acceptingApplications, true);
  assert.ok(opened.body.openedAt);
});
test("open opportunities support interest, required/preferred skill, supervisor filters and bounded pages", async () => {
  for (const skill of ["PYTHON", "TypeScript"]) {
    const res = (
      await get(
        `/opportunities?researchInterest=NLP&skill=${skill}&supervisorId=${owner.id}&limit=1`,
        student,
      ).expect(200)
    ).body;
    assert.equal(res.total, 1);
    assert.equal(res.items[0].areaTags.length, 2);
    assert.equal(res.items[0].preferredSkills.length, 1);
  }
  assert.equal(
    (await get("/opportunities?skill=unmatched", student).expect(200)).body
      .total,
    0,
  );
  for (const q of ["limit=101", "page=0", "supervisorId=bad", "unexpected=1"])
    await get("/opportunities?" + q, student).expect(400);
  await api.get("/opportunities").expect(401);
});
test("patch preserves omitted skill lists, supports clearing and rejects nulls", async () => {
  for (const body of [
    { title: null },
    { requiredSkills: null },
    { deadline: null },
    { places: null },
  ])
    await patch("/opportunities/" + postId, owner, body).expect(400);
  const res = await patch("/opportunities/" + postId, owner, {
    title: "Updated NLP research",
    preferredSkills: [],
  }).expect(200);
  assert.equal(res.body.requiredSkills[0].name, "python");
  assert.deepEqual(res.body.preferredSkills, []);
  await patch("/opportunities/" + postId, owner, {
    preferredSkills: ["Machine Learning"],
  }).expect(200);
});
test("closing stops new applications and reopening preserves the original publication time", async () => {
  const openedAt = (await get("/opportunities/" + postId, student).expect(200))
    .body.openedAt;
  const res = await patch(`/opportunities/${postId}/status`, owner, {
    status: "closed",
  }).expect(200);
  assert.equal(res.body.acceptingApplications, false);
  assert.equal(
    (await get("/opportunities?supervisorId=" + owner.id, student).expect(200))
      .body.total,
    0,
  );
  await get("/opportunities/" + postId, student).expect(200);
  assert.equal(
    (
      await patch(`/opportunities/${postId}/status`, owner, {
        status: "open",
      }).expect(200)
    ).body.openedAt,
    openedAt,
  );
});
test("expired deadlines disable applications and must be extended before reopening", async () => {
  await source.query(
    "UPDATE opportunities SET deadline=CURRENT_TIMESTAMP-interval '1 day' WHERE id=$1",
    [postId],
  );
  assert.equal(
    (await get("/opportunities/" + postId, student).expect(200)).body
      .acceptingApplications,
    false,
  );
  assert.equal(
    (await get("/opportunities?supervisorId=" + owner.id, student).expect(200))
      .body.total,
    0,
  );
  await patch(`/opportunities/${postId}/status`, owner, {
    status: "open",
  }).expect(409);
  await patch("/opportunities/" + postId, owner, { deadline: future() }).expect(
    200,
  );
  await patch(`/opportunities/${postId}/status`, owner, {
    status: "open",
  }).expect(200);
});
test("reserved places cannot be overwritten or reduced below reservations and full posts cannot reopen", async () => {
  await source.query("UPDATE opportunities SET reserved_places=3 WHERE id=$1", [
    postId,
  ]);
  await patch("/opportunities/" + postId, owner, { places: 2 }).expect(409);
  await patch("/opportunities/" + postId, owner, { reservedPlaces: 0 }).expect(
    400,
  );
  await patch("/opportunities/" + postId, owner, { places: 3 }).expect(200);
  await patch(`/opportunities/${postId}/status`, owner, {
    status: "open",
  }).expect(409);
  assert.equal(
    (await get("/opportunities/" + postId, student).expect(200)).body
      .acceptingApplications,
    false,
  );
  await assert.rejects(
    source.query("UPDATE opportunities SET reserved_places=4 WHERE id=$1", [
      postId,
    ]),
    (e) => e.code === "23514",
  );
  await source.query("UPDATE opportunities SET reserved_places=0 WHERE id=$1", [
    postId,
  ]);
});
test("inactive or demoted owners are excluded from the public directory and record view", async () => {
  await source.query("UPDATE users SET is_active=false WHERE id=$1", [
    owner.id,
  ]);
  await get("/opportunities/" + postId, student).expect(404);
  assert.equal(
    (await get("/opportunities?supervisorId=" + owner.id, student).expect(200))
      .body.total,
    0,
  );
  await source.query("UPDATE users SET is_active=true,role=$2 WHERE id=$1", [
    owner.id,
    "student",
  ]);
  await get("/opportunities/" + postId, student).expect(404);
  await source.query("UPDATE users SET role=$2 WHERE id=$1", [
    owner.id,
    "supervisor",
  ]);
});
