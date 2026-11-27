const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const target = path.join(root, ".env");
let text = fs.existsSync(target)
  ? fs.readFileSync(target, "utf8")
  : fs.readFileSync(path.join(root, ".env.example"), "utf8");
const match = text.match(/^JWT_BEARER_SECRET=(.*)$/m);
// Parse quotes and inline comments exactly as the application does.
const value = require("dotenv").parse(text).JWT_BEARER_SECRET || "";
if (
  !value ||
  value.length < 32 ||
  /change.?me|replace.?me|example.?secret/i.test(value)
) {
  const line = "JWT_BEARER_SECRET=" + crypto.randomBytes(32).toString("hex");
  text = match
    ? text.replace(/^JWT_BEARER_SECRET=.*$/m, line)
    : text + "\n" + line + "\n";
}
fs.writeFileSync(target, text, { mode: 0o600 });
console.log("Local .env is ready. Existing database settings were preserved.");
console.log(
  "Check DB_DATABASE=researchflow, DB credentials, PORT=5001 and JWT_TTL=3600 before running migrations.",
);
