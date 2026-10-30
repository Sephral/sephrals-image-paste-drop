import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { API_URL, buildReleasePayload, publishRelease, run } from "../build/publish-foundrymods-release.mjs";

const manifest = { id: "my-module", version: "1.2.3", compatibility: { minimum: 13, verified: "14.361" } };
const options = { repository: "Owner/my-module", tag: "v1.2.3" };

function fakeResponse(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => headers[name] ?? null },
    async json() {
      if ( body === undefined ) throw new Error("no json");
      return body;
    }
  };
}

test("buildReleasePayload points FoundryMods at the release-specific GitHub manifest", () => {
  assert.deepEqual(buildReleasePayload(manifest, options), {
    "dry-run": false,
    release: {
      manifest: "https://github.com/Owner/my-module/releases/download/v1.2.3/module.json",
      notes: "https://github.com/Owner/my-module/releases/tag/v1.2.3",
      foundrymods: { discord_announce: true }
    }
  });
  const quiet = buildReleasePayload(manifest, { ...options, dryRun: true, announce: false });
  assert.equal(quiet["dry-run"], true);
  assert.equal(quiet.release.foundrymods.discord_announce, false);
});

test("buildReleasePayload rejects mismatching or malformed input", () => {
  assert.throws(() => buildReleasePayload(manifest, { ...options, tag: "v1.2.4" }), /does not match/);
  assert.throws(() => buildReleasePayload(manifest, { ...options, tag: "1.2.3" }), /must look like v1.2.3/);
  assert.throws(() => buildReleasePayload(manifest, { ...options, repository: "no-slash" }), /owner\/repo/);
  assert.throws(() => buildReleasePayload({ version: "1.2.3" }, options), /no id/);
});

test("publishRelease sends the token only as Authorization header and returns the success body", async () => {
  const calls = [];
  const body = await publishRelease({ release: {} }, "fmp_secret", {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return fakeResponse(200, { status: "success", page: "https://foundrymods.com/modules/x/edit" });
    }
  });
  assert.equal(body.status, "success");
  assert.equal(calls[0].url, API_URL);
  assert.equal(calls[0].init.headers.Authorization, "fmp_secret");
  assert.equal(calls[0].init.body.includes("fmp_secret"), false);
});

test("publishRelease retries once after 429 and reports API errors without the token", async () => {
  const waits = [];
  let count = 0;
  const body = await publishRelease({ release: {} }, "fmp_secret", {
    wait: async seconds => waits.push(seconds),
    fetchImpl: async () => (++count === 1
      ? fakeResponse(429, undefined, { "Retry-After": "5" })
      : fakeResponse(200, { status: "success", page: "p" }))
  });
  assert.equal(body.page, "p");
  assert.deepEqual(waits, [5]);

  await assert.rejects(
    () => publishRelease({ release: {} }, "fmp_secret", {
      fetchImpl: async () => fakeResponse(401, { status: "error", message: "Invalid token fmp_secret" })
    }),
    error => error.message.includes("Invalid token") && !error.message.includes("fmp_secret")
  );
});

test("run skips without a token and publishes the built manifest with one", async () => {
  const logs = [];
  assert.deepEqual(await run({ env: {}, log: message => logs.push(message) }), { skipped: true });
  assert.match(logs[0], /not set, skipping/);
  await assert.rejects(() => run({ env: { FOUNDRYMODS_REQUIRE_TOKEN: "true" }, log: () => {} }), /not set/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-foundrymods-"));
  try {
    fs.mkdirSync(path.join(root, ".release", "package"), { recursive: true });
    fs.writeFileSync(path.join(root, ".release", "package", "module.json"), JSON.stringify(manifest));
    let sent = null;
    const result = await run({
      root,
      env: { FOUNDRYMODS_TOKEN: "fmp_secret", GITHUB_REPOSITORY: "Owner/my-module", RELEASE_TAG: "v1.2.3", FOUNDRYMODS_DRY_RUN: "true",
        FOUNDRYMODS_ANNOUNCE: "false" },
      log: message => logs.push(message),
      fetchImpl: async (_url, init) => {
        sent = JSON.parse(init.body);
        return fakeResponse(200, { status: "success", message: "dry run ok" });
      }
    });
    assert.equal(result.skipped, false);
    assert.equal(sent["dry-run"], true);
    assert.equal(sent.release.foundrymods.discord_announce, false);
    assert.equal(logs.some(message => message.includes("fmp_secret")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
