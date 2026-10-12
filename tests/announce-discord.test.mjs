import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildPayload, cleanSubject, collectNotes, formatCompatibility, normalizeMessage, postWebhook, run } from "../build/announce-discord.mjs";

const MODULE_HOOK = "https://discord.com/api/webhooks/111/module_secret";
const RELEASES_HOOK = "https://discord.com/api/webhooks/222/releases_secret";
const manifest = {
  id: "my-module",
  title: "Sephral’s My Module",
  version: "1.2.3",
  compatibility: { minimum: 13, verified: "14.369" }
};
const notes = { previousTag: "v1.2.2", message: null, headline: "Paste links and levels", changes: ["Images go to the viewed level"] };
const now = new Date("2026-10-12T12:00:00Z");

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

function fakeGit(answers) {
  return args => {
    const key = args.join(" ");
    if ( !(key in answers) ) throw new Error(`unexpected git ${key}`);
    if ( answers[key] instanceof Error ) throw answers[key];
    return answers[key];
  };
}

test("cleanSubject drops housekeeping parts and tidies punctuation", () => {
  assert.equal(cleanSubject("visibility choice and open panels"), "Visibility choice and open panels");
  assert.equal(cleanSubject("v1.0.4 paste links and levels"), "Paste links and levels");
  assert.equal(cleanSubject("gm focus, new demo, no hotkeys"), "Gm focus and no hotkeys");
  assert.equal(cleanSubject("time jump alerts and tests"), "Time jump alerts");
  assert.equal(cleanSubject("fixed tooltip; better layout - faster"), "Fixed tooltip, better layout, faster");
  assert.equal(cleanSubject("manual initiative order"), "Manual initiative order");
  for ( const subject of ["readme and manual rewrite", "new demo video", "more modules link", "readme: foundry link",
    "release zip without media", "workflow update v6", "irrelevant license change", "added unit tests",
    "v1.0.0 release candidate", "Version 1.0.1 Release Candidate", "v1.0.1", "Initial commit"] ) {
    assert.equal(cleanSubject(subject), null, subject);
  }
});

test("normalizeMessage turns list markers into bullets and cuts signatures", () => {
  const message = "Paste links\n- images go to the viewed level\n* drop position fixed\n-----BEGIN PGP SIGNATURE-----\nabc";
  assert.equal(normalizeMessage(message), "Paste links\n• images go to the viewed level\n• drop position fixed");
});

test("collectNotes prefers the annotated tag message, then commit subjects", () => {
  const annotated = collectNotes("v1.2.3", fakeGit({
    "describe --tags --abbrev=0 --match v* v1.2.3^": "v1.2.2\n",
    "cat-file -t v1.2.3": "tag\n",
    "tag -l --format=%(contents) v1.2.3": "- hand written note\n"
  }));
  assert.deepEqual(annotated, { previousTag: "v1.2.2", message: "• hand written note", headline: null, changes: [] });

  const fromCommits = collectNotes("v1.2.3", fakeGit({
    "describe --tags --abbrev=0 --match v* v1.2.3^": "v1.2.2\n",
    "cat-file -t v1.2.3": "commit\n",
    "log --reverse --no-merges --format=%s v1.2.2..v1.2.3": "readme: foundry link\nv1.2.21 untagged patch\npaste links\nnew demo video\nimages go to the viewed level\nv1.2.3 paste links\n"
  }));
  assert.deepEqual(fromCommits, { previousTag: "v1.2.2", message: null, headline: "Paste links", changes: ["Untagged patch", "Images go to the viewed level"] });

  const first = collectNotes("v1.0.0", fakeGit({
    "describe --tags --abbrev=0 --match v* v1.0.0^": new Error("no names found"),
    "cat-file -t v1.0.0": "commit\n"
  }));
  assert.deepEqual(first, { previousTag: null, message: null, headline: "First release", changes: [] });
});

