# Sephral's Image Paste & Drop

Sephral's Image Paste & Drop lets you paste images from the clipboard with `Ctrl+V` or drag and drop image content into Foundry and decide what should happen next.

## Foundry VTT

[![Foundry VTT package](https://img.shields.io/badge/Foundry%20VTT-Package%20page-fe6a1f?logo=foundryvirtualtabletop&logoColor=white)](https://foundryvtt.com/packages/sephrals-image-paste-drop)

Install the module from the package browser in Foundry VTT or open its [package page on foundryvtt.com](https://foundryvtt.com/packages/sephrals-image-paste-drop).

## Discord

[![Join Discord](https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?logo=discord&logoColor=white)](https://discord.gg/7BjCgDYaBP)

Questions, feedback, and module support are welcome on [Discord](https://discord.gg/7BjCgDYaBP).

## Demo

![SCBR demo](media/demo.gif)

If the embedded preview is not available in your GitHub view, please check the media folder.

## Current behavior

- Detects pasted clipboard images outside of text inputs
- Detects dropped image files and dropped image URLs outside of text inputs
- Shows a preview dialog after paste or drop and starts with configurable defaults
- Uploads the image into persistent storage when the selected action needs a reusable file path
- Supports these targets:
  - Create a new scene and use the image as its background
  - Replace the background of the current scene
  - Replace the foreground overlay of the current scene
  - Create a centered tile in the current scene
  - Create a centered tile scaled to fit the current scene
  - Create a journal entry with an image page
  - Show the image to connected players
  - Open the image in a preview window only

## Storage strategy

SIPD currently uses two storage layers:

- Persistent image files are stored under world data at `worlds/<world-id>/sephrals-image-paste-drop/...`
- User preferences are stored as client settings under the module id `sephrals-image-paste-drop`
- Player access (`allowPlayerToolUse`, `playerAllowedActions`) is stored as world settings

### Persistent file paths

The module writes image files only when the selected action needs a stable Foundry file path.

- Default upload directory: `worlds/<world-id>/sephrals-image-paste-drop/clipboard-images/YYYY/MM/`
- Manual `Upload directory` action: `worlds/<world-id>/sephrals-image-paste-drop/<chosen-directory>/`
- Replace current scene background: `worlds/<world-id>/sephrals-image-paste-drop/clipboard-images/scenes/<scene-id>/background.<ext>`
- Replace current scene foreground: `worlds/<world-id>/sephrals-image-paste-drop/clipboard-images/scenes/<scene-id>/foreground.<ext>`
- `Share image`: `worlds/<world-id>/sephrals-image-paste-drop/clipboard-images/shared/shared-<user-id>.<ext>`
- Uploads by players (`Upload directory`, journal entries): `worlds/<world-id>/sephrals-image-paste-drop/clipboard-images/players/`

Other persistent actions such as creating a new scene, tile, or journal entry also upload a file and then reference that file from the created Foundry document.

The world setting `Storage folder` replaces the base folder `worlds/<world-id>/sephrals-image-paste-drop` with any folder of your choice (for example `assets/handouts`). All paths above then start there.

### The Forge

On The Forge the world folder is not available for uploads. SIPD detects The Forge and stores its images in your Assets Library under `sephrals-image-paste-drop/<world-id>/...` (or under the configured `Storage folder`). Documents reference the absolute Assets Library URL that The Forge returns.

For non-deterministic persistent uploads, SIPD names the stored file by a SHA-256 hash of the image content. That avoids filename collisions when several dropped or pasted files share the same original filename, and it reuses the same world file path when the content is identical.

`Preview only` does not write a persistent file unless the image is also shared to players. In preview mode the module uses a temporary browser object URL instead.

### Client settings

The module stores UI and workflow preferences as client scoped settings. These include:

- paste enabled
- drag and drop enabled
- default action
- remember last action
- last used action
- default share to players
- default activate scene
- default navigation
- default upload directory
- upload directory history
- UI theme
- saved window sizes

### Current limitations

Client side cleanup is still limited by Foundry because the browser side file tools provide browse, create, and upload, but no reliable delete operation.

The current mitigation strategy is:

- reuse deterministic file paths for repeated updates of the current scene background
- reuse deterministic file paths for repeated updates of the current scene foreground
- reuse a deterministic shared image path per user for `Share image`
- use content-addressed filenames for other persistent uploads so identical image content reuses the same stored file
- avoid persistent writes for pure preview usage

## Access model

By default only the GM can use SIPD.

The GM can enable player access in the SIPD settings (`Allow players to use SIPD`). Players can then open the import flow and always use `Preview only`.

Under `Additional player targets` the GM can open up more targets for players:

| Target | Additional Foundry permission the player needs |
| --- | --- |
| `Upload directory` | Upload Files |
| Journal entry with an image page | Upload Files and Create Journal Entries |
| `Share image` (also the "show to players" checkbox) | Upload Files |

Foundry grants "Upload Files" only to Assistant GMs by default. Grant it to Players or Trusted Players under **Configure Permissions**. Assistant GM is no alternative when players should not see hidden journals and actors, because Foundry treats Assistant GMs like GMs.

Players always upload into `clipboard-images/players` (shared images into `clipboard-images/shared`) and cannot pick a folder, because Foundry does not let players create folders. A GM client creates both folders when player access or a player target is enabled and whenever a GM logs in.

Scene and tile targets stay GM-only, because Foundry requires the Assistant role to create scenes and tiles.

Note that "Upload Files" lets a player upload files into any existing folder of the Data directory, not only into the SIPD folders.

## Settings

The Foundry settings sidebar exposes the SIPD options directly on the standard module settings page.

It lets each user configure:

- whether the dialogs should use the warm signature design or a darker Foundry-style fallback
- whether clipboard paste should trigger the module
- whether drag and drop should trigger the module
- the default insertion target
- whether the last successful target should be reused automatically
- whether player sharing should be preselected
- whether newly created scenes should be activated by default
- whether newly created scenes should appear in navigation by default

## Notes

- Clipboard import currently targets image clipboard items.
- Drag and drop currently supports image files and dropped image URLs that can be fetched by the browser.
- The current scene foreground target is useful for map overlays and framing assets.
- Uploading requires the Foundry permission "Upload Files". GMs and Assistant GMs have it by default.
- Tile insertion requires an active viewed scene.