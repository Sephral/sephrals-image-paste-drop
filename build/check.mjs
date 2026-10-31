// Syntax check of every script the module ships and of the build scripts (node --check per file), so a new file is
// never left out. The same file in every module repository.
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }

    if (entry.isFile() && /\.m?js$/.test(entry.name)) files.push(fullPath);
  }

  return files.sort();
}

const files = [...await walk(path.join(rootDir, "scripts")), ...await walk(path.join(rootDir, "build"))];

for (const filePath of files) {
  const result = spawnSync(process.execPath, ["--check", filePath], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax-checked ${files.length} files.`);
