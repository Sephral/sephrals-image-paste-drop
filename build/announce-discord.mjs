// Announces a GitHub release on Discord: one post in the module's channel, one in the central releases channel.
//
// Usage: node build/announce-discord.mjs
// Environment:
//   DISCORD_WEBHOOK_MODULE    webhook of the module's channel (GitHub secret, never logged)
//   DISCORD_WEBHOOK_RELEASES  webhook of the central releases channel (GitHub secret, never logged)
//   GITHUB_REPOSITORY         owner/repo, set by GitHub Actions
//   RELEASE_TAG               release tag such as v1.2.3 (falls back to GITHUB_REF_NAME)
//   FOUNDRY_LISTED            "true" adds the link to the foundryvtt.com package page
//   DISCORD_DRY_RUN           "true" checks both webhooks and prints the messages without posting
//   DISCORD_MANIFEST_PATH     optional module.json to read (defaults to .release/package/module.json, then module.json)
//   DISCORD_REQUIRE_WEBHOOKS  "true" fails instead of skipping when a webhook is missing
//
// Release notes: the message of an annotated tag (git tag -a) when there is one, otherwise the
// commit subjects since the previous tag without readme, demo, workflow and other housekeeping parts.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TAG_PATTERN = /^v\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/;
const WEBHOOK_PATTERN = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/;
const VERSION_PREFIX = /^(?:version\s+)?v?\d+\.\d+\.\d+\S*\s*/i;
const HOUSEKEEPING = /\b(?:readme|docs?|demos?|licen[cs]e|workflows?|gitignore|lint(?:er)?|unit tests|tests|release zip|modules link|foundry link|initial commit|release candidate|manual(?:\s+(?:rewrite|update|cleanup))?$)/i;
const PART_SEPARATOR = /(,\s*|\s+and\s+)/i;
const MAX_CHANGES = 10;
const MAX_DESCRIPTION = 3500;
const EMBED_COLOR = 0xb5512d;
const KNOWN_NAMES = { dnd5e: "D&D 5e", crucible: "Crucible", ember: "Ember" };
const MAX_RETRY_WAIT_SECONDS = 60;

const WEBHOOKS = [
  { key: "module", env: "DISCORD_WEBHOOK_MODULE", label: "module channel" },
  { key: "releases", env: "DISCORD_WEBHOOK_RELEASES", label: "releases channel" }
];

export function resolveManifestPath(root, env = process.env) {
  if (env.DISCORD_MANIFEST_PATH) return path.resolve(root, env.DISCORD_MANIFEST_PATH);
  const built = path.join(root, ".release", "package", "module.json");
  return fs.existsSync(built) ? built : path.join(root, "module.json");
}

/** Plain punctuation for the release text. */
function tidy(text) {
  return text.replace(/;/g, ",").replace(/\s+[-–—]+\s+/g, ", ").replace(/\s+/g, " ").trim();
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** Turns a commit subject into a change line, dropping housekeeping parts. Returns null when nothing is left. */
export function cleanSubject(subject) {
  const text = tidy(String(subject ?? "").replace(VERSION_PREFIX, "")).replace(/[.!]+$/, "");
  if ( !text ) return null;
  const tokens = text.split(PART_SEPARATOR);
  const parts = tokens.filter((_token, index) => index % 2 === 0);
  const kept = parts.filter(part => part.trim() && !HOUSEKEEPING.test(part.trim()));
  if ( !kept.length ) return null;
  if ( kept.length === parts.length ) return capitalize(text);
  const joined = kept.length === 1 ? kept[0] : `${kept.slice(0, -1).join(", ")} and ${kept.at(-1)}`;
  return capitalize(joined.trim());
}

/** Normalizes a hand-written tag message: list markers become bullets, signatures are cut off. */
export function normalizeMessage(message) {
  const text = String(message ?? "").split("-----BEGIN PGP SIGNATURE-----")[0].trim();
  return text
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*[-*]\s+/, "• ").trimEnd())
    .join("\n")
    .trim();
}

function tryGit(git, args) {
  try {
    return git(args).trim();
  } catch (_error) {
    return "";
  }
}

