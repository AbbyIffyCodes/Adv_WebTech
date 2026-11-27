const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
if (
  process.env.RF_POSTGRES_TEST !== "1" ||
  !/^researchflow_test_[a-z0-9_]+$/.test(process.env.DB_DATABASE || "") ||
  !["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST)
)
  throw new Error("Disposable local test database required");
process.env.JWT_BEARER_SECRET = crypto.randomBytes(32).toString("hex");
process.env.ENABLE_QUEUE = "false";
process.env.UPLOAD_MAX_FILE_MB = "1";
process.env.UPLOAD_MAX_FILES = "5";
require("reflect-metadata");
const { DataSource } = require("typeorm"),
  { NestFactory } = require("@nestjs/core"),
  { JwtService } = require("@nestjs/jwt"),
  { ValidationPipe } = require("@nestjs/common"),
  argon2 = require("argon2"),
  request = require("supertest");
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
  project,
  pair,
  first,
  second,
  grant,
  uploadRoot;
const auth = (u) => "Bearer " + u.token,
  get = (p, u) => api.get(p).set("Authorization", auth(u)),
  post = (p, u, b = {}) => api.post(p).set("Authorization", auth(u)).send(b),
  patch = (p, u, b) => api.patch(p).set("Authorization", auth(u)).send(b),
  del = (p, u) => api.delete(p).set("Authorization", auth(u));
const csv = Buffer.from("topic,score\nBangla NLP,95\n");
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
);
const upload = (u = leader, note = "Proposal submission") =>
  api
    .post(`/projects/${project.id}/submissions`)
    .set("Authorization", auth(u))
    .field("revisionNote", note);
