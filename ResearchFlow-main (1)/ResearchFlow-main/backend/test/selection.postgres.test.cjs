const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
if (
  process.env.RF_POSTGRES_TEST !== "1" ||
  !/^researchflow_test_[a-z0-9_]+$/.test(process.env.DB_DATABASE || "") ||
  !["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST)
)
  throw new Error("Disposable local test database required");
process.env.JWT_BEARER_SECRET = crypto.randomBytes(32).toString("hex");
process.env.ENABLE_QUEUE = "false";
require("reflect-metadata");
const { DataSource } = require("typeorm"),
  { NestFactory } = require("@nestjs/core"),
  { JwtService } = require("@nestjs/jwt"),
  { ValidationPipe } = require("@nestjs/common"),
  argon2 = require("argon2"),
  request = require("supertest");
const { dataSourceOptions } = require("../src/config/database.config"),
  { AppModule } = require("../src/app.module"),
  { User } = require("../src/modules/accounts/entities/user.entity"),
  { Profile } = require("../src/modules/profiles/entities/profile.entity");
let source,
  app,
  api,
  jwt,
  tahmid,
  mayesha,
  amrin,
  supervisor,
  second,
  coordinator,
  project,
  group,
  opportunity,
  application,
  invitation,
  pair,
  coordGrant;
const auth = (u) => "Bearer " + u.token;
const get = (p, u) => api.get(p).set("Authorization", auth(u)),
  post = (p, u, b = {}) => api.post(p).set("Authorization", auth(u)).send(b),
  patch = (p, u, b) => api.patch(p).set("Authorization", auth(u)).send(b),
  del = (p, u) => api.delete(p).set("Authorization", auth(u));
const start = (u, extra = {}) =>
  post("/selection/applications", u, {
    projectId: project.id,
    supervisorId: supervisor.id,
    opportunityId: opportunity.id,
    statement: "Our group is interested in this research topic.",
    ...extra,
  });
const confirm = (id, u = tahmid) =>
  post(`/selection/requests/${id}/confirm`, u, { shareFullProposal: true });
const access = async (u) =>
  (await get(`/projects/${project.id}/document-access`, u).expect(200)).body
    .allowed;
async function createGroupProject(actor, name) {
  const g = (await post("/groups", actor, { name }).expect(201)).body;
  const p = (
    await post("/projects", actor, {
      groupId: g.id,
      title: name,
      sharedSummary: "A limited proposal summary.",
      areaTags: ["NLP"],
    }).expect(201)
  ).body;
  await patch(`/projects/${p.id}/summary-visibility`, actor, {
    published: true,
  }).expect(200);
  return { g, p };
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
  jwt = app.get(JwtService);
  const passwordHash = await argon2.hash("SelectionTest@12345");
  async function actor(fullName, role = "student") {
    const u = await source.transaction(async (m) => {
      const saved = await m.getRepository(User).save({
        fullName,
        role,
        email: crypto.randomUUID() + "@example.com",
        passwordHash,
      });
      await m
        .getRepository(Profile)
        .save({ userId: saved.id, capacity: role === "supervisor" ? 3 : null });
      return saved;
    });
    return {
      ...u,
      token: await jwt.signAsync({ sub: u.id, version: u.tokenVersion }),
    };
  }
  tahmid = await actor("Md. Tahmid Abtahee");
  mayesha = await actor("Jannatul Ferdoush Mayesha");
  amrin = await actor("Amrin Shahwar");
  supervisor = await actor("Research Supervisor", "supervisor");
  second = await actor("Alternative Supervisor", "supervisor");
  coordinator = await actor("Research Coordinator", "coordinator");
  ({ g: group, p: project } = await createGroupProject(
    tahmid,
    "Tahmid and Mayesha NLP Project",
  ));
  const invited = (
    await post(`/groups/${group.id}/invitations`, tahmid, {
      inviteeId: mayesha.id,
    }).expect(201)
  ).body;
  await post(`/groups/invitations/${invited.id}/accept`, mayesha).expect(200);
  await post(`/profiles/${tahmid.id}/tags`, tahmid, {
    skills: ["Python"],
  }).expect(201);
  opportunity = (
    await post("/opportunities", supervisor, {
      title: "NLP student opportunity",
      description: "Work on Bangla NLP.",
      criteria: "Python skills and interest in research.",
      places: 3,
      deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      areaTags: ["NLP"],
      requiredSkills: ["Python"],
      preferredSkills: [],
    }).expect(201)
  ).body;
  await patch(`/opportunities/${opportunity.id}/status`, supervisor, {
    status: "open",
  }).expect(200);
});
after(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
});
test("only the group leader can apply and supervisors can invite only as themselves", async () => {
  await start(mayesha).expect(403);
  await start(amrin).expect(403);
  await start(coordinator).expect(403);
  await api.post("/selection/applications").send({}).expect(401);
  await post("/selection/invitations", tahmid, {
    projectId: project.id,
    statement: "Invite",
  }).expect(403);
});
test("selection validates fields, published summary, opportunity owner and required group skills", async () => {
  await start(tahmid, { statement: "" }).expect(400);
  await start(tahmid, { reservedPlaces: 1 }).expect(400);
  await start(tahmid, { supervisorId: second.id }).expect(409);
  await patch(`/projects/${project.id}/summary-visibility`, tahmid, {
    published: false,
  }).expect(200);
  await start(tahmid).expect(409);
  await patch(`/projects/${project.id}/summary-visibility`, tahmid, {
    published: true,
  }).expect(200);
  await patch(`/profiles/${tahmid.id}/tags`, tahmid, { skills: [] }).expect(
    200,
  );
  await start(tahmid).expect(409);
  await post(`/profiles/${tahmid.id}/tags`, tahmid, {
    skills: ["Python"],
  }).expect(201);
});
test("an application reserves no capacity or document access and duplicate live requests conflict", async () => {
  application = (await start(tahmid).expect(201)).body;
  assert.equal(application.status, "pending");
  await start(tahmid).expect(409);
  assert.equal(await access(supervisor), false);
  assert.equal(
    (await get("/selection/capacity/" + supervisor.id, tahmid).expect(200)).body
      .reservedPlaces,
    0,
  );
  await confirm(application.id).expect(409);
});
test("only the named supervisor can offer and an offer does not grant access or reserve places", async () => {
  await post(`/selection/requests/${application.id}/offer`, second).expect(403);
  await post(`/selection/requests/${application.id}/offer`, tahmid).expect(403);
  const res = await post(
    `/selection/requests/${application.id}/offer`,
    supervisor,
  ).expect(200);
  assert.equal(res.body.status, "offered");
  assert.equal(await access(supervisor), false);
  assert.equal(
    (await get("/selection/capacity/" + supervisor.id, tahmid).expect(200)).body
      .reservedPlaces,
    0,
  );
});
test("confirmation requires leader ownership and literal document-sharing consent", async () => {
  for (const body of [
    {},
    { shareFullProposal: false },
    { shareFullProposal: "true" },
    { shareFullProposal: true, supervisorId: second.id },
  ])
    await post(
      `/selection/requests/${application.id}/confirm`,
      tahmid,
      body,
    ).expect(400);
  await confirm(application.id, mayesha).expect(403);
});
test("capacity and opportunity places are rechecked at final confirmation", async () => {
  await patch(`/profiles/${supervisor.id}`, supervisor, { capacity: 1 }).expect(
    200,
  );
  await confirm(application.id).expect(409);
  await patch(`/profiles/${supervisor.id}`, supervisor, { capacity: 3 }).expect(
    200,
  );
  await patch(`/opportunities/${opportunity.id}`, supervisor, {
    places: 1,
  }).expect(200);
  await confirm(application.id).expect(409);
  await patch(`/opportunities/${opportunity.id}`, supervisor, {
    places: 3,
  }).expect(200);
  await patch(`/opportunities/${opportunity.id}/status`, supervisor, {
    status: "closed",
  }).expect(200);
  await confirm(application.id).expect(409);
  await patch(`/opportunities/${opportunity.id}/status`, supervisor, {
    status: "open",
  }).expect(200);
});
test("leader confirmation reserves all members, closes competing requests and grants only the named supervisor", async () => {
  invitation = (
    await post("/selection/invitations", second, {
      projectId: project.id,
      statement: "Alternative supervision offer.",
    }).expect(201)
  ).body;
  const res = await confirm(application.id).expect(200);
  pair = res.body.supervision;
  assert.equal(pair.reservedPlaces, 2);
  assert.equal(res.body.accessGrant.granteeId, supervisor.id);
  assert.equal(await access(supervisor), true);
  assert.equal(await access(second), false);
  assert.equal(await access(coordinator), false);
  assert.equal(await access(mayesha), true);
  const list = (
    await get("/selection/requests?projectId=" + project.id, tahmid).expect(200)
  ).body;
  assert.equal(
    list.items.find((r) => r.id === invitation.id).status,
    "withdrawn",
  );
  assert.equal(
    (await get("/selection/capacity/" + supervisor.id, tahmid).expect(200)).body
      .remainingPlaces,
    1,
  );
  assert.equal(
    (await get("/opportunities/" + opportunity.id, tahmid).expect(200)).body
      .reservedPlaces,
    2,
  );
  assert.equal(
    (await get("/projects/" + project.id, tahmid).expect(200)).body.status,
    "under_supervision",
  );
});
test("confirmed groups reject membership, leadership, project resets and conflicting pairings", async () => {
  await post(`/groups/${group.id}/leave`, mayesha).expect(409);
  await patch(`/groups/${group.id}/leader`, tahmid, {
    leaderId: mayesha.id,
  }).expect(409);
  await patch(`/projects/${project.id}/summary-visibility`, tahmid, {
    published: false,
  }).expect(409);
  await patch(`/projects/${project.id}`, tahmid, {
    title: "Changed direction",
  }).expect(409);
  await start(tahmid, { supervisorId: second.id, opportunityId: null }).expect(
    409,
  );
  await confirm(application.id).expect(409);
});
test("capacity cannot be cleared or reduced below actual reservations and active supervisor roles cannot change", async () => {
  await patch(`/profiles/${supervisor.id}`, supervisor, { capacity: 1 }).expect(
    409,
  );
  await patch(`/profiles/${supervisor.id}`, supervisor, {
    capacity: null,
  }).expect(409);
  await patch(`/accounts/${supervisor.id}/role`, coordinator, {
    role: "student",
  }).expect(409);
  await assert.rejects(
    source.query("UPDATE profiles SET capacity=1 WHERE user_id=$1", [
      supervisor.id,
    ]),
    (e) => e.constraint === "CK_profiles_reserved_capacity",
  );
});
test("coordinators need a separate named grant and members cannot grant or inspect access settings", async () => {
  await post(`/projects/${project.id}/access-grants`, mayesha, {
    granteeId: coordinator.id,
  }).expect(403);
  await get(`/projects/${project.id}/access-grants`, coordinator).expect(403);
  await post(`/projects/${project.id}/access-grants`, tahmid, {
    granteeId: second.id,
  }).expect(409);
  await post(`/projects/${project.id}/access-grants`, tahmid, {
    granteeId: amrin.id,
  }).expect(409);
  coordGrant = (
    await post(`/projects/${project.id}/access-grants`, tahmid, {
      granteeId: coordinator.id,
    }).expect(201)
  ).body;
  assert.equal(await access(coordinator), true);
  await post(`/projects/${project.id}/access-grants`, tahmid, {
    granteeId: coordinator.id,
  }).expect(409);
  await del(
    `/projects/${project.id}/access-grants/${coordGrant.id}`,
    tahmid,
  ).expect(200);
  assert.equal(await access(coordinator), false);
});
test("supervisor grants can be revoked and reissued only while that pairing is active", async () => {
  const list = (
    await get(`/projects/${project.id}/access-grants`, tahmid).expect(200)
  ).body;
  const grant = list.items.find(
    (g) => g.granteeId === supervisor.id && !g.revokedAt,
  );
  await del(`/projects/${project.id}/access-grants/${grant.id}`, tahmid).expect(
    200,
  );
  assert.equal(await access(supervisor), false);
  await post(`/projects/${project.id}/access-grants`, tahmid, {
    granteeId: supervisor.id,
  }).expect(201);
  assert.equal(await access(supervisor), true);
});
test("selection lists and activity restrict private request information", async () => {
  await get("/selection/requests?projectId=" + project.id, amrin).expect(403);
  const admin = (
    await get(
      "/selection/requests?projectId=" + project.id,
      coordinator,
    ).expect(200)
  ).body;
  assert.equal("statement" in admin.items[0], false);
  const own = (
    await get("/selection/requests?projectId=" + project.id, second).expect(200)
  ).body;
  assert.ok(own.items.every((r) => r.supervisorId === second.id));
  await get(`/projects/${project.id}/activity`, second).expect(403);
  const activity = (
    await get(`/projects/${project.id}/activity`, tahmid).expect(200)
  ).body;
  assert.ok(activity.items.some((e) => e.action === "supervision.confirmed"));
});
test("only parties can end supervision; ending releases places, unlocks membership and revokes access", async () => {
  await post(`/selection/supervisions/${pair.id}/end`, coordinator, {
    reason: "Admin override",
  }).expect(403);
  await post(`/selection/supervisions/${pair.id}/end`, tahmid, {
    reason: " ",
  }).expect(400);
  await post(`/selection/supervisions/${pair.id}/end`, tahmid, {
    reason: "We agreed to explore another research direction.",
  }).expect(200);
  assert.equal(await access(supervisor), false);
  assert.equal(
    (await get("/selection/capacity/" + supervisor.id, tahmid).expect(200)).body
      .reservedPlaces,
    0,
  );
  assert.equal(
    (await get("/opportunities/" + opportunity.id, tahmid).expect(200)).body
      .reservedPlaces,
    0,
  );
  assert.equal(
    (await get("/groups/" + group.id, tahmid).expect(200)).body
      .membershipLocked,
    false,
  );
  await post(`/selection/supervisions/${pair.id}/end`, tahmid, {
    reason: "Again",
  }).expect(409);
  await post(`/projects/${project.id}/access-grants`, tahmid, {
    granteeId: supervisor.id,
  }).expect(409);
});
test("supervisor-led invitations require fresh consent and support decline and sender withdrawal", async () => {
  let r = (
    await post("/selection/invitations", second, {
      projectId: project.id,
      statement: "Invitation to supervise.",
    }).expect(201)
  ).body;
  await post(`/selection/requests/${r.id}/decline`, second, {
    reason: "Wrong actor",
  }).expect(403);
  await post(`/selection/requests/${r.id}/decline`, tahmid, {
    reason: "Different research interests.",
  }).expect(200);
  await confirm(r.id).expect(409);
  r = (
    await post("/selection/invitations", second, {
      projectId: project.id,
      statement: "Another invitation.",
    }).expect(201)
  ).body;
  await post(`/selection/requests/${r.id}/withdraw`, second, {
    reason: "Availability changed.",
  }).expect(200);
  await confirm(r.id).expect(409);
});
test("expired requests cannot be accepted and can be replaced", async () => {
  const r = (
    await post("/selection/invitations", second, {
      projectId: project.id,
      statement: "Time-limited invitation.",
    }).expect(201)
  ).body;
  await source.query(
    "UPDATE selection_requests SET response_due=CURRENT_TIMESTAMP-interval '1 hour' WHERE id=$1",
    [r.id],
  );
  await confirm(r.id).expect(409);
  assert.equal(
    (
      await get("/selection/requests?projectId=" + project.id, tahmid).expect(
        200,
      )
    ).body.items.find((x) => x.id === r.id).status,
    "expired",
  );
  invitation = (
    await post("/selection/invitations", second, {
      projectId: project.id,
      statement: "Replacement invitation.",
    }).expect(201)
  ).body;
});
test("two simultaneous confirmations for one project produce exactly one active pairing", async () => {
  const competing = (
    await post("/selection/invitations", supervisor, {
      projectId: project.id,
      statement: "Competing invitation.",
    }).expect(201)
  ).body;
  const results = await Promise.all([
    confirm(invitation.id),
    confirm(competing.id),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const winner = results.find((r) => r.status === 200).body.supervision;
  const [row] = await source.query(
    "SELECT count(*)::int n FROM supervisions WHERE project_id=$1 AND ended_at IS NULL",
    [project.id],
  );
  assert.equal(row.n, 1);
  await post(`/selection/supervisions/${winner.id}/end`, tahmid, {
    reason: "Completed concurrency demonstration.",
  }).expect(200);
});
test("different projects cannot concurrently overbook a supervisor student-place limit", async () => {
  const { p } = await createGroupProject(amrin, "Amrin Research Project");
  await patch(`/profiles/${second.id}`, second, { capacity: 2 }).expect(200);
  const a = (
    await post("/selection/invitations", second, {
      projectId: project.id,
      statement: "Invite two students.",
    }).expect(201)
  ).body;
  const b = (
    await post("/selection/invitations", second, {
      projectId: p.id,
      statement: "Invite one student.",
    }).expect(201)
  ).body;
  const results = await Promise.all([
    confirm(a.id, tahmid),
    confirm(b.id, amrin),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.ok(
    (await get("/selection/capacity/" + second.id, tahmid).expect(200)).body
      .reservedPlaces <= 2,
  );
  const winner = results.find((r) => r.status === 200).body.supervision;
  await post(
    `/selection/supervisions/${winner.id}/end`,
    winner.projectId === project.id ? tahmid : amrin,
    { reason: "Release test places." },
  ).expect(200);
});
test("database prevents a second active supervisor even through a direct write", async () => {
  const r = (
    await post("/selection/invitations", supervisor, {
      projectId: project.id,
      statement: "Final fresh invitation.",
    }).expect(201)
  ).body;
  pair = (await confirm(r.id).expect(200)).body.supervision;
  const otherRequest = (
    await source.query(
      "SELECT r.id FROM selection_requests r WHERE project_id=$1 AND id<>$2 AND NOT EXISTS(SELECT 1 FROM supervisions s WHERE s.request_id=r.id) LIMIT 1",
      [project.id, r.id],
    )
  )[0];
  await assert.rejects(
    source.query(
      "INSERT INTO supervisions(project_id,supervisor_id,request_id,reserved_places) VALUES($1,$2,$3,1)",
      [project.id, second.id, otherRequest.id],
    ),
    (e) => e.constraint === "UQ_supervision_active_project",
  );
  await source.query("UPDATE users SET is_active=false WHERE id=$1", [
    supervisor.id,
  ]);
  await get(`/projects/${project.id}/document-access`, supervisor).expect(401);
  await post(`/selection/supervisions/${pair.id}/end`, tahmid, {
    reason: "Supervisor became unavailable.",
  }).expect(200);
  await source.query("UPDATE users SET is_active=true WHERE id=$1", [
    supervisor.id,
  ]);
});