test("collectNotes reads a real repository", { skip: !hasGit() }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "announce-discord-"));
  const git = args => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    git(["init", "-q"]);
    const commit = message => git(["commit", "-q", "--allow-empty", "-m", message]);
    commit("first version");
    git(["tag", "v1.0.0"]);
    commit("added demo video");
    commit("undo and filter");
    commit("v1.0.1 undo");
    git(["tag", "v1.0.1"]);
    commit("v1.0.2 api");
    git(["tag", "-a", "v1.0.2", "-m", "New api\n\n- notes api for macros"]);

    assert.deepEqual(collectNotes("v1.0.0", git), { previousTag: null, message: null, headline: "First release", changes: [] });
    assert.deepEqual(collectNotes("v1.0.1", git), { previousTag: "v1.0.0", message: null, headline: "Undo", changes: ["Undo and filter"] });
    assert.deepEqual(collectNotes("v1.0.2", git), { previousTag: "v1.0.1", message: "New api\n\n• notes api for macros", headline: null, changes: [] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function hasGit() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch (_error) {
    return false;
  }
}

test("formatCompatibility names the Foundry generations", () => {
  assert.equal(formatCompatibility({ minimum: 13, verified: "14.369" }), "v13 and v14");
  assert.equal(formatCompatibility({ minimum: 14, verified: "14.369" }), "v14");
  assert.equal(formatCompatibility({ minimum: "12", verified: "14", maximum: "14" }), "v12 to v14");
});

test("buildPayload links the release and adds Foundry and discussion only when known", () => {
  const payload = buildPayload({ ...manifest, relationships: { systems: [{ id: "crucible" }], requires: [{ id: "ember" }] } },
    { repository: "Owner/my-module", tag: "v1.2.3", notes, foundryListed: true, discussionChannelId: "555", now });
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  const [embed] = payload.embeds;
  assert.equal(embed.title, "Sephral’s My Module v1.2.3");
  assert.equal(embed.url, "https://github.com/Owner/my-module/releases/tag/v1.2.3");
  assert.equal(embed.description, "**Paste links and levels**\n• Images go to the viewed level");
  assert.equal(embed.timestamp, "2026-10-12T12:00:00.000Z");
  const fields = Object.fromEntries(embed.fields.map(field => [field.name, field.value]));
  assert.equal(fields["Foundry VTT"], "v13 and v14");
  assert.equal(fields.System, "Crucible");
  assert.equal(fields.Requires, "Ember");
  assert.equal(fields.Discussion, "<#555>");
  assert.match(fields.Links, /\[Foundry package\]\(https:\/\/foundryvtt\.com\/packages\/my-module\)/);
  assert.match(fields.Links, /compare\/v1\.2\.2\.\.\.v1\.2\.3/);
  assert.equal(fields["Manifest URL"], "`https://github.com/Owner/my-module/releases/latest/download/module.json`");

  const plain = buildPayload(manifest, { repository: "Owner/my-module", tag: "v1.2.3", notes: { ...notes, changes: Array.from({ length: 12 }, (_, i) => `Change ${i}`) }, now });
  const plainFields = plain.embeds[0].fields.map(field => field.name);
  assert.equal(plainFields.includes("Discussion"), false);
  assert.equal(plain.embeds[0].fields.find(field => field.name === "Links").value.includes("foundryvtt.com"), false);
  assert.match(plain.embeds[0].description, /• Change 9\n• and 2 more$/);
  for ( const text of [plain.embeds[0].description, ...plain.embeds[0].fields.map(field => field.value)] ) {
    assert.equal(/;|\s[-–—]\s/.test(text), false, text);
  }

  assert.throws(() => buildPayload(manifest, { repository: "Owner/my-module", tag: "v1.2.4", notes }), /does not match/);
  assert.throws(() => buildPayload(manifest, { repository: "no-slash", tag: "v1.2.3", notes }), /owner\/repo/);
});

test("postWebhook waits for the message, retries once after 429 and hides the URL in errors", async () => {
  const waits = [];
  const calls = [];
  let count = 0;
  const message = await postWebhook(MODULE_HOOK, "module channel", { embeds: [] }, {
    wait: async seconds => waits.push(seconds),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return ++count === 1 ? fakeResponse(429, { retry_after: 1.2 }) : fakeResponse(200, { id: "999", channel_id: "555" });
    }
  });
  assert.equal(message.id, "999");
  assert.deepEqual(waits, [2]);
  assert.equal(calls[0].url, `${MODULE_HOOK}?wait=true`);

  await assert.rejects(
    () => postWebhook(MODULE_HOOK, "module channel", {}, { fetchImpl: async () => fakeResponse(404, { message: "Unknown Webhook", code: 10015 }) }),
    error => error.message.includes("Unknown Webhook") && !error.message.includes("module_secret")
  );
});

test("run skips without webhooks, checks them in a dry run and posts to both channels", async () => {
  const logs = [];
  const log = message => logs.push(message);
  assert.deepEqual(await run({ env: {}, log }), { skipped: true });
  assert.match(logs[0], /not set, skipping/);
  await assert.rejects(() => run({ env: { DISCORD_REQUIRE_WEBHOOKS: "true" }, log }), /not set/);
  await assert.rejects(
    () => run({ env: { DISCORD_WEBHOOK_MODULE: "https://example.com/hook_secret" }, log }),
    error => /not a Discord webhook URL/.test(error.message) && !error.message.includes("hook_secret")
  );

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "announce-discord-"));
  try {
    fs.writeFileSync(path.join(root, "module.json"), JSON.stringify(manifest));
    const git = fakeGit({
      "describe --tags --abbrev=0 --match v* v1.2.3^": "v1.2.2\n",
      "cat-file -t v1.2.3": "commit\n",
      "log --reverse --no-merges --format=%s v1.2.2..v1.2.3": "v1.2.3 paste links\n"
    });
    const env = { DISCORD_WEBHOOK_MODULE: MODULE_HOOK, DISCORD_WEBHOOK_RELEASES: RELEASES_HOOK, GITHUB_REPOSITORY: "Owner/my-module", RELEASE_TAG: "v1.2.3", FOUNDRY_LISTED: "true" };
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
      if ( init.method === "GET" ) return fakeResponse(200, { id: "1", name: "Releases", channel_id: url === MODULE_HOOK ? "555" : "777" });
      return fakeResponse(200, { id: `msg-${calls.length}`, channel_id: url.startsWith(MODULE_HOOK) ? "555" : "777" });
    };

    const dry = await run({ root, env: { ...env, DISCORD_DRY_RUN: "true" }, git, fetchImpl, log, now });
    assert.equal(dry.dryRun, true);
    assert.deepEqual(calls.map(call => call.method), ["GET", "GET"]);

    calls.length = 0;
    const result = await run({ root, env, git, fetchImpl, log, now });
    assert.deepEqual(result.posted.map(post => [post.key, post.channelId]), [["module", "555"], ["releases", "777"]]);
    const [moduleBody, releasesBody] = calls.filter(call => call.method === "POST").map(call => call.body);
    assert.equal(moduleBody.embeds[0].fields.some(field => field.name === "Discussion"), false);
    assert.equal(releasesBody.embeds[0].fields.find(field => field.name === "Discussion").value, "<#555>");
    assert.equal(logs.some(message => message.includes("_secret")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
