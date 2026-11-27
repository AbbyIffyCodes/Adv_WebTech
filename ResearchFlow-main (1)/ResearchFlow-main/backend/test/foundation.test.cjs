const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
process.env.JWT_BEARER_SECRET = crypto.randomBytes(32).toString("hex");
process.env.JWT_TTL = "3600";
require("reflect-metadata");
const { Test } = require("@nestjs/testing");
const { APP_GUARD } = require("@nestjs/core");
const { ValidationPipe } = require("@nestjs/common");
const { JwtModule, JwtService } = require("@nestjs/jwt");
const { PassportModule } = require("@nestjs/passport");
const { getRepositoryToken } = require("@nestjs/typeorm");
const request = require("supertest");
const argon2 = require("argon2");
const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const {
  AccountsController,
} = require("../src/modules/accounts/accounts.controller");
const { AccountsService } = require("../src/modules/accounts/accounts.service");
const { AuthController } = require("../src/modules/auth/auth.controller");
const { AuthService } = require("../src/modules/auth/auth.service");
const { JwtStrategy } = require("../src/modules/auth/jwt.strategy");
const {
  ProfilesController,
} = require("../src/modules/profiles/profiles.controller");
const { ProfilesService } = require("../src/modules/profiles/profiles.service");
const { AuthGuard } = require("../src/common/guard/auth.guard");
const { RolesGuard } = require("../src/common/guard/roles.guard");
const { User } = require("../src/modules/accounts/entities/user.entity");
const { Profile } = require("../src/modules/profiles/entities/profile.entity");
const {
  WorkLink,
} = require("../src/modules/profiles/entities/work_link.entity");
const {
  ProfileQueryDto,
} = require("../src/modules/profiles/dto/profile-query.dto");

const users = new Map(),
  profiles = new Map(),
  links = new Map();
let app, api, jwt, student, other, supervisor, coordinator, linkId;
const account = (name, email) => ({
  fullName: name,
  email,
  password: "Strong@123",
});
const userRepo = {
  create: (data) => ({
    id: crypto.randomUUID(),
    role: "student",
    isActive: true,
    tokenVersion: 0,
    ...data,
  }),
  save: async (user) => {
    users.set(user.id, user);
    return user;
  },
  findOneBy: async (where) =>
    [...users.values()].find((user) =>
      Object.entries(where).every(([key, val]) => user[key] === val),
    ) ?? null,
  findOne: async ({ where }) => userRepo.findOneBy(where),
  update: async (where, changes) => {
    const user = await userRepo.findOneBy(where);
    if (!user) return { affected: 0 };
    Object.assign(user, changes);
    return { affected: 1 };
  },
  increment: async ({ id }, field, count) => {
    users.get(id)[field] += count;
  },
  createQueryBuilder: () => {
    let email;
    const builder = {
      addSelect: () => builder,
      where: (_sql, params) => {
        email = params.email;
        return builder;
      },
      getOne: async () =>
        [...users.values()].find(
          (user) => user.email.toLowerCase() === email,
        ) ?? null,
    };
    return builder;
  },
};
const profileRepo = {
  create: (data) => ({
    bio: null,
    availability: null,
    capacity: null,
    seekingSupervisor: false,
    researchInterests: [],
    skills: [],
    workLinks: [],
    ...data,
  }),
  save: async (profile) => {
    profiles.set(profile.userId, profile);
    return profile;
  },
  findOneBy: async ({ userId }) => profiles.get(userId) ?? null,
  findOne: async ({ where }) => {
    const profile = profiles.get(where.userId);
    if (
      !profile ||
      (where.user?.isActive && !users.get(where.userId)?.isActive)
    )
      return null;
    return {
      ...profile,
      user: users.get(where.userId),
      workLinks: [...links.values()].filter(
        (link) => link.profile.userId === where.userId,
      ),
    };
  },
  update: async ({ userId }, changes) => {
    const profile = profiles.get(userId);
    if (!profile) return { affected: 0 };
    Object.assign(profile, changes);
    return { affected: 1 };
  },
};
const linkRepo = {
  create: (data) => ({ id: crypto.randomUUID(), ...data }),
  save: async (link) => {
    links.set(link.id, link);
    return link;
  },
  findOne: async ({ where }) => {
    const link = links.get(where.id);
    return link?.profile.userId === where.profile.userId ? link : null;
  },
  delete: async ({ id }) => {
    links.delete(id);
    return { affected: 1 };
  },
};
const manager = {
  getRepository: (entity) =>
    entity === User
      ? userRepo
      : entity === Profile
        ? profileRepo
        : { existsBy: async () => false },
};
userRepo.manager = { transaction: async (fn) => fn(manager) };
const bearer = (token) => "Bearer " + token;
async function register(name, email, role = "student") {
  const response = await api
    .post("/accounts")
    .send(account(name, email))
    .expect(201);
  const stored = users.get(response.body.user.id);
  stored.role = role;
  const login = await api
    .post("/auth/login")
    .send({ email, password: "Strong@123" })
    .expect(200);
  return { id: stored.id, token: login.body.accessToken, email };
}

