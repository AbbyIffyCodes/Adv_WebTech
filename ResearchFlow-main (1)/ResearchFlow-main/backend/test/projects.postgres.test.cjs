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
let source,
  app,
  api,
  jwt,
  leader,
  member,
  outsider,
  supervisor,
  coordinator,
  group,
  project;
const auth = (u) => "Bearer " + u.token;
const get = (p, u) => api.get(p).set("Authorization", auth(u));
const post = (p, u, b) => api.post(p).set("Authorization", auth(u)).send(b);
const patch = (p, u, b) => api.patch(p).set("Authorization", auth(u)).send(b);
const del = (p, u) => api.delete(p).set("Authorization", auth(u));
const details = {
  title: "Bangla research classification",
  sharedSummary: "Study classification of Bangla research abstracts.",
  areaTags: [" NLP ", "Artificial Intelligence"],
};
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
  const passwordHash = await argon2.hash("ProjectTest@12345");
  async function actor(fullName, role = "student") {
    const user = await source.transaction(async (m) => {
      const u = await m
        .getRepository(User)
        .save({
          fullName,
          email: crypto.randomUUID() + "@example.com",
          passwordHash,
          role,
        });
      await m.getRepository(Profile).save({ userId: u.id });
      return u;
    });
    return {
      ...user,
      token: await jwt.signAsync({ sub: user.id, version: user.tokenVersion }),
    };
  }
  leader = await actor("Md. Tahmid Abtahee");
  member = await actor("Jannatul Ferdoush Mayesha");
  outsider = await actor("Amrin Shahwar");
  supervisor = await actor("Demo Project Supervisor", "supervisor");
  coordinator = await actor("Demo Project Coordinator", "coordinator");
  group = (
    await post("/groups", leader, {
      name: "Tahmid and Mayesha Research Group",
    }).expect(201)
  ).body;
  const invite = (
    await post(`/groups/${group.id}/invitations`, leader, {
      inviteeId: member.id,
    }).expect(201)
  ).body;
  await post(`/groups/invitations/${invite.id}/accept`, member, {}).expect(200);
});
after(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
});
test("only authenticated student leaders can create a project", async () => {
  await api
    .post("/projects")
    .send({ ...details, groupId: group.id })
    .expect(401);
  for (const actor of [member, outsider, supervisor, coordinator])
    await post("/projects", actor, { ...details, groupId: group.id }).expect(
      403,
    );
});
test("project DTOs reject blank fields, invalid tags, private text and forged state", async () => {
  for (const extra of [
    { title: " " },
    { sharedSummary: "" },
    { sharedSummary: "x".repeat(1501) },
    { areaTags: [] },
    { areaTags: [" "] },
    { areaTags: ["NLP", " nlp "] },
    { areaTags: null },
    { groupId: "bad" },
    { status: "confirmed" },
    { fullProposal: "Private text" },
    { publishedAt: new Date().toISOString() },
  ])
    await post("/projects", leader, {
      ...details,
      groupId: group.id,
      ...extra,
    }).expect(400);
});
test("project creation saves a private draft and canonical shared research tags", async () => {
  project = (
    await post("/projects", leader, { ...details, groupId: group.id }).expect(
      201,
    )
  ).body;
  assert.equal(project.status, "draft");
  assert.equal(project.publishedAt, null);
  assert.deepEqual(
    project.areaTags.map((t) => t.name),
    ["artificial intelligence", "nlp"],
  );
  const tag = await source.query(
    "SELECT id FROM research_interests WHERE name=$1",
    ["nlp"],
  );
  assert.equal(project.areaTags[1].id, tag[0].id);
});
test("simultaneous duplicate project creation cannot bypass one active project per group", async () => {
  const results = await Promise.all([
    post("/projects", leader, { ...details, groupId: group.id }),
    post("/projects", leader, { ...details, groupId: group.id }),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [409, 409],
  );
});
test("members can read their draft while outsiders, supervisors and coordinators cannot", async () => {
  for (const actor of [leader, member]) {
    assert.equal(
      (await get("/projects/mine", actor).expect(200)).body.project.id,
      project.id,
    );
    await get("/projects/" + project.id, actor).expect(200);
  }
  assert.equal(
    (await get("/projects/mine", outsider).expect(200)).body.project,
    null,
  );
  for (const actor of [outsider, supervisor, coordinator]) {
    await get("/projects/" + project.id, actor).expect(404);
    assert.equal(
      (await get("/projects", actor).expect(200)).body.items.some(
        (p) => p.id === project.id,
      ),
      false,
    );
  }
});
test("only the current leader can edit and publish; nullable or forged updates fail validation", async () => {
  for (const actor of [member, outsider, supervisor, coordinator]) {
    await patch("/projects/" + project.id, actor, {
      title: "Hijack project",
    }).expect(403);
    await patch(`/projects/${project.id}/summary-visibility`, actor, {
      published: true,
    }).expect(403);
  }
  await patch("/projects/" + project.id, leader, {
    title: "Bangla NLP Research by Tahmid and Mayesha",
  }).expect(200);
  for (const body of [
    { title: null },
    { areaTags: null },
    { groupId: crypto.randomUUID() },
  ])
    await patch("/projects/" + project.id, leader, body).expect(400);
  await patch(`/projects/${project.id}/summary-visibility`, leader, {
    published: "false",
  }).expect(400);
});
test("leader consent publishes only limited fields to authenticated viewers", async () => {
  assert.equal(
    (
      await patch(`/projects/${project.id}/summary-visibility`, leader, {
        published: true,
      }).expect(200)
    ).body.status,
    "seeking_supervisor",
  );
  const view = (await get("/projects/" + project.id, coordinator).expect(200))
    .body;
  assert.deepEqual(
    Object.keys(view).sort(),
    [
      "id",
      "groupId",
      "title",
      "sharedSummary",
      "areaTags",
      "status",
      "publishedAt",
      "archivedAt",
      "createdAt",
      "updatedAt",
    ].sort(),
  );
  await api.get("/projects/" + project.id).expect(401);
});
test("published summaries support normalized filters, pagination and full tag lists", async () => {
  const res = (
    await get(
      "/projects?researchInterest=NLP&page=1&limit=1",
      supervisor,
    ).expect(200)
  ).body;
  assert.equal(res.total, 1);
  assert.equal(res.items[0].areaTags.length, 2);
  assert.equal(
    (await get("/projects?researchInterest=unmatched", supervisor).expect(200))
      .body.total,
    0,
  );
  for (const q of ["limit=101", "page=0", "unknown=x"])
    await get("/projects?" + q, supervisor).expect(400);
});
test("replacing area tags keeps shared tag vocabulary intact", async () => {
  const res = await patch("/projects/" + project.id, leader, {
    areaTags: ["NLP", "Machine Learning"],
  }).expect(200);
  assert.deepEqual(res.body.areaTags.map((t) => t.name).sort(), [
    "machine learning",
    "nlp",
  ]);
  assert.equal(
    (
      await source.query(
        "SELECT count(*)::int n FROM research_interests WHERE name=$1",
        ["artificial intelligence"],
      )
    )[0].n,
    1,
  );
});
test("unpublishing hides the summary and group archive cannot orphan an active project", async () => {
  await patch(`/projects/${project.id}/summary-visibility`, leader, {
    published: false,
  }).expect(200);
  await get("/projects/" + project.id, supervisor).expect(404);
  assert.equal(
    (await get("/projects", coordinator).expect(200)).body.items.some(
      (p) => p.id === project.id,
    ),
    false,
  );
  await get("/projects/" + project.id, member).expect(200);
  await del("/groups/" + group.id, leader).expect(409);
});
test("leadership transfer and member departure immediately change project permissions", async () => {
  await patch(`/groups/${group.id}/leader`, leader, {
    leaderId: member.id,
  }).expect(200);
  await patch("/projects/" + project.id, leader, {
    title: "Former leader edit",
  }).expect(403);
  await patch("/projects/" + project.id, member, {
    title: "Mayesha leads Bangla NLP Research",
  }).expect(200);
  await post(`/groups/${group.id}/leave`, leader, {}).expect(200);
  await get("/projects/" + project.id, leader).expect(404);
});
test("project archive requires leader authority and rejects a supervision-locked group", async () => {
  await del("/projects/" + project.id, outsider).expect(403);
  await source.query(
    "UPDATE research_groups SET membership_locked=true WHERE id=$1",
    [group.id],
  );
  await del("/projects/" + project.id, member).expect(409);
  await source.query(
    "UPDATE research_groups SET membership_locked=false WHERE id=$1",
    [group.id],
  );
  const res = await del("/projects/" + project.id, member).expect(200);
  assert.equal(res.body.status, "archived");
  assert.equal(res.body.publishedAt, null);
  assert.ok(res.body.archivedAt);
  await patch("/projects/" + project.id, member, {
    title: "Archived edit",
  }).expect(404);
});
test("project history is retained and a replacement draft can be created before group archive", async () => {
  assert.equal(
    (await get("/projects/mine", member).expect(200)).body.project,
    null,
  );
  await get("/projects/" + project.id, member).expect(200);
  const next = (
    await post("/projects", member, { ...details, groupId: group.id }).expect(
      201,
    )
  ).body;
  assert.notEqual(next.id, project.id);
  await del("/projects/" + next.id, member).expect(200);
  await del("/groups/" + group.id, member).expect(200);
  await post("/projects", member, { ...details, groupId: group.id }).expect(
    404,
  );
});
test("database checks reject impossible states and duplicate active group projects", async () => {
  await assert.rejects(
    source.query(
      "INSERT INTO projects(group_id,title,shared_summary,status) VALUES($1,$2,$3,$4)",
      [group.id, "SQL state check", "A limited summary", "seeking_supervisor"],
    ),
    (e) => e.code === "23514",
  );
  const g = (
    await post("/groups", outsider, { name: "Amrin Research Group" }).expect(
      201,
    )
  ).body;
  await post("/projects", outsider, { ...details, groupId: g.id }).expect(201);
  await assert.rejects(
    source.query(
      "INSERT INTO projects(group_id,title,shared_summary) VALUES($1,$2,$3)",
      [g.id, "Duplicate project", "Limited summary"],
    ),
    (e) => e.code === "23505",
  );
});
