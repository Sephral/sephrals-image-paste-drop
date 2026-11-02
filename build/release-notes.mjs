// Writes the top of the GitHub release text: how to install the module. GitHub adds the generated notes below it.
//
// Usage: node build/release-notes.mjs > .release/notes.md
// Environment:
//   GITHUB_REPOSITORY  owner/repo, set by GitHub Actions
//   FOUNDRY_LISTED     "true" when the module has a package page on foundryvtt.com (the release token is set)
//   NOTES_MANIFEST_PATH  optional module.json to read (defaults to .release/package/module.json, then module.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** "Sephral’s Loot Ledger" becomes "Loot Ledger", the name to search for in Foundry. */
export function shortTitle(title) {
  return String(title ?? "").replace(/^Sephral[’']s\s+/, "");
}

/**
 * The install part of the release text. Public text: no semicolons, no dashes.
 * @param {{title: string, id: string}} manifest
 * @param {{repository: string, listed: boolean}} options
 * @returns {string}
 */
export function installNote(manifest, { repository, listed }) {
  if ( !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository) ) throw new Error(`GITHUB_REPOSITORY must look like owner/repo, got: ${repository}`);
  const owner = repository.split("/")[0];
  const manifestUrl = `https://github.com/${repository}/releases/latest/download/module.json`;
  const lines = ["## Install", ""];
  if ( listed ) {
    lines.push(`Search for **${shortTitle(manifest.title || manifest.id)}** in Foundry's module browser, or paste this link into **Manifest URL** at the bottom of Foundry's **Install Module** window:`);
  }
  else {
    lines.push(`${shortTitle(manifest.title || manifest.id)} is not in Foundry's module search. Copy this link:`);
  }
  lines.push("", "```text", manifestUrl, "```", "");
  if ( !listed ) {
    lines.push(
      "1. In Foundry's setup screen open **Add-on Modules** and click **Install Module**.",
      "2. Paste the link into **Manifest URL** at the bottom of the window.",
      "3. Click **Install**, then enable the module in your world.",
      "",
      "On The Forge open the Bazaar, click **Install From Manifest** and paste the link.",
      "",
      `![How to install a module by its link](https://raw.githubusercontent.com/${owner}/${owner}/main/media/install.gif)`,
      ""
    );
  }
  return lines.join("\n");
}

function resolveManifestPath(root, env) {
  if ( env.NOTES_MANIFEST_PATH ) return path.resolve(root, env.NOTES_MANIFEST_PATH);
  const built = path.join(root, ".release", "package", "module.json");
  return fs.existsSync(built) ? built : path.join(root, "module.json");
}

if ( process.argv[1] && (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ) {
  const env = process.env;
  const manifest = JSON.parse(fs.readFileSync(resolveManifestPath(process.cwd(), env), "utf8"));
  process.stdout.write(installNote(manifest, { repository: env.GITHUB_REPOSITORY, listed: env.FOUNDRY_LISTED === "true" }));
}