before(async () => {
  const module = await Test.createTestingModule({
    imports: [
      PassportModule.register({ defaultStrategy: "jwt" }),
      JwtModule.register({
        secret: process.env.JWT_BEARER_SECRET,
        signOptions: {
          algorithm: "HS256",
          expiresIn: 3600,
          issuer: "researchflow-api",
          audience: "researchflow-client",
        },
      }),
    ],
    controllers: [AccountsController, AuthController, ProfilesController],
    providers: [
      AccountsService,
      AuthService,
      ProfilesService,
      JwtStrategy,
      { provide: getRepositoryToken(User), useValue: userRepo },
      { provide: getRepositoryToken(Profile), useValue: profileRepo },
      { provide: getRepositoryToken(WorkLink), useValue: linkRepo },
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();
  jwt = module.get(JwtService);
  app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  await app.listen(0, "127.0.0.1");
  api = request(app.getHttpServer());
  student = await register("Sample Student", "student@example.com");
  other = await register("Other Student", "other@example.com");
  supervisor = await register(
    "Sample Supervisor",
    "supervisor@example.com",
    "supervisor",
  );
  coordinator = await register(
    "Sample Coordinator",
    "coordinator@example.com",
    "coordinator",
  );
});
after(async () => {
  if (app) await app.close();
});

test("registration hashes passwords and returns no hash", async () => {
  const res = await api
    .post("/accounts")
    .send(account("New Student", "new@example.com"))
    .expect(201);
  assert.equal(res.body.user.role, "student");
  assert.equal("passwordHash" in res.body.user, false);
  assert.equal("password" in res.body.user, false);
  assert.ok(
    await require("bcryptjs").compare(
      "Strong@123",
      users.get(res.body.user.id).passwordHash,
    ),
  );
  assert.ok(profiles.has(res.body.user.id));
});
test("registration rejects self-assigned coordinator role", async () => {
  await api
    .post("/accounts")
    .send({ ...account("Bad Role", "bad@example.com"), role: "coordinator" })
    .expect(400);
});
test("registration rejects names longer than the database column", async () => {
  await api
    .post("/accounts")
    .send(account("A".repeat(121), "long@example.com"))
    .expect(400);
});
test("registration rejects a blank name", async () => {
  await api
    .post("/accounts")
    .send(account("   ", "blank@example.com"))
    .expect(400);
});
test("registration rejects invalid email and weak password", async () => {
  await api
    .post("/accounts")
    .send({ fullName: "Sample", email: "invalid", password: "123" })
    .expect(400);
});
test("email is normalised and duplicates return conflict", async () => {
  await api
    .post("/accounts")
    .send(account("Duplicate", " STUDENT@EXAMPLE.COM "))
    .expect(409);
});
test("login accepts normalised email and returns a verifiable token", async () => {
  const res = await api
    .post("/auth/login")
    .send({ email: " STUDENT@EXAMPLE.COM ", password: "Strong@123" })
    .expect(200);
  assert.equal(jwt.verify(res.body.accessToken).sub, student.id);
  assert.equal("passwordHash" in res.body.user, false);
});
test("wrong password returns 401", async () => {
  await api
    .post("/auth/login")
    .send({ email: student.email, password: "wrong" })
    .expect(401);
});
test("unknown account returns 401", async () => {
  await api
    .post("/auth/login")
    .send({ email: "missing@example.com", password: "wrong" })
    .expect(401);
});
test("profiles require authentication", async () => {
  await api.get("/profiles/" + student.id).expect(401);
});
test("arbitrary bearer text is rejected", async () => {
  await api
    .get("/auth/me")
    .set("Authorization", "Bearer not-a-jwt")
    .expect(401);
});
test("token with an invalid signature is rejected", async () => {
  const token = await jwt.signAsync(
    { sub: student.id, version: 0 },
    { secret: "wrong-secret" },
  );
  await api.get("/auth/me").set("Authorization", bearer(token)).expect(401);
});
test("expired token is rejected", async () => {
  const token = await jwt.signAsync(
    { sub: student.id, version: 0 },
    { expiresIn: -1 },
  );
  await api.get("/auth/me").set("Authorization", bearer(token)).expect(401);
});
test("token with the wrong audience is rejected", async () => {
  const token = await jwt.signAsync(
    { sub: student.id, version: 0 },
    { audience: "other-client" },
  );
  await api.get("/auth/me").set("Authorization", bearer(token)).expect(401);
});
test("signed-in profile response excludes private email and password", async () => {
  const res = await api
    .get("/profiles/" + other.id)
    .set("Authorization", bearer(student.token))
    .expect(200);
  assert.equal(res.body.fullName, "Other Student");
  assert.equal("email" in res.body, false);
  assert.equal("passwordHash" in res.body, false);
  assert.equal("user" in res.body, false);
});
test("owner can update their own bio", async () => {
  const res = await api
    .patch("/profiles/" + student.id)
    .set("Authorization", bearer(student.token))
    .send({ bio: "  Interested in NLP  " })
    .expect(200);
  assert.equal(res.body.bio, "Interested in NLP");
});
test("another user's profile cannot be edited", async () => {
  await api
    .patch("/profiles/" + other.id)
    .set("Authorization", bearer(student.token))
    .send({ bio: "Hacked" })
    .expect(403);
});
test("coordinator cannot edit someone else's profile", async () => {
  await api
    .patch("/profiles/" + student.id)
    .set("Authorization", bearer(coordinator.token))
    .send({ bio: "Changed" })
    .expect(403);
});
test("student cannot set supervisor capacity", async () => {
  await api
    .patch("/profiles/" + student.id)
    .set("Authorization", bearer(student.token))
    .send({ capacity: 3 })
    .expect(403);
});
test("supervisor can set nonnegative capacity", async () => {
  const res = await api
    .patch("/profiles/" + supervisor.id)
    .set("Authorization", bearer(supervisor.token))
    .send({ capacity: 3, availability: "Open for requests" })
    .expect(200);
  assert.equal(res.body.capacity, 3);
});
test("negative capacity is rejected", async () => {
  await api
    .patch("/profiles/" + supervisor.id)
    .set("Authorization", bearer(supervisor.token))
    .send({ capacity: -1 })
    .expect(400);
});
test("null seekingSupervisor is rejected", async () => {
  await api
    .patch("/profiles/" + student.id)
    .set("Authorization", bearer(student.token))
    .send({ seekingSupervisor: null })
    .expect(400);
});
test("supervisor cannot use the student seeking flag", async () => {
  await api
    .patch("/profiles/" + supervisor.id)
    .set("Authorization", bearer(supervisor.token))
    .send({ seekingSupervisor: true })
    .expect(403);
});
test("unexpected profile properties are rejected", async () => {
  await api
    .patch("/profiles/" + student.id)
    .set("Authorization", bearer(student.token))
    .send({ isAdmin: true })
    .expect(400);
});
test("invalid UUID is rejected", async () => {
  await api
    .get("/profiles/not-a-uuid")
    .set("Authorization", bearer(student.token))
    .expect(400);
});
test("work links can be added by their owner", async () => {
  const res = await api
    .post("/profiles/" + student.id + "/work-links")
    .set("Authorization", bearer(student.token))
    .send({ label: "GitHub", url: "https://github.com/example" })
    .expect(201);
  linkId = res.body.id;
  assert.ok(linkId);
  assert.equal("profile" in res.body, false);
});
test("unsafe work-link URL is rejected", async () => {
  await api
    .post("/profiles/" + student.id + "/work-links")
    .set("Authorization", bearer(student.token))
    .send({ label: "Bad", url: "javascript:alert(1)" })
    .expect(400);
});
test("another user's work link cannot be modified", async () => {
  await api
    .patch("/profiles/" + student.id + "/work-links/" + linkId)
    .set("Authorization", bearer(other.token))
    .send({ label: "Changed" })
    .expect(403);
});
test("a link cannot be accessed through a different profile ID", async () => {
  await api
    .patch("/profiles/" + other.id + "/work-links/" + linkId)
    .set("Authorization", bearer(other.token))
    .send({ label: "Changed" })
    .expect(404);
});
test("owner can delete their own work link", async () => {
  await api
    .delete("/profiles/" + student.id + "/work-links/" + linkId)
    .set("Authorization", bearer(student.token))
    .expect(200);
  assert.equal(links.has(linkId), false);
});
test("another user's tags cannot be changed", async () => {
  await api
    .post("/profiles/" + other.id + "/tags")
    .set("Authorization", bearer(student.token))
    .send({ skills: ["python"] })
    .expect(403);
});
test("blank research tags are rejected after trimming", async () => {
  await api
    .post("/profiles/" + student.id + "/tags")
    .set("Authorization", bearer(student.token))
    .send({ skills: ["   "] })
    .expect(400);
});
test("query strings transform false correctly and pagination is bounded", async () => {
  const query = plainToInstance(ProfileQueryDto, {
    seekingSupervisor: "false",
    page: "2",
    limit: "10",
  });
  assert.equal(query.seekingSupervisor, false);
  assert.equal(query.page, 2);
  assert.equal((await validate(query)).length, 0);
  assert.ok(
    (await validate(plainToInstance(ProfileQueryDto, { limit: "101" }))).length,
  );
});
test("student cannot assign roles", async () => {
  await api
    .patch("/accounts/" + other.id + "/role")
    .set("Authorization", bearer(student.token))
    .send({ role: "supervisor" })
    .expect(403);
});
test("coordinator can assign supervisor role and revoke old sessions", async () => {
  await api
    .patch("/accounts/" + other.id + "/role")
    .set("Authorization", bearer(coordinator.token))
    .send({ role: "supervisor" })
    .expect(200);
  assert.equal(users.get(other.id).role, "supervisor");
  await api
    .get("/auth/me")
    .set("Authorization", bearer(other.token))
    .expect(401);
});
test("coordinator cannot accidentally demote their own account", async () => {
  await api
    .patch("/accounts/" + coordinator.id + "/role")
    .set("Authorization", bearer(coordinator.token))
    .send({ role: "student" })
    .expect(403);
});
test("disabled users cannot use existing tokens or log in", async () => {
  users.get(supervisor.id).isActive = false;
  try {
    await api
      .get("/auth/me")
      .set("Authorization", bearer(supervisor.token))
      .expect(401);
    await api
      .post("/auth/login")
      .send({ email: supervisor.email, password: "Strong@123" })
      .expect(401);
  } finally {
    users.get(supervisor.id).isActive = true;
  }
});
test("logout revokes existing tokens", async () => {
  await api
    .post("/auth/logout")
    .set("Authorization", bearer(student.token))
    .expect(200);
  await api
    .get("/auth/me")
    .set("Authorization", bearer(student.token))
    .expect(401);
});

test("legacy login verifies Argon2 and upgrades a correct password to bcrypt", async () => {
  const registered = await api
    .post("/accounts")
    .send(account("Legacy Account", "legacy.extra@example.com"))
    .expect(201);
  const user = users.get(registered.body.user.id);
  user.passwordHash = await argon2.hash("Strong@123");
  const original = user.passwordHash;
  await api
    .post("/auth/login")
    .send({ email: user.email, password: "Wrong@12345" })
    .expect(401);
  assert.equal(user.passwordHash, original);
  await api
    .post("/auth/login")
    .send({ email: user.email, password: "Strong@123" })
    .expect(200);
  assert.match(user.passwordHash, /^\$2[aby]\$12\$/);
});
test("new passwords exceeding 72 bytes are rejected without creating accounts", async () => {
  const count = users.size;
  await api
    .post("/accounts")
    .send({
      ...account("Long Password", "long.extra@example.com"),
      password: "Aa1!" + "x".repeat(69),
    })
    .expect(400);
  assert.equal(users.size, count);
});
