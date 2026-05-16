import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packageJsonPath = path.join(rootDir, "package.json");
const moduleJsonPath = path.join(rootDir, "module.json");
const releaseRoot = path.join(rootDir, ".release");
const packageDir = path.join(releaseRoot, "package");

const optionalEntries = ["templates"];
const requiredEntries = ["LICENSE.md", "README.md", "lang", "media", "scripts", "styles"];

async function pathExists(relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

function getRepositorySlug(moduleManifest) {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;

  const repositoryUrl = String(moduleManifest.url ?? "").trim();
  const match = repositoryUrl.match(/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/i);
  if (!match) {
    throw new Error("Could not determine the GitHub repository slug from module.json url.");
  }

  return match[1];
}

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const moduleManifest = JSON.parse(await readFile(moduleJsonPath, "utf8"));

const version = packageJson.version;
if (!version) throw new Error("package.json is missing a version.");

const tag = process.env.RELEASE_TAG?.trim() || process.env.GITHUB_REF_NAME?.trim() || `v${version}`;
const repository = getRepositorySlug(moduleManifest);
const moduleId = moduleManifest.id;
if (!moduleId) throw new Error("module.json is missing an id.");

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(packageDir, { recursive: true });

for (const entry of requiredEntries) {
  await cp(path.join(rootDir, entry), path.join(packageDir, entry), { recursive: true });
}

for (const entry of optionalEntries) {
  if (await pathExists(entry)) {
    await cp(path.join(rootDir, entry), path.join(packageDir, entry), { recursive: true });
  }
}

const releaseManifest = {
  ...moduleManifest,
  version,
  manifest: `https://github.com/${repository}/releases/latest/download/module.json`,
  download: `https://github.com/${repository}/releases/download/${tag}/${moduleId}.zip`
};

await writeFile(path.join(packageDir, "module.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");
await writeFile(path.join(releaseRoot, "release-metadata.json"), `${JSON.stringify({ version, tag, moduleId, repository }, null, 2)}\n`, "utf8");

console.log(`Prepared release assets for ${moduleId} ${version} (${tag}).`);