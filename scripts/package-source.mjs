import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "extension/manifest.json"), "utf8"));
const archive = join(root, "dist", `graphite-to-github-${manifest.version}-source.zip`);

// Include the complete project source explicitly, without local dependencies,
// browser profiles, generated packages, credentials, or Git history.
const files = [
  ".gitignore",
  "README.md",
  "BUILDING.md",
  "CHANGELOG.md",
  "package.json",
  "package-lock.json",
  "extension/manifest.json",
  "extension/rules/redirects.json",
  "extension/icons/redirect.svg",
  "scripts/package-source.mjs",
  "tests/firefox.mjs",
  "tests/redirects.test.mjs",
];

await mkdir(join(root, "dist"), { recursive: true });
await rm(archive, { force: true });
execFileSync("zip", ["-X", "-q", archive, ...files], { cwd: root, stdio: "inherit" });
console.log(`Source archive ready: ${archive}`);
