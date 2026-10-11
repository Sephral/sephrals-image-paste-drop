// Registers a GitHub release as a new version on foundryvtt.com (Foundry VTT Package Release API).
//
// Usage: node build/publish-foundry-release.mjs
// Environment:
//   FOUNDRY_RELEASE_TOKEN  package release token from the package's edit page (GitHub secret, never logged)
//   GITHUB_REPOSITORY      owner/repo, set by GitHub Actions
//   RELEASE_TAG            release tag such as v1.2.3 (falls back to GITHUB_REF_NAME)
//   FOUNDRY_DRY_RUN        "true" validates the request on foundryvtt.com without saving it
//   FOUNDRY_MANIFEST_PATH  optional module.json to read (defaults to .release/package/module.json, then module.json)
//   FOUNDRY_REQUIRE_TOKEN  "true" fails instead of skipping when the token is missing
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const API_URL = "https://foundryvtt.com/_api/packages/release_version/";
const TAG_PATTERN = /^v\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/;
const MAX_RETRY_WAIT_SECONDS = 120;

export function resolveManifestPath(root, env = process.env) {
  if (env.FOUNDRY_MANIFEST_PATH) return path.resolve(root, env.FOUNDRY_MANIFEST_PATH);
  const built = path.join(root, ".release", "package", "module.json");
  return fs.existsSync(built) ? built : path.join(root, "module.json");
}

export function buildReleasePayload(manifest, { repository, tag, dryRun = false }) {
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error(`GITHUB_REPOSITORY must look like owner/repo, got: ${repository}`);
  if (!TAG_PATTERN.test(tag ?? "")) throw new Error(`Release tag must look like v1.2.3, got: ${tag}`);
  if (tag !== `v${manifest.version}`) throw new Error(`module.json version (${manifest.version}) does not match release tag ${tag}.`);
  if (!manifest.id) throw new Error("module.json has no id.");

  const compatibility = manifest.compatibility ?? {};
  if (compatibility.minimum === undefined || compatibility.verified === undefined) {
    throw new Error("module.json needs compatibility.minimum and compatibility.verified.");
  }

  const release = {
    version: manifest.version,
    manifest: `https://github.com/${repository}/releases/download/${tag}/module.json`,
    notes: `https://github.com/${repository}/releases/tag/${tag}`,
    compatibility: {
      minimum: String(compatibility.minimum),
      verified: String(compatibility.verified)
    }
  };
  if ( compatibility.maximum !== undefined && compatibility.maximum !== null && compatibility.maximum !== "" ) {
    release.compatibility.maximum = String(compatibility.maximum);
  }

  return { id: manifest.id, "dry-run": Boolean(dryRun), release };
}

const sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000));

export async function publishRelease(payload, token, { fetchImpl = fetch, wait = sleep } = {}) {
  for ( let attempt = 0; attempt < 2; attempt++ ) {
    const response = await fetchImpl(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify(payload)
    });

    if ( response.status === 429 && attempt === 0 ) {
      const retryAfter = Math.min(Number(response.headers?.get?.("Retry-After")) || 60, MAX_RETRY_WAIT_SECONDS);
      await wait(retryAfter);
      continue;
    }

    let body = null;
    try {
      body = await response.json();
    } catch (_error) {
      body = null;
    }

    if ( !response.ok || body?.status !== "success" ) {
      const details = body?.errors ? JSON.stringify(body.errors) : (body?.message ?? `HTTP ${response.status}`);
      throw new Error(`foundryvtt.com rejected the release (HTTP ${response.status}): ${details}`);
    }
    return body;
  }
  throw new Error("foundryvtt.com kept answering 429 Too Many Requests.");
}

export async function run({ env = process.env, root = process.cwd(), fetchImpl = fetch, wait = sleep, log = console.log } = {}) {
  const token = env.FOUNDRY_RELEASE_TOKEN?.trim();
  if ( !token ) {
    if ( String(env.FOUNDRY_REQUIRE_TOKEN).toLowerCase() === "true" ) {
      throw new Error("FOUNDRY_RELEASE_TOKEN is not set. Add the package release token as repository secret.");
    }
    log("::notice::FOUNDRY_RELEASE_TOKEN is not set, skipping the foundryvtt.com release.");
    return { skipped: true };
  }

  const manifestPath = resolveManifestPath(root, env);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const payload = buildReleasePayload(manifest, {
    repository: env.GITHUB_REPOSITORY,
    tag: env.RELEASE_TAG || env.GITHUB_REF_NAME,
    dryRun: String(env.FOUNDRY_DRY_RUN).toLowerCase() === "true"
  });

  log(`Publishing ${payload.id} ${payload.release.version} on foundryvtt.com${payload["dry-run"] ? " (dry run)" : ""}`);
  log(`Manifest: ${payload.release.manifest}`);
  log(`Compatibility: ${JSON.stringify(payload.release.compatibility)}`);
  const body = await publishRelease(payload, token, { fetchImpl, wait });
  log(body.message ?? `Done: ${body.page ?? "release registered"}`);
  return { skipped: false, body };
}

if ( process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ) {
  run().catch(error => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