before(async () => {
  uploadRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "researchflow-files-test-"),
  );
  process.env.PRIVATE_UPLOAD_DIR = uploadRoot;
  const { dataSourceOptions } = require("../src/config/database.config"),
    { AppModule } = require("../src/app.module"),
    { User } = require("../src/modules/accounts/entities/user.entity"),
    { Profile } = require("../src/modules/profiles/entities/profile.entity");
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
  const passwordHash = await argon2.hash("FilesTest@12345");
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
        .save({ userId: saved.id, capacity: role === "supervisor" ? 4 : null });
      return saved;
    });
    return {
      ...u,
      token: await jwt.signAsync({ sub: u.id, version: u.tokenVersion }),
    };
  }
  leader = await actor("Jannatul Ferdoush Mayesha");
  member = await actor("Amrin Shahwar");
  outsider = await actor("Md. Tahmid Abtahee");
  supervisor = await actor("Proposal Supervisor", "supervisor");
  coordinator = await actor("Proposal Coordinator", "coordinator");
  group = (
    await post("/groups", leader, {
      name: "Mayesha and Amrin Research",
    }).expect(201)
  ).body;
  const invite = (
    await post(`/groups/${group.id}/invitations`, leader, {
      inviteeId: member.id,
    }).expect(201)
  ).body;
  await post(`/groups/invitations/${invite.id}/accept`, member).expect(200);
  project = (
    await post("/projects", leader, {
      groupId: group.id,
      title: "Bangla document research",
      sharedSummary: "A deliberately limited summary.",
      areaTags: ["NLP"],
    }).expect(201)
  ).body;
  await patch(`/projects/${project.id}/summary-visibility`, leader, {
    published: true,
  }).expect(200);
});
after(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
  if (
    uploadRoot &&
    path.dirname(uploadRoot) === os.tmpdir() &&
    path.basename(uploadRoot).startsWith("researchflow-files-test-")
  )
    await fs.rm(uploadRoot, { recursive: true, force: true });
});
test("proposal uploads require confirmation and leader permission before files are stored", async () => {
  await upload().attach("files", csv, "proposal.csv").expect(409);
  assert.equal((await fs.readdir(uploadRoot)).length, 0);
  const r = (
    await post("/selection/invitations", supervisor, {
      projectId: project.id,
      statement: "I can supervise this topic.",
    }).expect(201)
  ).body;
  pair = (
    await post(`/selection/requests/${r.id}/confirm`, leader, {
      shareFullProposal: true,
    }).expect(200)
  ).body.supervision;
  for (const u of [member, outsider, coordinator, supervisor])
    await upload(u).attach("files", csv, "proposal.csv").expect(403);
  await api
    .post(`/projects/${project.id}/submissions`)
    .attach("files", csv, "proposal.csv")
    .expect(401);
});
test("uploads reject missing/empty files, invalid notes, unknown fields and invalid UUIDs", async () => {
  await upload().expect(400);
  await upload(leader, " ").attach("files", csv, "data.csv").expect(400);
  await upload()
    .field("status", "approved")
    .attach("files", csv, "data.csv")
    .expect(400);
  await upload().attach("files", Buffer.alloc(0), "empty.csv").expect(400);
  await api
    .post("/projects/not-a-uuid/submissions")
    .set("Authorization", auth(leader))
    .attach("files", csv, "data.csv")
    .expect(400);
  assert.equal((await fs.readdir(uploadRoot)).length, 0);
});
test("file content validation rejects executable/renamed PDF, binary CSV, malformed images and fake Office archives", async () => {
  for (const [name, buffer] of [
    ["bad.exe", Buffer.from("MZ")],
    ["fake.pdf", Buffer.from("MZ executable")],
    ["binary.csv", Buffer.from([0, 1, 2])],
    ["fake.png", Buffer.from("not an image")],
    ["fake.jpg", Buffer.from("no JPEG")],
    ["fake.docx", Buffer.from("PK fake office")],
    ["fake.pptx", Buffer.from("PK fake office")],
    ["fake.xlsx", Buffer.from("PK fake office")],
  ])
    await upload().attach("files", buffer, name).expect(400);
  assert.equal((await fs.readdir(uploadRoot)).length, 0);
});
test("multipart size/count limits reject oversized or excessive attachments", async () => {
  await upload()
    .attach("files", Buffer.alloc(1024 * 1024 + 1, 65), "large.csv")
    .expect(413);
  let many = upload();
  for (let i = 0; i < 6; i++)
    many = many.attach("files", csv, "data" + i + ".csv");
  const result = await many;
  assert.ok([400, 413].includes(result.status));
  assert.equal((await fs.readdir(uploadRoot)).length, 0);
});
test("a versioned submission saves several files under generated names without leaking storage paths", async () => {
  first = (
    await upload()
      .attach("files", pdf, "proposal.pdf")
      .attach("files", csv, "evidence.csv")
      .expect(201)
  ).body;
  assert.equal(first.versionNo, 1);
  assert.equal(first.status, "submitted");
  assert.equal(first.files.length, 2);
  assert.equal(first.reviews.length, 0);
  assert.ok(first.files.every((f) => !("storageKey" in f)));
  const disk = await fs.readdir(uploadRoot);
  assert.equal(disk.length, 2);
  assert.ok(disk.every((f) => /^[0-9a-f-]{36}\./.test(f)));
  assert.equal(
    first.files.find((f) => f.originalName === "proposal.pdf").sha256,
    crypto.createHash("sha256").update(pdf).digest("hex"),
  );
});
test("members and granted supervisors can list versions; public viewers and ungranted coordinators cannot", async () => {
  for (const u of [leader, member, supervisor]) {
    const list = (
      await get(`/projects/${project.id}/submissions`, u).expect(200)
    ).body;
    assert.equal(list.total, 1);
    assert.equal(list.proposalStatus, "submitted");
    await get("/submissions/" + first.id, u).expect(200);
  }
  for (const u of [outsider, coordinator]) {
    await get(`/projects/${project.id}/submissions`, u).expect(403);
    await get("/submissions/" + first.id, u).expect(403);
  }
});
test("downloads enforce grants and return original bytes with private cache and safe disposition headers", async () => {
  const file = first.files.find((f) => f.originalName === "proposal.pdf");
  for (const u of [leader, member, supervisor]) {
    const response = await get(`/files/${file.id}/download`, u).expect(200);
    assert.equal(Buffer.compare(response.body, pdf), 0);
    assert.match(response.headers["content-disposition"], /^attachment/);
    assert.match(response.headers["cache-control"], /no-store/);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  }
  await get(`/files/${file.id}/download`, outsider).expect(403);
  await get(`/files/${file.id}/download`, coordinator).expect(403);
  await api.get(`/files/${file.id}/download`).expect(401);
});
test("PDF previews are protected and text/spreadsheet formats require downloads", async () => {
  const file = first.files.find((f) => f.originalName === "proposal.pdf"),
    data = first.files.find((f) => f.originalName === "evidence.csv");
  const res = await get(`/files/${file.id}/preview`, supervisor).expect(200);
  assert.match(res.headers["content-disposition"], /^inline/);
  assert.match(res.headers["content-security-policy"], /sandbox/);
  await get(`/files/${data.id}/preview`, supervisor).expect(400);
  await get(`/files/${file.id}/preview`, outsider).expect(403);
  await get("/uploads/private/proposal.pdf", leader).expect(404);
});
test("a pending proposal prevents another version and creates no extra disk files", async () => {
  await upload().attach("files", csv, "second.csv").expect(409);
  assert.equal((await fs.readdir(uploadRoot)).length, 2);
});
test("only the confirmed supervisor with a current grant can start or decide a review", async () => {
  for (const u of [leader, member, outsider, coordinator])
    await post(`/submissions/${first.id}/start-review`, u).expect(403);
  const grants = (
    await get(`/projects/${project.id}/access-grants`, leader).expect(200)
  ).body;
  grant = grants.items.find(
    (g) => g.granteeId === supervisor.id && !g.revokedAt,
  );
  await del(`/projects/${project.id}/access-grants/${grant.id}`, leader).expect(
    200,
  );
  await post(`/submissions/${first.id}/start-review`, supervisor).expect(403);
  await post(`/projects/${project.id}/access-grants`, leader, {
    granteeId: supervisor.id,
  }).expect(201);
  const res = await post(
    `/submissions/${first.id}/start-review`,
    supervisor,
  ).expect(200);
  assert.equal(res.body.status, "under_review");
  await post(`/submissions/${first.id}/start-review`, supervisor).expect(409);
});
test("review DTOs reject invalid decisions or empty comments and reviews attach to the correct version", async () => {
  await post(`/submissions/${first.id}/reviews`, supervisor, {
    decision: "confirmed",
    comments: "Invalid",
  }).expect(400);
  await post(`/submissions/${first.id}/reviews`, supervisor, {
    decision: "approved",
    comments: "",
  }).expect(400);
  const res = await api
    .post(`/submissions/${first.id}/reviews`)
    .set("Authorization", auth(supervisor))
    .field("decision", "revision_required")
    .field("comments", "Please expand the methodology and dataset section.")
    .attach("files", csv, "supervisor-feedback.csv")
    .expect(201);
  assert.equal(res.body.status, "revision_required");
  assert.equal(res.body.reviews[0].files.length, 1);
  assert.equal(res.body.reviews[0].reviewerId, supervisor.id);
  await post(`/submissions/${first.id}/reviews`, supervisor, {
    decision: "approved",
    comments: "Second final decision",
  }).expect(409);
});
test("revisions retain earlier attachments and feedback, and old versions cannot receive new reviews", async () => {
  second = (
    await upload(leader, "Expanded methodology and dataset.")
      .attach("files", csv, "revision-v2.csv")
      .expect(201)
  ).body;
  assert.equal(second.versionNo, 2);
  assert.equal(second.reviews.length, 0);
  const old = (await get("/submissions/" + first.id, member).expect(200)).body;
  assert.equal(old.status, "revision_required");
  assert.equal(old.files.length, 2);
  assert.equal(old.reviews[0].files.length, 1);
  await post(`/submissions/${first.id}/start-review`, supervisor).expect(409);
  await get(`/files/${old.reviews[0].files[0].id}/download`, member).expect(
    200,
  );
});
test("supervisor approval applies only to the reviewed version and activity records the decision", async () => {
  const res = await post(`/submissions/${second.id}/reviews`, supervisor, {
    decision: "approved",
    comments: "The revised proposal is approved.",
  }).expect(201);
  assert.equal(res.body.status, "approved");
  assert.equal(res.body.versionNo, 2);
  assert.equal(
    (await get("/submissions/" + first.id, leader).expect(200)).body.status,
    "revision_required",
  );
  const history = (
    await get(`/projects/${project.id}/activity`, leader).expect(200)
  ).body;
  assert.ok(history.items.some((e) => e.action === "proposal.approved"));
  assert.equal(
    (await get(`/projects/${project.id}/submissions`, leader).expect(200)).body
      .proposalStatus,
    "approved",
  );
});
test("normal transaction failure removes only newly written files and rolls database rows back", async () => {
  const {
    SubmissionsService,
  } = require("../src/modules/submissions/submissions.service");
  const service = app.get(SubmissionsService),
    original = service.audit,
    before = await fs.readdir(uploadRoot);
  service.audit = async () => {
    throw new Error("Simulated audit failure");
  };
  try {
    await upload().attach("files", csv, "rollback.csv").expect(500);
  } finally {
    service.audit = original;
  }
  assert.deepEqual((await fs.readdir(uploadRoot)).sort(), before.sort());
  assert.equal(
    (await get(`/projects/${project.id}/submissions`, leader).expect(200)).body
      .total,
    2,
  );
});
test("named coordinator consent enables reading only, revocation removes downloads immediately", async () => {
  const g = (
    await post(`/projects/${project.id}/access-grants`, leader, {
      granteeId: coordinator.id,
    }).expect(201)
  ).body;
  await get("/submissions/" + second.id, coordinator).expect(200);
  await get(`/files/${second.files[0].id}/download`, coordinator).expect(200);
  await upload(coordinator).attach("files", csv, "coordinator.csv").expect(403);
  await post(`/submissions/${second.id}/reviews`, coordinator, {
    decision: "approved",
    comments: "Override",
  }).expect(403);
  await del(`/projects/${project.id}/access-grants/${g.id}`, leader).expect(
    200,
  );
  await get(`/files/${second.files[0].id}/download`, coordinator).expect(403);
});
test("milestone planning is supervisor-only, uses current group owners and reports no-plan progress honestly", async () => {
  const empty = (
    await get(`/projects/${project.id}/milestones`, leader).expect(200)
  ).body;
  assert.equal(empty.progress.percentage, null);
  assert.equal(empty.progress.state, "not_yet_planned");
  const task = {
    title: "Prepare dataset",
    description: "Collect and label the research samples.",
    ownerId: member.id,
    dueDate: new Date(Date.now() + 86400000).toISOString(),
  };
  for (const u of [leader, member, outsider, coordinator])
    await post(`/projects/${project.id}/milestones`, u, task).expect(403);
  await post(`/projects/${project.id}/milestones`, supervisor, {
    ...task,
    ownerId: outsider.id,
  }).expect(409);
  await post(`/projects/${project.id}/milestones`, supervisor, {
    ...task,
    dueDate: "2020-01-01T00:00:00Z",
  }).expect(400);
  await post(`/projects/${project.id}/milestones`, supervisor, {
    ...task,
    status: "completed",
  }).expect(400);
  await post(`/projects/${project.id}/milestones`, supervisor, task).expect(
    201,
  );
  await post(`/projects/${project.id}/milestones`, supervisor, {
    ...task,
    title: "Evaluate the baseline model",
    ownerId: leader.id,
  }).expect(201);
});
test("only the assigned owner can start work and overdue work is separate from submitted evidence", async () => {
  const task = (
    await get(`/projects/${project.id}/milestones`, leader).expect(200)
  ).body.items.find((t) => t.ownerId === member.id);
  await post(`/milestones/${task.id}/start`, leader).expect(403);
  await post(`/milestones/${task.id}/start`, member).expect(200);
  await source.query(
    "UPDATE milestones SET due_date=CURRENT_TIMESTAMP-interval '1 day' WHERE id=$1",
    [task.id],
  );
  let list = (
    await get(`/projects/${project.id}/milestones`, leader).expect(200)
  ).body;
  assert.equal(list.progress.overdue, 1);
  assert.equal(list.progress.percentage, 0);
  const evidence = await upload(
    leader,
    "Dataset evidence for supervisor review.",
  )
    .field("milestoneId", task.id)
    .attach("files", csv, "dataset.csv")
    .expect(201);
  assert.equal(evidence.body.kind, "milestone");
  assert.equal(evidence.body.versionNo, 1);
  list = (await get(`/projects/${project.id}/milestones`, leader).expect(200))
    .body;
  assert.equal(list.progress.awaitingReview, 1);
  assert.equal(list.progress.overdue, 0);
  assert.equal(list.progress.percentage, 0);
  await patch(`/milestones/${task.id}`, supervisor, {
    title: "Rewrite pending task",
  }).expect(409);
});
test("milestone evidence revisions are versioned separately and only supervisor approval increases progress", async () => {
  const task = (
    await get(`/projects/${project.id}/milestones`, leader).expect(200)
  ).body.items.find((t) => t.ownerId === member.id);
  let history = (
    await get(`/milestones/${task.id}/submissions`, member).expect(200)
  ).body;
  await post(`/submissions/${history.items[0].id}/reviews`, supervisor, {
    decision: "revision_required",
    comments: "Correct two labels before approval.",
  }).expect(201);
  assert.equal(
    (await get(`/projects/${project.id}/milestones`, leader).expect(200)).body
      .progress.percentage,
    0,
  );
  const revised = (
    await upload(leader, "Corrected dataset labels.")
      .field("milestoneId", task.id)
      .attach("files", csv, "dataset-v2.csv")
      .expect(201)
  ).body;
  assert.equal(revised.versionNo, 2);
  await post(`/submissions/${revised.id}/reviews`, supervisor, {
    decision: "approved",
    comments: "Dataset accepted.",
  }).expect(201);
  const progress = (
    await get(`/projects/${project.id}/milestones`, leader).expect(200)
  ).body.progress;
  assert.equal(progress.completed, 1);
  assert.equal(progress.total, 2);
  assert.equal(progress.percentage, 50);
  await patch(`/milestones/${task.id}`, supervisor, {
    ownerId: leader.id,
  }).expect(409);
  await upload()
    .field("milestoneId", task.id)
    .attach("files", csv, "overwritten.csv")
    .expect(409);
  history = (
    await get(`/milestones/${task.id}/submissions`, member).expect(200)
  ).body;
  assert.equal(history.total, 2);
  assert.equal(
    (await get(`/projects/${project.id}/submissions`, member).expect(200)).body
      .total,
    2,
  );
});
test("milestone evidence rejects nonexistent milestones and enforces project binding in PostgreSQL", async () => {
  await upload()
    .field("milestoneId", crypto.randomUUID())
    .attach("files", csv, "wrong.csv")
    .expect(400);
  const task = (
    await get(`/projects/${project.id}/milestones`, leader).expect(200)
  ).body.items[0];
  await assert.rejects(
    source.query(
      "INSERT INTO submissions(project_id,kind,milestone_id,version_no,submitted_by,revision_note) VALUES($1,'proposal',$2,90,$3,'Invalid kind and milestone')",
      [project.id, task.id, leader.id],
    ),
    (e) => e.code === "23514",
  );
  await get(`/milestones/${task.id}/submissions`, outsider).expect(403);
});
let supportCase, directionSuggestion, supervisorSuggestion;
test("support cases restrict creation and reading to the group and coordinators", async () => {
  const body = {
    projectId: project.id,
    reason: "concern",
    description:
      "Please suggest an alternative direction for our follow-up research.",
  };
  for (const u of [outsider, supervisor])
    await post("/support/cases", u, body).expect(403);
  await post("/support/cases", leader, { ...body, description: "" }).expect(
    400,
  );
  await post("/support/cases", leader, { ...body, status: "resolved" }).expect(
    400,
  );
  supportCase = (await post("/support/cases", member, body).expect(201)).body;
  assert.equal(supportCase.status, "open");
  for (const u of [leader, member, coordinator])
    await get("/support/cases/" + supportCase.id, u).expect(200);
  for (const u of [outsider, supervisor])
    await get("/support/cases/" + supportCase.id, u).expect(403);
  assert.equal(
    (await get("/support/cases?projectId=" + project.id, outsider).expect(200))
      .body.total,
    0,
  );
});
test("support linkage validates request ownership and actual declined or unanswered state", async () => {
  const body = {
    projectId: project.id,
    reason: "declined",
    description: "Need another supervisor.",
    requestId: crypto.randomUUID(),
  };
  await post("/support/cases", leader, body).expect(400);
  const confirmed = (
    await source.query("SELECT request_id FROM supervisions WHERE id=$1", [
      pair.id,
    ])
  )[0];
  await post("/support/cases", leader, {
    ...body,
    requestId: confirmed.request_id,
  }).expect(409);
  await post("/support/cases", leader, {
    ...body,
    reason: "unanswered",
    requestId: confirmed.request_id,
  }).expect(409);
});
test("only coordinators suggest one alternative at a time without receiving document access", async () => {
  const body = {
    researchDirection:
      "Evaluate Bangla information retrieval instead of only classification.",
    explanation: "The team already has relevant NLP and dataset experience.",
  };
  await post(
    `/support/cases/${supportCase.id}/suggestions`,
    leader,
    body,
  ).expect(403);
  await post(`/support/cases/${supportCase.id}/suggestions`, coordinator, {
    explanation: "No target",
  }).expect(400);
  await post(`/support/cases/${supportCase.id}/suggestions`, coordinator, {
    ...body,
    supervisorId: supervisor.id,
  }).expect(400);
  directionSuggestion = (
    await post(
      `/support/cases/${supportCase.id}/suggestions`,
      coordinator,
      body,
    ).expect(201)
  ).body;
  assert.equal(directionSuggestion.response, "pending");
  assert.equal(
    (
      await get(`/projects/${project.id}/document-access`, coordinator).expect(
        200,
      )
    ).body.allowed,
    false,
  );
  const detail = (
    await get("/support/cases/" + supportCase.id, coordinator).expect(200)
  ).body;
  assert.ok(detail.projectSummary.sharedSummary);
  assert.equal("files" in detail, false);
  assert.equal("submissions" in detail, false);
});
test("only the leader accepts suggestions and acceptance changes neither pairing nor proposal", async () => {
  const body = {
    response: "accepted",
    reason: "We will consider this direction in a future proposal revision.",
  };
  for (const u of [member, outsider, coordinator])
    await post(
      `/support/suggestions/${directionSuggestion.id}/respond`,
      u,
      body,
    ).expect(403);
  const before = (await get("/projects/" + project.id, leader).expect(200))
    .body;
  const res = await post(
    `/support/suggestions/${directionSuggestion.id}/respond`,
    leader,
    body,
  ).expect(200);
  assert.equal(res.body.suggestion.response, "accepted");
  await post(
    `/support/suggestions/${directionSuggestion.id}/respond`,
    leader,
    body,
  ).expect(409);
  const after = (await get("/projects/" + project.id, leader).expect(200)).body;
  assert.equal(after.sharedSummary, before.sharedSummary);
  assert.equal(after.status, "under_supervision");
  assert.equal(
    (
      await source.query(
        "SELECT id FROM supervisions WHERE project_id=$1 AND ended_at IS NULL",
        [project.id],
      )
    )[0].id,
    pair.id,
  );
});
test("supervisor alternatives check active capacity and leaders may decline with a reason", async () => {
  await post(`/support/cases/${supportCase.id}/suggestions`, coordinator, {
    supervisorId: outsider.id,
    explanation: "Invalid student target",
  }).expect(404);
  await patch("/profiles/" + supervisor.id, supervisor, { capacity: 2 }).expect(
    200,
  );
  await post(`/support/cases/${supportCase.id}/suggestions`, coordinator, {
    supervisorId: supervisor.id,
    explanation: "Already at capacity",
  }).expect(409);
  await patch("/profiles/" + supervisor.id, supervisor, { capacity: 4 }).expect(
    200,
  );
  supervisorSuggestion = (
    await post(`/support/cases/${supportCase.id}/suggestions`, coordinator, {
      supervisorId: supervisor.id,
      explanation:
        "This supervisor has relevant research interests and enough student places.",
    }).expect(201)
  ).body;
  await patch(`/support/cases/${supportCase.id}/status`, coordinator, {
    status: "resolved",
    note: "Attempt before response",
  }).expect(409);
  await post(
    `/support/suggestions/${supervisorSuggestion.id}/respond`,
    leader,
    {
      response: "declined",
      reason: "We are already working with this supervisor.",
    },
  ).expect(200);
});
test("case resolution and reopening preserve suggestions and activity history", async () => {
  await patch(`/support/cases/${supportCase.id}/status`, leader, {
    status: "resolved",
    note: "Unauthorized",
  }).expect(403);
  await patch(`/support/cases/${supportCase.id}/status`, coordinator, {
    status: "resolved",
    note: "",
  }).expect(400);
  await patch(`/support/cases/${supportCase.id}/status`, coordinator, {
    status: "resolved",
    note: "Discussed the alternatives and recorded the team decision.",
  }).expect(200);
  await post(`/support/cases/${supportCase.id}/suggestions`, coordinator, {
    researchDirection: "Another direction",
    explanation: "Case is closed.",
  }).expect(409);
  await post(`/support/cases/${supportCase.id}/reopen`, member, {
    reason: "Not the leader",
  }).expect(403);
  await post(`/support/cases/${supportCase.id}/reopen`, leader, {
    reason: "We need a follow-up discussion.",
  }).expect(200);
  const c = (await get("/support/cases/" + supportCase.id, leader).expect(200))
    .body;
  assert.equal(c.status, "open");
  assert.equal(c.suggestions.length, 2);
  assert.equal(c.resolvedAt, null);
  assert.ok(
    (
      await get(`/projects/${project.id}/activity`, leader).expect(200)
    ).body.items.some((e) => e.action === "support.reopened"),
  );
});
test("coordinator needs-attention queue exposes administrative cases with bounded pagination", async () => {
  await get("/support/needs-attention", leader).expect(403);
  const list = (
    await get("/support/needs-attention?limit=1", coordinator).expect(200)
  ).body;
  assert.ok(list.total >= 1);
  assert.equal(list.items.length, 1);
  assert.equal("description" in list.items[0], false);
  assert.equal("files" in list.items[0], false);
  await get("/support/needs-attention?limit=101", coordinator).expect(400);
  assert.equal(
    (
      await get(
        "/support/cases?status=open&projectId=" + project.id,
        coordinator,
      ).expect(200)
    ).body.total,
    1,
  );
});
let inboxNotice;
test("dashboards scope projects to role and show approved progress without private files or comments", async () => {
  for (const u of [leader, member, supervisor]) {
    const d = (await get("/dashboard", u).expect(200)).body;
    assert.equal(d.role, u.role);
    assert.equal(
      d.projects.items.find((p) => p.id === project.id).progress,
      50,
    );
    assert.equal(
      d.projects.items.some((p) => "files" in p || "comments" in p),
      false,
    );
  }
  const out = (await get("/dashboard", outsider).expect(200)).body;
  assert.equal(out.projects.total, 0);
  const admin = (await get("/dashboard", coordinator).expect(200)).body;
  assert.ok(admin.counts.activePairings >= 1);
  assert.equal("pendingReviews" in admin.counts, false);
  assert.equal("submissions" in admin, false);
  await api.get("/dashboard").expect(401);
});
test("dashboard project pagination is bounded and supports all three roles", async () => {
  for (const u of [leader, supervisor, coordinator]) {
    const r = (await get("/dashboard/projects?limit=1", u).expect(200)).body;
    assert.equal(r.items.length, 1);
    assert.ok(r.total >= 1);
  }
  await get("/dashboard/projects?limit=101", leader).expect(400);
  await get("/dashboard/projects?userId=" + outsider.id, leader).expect(400);
});
test("workflow alerts are private and do not expose support concerns to a supervisor", async () => {
  const own = (await get("/notifications", leader).expect(200)).body;
  assert.ok(own.total > 0);
  inboxNotice = own.items[0];
  assert.ok(
    own.items.every(
      (n) => !("userId" in n) && !("details" in n) && !("dedupeKey" in n),
    ),
  );
  const sup = (await get("/notifications?limit=100", supervisor).expect(200))
    .body;
  assert.equal(
    sup.items.some((n) => n.kind.startsWith("support.")),
    false,
  );
  const empty = (await get("/notifications", outsider).expect(200)).body;
  assert.equal(empty.total, 0);
  await api.get("/notifications").expect(401);
  await get("/notifications?unread=notboolean", leader).expect(400);
});
test("notification read state belongs only to its recipient and read actions are idempotent", async () => {
  await patch(`/notifications/${inboxNotice.id}/read`, outsider, {}).expect(
    404,
  );
  const firstRead = (
    await patch(`/notifications/${inboxNotice.id}/read`, leader, {}).expect(200)
  ).body;
  const again = (
    await patch(`/notifications/${inboxNotice.id}/read`, leader, {}).expect(200)
  ).body;
  assert.equal(again.readAt, firstRead.readAt);
  assert.ok(
    (
      await get("/notifications?unread=false", leader).expect(200)
    ).body.items.some((n) => n.id === inboxNotice.id),
  );
  await patch("/notifications/read-all", leader, {}).expect(200);
  assert.equal(
    (await get("/notifications?unread=true", leader).expect(200)).body.total,
    0,
  );
  assert.ok((await get("/notifications", member).expect(200)).body.unread > 0);
});
test("deadline refresh produces one alert per user and deadline version without duplicate notifications", async () => {
  const task = (
    await get(`/projects/${project.id}/milestones`, leader).expect(200)
  ).body.items.find((t) => t.status !== "completed");
  await source.query(
    "UPDATE milestones SET due_date=CURRENT_TIMESTAMP+interval '2 hours' WHERE id=$1",
    [task.id],
  );
  const before = (await post("/notifications/refresh", leader).expect(200))
    .body;
  assert.ok(before.created >= 1);
  assert.equal(
    (await post("/notifications/refresh", leader).expect(200)).body.created,
    0,
  );
  const deadline = (
    await get("/notifications?limit=100", leader).expect(200)
  ).body.items.filter(
    (n) => n.sourceType === "milestone_deadline" && n.sourceId === task.id,
  );
  assert.equal(deadline.length, 1);
  await source.query(
    "UPDATE milestones SET status='submitted_for_review' WHERE id=$1",
    [task.id],
  );
  assert.equal(
    (await get("/notifications?limit=100", leader).expect(200)).body.items.some(
      (n) => n.sourceType === "milestone_deadline" && n.sourceId === task.id,
    ),
    false,
  );
  await source.query("UPDATE milestones SET status='not_started' WHERE id=$1", [
    task.id,
  ]);
});
test("activity notification deduplication and payload privacy hold when an event is replayed", async () => {
  const [event] = await source.query(
    "SELECT * FROM activity_events WHERE project_id=$1 AND action='proposal.approved' LIMIT 1",
    [project.id],
  );
  const [before] = await source.query(
    "SELECT count(*)::int n FROM notifications WHERE source_id=$1",
    [event.id],
  );
  await source.query("SELECT rf_notify_activity($1,$2,$3,$4,$5::jsonb)", [
    event.id,
    event.project_id,
    event.actor_id,
    event.action,
    JSON.stringify(event.details),
  ]);
  const [after] = await source.query(
    "SELECT count(*)::int n FROM notifications WHERE source_id=$1",
    [event.id],
  );
  assert.equal(after.n, before.n);
  const notices = await source.query(
    "SELECT message FROM notifications WHERE source_id=$1",
    [event.id],
  );
  assert.ok(
    notices.every(
      (n) =>
        !n.message.includes("comments") &&
        !n.message.includes("Dataset accepted"),
    ),
  );
});
test("ending supervision removes the former supervisor download right while the group retains its history", async () => {
  await post(`/selection/supervisions/${pair.id}/end`, leader, {
    reason: "Completed proposal review demonstration.",
  }).expect(200);
  await get(`/files/${first.files[0].id}/download`, supervisor).expect(403);
  await get("/submissions/" + second.id, member).expect(200);
  await upload().attach("files", csv, "without-supervisor.csv").expect(409);
});
test("Office content checks distinguish DOCX/PPTX/XLSX and reject wrong or macro-enabled archives", () => {
  const {
    validateFile,
  } = require("../src/modules/submissions/file-validation");
  function zip(entries) {
    let offset = 0;
    const local = [],
      central = [];
    for (const [name, text] of entries) {
      const n = Buffer.from(name),
        data = Buffer.from(text),
        h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50);
      h.writeUInt32LE(data.length, 18);
      h.writeUInt32LE(data.length, 22);
      h.writeUInt16LE(n.length, 26);
      local.push(h, n, data);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50);
      c.writeUInt32LE(data.length, 20);
      c.writeUInt32LE(data.length, 24);
      c.writeUInt16LE(n.length, 28);
      c.writeUInt32LE(offset, 42);
      central.push(c, n);
      offset += h.length + n.length + data.length;
    }
    const cd = Buffer.concat(central),
      end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, cd, end]);
  }
  for (const [ext, part, type] of [
    ["docx", "word/document.xml", "wordprocessingml.document.main+xml"],
    ["pptx", "ppt/presentation.xml", "presentationml.presentation.main+xml"],
    ["xlsx", "xl/workbook.xml", "spreadsheetml.sheet.main+xml"],
  ]) {
    const buffer = zip([
      ["[Content_Types].xml", `<Types>${type}</Types>`],
      [part, "<document/>"],
    ]);
    assert.equal(
      validateFile({ originalname: "sample." + ext, buffer }).extension,
      ext,
    );
    assert.throws(() =>
      validateFile({
        originalname: "renamed." + (ext === "docx" ? "pptx" : "docx"),
        buffer,
      }),
    );
  }
  const macro = zip([
    [
      "[Content_Types].xml",
      "<Types>wordprocessingml.document.main+xml</Types>",
    ],
    ["word/document.xml", "<document/>"],
    ["word/vbaProject.bin", "macro"],
  ]);
  assert.throws(() =>
    validateFile({ originalname: "macro.docx", buffer: macro }),
  );
});
