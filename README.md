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

- Detects pasted clipboard images and pasted image links outside of text inputs
- Detects dropped image files and dropped image URLs outside of text inputs
- Shows a preview dialog after paste or drop and starts with configurable defaults
- Uploads the image into persistent storage when the selected action needs a reusable file path
- Offers to use an image URL directly when the browser cannot download it
- Supports these targets:
  - Create a new scene and use the image as its background
  - Replace the background of the current scene
  - Replace the foreground overlay of the current scene
  - Create a centered tile in the current scene, placed at the drop point when you drop the image onto the canvas
  - Create a centered tile scaled to fit the current scene
  - Create a journal entry with an image page
  - Show the image to connected players
  - Open the image in a preview window only

## Image links

Copy an image link, for example with "Copy image address" in your browser, and press `Ctrl+V` outside of text inputs. SIPD downloads the image and opens the same dialog as for a dropped image. This works for web addresses that end in an image file type (png, jpg, jpeg, gif, webp, svg, avif) and for `data:image` links. Other text is left alone.

Some servers do not let other sites download their images. SIPD then offers to use the URL directly. Nothing is uploaded in that case. The image stays on the other server and can change or disappear at any time.

A linked image works for journal image pages, for showing it to players and for the preview. Scene backgrounds and tiles are drawn by the canvas, which needs the same download access. These targets stay unavailable for linked images, and so does the upload target.

## Tile position

When you drop an image onto the canvas and create a centered tile, the tile is centered on the drop point. It snaps to the grid the same way Foundry snaps dropped tiles. Hold Shift while dropping to place it without snapping. The tile always stays inside the scene.

Pasted images and tiles scaled to fit the scene are centered on the scene.

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

- Clipboard import handles image data and single image links.
- Drag and drop supports image files and image URLs. A URL the browser cannot download can be linked directly, see Image links.
- The current scene foreground target is useful for map overlays and framing assets.
- Uploading requires the Foundry permission "Upload Files". GMs and Assistant GMs have it by default.
- Tile insertion requires an active viewed scene.