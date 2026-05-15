# Sephral's Image Paste & Drop

Sephral's Image Paste & Drop lets you paste images from the clipboard with `Ctrl+V` or drag and drop image content into Foundry and decide what should happen next.

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

### Persistent file paths

The module writes image files only when the selected action needs a stable Foundry file path.

- Default upload directory: `worlds/<world-id>/sephrals-image-paste-drop/clipboard-images/YYYY/MM/`
- Manual `Upload directory` action: `worlds/<world-id>/sephrals-image-paste-drop/<chosen-directory>/`
- Replace current scene background: `worlds/<world-id>/sephrals-image-paste-drop/clipboard-images/scenes/<scene-id>/background.<ext>`
- Replace current scene foreground: `worlds/<world-id>/sephrals-image-paste-drop/clipboard-images/scenes/<scene-id>/foreground.<ext>`
- `Share image`: `worlds/<world-id>/sephrals-image-paste-drop/clipboard-images/shared/shared-<user-id>.<ext>`

Other persistent actions such as creating a new scene, tile, or journal entry also upload a file and then reference that file from the created Foundry document.

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

The GM can enable a restricted player mode in the SIPD settings.

In restricted player mode, non GM users can open the import flow but are limited to `Preview only`. They cannot create scenes, tiles, journal entries, uploads, or player facing broadcasts through SIPD.

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
- Uploading requires the Foundry file upload permission.
- Tile insertion requires an active viewed scene.