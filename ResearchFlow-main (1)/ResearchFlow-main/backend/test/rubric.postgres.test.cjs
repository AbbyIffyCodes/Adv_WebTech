const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
if (
  process.env.RF_POSTGRES_TEST !== "1" ||
  !/^researchflow_test_[a-z0-9_]+$/.test(process.env.DB_DATABASE || "") ||
  !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST)
)
  throw Error("Disposable database required");
process.env.JWT_BEARER_SECRET = crypto.randomBytes(32).toString("hex");
process.env.ENABLE_QUEUE = "false";
require("reflect-metadata");
const { DataSource } = require("typeorm"),
  { NestFactory } = require("@nestjs/core"),
  { ValidationPipe } = require("@nestjs/common"),
  request = require("supertest"),
  argon2 = require("argon2"),
  bcrypt = require("bcryptjs");
const { dataSourceOptions } = require("../src/config/database.config"),
  { AppModule } = require("../src/app.module");
let source,
  app,
  api,
  student,
  other,
  coord,
  sup,
  group,
  project,
  opportunity,
  selection;
const password = "Rubric@12345",
  auth = (u) => "Bearer " + u.token;
const get = (p, u) => api.get(p).set("Authorization", auth(u));
const post = (p, u, b) => api.post(p).set("Authorization", auth(u)).send(b);
const patch = (p, u, b) => api.patch(p).set("Authorization", auth(u)).send(b);
const del = (p, u) => api.delete(p).set("Authorization", auth(u));
async function actor(fullName, role = "student") {
  const email = crypto.randomUUID() + "@example.com";
  const res = await api
    .post("/accounts")
    .send({ fullName, email, password })
    .expect(201);
  if (role !== "student")
    await source.query("UPDATE users SET role=$1 WHERE id=$2", [
      role,
      res.body.user.id,
    ]);
  const { JwtService } = require("@nestjs/jwt");
  const token = await app
    .get(JwtService)
    .signAsync({ sub: res.body.user.id, version: 0 });
  return { ...res.body.user, role, email, token };
}
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
  student = await actor("Mayesha Rubric Demo");
  other = await actor("Amrin Rubric Demo");
  coord = await actor("Rubric Coordinator", "coordinator");
  sup = await actor("Rubric Supervisor", "supervisor");
});
after(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
});
test("new accounts use bcrypt cost 12 without exposing the hash", async () => {
  const [row] = await source.query(
    "SELECT password_hash FROM users WHERE id=$1",
    [student.id],
  );
  assert.match(row.password_hash, /^\$2[aby]\$12\$/);
  assert.ok(await bcrypt.compare(password, row.password_hash));
  const res = await get("/accounts/" + student.id, student).expect(200);
  assert.equal(res.body.passwordHash, undefined);
  assert.equal(res.body.tokenVersion, undefined);
});
test("legacy Argon2 login upgrades only after correct password verification", async () => {
  const old = await argon2.hash(password);
  await source.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
    old,
    other.id,
  ]);
  await api
    .post("/auth/login")
    .send({ email: other.email, password: "Wrong@12345" })
    .expect(401);
  assert.equal(
    (
      await source.query("SELECT password_hash FROM users WHERE id=$1", [
        other.id,
      ])
    )[0].password_hash,
    old,
  );
  const result = await api
    .post("/auth/login")
    .send({ email: other.email, password });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.match(
    (
      await source.query("SELECT password_hash FROM users WHERE id=$1", [
        other.id,
      ])
    )[0].password_hash,
    /^\$2[aby]\$/,
  );
});
test("bcrypt byte limit prevents truncation and legacy long passwords still work", async () => {
  const email = crypto.randomUUID() + "@example.com";
  await api
    .post("/accounts")
    .send({
      fullName: "Long Password",
      email,
      password: "Aa1!" + "x".repeat(69),
    })
    .expect(400);
  await api
    .post("/accounts")
    .send({
      fullName: "Unicode Password",
      email,
      password: "Aa1!" + String.fromCodePoint(0x985).repeat(24),
    })
    .expect(400);
  const long = "Aa1!" + "x".repeat(80);
  await source.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
    await argon2.hash(long),
    other.id,
  ]);
  await api
    .post("/auth/login")
    .send({ email: other.email, password: long })
    .expect(200);
  await source.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
    await bcrypt.hash(password, 12),
    other.id,
  ]);
});
test("account list and detail enforce role, ownership and pagination", async () => {
  await get("/accounts", student).expect(403);
  await get("/accounts/" + other.id, student).expect(403);
  const res = await get("/accounts?page=1&limit=1", coord).expect(200);
  assert.equal(res.body.items.length, 1);
  assert.ok(res.body.total >= 4);
  assert.equal(res.body.limit, 1);
  await get("/accounts?limit=101", coord).expect(400);
  await get("/accounts/" + crypto.randomUUID(), coord).expect(404);
});
test("account update validates fields and rolls back a duplicate email with 409", async () => {
  await patch("/accounts/" + other.id, student, {
    fullName: "Forged Edit",
  }).expect(403);
  await patch("/accounts/" + student.id, student, {
    role: "coordinator",
  }).expect(400);
  await patch("/accounts/" + student.id, student, { fullName: null }).expect(
    400,
  );
  await patch("/accounts/" + student.id, student, {
    fullName: "Mayesha Updated",
  }).expect(200);
  const fail = await patch("/accounts/" + student.id, student, {
    fullName: "Must Roll Back",
    email: other.email,
  }).expect(409);
  assert.equal(fail.body.statusCode, 409);
  assert.equal(fail.body.error, "Conflict");
  assert.equal(fail.body.stack, undefined);
  assert.equal(
    (await get("/accounts/" + student.id, student)).body.fullName,
    "Mayesha Updated",
  );
});
test("deactivation retains history, revokes tokens and blocks later login", async () => {
  await del("/accounts/" + other.id, student).expect(403);
  await del("/accounts/" + coord.id, coord).expect(403);
  await del("/accounts/" + other.id, coord).expect(200);
  await get("/auth/me", other).expect(401);
  await api
    .post("/auth/login")
    .send({ email: other.email, password })
    .expect(401);
  const retained = await get("/accounts/" + other.id, coord).expect(200);
  assert.equal(retained.body.isActive, false);
  await del("/accounts/" + other.id, coord).expect(200);
});
test("group directory provides paginated summaries without private account fields", async () => {
  group = (
    await post("/groups", student, { name: "Rubric Research Group" }).expect(
      201,
    )
  ).body;
  const res = await get("/groups?limit=1", coord).expect(200);
  assert.equal(res.body.items.length, 1);
  assert.ok(res.body.total >= 1);
  assert.equal(res.body.items[0].members[0].email, undefined);
  await get("/groups?limit=101", student).expect(400);
  await del("/accounts/" + student.id, coord).expect(409);
});
const details = () => ({
  title: "Rubric Opportunity",
  description: "Research test opportunity",
  criteria: "Interest in research",
  places: 4,
  deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
  areaTags: ["NLP"],
  requiredSkills: [],
  preferredSkills: [],
});
test("opportunity deletion checks owner, role and missing IDs", async () => {
  const item = (await post("/opportunities", sup, details()).expect(201)).body;
  await del("/opportunities/" + item.id, student).expect(403);
  const otherSup = await actor("Other Rubric Supervisor", "supervisor");
  await del("/opportunities/" + item.id, otherSup).expect(403);
  await del("/opportunities/" + item.id, sup).expect(200);
  await get("/opportunities/" + item.id, sup).expect(404);
  await del("/opportunities/" + item.id, sup).expect(404);
});
test("referenced opportunities and confirmed supervisors cannot be deleted", async () => {
  await patch("/profiles/" + sup.id, sup, {
    capacity: 5,
    availability: "Open",
  }).expect(200);
  project = (
    await post("/projects", student, {
      groupId: group.id,
      title: "Rubric Project",
      sharedSummary: "Test transactional selection",
      areaTags: ["NLP"],
    }).expect(201)
  ).body;
  await patch("/projects/" + project.id + "/summary-visibility", student, {
    published: true,
  }).expect(200);
  opportunity = (await post("/opportunities", sup, details()).expect(201)).body;
  await patch("/opportunities/" + opportunity.id + "/status", sup, {
    status: "open",
  }).expect(200);
  selection = (
    await post("/selection/applications", student, {
      projectId: project.id,
      supervisorId: sup.id,
      opportunityId: opportunity.id,
      statement: "Request supervision",
    }).expect(201)
  ).body;
  await del("/opportunities/" + opportunity.id, sup).expect(409);
  await post("/selection/requests/" + selection.id + "/offer", sup, {}).expect(
    200,
  );
  await post("/selection/requests/" + selection.id + "/confirm", student, {
    shareFullProposal: true,
  }).expect(200);
  await del("/accounts/" + sup.id, coord).expect(409);
  await del("/opportunities/" + opportunity.id, sup).expect(409);
});
test("unknown failures use a generic error response without SQL or stack details", () => {
  const {
    HttpErrorFilter,
  } = require("../src/common/filters/http-error.filter");
  const filter = new HttpErrorFilter();
  let status, body;
  filter.logger = { error: () => {} };
  filter.catch(new Error("private SQL failure"), {
    switchToHttp: () => ({
      getResponse: () => ({
        status(s) {
          status = s;
          return this;
        },
        json(b) {
          body = b;
        },
      }),
    }),
  });
  assert.equal(status, 500);
  assert.equal(body.message, "Internal server error");
  assert.equal(body.stack, undefined);
});

test("login rate limit still blocks repeated attempts", async () => {
  // Four login attempts were made by the preceding password tests.
  await api
    .post("/auth/login")
    .send({ email: student.email, password })
    .expect(200);
  await api
    .post("/auth/login")
    .send({ email: student.email, password })
    .expect(429);
});
