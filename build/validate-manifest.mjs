import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packageJsonPath = path.join(rootDir, "package.json");
const moduleJsonPath = path.join(rootDir, "module.json");

function fail(message) {
  throw new Error(message);
}

function ensureString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`module.json field \"${fieldName}\" must be a non-empty string.`);
  }
}

function ensureArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`module.json field \"${fieldName}\" must be a non-empty array.`);
  }
}

async function ensurePathExists(relativePath, fieldName) {
  try {
    await access(path.join(rootDir, relativePath));
  } catch {
    fail(`${fieldName} references a missing path: ${relativePath}`);
  }
}

async function ensureOptionalPath(relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const moduleManifest = JSON.parse(await readFile(moduleJsonPath, "utf8"));

ensureString(moduleManifest.id, "id");
ensureString(moduleManifest.title, "title");
ensureString(moduleManifest.description, "description");
ensureString(moduleManifest.version, "version");

if (packageJson.version !== moduleManifest.version) {
  fail(`package.json version (${packageJson.version}) does not match module.json version (${moduleManifest.version}).`);
}

if (typeof moduleManifest.compatibility !== "object" || moduleManifest.compatibility === null) {
  fail("module.json field \"compatibility\" must be an object.");
}

const { minimum, verified } = moduleManifest.compatibility;
if (!Number.isInteger(minimum) || minimum < 1) {
  fail("module.json compatibility.minimum must be a positive integer.");
}

if (typeof verified !== "string" || !/^\d+\.\d+$/.test(verified)) {
  fail("module.json compatibility.verified must be a string like 14.361.");
}

ensureArray(moduleManifest.authors, "authors");
for (const author of moduleManifest.authors) {
  if (!author || typeof author !== "object") {
    fail("Each author entry in module.json must be an object.");
  }

  ensureString(author.name, "authors[].name");
}

ensureArray(moduleManifest.esmodules, "esmodules");
for (const entry of moduleManifest.esmodules) {
  ensureString(entry, "esmodules[]");
  await ensurePathExists(entry, "esmodules");
}

ensureArray(moduleManifest.styles, "styles");
for (const entry of moduleManifest.styles) {
  ensureString(entry, "styles[]");
  await ensurePathExists(entry, "styles");
}

ensureArray(moduleManifest.languages, "languages");
const seenLanguages = new Set();
for (const language of moduleManifest.languages) {
  if (!language || typeof language !== "object") {
    fail("Each language entry in module.json must be an object.");
  }

  ensureString(language.lang, "languages[].lang");
  ensureString(language.name, "languages[].name");
  ensureString(language.path, "languages[].path");

  if (seenLanguages.has(language.lang)) {
    fail(`Duplicate language code in module.json: ${language.lang}`);
  }

  seenLanguages.add(language.lang);
  await ensurePathExists(language.path, `languages.${language.lang}`);
}

await ensurePathExists("README.md", "README.md");
await ensurePathExists("LICENSE.md", "LICENSE.md");
if (await ensureOptionalPath("templates")) {
  await ensurePathExists("templates", "templates");
}

console.log(`Validated module manifest for ${moduleManifest.id} ${moduleManifest.version}.`);