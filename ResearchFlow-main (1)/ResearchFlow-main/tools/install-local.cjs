const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const defaultDestination = "E:\\AIUB\\Fall 26-27 (sem 10)\\Adv Webtech\\AWT-Project";
const destinationFlag = args.indexOf("--destination");
if (destinationFlag >= 0 && !args[destinationFlag + 1]) throw new Error("--destination needs a full project folder path");
const requested = destinationFlag >= 0 ? args[destinationFlag + 1] : defaultDestination;
if (!path.isAbsolute(requested)) throw new Error("Destination must be an absolute project folder path");
const destination = path.resolve(requested);
const dryRun = args.includes("--dry-run");
const fold = value => process.platform === "win32" ? value.toLowerCase() : value;
const within = (parent, child) => fold(child).startsWith(fold(parent) + path.sep);
if (destination === path.parse(destination).root || fold(source) === fold(destination) || within(source, destination) || within(destination, source)) {
  throw new Error("Choose a separate project folder, outside this prepared copy");
}
function checkLinks(target) {
  let cursor = path.resolve(target);
  while (true) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error("Refusing symbolic link or junction: " + cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}
const skip = new Set(["node_modules", "dist", ".git", "coverage", "uploads", ".researchflow-backups"]);
const files = [];
function collect(relative) {
  const absolute = path.join(source, relative);
  const info = fs.lstatSync(absolute);
  if (info.isSymbolicLink()) throw new Error("Unexpected source link: " + relative);
  if (info.isDirectory()) {
    for (const entry of fs.readdirSync(absolute).sort()) {
      if (skip.has(entry) || (entry.startsWith(".env") && entry !== ".env.example") || entry.endsWith(".log") || entry.endsWith(".tsbuildinfo")) continue;
      collect(path.join(relative, entry));
    }
  } else if (info.isFile()) files.push(relative);
}
for (const item of ["backend", "postman", "tools", "README.md", ".gitignore"]) collect(item);
checkLinks(destination);
const changed = files.filter(relative => {
  const target = path.resolve(destination, relative);
  if (!within(destination, target)) throw new Error("Target escaped destination");
  checkLinks(target);
  if (!fs.existsSync(target)) return true;
  if (!fs.lstatSync(target).isFile()) throw new Error("Existing target is not a regular file: " + relative);
  return !fs.readFileSync(target).equals(fs.readFileSync(path.join(source, relative)));
});
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(destination, ".researchflow-backups", stamp);
const existing = changed.filter(relative => fs.existsSync(path.join(destination, relative)));
console.log("Destination:", destination);
console.log("Files to add or update:", changed.length);
console.log("Existing files to back up:", existing.length);
console.log("Existing .env, node_modules, .git and other files are preserved.");
if (dryRun) {
  for (const relative of changed) console.log("Would copy:", relative);
  console.log("Dry run completed. No files changed.");
} else {
  // Back up every existing target before writing any project files.
  checkLinks(backup);
  for (const relative of existing) {
    const target = path.join(backup, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(destination, relative), target, fs.constants.COPYFILE_EXCL);
  }
  for (const relative of changed) {
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(source, relative), target);
  }
  console.log("Installed. Next: open backend/README.md and run pnpm.cmd run setup:local.");
  if (existing.length) console.log("Backup:", backup);
}
