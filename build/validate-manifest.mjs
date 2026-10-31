// Checks module.json against package.json, the files it references and the manifest rules all of Sephral's modules
// share. The same file in every module repository.
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const OWNER = "Sephral";
const AUTHOR_URL = `https://github.com/${OWNER}`;
const LANGUAGES = ["en", "de"];
const RELEASE_FIELDS = ["manifest", "download"];

const packageJsonPath = path.join(rootDir, "package.json");
const moduleJsonPath = path.join(rootDir, "module.json");

function fail(message) {
  throw new Error(message);
}

function ensureString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`module.json field "${fieldName}" must be a non-empty string.`);
  }
}

function ensureArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`module.json field "${fieldName}" must be a non-empty array.`);
  }
}

async function exists(relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function ensurePathExists(relativePath, fieldName) {
  if (!(await exists(relativePath))) fail(`${fieldName} references a missing path: ${relativePath}`);
}

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const moduleManifest = JSON.parse(await readFile(moduleJsonPath, "utf8"));
const moduleId = moduleManifest.id;

ensureString(moduleId, "id");
ensureString(moduleManifest.title, "title");
ensureString(moduleManifest.description, "description");
ensureString(moduleManifest.version, "version");
ensureString(moduleManifest.url, "url");

if (!moduleManifest.title.startsWith(`${OWNER}’s `)) {
  fail(`module.json title must start with "${OWNER}’s ", got: ${moduleManifest.title}`);
}

if (moduleManifest.url !== `https://github.com/${OWNER}/${moduleId}.git`) {
  fail(`module.json url must be https://github.com/${OWNER}/${moduleId}.git, got: ${moduleManifest.url}`);
}

if (packageJson.name !== moduleId) {
  fail(`package.json name (${packageJson.name}) does not match module.json id (${moduleId}).`);
}

if (packageJson.version !== moduleManifest.version) {
  fail(`package.json version (${packageJson.version}) does not match module.json version (${moduleManifest.version}).`);
}

for (const field of RELEASE_FIELDS) {
  if (field in moduleManifest) {
    fail(`module.json must not contain "${field}": build/prepare-release.mjs adds it to the released manifest.`);
  }
}

if (typeof moduleManifest.compatibility !== "object" || moduleManifest.compatibility === null) {
  fail('module.json field "compatibility" must be an object.');
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

if (!moduleManifest.authors.some((author) => author.name === OWNER && author.url === AUTHOR_URL)) {
  fail(`module.json authors must contain { "name": "${OWNER}", "url": "${AUTHOR_URL}" }.`);
}

const relationships = moduleManifest.relationships ?? {};
for (const system of relationships.systems ?? []) {
  ensureString(system?.id, "relationships.systems[].id");
  if (system.type !== "system") fail(`relationships.systems entry ${system.id} must have "type": "system".`);
  if (typeof system.compatibility !== "object" || system.compatibility === null) {
    fail(`relationships.systems entry ${system.id} needs a compatibility object.`);
  }
}

for (const kind of ["requires", "recommends"]) {
  for (const entry of relationships[kind] ?? []) {
    ensureString(entry?.id, `relationships.${kind}[].id`);
    ensureString(entry.type, `relationships.${kind}[].type`);
    if (kind === "recommends") ensureString(entry.reason, `relationships.recommends[${entry.id}].reason`);
    if (entry.id.startsWith("sephrals-")) {
      const manifest = `https://github.com/${OWNER}/${entry.id}/releases/latest/download/module.json`;
      if (entry.manifest !== manifest) fail(`relationships.${kind} entry ${entry.id} needs "manifest": "${manifest}".`);
    }
  }
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
  try {
    JSON.parse(await readFile(path.join(rootDir, language.path), "utf8"));
  } catch (error) {
    fail(`languages.${language.lang} is not valid JSON: ${error.message}`);
  }
}

for (const lang of LANGUAGES) {
  if (!seenLanguages.has(lang)) fail(`module.json languages must include "${lang}".`);
}

for (const file of ["README.md", "MANUAL.md", "LICENSE.md"]) {
  await ensurePathExists(file, file);
}

console.log(`Validated module manifest for ${moduleId} ${moduleManifest.version}.`);