export function collectNotes(tag, git) {
  const previousTag = tryGit(git, ["describe", "--tags", "--abbrev=0", "--match", "v*", `${tag}^`]) || null;

  if ( tryGit(git, ["cat-file", "-t", tag]) === "tag" ) {
    const message = normalizeMessage(tryGit(git, ["tag", "-l", "--format=%(contents)", tag]));
    if ( message ) return { previousTag, message, headline: null, changes: [] };
  }

  if ( !previousTag ) return { previousTag, message: null, headline: "First release", changes: [] };

  const subjects = tryGit(git, ["log", "--reverse", "--no-merges", "--format=%s", `${previousTag}..${tag}`])
    .split(/\r?\n/)
    .filter(Boolean);
  // The commit named after this version ("v1.2.3 paste links") becomes the headline.
  const ownVersion = new RegExp(`^(?:version\\s+)?v?${tag.slice(1).replace(/\./g, "\\.")}(?![\\w.-])`, "i");
  let headline = null;
  const changes = [];
  for ( const subject of subjects ) {
    const line = cleanSubject(subject);
    if ( !line ) continue;
    if ( ownVersion.test(subject) && !headline ) headline = line;
    else if ( !changes.some(change => change.toLowerCase() === line.toLowerCase()) ) changes.push(line);
  }
  return {
    previousTag,
    message: null,
    headline,
    changes: changes.filter(change => change.toLowerCase() !== headline?.toLowerCase())
  };
}

function major(value) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) ? number : null;
}

export function formatCompatibility(compatibility = {}) {
  const minimum = major(compatibility.minimum);
  const newest = major(compatibility.maximum) ?? major(compatibility.verified);
  if ( minimum === null && newest === null ) return "See module page";
  if ( minimum === null || newest === null || minimum === newest ) return `v${minimum ?? newest}`;
  if ( newest - minimum === 1 ) return `v${minimum} and v${newest}`;
  return `v${minimum} to v${newest}`;
}

function relationshipNames(entries) {
  return (entries ?? []).map(entry => KNOWN_NAMES[entry.id] ?? entry.id).filter(Boolean).join(", ");
}

export function buildDescription(notes) {
  let text;
  if ( notes.message ) text = notes.message;
  else {
    const lines = [];
    if ( notes.headline ) lines.push(`**${notes.headline}**`);
    const shown = notes.changes.slice(0, MAX_CHANGES);
    lines.push(...shown.map(change => `• ${change}`));
    const hidden = notes.changes.length - shown.length;
    if ( hidden > 0 ) lines.push(`• and ${hidden} more`);
    text = lines.join("\n") || "Maintenance release";
  }
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : text;
}

export function buildPayload(manifest, { repository, tag, notes, foundryListed = false, discussionChannelId = null, now = new Date() }) {
  if ( !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository) ) throw new Error(`GITHUB_REPOSITORY must look like owner/repo, got: ${repository}`);
  if ( !TAG_PATTERN.test(tag ?? "") ) throw new Error(`Release tag must look like v1.2.3, got: ${tag}`);
  if ( tag !== `v${manifest.version}` ) throw new Error(`module.json version (${manifest.version}) does not match release tag ${tag}.`);
  if ( !manifest.id ) throw new Error("module.json has no id.");

  const releaseUrl = `https://github.com/${repository}/releases/tag/${tag}`;
  const changesUrl = notes.previousTag
    ? `https://github.com/${repository}/compare/${notes.previousTag}...${tag}`
    : `https://github.com/${repository}/commits/${tag}`;
  const manifestUrl = `https://github.com/${repository}/releases/latest/download/module.json`;

  const fields = [{ name: "Foundry VTT", value: formatCompatibility(manifest.compatibility), inline: true }];
  const systems = relationshipNames(manifest.relationships?.systems);
  if ( systems ) fields.push({ name: "System", value: systems, inline: true });
  const requires = relationshipNames(manifest.relationships?.requires);
  if ( requires ) fields.push({ name: "Requires", value: requires, inline: true });
  if ( discussionChannelId ) fields.push({ name: "Discussion", value: `<#${discussionChannelId}>`, inline: true });

  const links = [
    foundryListed ? `[Foundry package](https://foundryvtt.com/packages/${manifest.id})` : null,
    `[GitHub release](${releaseUrl})`,
    `[All changes](${changesUrl})`
  ].filter(Boolean);
  fields.push({ name: "Links", value: links.join(" • ") });
  fields.push({ name: "Manifest URL", value: `\`${manifestUrl}\`` });

  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${manifest.title ?? manifest.id} v${manifest.version}`.slice(0, 256),
      url: releaseUrl,
      color: EMBED_COLOR,
      description: buildDescription(notes),
      fields,
      timestamp: now.toISOString()
    }]
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

/** Reads the webhook (no post). Errors never contain the URL, it holds the webhook token. */
export async function inspectWebhook(url, label, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { method: "GET" });
  const body = await readJson(response);
  if ( !response.ok ) throw new Error(`Discord rejected the ${label} webhook (HTTP ${response.status}): ${body?.message ?? "no details"}`);
  return { id: body?.id, name: body?.name, channelId: body?.channel_id };
}

const sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000));

export async function postWebhook(url, label, payload, { fetchImpl = fetch, wait = sleep } = {}) {
  for ( let attempt = 0; attempt < 2; attempt++ ) {
    const response = await fetchImpl(`${url}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await readJson(response);

    if ( response.status === 429 && attempt === 0 ) {
      const retryAfter = Number(body?.retry_after) || Number(response.headers?.get?.("Retry-After")) || 5;
      await wait(Math.min(Math.ceil(retryAfter), MAX_RETRY_WAIT_SECONDS));
      continue;
    }
    if ( !response.ok ) {
      const details = body?.message ? `${body.message}${body.errors ? ` ${JSON.stringify(body.errors)}` : ""}` : "no details";
      throw new Error(`Discord rejected the post to the ${label} (HTTP ${response.status}): ${details}`);
    }
    return body;
  }
  throw new Error(`Discord kept answering 429 Too Many Requests for the ${label}.`);
}

