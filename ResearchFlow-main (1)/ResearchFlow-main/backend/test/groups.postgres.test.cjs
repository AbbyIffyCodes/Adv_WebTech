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
  leaderA,
  leaderB,
  one,
  two,
  outsider,
  coordinator,
  supervisor,
  groupA,
  groupB,
  invitationOne,
  expiredReplacement;
const auth = (user) => "Bearer " + user.token;
const post = (path, user, body) =>
  api.post(path).set("Authorization", auth(user)).send(body);
const patch = (path, user, body) =>
  api.patch(path).set("Authorization", auth(user)).send(body);
const get = (path, user) => api.get(path).set("Authorization", auth(user));
const del = (path, user) => api.delete(path).set("Authorization", auth(user));
const groupPath = (id) => "/groups/" + id;
const invite = (group, actor, member) =>
  post(groupPath(group.id) + "/invitations", actor, { inviteeId: member.id });
const respond = (id, actor, action = "accept") =>
  post("/groups/invitations/" + id + "/" + action, actor, {});
before(async () => {
  source = new DataSource(dataSourceOptions);
  await source.initialize();
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
  const passwordHash = await argon2.hash("GroupTest@12345");
  async function actor(name, role = "student") {
    const user = await source.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const saved = await users.save(
        users.create({
          fullName: name,
          email: crypto.randomUUID() + "@example.com",
          passwordHash,
          role,
        }),
      );
      await manager.getRepository(Profile).save({ userId: saved.id });
      return saved;
    });
    return {
      ...user,
      token: await jwt.signAsync({ sub: user.id, version: user.tokenVersion }),
    };
  }
  leaderA = await actor("Leader Alpha");
  leaderB = await actor("Leader Beta");
  one = await actor("Student One");
  two = await actor("Student Two");
  outsider = await actor("Outside Student");
  coordinator = await actor("Group Coordinator", "coordinator");
  supervisor = await actor("Group Supervisor", "supervisor");
  groupA = (
    await post("/groups", leaderA, { name: "Alpha Research Group" }).expect(201)
  ).body;
  groupB = (
    await post("/groups", leaderB, { name: "Beta Research Group" }).expect(201)
  ).body;
});
after(async () => {
  if (app) await app.close();
  if (source?.isInitialized) await source.destroy();
});
test("group creation automatically registers its student leader as an active member", async () => {
  assert.equal(groupA.leaderId, leaderA.id);
  assert.equal(groupA.memberCount, 1);
  assert.equal(groupA.members[0].userId, leaderA.id);
  const res = await get("/groups/mine", leaderA).expect(200);
  assert.equal(res.body.group.id, groupA.id);
});
test("group views expose public member identity without emails or password hashes", async () => {
  const res = await get(groupPath(groupA.id), supervisor).expect(200);
  assert.equal(res.body.members[0].fullName, "Leader Alpha");
  assert.equal("email" in res.body.members[0], false);
  assert.equal("passwordHash" in res.body.members[0], false);
});
test("students cannot create a second active group", async () => {
  await post("/groups", leaderA, { name: "Another Research Group" }).expect(
    409,
  );
});
test("group mutations require authentication and student role", async () => {
  await api.post("/groups").send({ name: "Anonymous Group" }).expect(401);
  await post("/groups", supervisor, { name: "Supervisor Group" }).expect(403);
  await post("/groups", coordinator, { name: "Coordinator Group" }).expect(403);
});
test("only the leader can edit group details", async () => {
  await patch(groupPath(groupA.id), outsider, {
    name: "Hijacked Group",
  }).expect(403);
  const res = await patch(groupPath(groupA.id), leaderA, {
    name: "  Alpha AI Research  ",
    description: "Research on NLP",
  }).expect(200);
  assert.equal(res.body.name, "Alpha AI Research");
});
test("group DTOs reject empty names, invalid IDs and internal state changes", async () => {
  await post("/groups", outsider, { name: " " }).expect(400);
  await post("/groups", outsider, { name: "A".repeat(121) }).expect(400);
  await patch(groupPath(groupA.id), leaderA, { name: null }).expect(400);
  await patch(groupPath(groupA.id), leaderA, {
    membershipLocked: false,
  }).expect(400);
  await post(groupPath(groupA.id) + "/invitations", leaderA, {
    inviteeId: "invalid",
  }).expect(400);
  await get("/groups/not-a-uuid", leaderA).expect(400);
});
test("only group leaders can send invitations or read the group invitation history", async () => {
  await invite(groupA, outsider, two).expect(403);
  await get(groupPath(groupA.id) + "/invitations", outsider).expect(403);
});
test("leaders cannot invite themselves, supervisors or existing active group members", async () => {
  await invite(groupA, leaderA, leaderA).expect(409);
  await invite(groupA, leaderA, supervisor).expect(409);
  await invite(groupA, leaderA, leaderB).expect(409);
});
test("an invitation does not add a member until accepted and pending duplicates are rejected", async () => {
  invitationOne = (await invite(groupA, leaderA, one).expect(201)).body;
  assert.equal(invitationOne.status, "pending");
  await invite(groupA, leaderA, one).expect(409);
  const res = await get("/groups/mine", one).expect(200);
  assert.equal(res.body.group, null);
});
test("invitation ownership is enforced and private invitation lists are paginated", async () => {
  await respond(invitationOne.id, outsider).expect(404);
  const res = await get("/groups/invitations/me?limit=1", one).expect(200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].id, invitationOne.id);
  await get("/groups/invitations/me?limit=101", one).expect(400);
});
test("invitees can decline an invitation and cannot accept it afterwards", async () => {
  const invitation = (await invite(groupA, leaderA, outsider).expect(201)).body;
  const res = await respond(invitation.id, outsider, "decline").expect(200);
  assert.equal(res.body.status, "declined");
  await respond(invitation.id, outsider).expect(409);
});
test("leaders can cancel pending invitations and cannot cancel invitations belonging to another group", async () => {
  const invitation = (await invite(groupA, leaderA, outsider).expect(201)).body;
  await del(
    groupPath(groupB.id) + "/invitations/" + invitation.id,
    leaderB,
  ).expect(404);
  await del(
    groupPath(groupA.id) + "/invitations/" + invitation.id,
    outsider,
  ).expect(403);
  const res = await del(
    groupPath(groupA.id) + "/invitations/" + invitation.id,
    leaderA,
  ).expect(200);
  assert.equal(res.body.status, "cancelled");
  await respond(invitation.id, outsider).expect(409);
});
test("expired invitations cannot be accepted and leaders can issue a fresh replacement", async () => {
  const invitation = (await invite(groupA, leaderA, outsider).expect(201)).body;
  await source.query(
    "UPDATE group_invitations SET expires_at = CURRENT_TIMESTAMP - interval '1 minute' WHERE id = $1",
    [invitation.id],
  );
  const res = await get("/groups/invitations/me", outsider).expect(200);
  assert.equal(
    res.body.items.find((item) => item.id === invitation.id).status,
    "expired",
  );
  await respond(invitation.id, outsider).expect(409);
  expiredReplacement = (await invite(groupA, leaderA, outsider).expect(201))
    .body;
  assert.notEqual(expiredReplacement.id, invitation.id);
});
test("two simultaneous invitation acceptances cannot place a student in two groups", async () => {
  const second = (await invite(groupB, leaderB, one).expect(201)).body;
  const responses = await Promise.all([
    respond(invitationOne.id, one),
    respond(second.id, one),
  ]);
  assert.deepEqual(responses.map((res) => res.status).sort(), [200, 409]);
  const [row] = await source.query(
    "SELECT count(*)::integer AS count FROM group_members WHERE user_id=$1 AND left_at IS NULL",
    [one.id],
  );
  assert.equal(row.count, 1);
});
test("a leader cannot leave without a valid leadership transfer", async () => {
  await post(groupPath(groupA.id) + "/leave", leaderA, {}).expect(409);
  await patch(groupPath(groupA.id) + "/leader", leaderA, {
    leaderId: outsider.id,
  }).expect(409);
});
test("accepted invitations persist memberships and cannot be accepted twice", async () => {
  const invitation = (await invite(groupA, leaderA, two).expect(201)).body;
  const res = await respond(invitation.id, two).expect(200);
  assert.equal(res.body.status, "accepted");
  await respond(invitation.id, two).expect(409);
  const mine = await get("/groups/mine", two).expect(200);
  assert.equal(mine.body.group.id, groupA.id);
});
test("coordinators cannot change the role of an active group member", async () => {
  await patch("/accounts/" + two.id + "/role", coordinator, {
    role: "supervisor",
  }).expect(409);
  await patch("/accounts/" + leaderA.id + "/role", coordinator, {
    role: "supervisor",
  }).expect(409);
});
test("leadership can be transferred only by the current leader to an active member", async () => {
  await patch(groupPath(groupA.id) + "/leader", outsider, {
    leaderId: two.id,
  }).expect(403);
  const res = await patch(groupPath(groupA.id) + "/leader", leaderA, {
    leaderId: two.id,
  }).expect(200);
  assert.equal(res.body.leaderId, two.id);
  await patch(groupPath(groupA.id), leaderA, {
    description: "Old leader edit",
  }).expect(403);
});
test("locked groups reject membership and leadership changes until capacity/access is rechecked", async () => {
  await source.query(
    "UPDATE research_groups SET membership_locked=true WHERE id=$1",
    [groupA.id],
  );
  try {
    await del(groupPath(groupA.id) + "/members/" + leaderA.id, two).expect(409);
    await post(groupPath(groupA.id) + "/leave", leaderA, {}).expect(409);
    await respond(expiredReplacement.id, outsider).expect(409);
    await patch(groupPath(groupA.id) + "/leader", two, {
      leaderId: leaderA.id,
    }).expect(409);
    await del(groupPath(groupA.id), two).expect(409);
  } finally {
    await source.query(
      "UPDATE research_groups SET membership_locked=false WHERE id=$1",
      [groupA.id],
    );
  }
});
test("a leader can remove another member, but cannot remove themselves", async () => {
  await del(groupPath(groupA.id) + "/members/" + two.id, two).expect(409);
  await del(groupPath(groupA.id) + "/members/" + leaderA.id, two).expect(200);
  const res = await get("/groups/mine", leaderA).expect(200);
  assert.equal(res.body.group, null);
});
test("a former member can accept a new invitation without duplicating the membership row", async () => {
  const invitation = (await invite(groupA, two, leaderA).expect(201)).body;
  await respond(invitation.id, leaderA).expect(200);
  const [row] = await source.query(
    "SELECT count(*)::integer AS count FROM group_members WHERE group_id=$1 AND user_id=$2",
    [groupA.id, leaderA.id],
  );
  assert.equal(row.count, 1);
});
test("nonleaders can leave and their role can then change", async () => {
  await post(groupPath(groupA.id) + "/leave", leaderA, {}).expect(200);
  await patch("/accounts/" + leaderA.id + "/role", coordinator, {
    role: "supervisor",
  }).expect(200);
  await get("/auth/me", leaderA).expect(401);
});
test("archiving preserves group history, releases memberships and cancels pending invitations", async () => {
  await del(groupPath(groupA.id), two).expect(200);
  const group = await get(groupPath(groupA.id), supervisor).expect(200);
  assert.ok(group.body.archivedAt);
  assert.equal(group.body.memberCount, 0);
  const mine = await get("/groups/mine", two).expect(200);
  assert.equal(mine.body.group, null);
  const [row] = await source.query(
    "SELECT status FROM group_invitations WHERE id=$1",
    [expiredReplacement.id],
  );
  assert.equal(row.status, "cancelled");
  await respond(expiredReplacement.id, outsider).expect(404);
  await patch(groupPath(groupA.id), two, { name: "Reopened Group" }).expect(
    404,
  );
});
test("the database requires a group leader to have a membership record", async () => {
  await assert.rejects(
    source.query(
      "INSERT INTO research_groups (name,leader_id) VALUES ('Invalid Leader Group',$1)",
      [outsider.id],
    ),
    (error) => error.code === "23503",
  );
});
test("the database unique index rejects a second active membership even for direct SQL writes", async () => {
  const group = (
    await post("/groups", outsider, { name: "Gamma Research Group" }).expect(
      201,
    )
  ).body;
  assert.ok(group.id);
  await assert.rejects(
    source.query(
      "INSERT INTO group_members (group_id,user_id) VALUES ($1,$2)",
      [groupB.id, outsider.id],
    ),
    (error) => error.code === "23505",
  );
});
