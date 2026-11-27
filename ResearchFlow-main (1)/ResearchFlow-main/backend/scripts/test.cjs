const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const args = ["--test"];
if (process.argv.includes("--watch")) args.push("--watch");
args.push(
  "-r",
  "ts-node/register/transpile-only",
  "-r",
  "tsconfig-paths/register",
  "test/foundation.test.cjs",
);
const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, TS_NODE_PROJECT: path.join(root, "tsconfig.json") },
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