const defaultGit = root => args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export async function run({ env = process.env, root = process.cwd(), fetchImpl = fetch, wait = sleep, git = defaultGit(root), log = console.log, now = new Date() } = {}) {
  const targets = WEBHOOKS.map(webhook => ({ ...webhook, url: env[webhook.env]?.trim() || "" }));
  const missing = targets.filter(target => !target.url);
  if ( missing.length ) {
    const names = missing.map(target => target.env).join(" and ");
    if ( String(env.DISCORD_REQUIRE_WEBHOOKS).toLowerCase() === "true" ) {
      throw new Error(`${names} not set. Add the Discord webhook URLs as repository secrets.`);
    }
    log(`::notice::${names} not set, skipping that Discord post.`);
  }
  const active = targets.filter(target => target.url);
  if ( !active.length ) return { skipped: true };
  for ( const target of active ) {
    if ( !WEBHOOK_PATTERN.test(target.url) ) throw new Error(`${target.env} is not a Discord webhook URL.`);
  }

  const manifest = JSON.parse(fs.readFileSync(resolveManifestPath(root, env), "utf8"));
  const tag = env.RELEASE_TAG || env.GITHUB_REF_NAME;
  const notes = collectNotes(tag, git);
  const dryRun = String(env.DISCORD_DRY_RUN).toLowerCase() === "true";

  for ( const target of active ) {
    target.info = await inspectWebhook(target.url, target.label, { fetchImpl });
  }
  const moduleChannelId = active.find(target => target.key === "module")?.info.channelId ?? null;
  const options = { repository: env.GITHUB_REPOSITORY, tag, notes, foundryListed: String(env.FOUNDRY_LISTED).toLowerCase() === "true", now };
  for ( const target of active ) {
    const discussionChannelId = target.key === "releases" && moduleChannelId !== target.info.channelId ? moduleChannelId : null;
    target.payload = buildPayload(manifest, { ...options, discussionChannelId });
  }

  log(`Announcing ${active[0].payload.embeds[0].title} on Discord${dryRun ? " (dry run)" : ""}`);
  log(`Notes: ${notes.message ? "annotated tag message" : `commits since ${notes.previousTag ?? "the first commit"}`}`);
  for ( const target of active ) log(`Webhook "${target.info.name}" posts to channel ${target.info.channelId} (${target.label})`);

  if ( dryRun ) {
    for ( const target of active ) log(`${target.label} message:\n${JSON.stringify(target.payload, null, 2)}`);
    return { skipped: false, dryRun: true, targets: active.map(target => target.key) };
  }

  const posted = [];
  for ( const target of active ) {
    const message = await postWebhook(target.url, target.label, target.payload, { fetchImpl, wait });
    log(`Posted to the ${target.label}: message ${message?.id ?? "sent"}`);
    posted.push({ key: target.key, id: message?.id ?? null, channelId: message?.channel_id ?? target.info.channelId });
  }
  return { skipped: false, dryRun: false, posted };
}

if ( process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ) {
  run().catch(error => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
