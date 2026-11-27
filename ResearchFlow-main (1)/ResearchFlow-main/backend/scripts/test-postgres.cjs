const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
if (
  process.env.RF_POSTGRES_TEST !== "1" ||
  !/^researchflow_test_[a-z0-9_]+$/.test(process.env.DB_DATABASE || "") ||
  !["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST)
) {
  console.error(
    "Refusing database tests. Set RF_POSTGRES_TEST=1 and DB_HOST to localhost, and point DB_DATABASE to a disposable researchflow_test_* database. This suite drops its tables.",
  );
  process.exit(1);
}
// Separate processes preserve the migration-suite-then-group-suite order.
for (const file of [
  "test/postgres.test.cjs",
  "test/groups.postgres.test.cjs",
  "test/projects.postgres.test.cjs",
  "test/opportunities.postgres.test.cjs",
  "test/selection.postgres.test.cjs",
  "test/submissions.postgres.test.cjs",
  "test/rubric.postgres.test.cjs",
]) {
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "-r",
      "./scripts/test-network.cjs",
      "--test-concurrency=1",
      "-r",
      "ts-node/register/transpile-only",
      "-r",
      "tsconfig-paths/register",
      file,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        TS_NODE_PROJECT: path.join(root, "tsconfig.json"),
      },
    },
  );
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
