const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
if (
  process.env.RF_POSTGRES_TEST !== "1" ||
  !/^researchflow_test_[a-z0-9_]+$/.test(process.env.DB_DATABASE || "") ||
  !["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST)
)
  throw new Error("A disposable local test database is required");
process.env.JWT_BEARER_SECRET = crypto.randomBytes(32).toString("hex");
process.env.ENABLE_QUEUE = "false";
require("reflect-metadata");
const { DataSource } = require("typeorm");
const { NestFactory } = require("@nestjs/core");
const { ValidationPipe } = require("@nestjs/common");
const request = require("supertest");
const argon2 = require("argon2");
const { dataSourceOptions } = require("../src/config/database.config");
const { AppModule } = require("../src/app.module");
let source, app, api, student, other, supervisor, coordinator, linkId;
const password = "Sample@12345";
const auth = (user) => "Bearer " + user.token;
async function register(name, email, role = "student") {
  const res = await api
    .post("/accounts")
    .send({ fullName: name, email, password })
    .expect(201);
  const user = res.body.user;
  if (role !== "student")
    await source.query("UPDATE users SET role = $1 WHERE id = $2", [
      role,
      user.id,
    ]);
  const login = await api
    .post("/auth/login")
    .send({ email, password })
    .expect(200);
  return { ...user, role, token: login.body.accessToken };
}
before(async () => {
  source = new DataSource(dataSourceOptions);
  await source.initialize();
  const migrations = await source.runMigrations({ transaction: "all" });
  assert.equal(
    migrations.length,
    11,
    "Start with an empty disposable database",
  );
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(0, "127.0.0.1");
  api = request(app.getHttpServer());
  student = await register("Test Student", "student@example.com");
  other = await register("Other Student", "other@example.com");
  supervisor = await register(
    "Test Supervisor",
    "supervisor@example.com",
    "supervisor",
  );
  coordinator = await register(
    "Test Coordinator",
    "coordinator@example.com",
    "coordinator",
  );
});
after(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
});
test("eleven migrations create all current workflow tables and password hashes", async () => {
  const rows = await source.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
  );
  for (const table of [
    "users",
    "profiles",
    "research_interests",
    "skills",
    "profile_research_interests",
    "profile_skills",
    "work_links",
  ])
    assert.ok(
      rows.some((row) => row.table_name === table),
      table,
    );
  const [row] = await source.query(
    "SELECT password_hash FROM users WHERE id = $1",
    [student.id],
  );
  assert.ok(await require("bcryptjs").compare(password, row.password_hash));
});
test("real profile pagination joins and explicit false filters work", async () => {
  const res = await api
    .get("/profiles?page=1&limit=2&seekingSupervisor=false")
    .set("Authorization", auth(student))
    .expect(200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.items.length, 2);
  assert.ok(
    res.body.items.every(
      (item) => item.role === "student" && item.seekingSupervisor === false,
    ),
  );
});
test("profile ownership is enforced with real repositories", async () => {
  await api
    .patch("/profiles/" + other.id)
    .set("Authorization", auth(student))
    .send({ bio: "Changed" })
    .expect(403);
  await api
    .patch("/profiles/" + student.id)
    .set("Authorization", auth(student))
    .send({ bio: "Research on NLP", seekingSupervisor: true })
    .expect(200);
});
test("tag upserts, deduplication and filtered directory return complete tag lists", async () => {
  for (let i = 0; i < 2; i++)
    await api
      .post("/profiles/" + student.id + "/tags")
      .set("Authorization", auth(student))
      .send({
        researchInterests: ["Artificial Intelligence", "NLP"],
        skills: ["Python", "TypeScript"],
      })
      .expect(201);
  const res = await api
    .get(
      "/profiles?researchInterest=Artificial%20Intelligence&skill=python&seekingSupervisor=true",
    )
    .set("Authorization", auth(student))
    .expect(200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.items[0].userId, student.id);
  assert.equal(res.body.items[0].researchInterests.length, 2);
  assert.equal(res.body.items[0].skills.length, 2);
  assert.equal("email" in res.body.items[0], false);
  const [row] = await source.query(
    "SELECT count(*)::integer AS count FROM profile_skills WHERE profile_id = $1",
    [student.id],
  );
  assert.equal(row.count, 2);
});
test("PATCH tags replaces only supplied arrays and supports clearing", async () => {
  const res = await api
    .patch("/profiles/" + student.id + "/tags")
    .set("Authorization", auth(student))
    .send({ skills: ["SQL"] })
    .expect(200);
  assert.deepEqual(
    res.body.skills.map((tag) => tag.name),
    ["sql"],
  );
  assert.equal(res.body.researchInterests.length, 2);
  const cleared = await api
    .patch("/profiles/" + student.id + "/tags")
    .set("Authorization", auth(student))
    .send({ skills: [] })
    .expect(200);
  assert.equal(cleared.body.skills.length, 0);
});
test("work links can be created, edited and deleted only by their owner", async () => {
  const res = await api
    .post("/profiles/" + student.id + "/work-links")
    .set("Authorization", auth(student))
    .send({ label: "Portfolio", url: "https://example.com/portfolio" })
    .expect(201);
  linkId = res.body.id;
  await api
    .patch("/profiles/" + student.id + "/work-links/" + linkId)
    .set("Authorization", auth(other))
    .send({ label: "Hijack" })
    .expect(403);
  await api
    .patch("/profiles/" + student.id + "/work-links/" + linkId)
    .set("Authorization", auth(student))
    .send({ label: "Updated portfolio" })
    .expect(200);
  const profile = await api
    .get("/profiles/" + student.id)
    .set("Authorization", auth(other))
    .expect(200);
  assert.equal(profile.body.workLinks[0].label, "Updated portfolio");
  await api
    .delete("/profiles/" + student.id + "/work-links/" + linkId)
    .set("Authorization", auth(student))
    .expect(200);
});
test("supervisor capacity and database constraints reject invalid direct writes", async () => {
  await api
    .patch("/profiles/" + supervisor.id)
    .set("Authorization", auth(supervisor))
    .send({ capacity: 5, availability: "Open" })
    .expect(200);
  await assert.rejects(
    source.query("UPDATE profiles SET capacity = -1 WHERE user_id = $1", [
      supervisor.id,
    ]),
    (error) => error.code === "23514",
  );
  await assert.rejects(
    source.query("UPDATE users SET full_name = ' ' WHERE id = $1", [
      student.id,
    ]),
    (error) => error.code === "23514",
  );
  await assert.rejects(
    source.query("UPDATE users SET email = $1 WHERE id = $2", [
      "STUDENT@EXAMPLE.COM",
      other.id,
    ]),
    (error) => error.code === "23505",
  );
});
test("coordinator role changes invalidate already-issued tokens", async () => {
  await api
    .patch("/accounts/" + other.id + "/role")
    .set("Authorization", auth(coordinator))
    .send({ role: "supervisor" })
    .expect(200);
  await api.get("/auth/me").set("Authorization", auth(other)).expect(401);
});
test("logout increments the persisted token version", async () => {
  await api
    .post("/auth/logout")
    .set("Authorization", auth(student))
    .expect(200);
  await api.get("/auth/me").set("Authorization", auth(student)).expect(401);
});
test("all migrations roll back and run again on the disposable database", async () => {
  await app.close();
  app = null;
  for (let i = 0; i < 11; i++)
    await source.undoLastMigration({ transaction: "all" });
  const [row] = await source.query(
    "SELECT to_regclass('public.users') AS users",
  );
  assert.equal(row.users, null);
  assert.equal((await source.runMigrations({ transaction: "all" })).length, 11);
});
