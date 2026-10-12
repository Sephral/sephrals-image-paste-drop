# Sephral's Image Paste & Drop Manual

This manual covers the details. For a quick overview see the [README](README.md).

## What it reacts to

* Pasted clipboard images and pasted image links outside of text inputs
* Dropped image files and dropped image URLs outside of text inputs

After a paste or drop a preview dialog opens with your configured defaults. The image is uploaded when the chosen target needs a file. If the browser cannot download an image URL, the module offers to use the URL directly.

## Targets

* Create a new scene and use the image as its background
* Replace the background of the current scene
* Replace the foreground overlay of the current scene, useful for map overlays and framing assets
* Create a centered tile in the current scene, placed at the drop point when you drop the image onto the canvas
* Create a centered tile scaled to fit the current scene
* Create a journal entry with an image page
* Show the image to connected players
* Open the image in a preview window only
* Upload the image into a folder of your choice (`Upload directory`)

Tile targets need an active viewed scene.

## Image links

Copy an image link, for example with "Copy image address" in your browser, and press `Ctrl+V` outside of text inputs. SIPD downloads the image and opens the same dialog as for a dropped image. This works for web addresses that end in an image file type (png, jpg, jpeg, gif, webp, svg, avif) and for `data:image` links. Other text is left alone.

Some servers do not let other sites download their images. SIPD then offers to use the URL directly. Nothing is uploaded in that case. The image stays on the other server and can change or disappear at any time.

A linked image works for journal image pages, for showing it to players and for the preview. Scene backgrounds and tiles are drawn by the canvas, which needs the same download access. These targets stay unavailable for linked images, and so does the upload target.

## Tile position

When you drop an image onto the canvas and create a centered tile, the tile is centered on the drop point. It snaps to the grid the same way Foundry snaps dropped tiles. Hold Shift while dropping to place it without snapping. The tile always stays inside the scene.

Pasted images and tiles scaled to fit the scene are centered on the scene.

## Player access

By default only the GM can use SIPD.

The GM can enable player access in the settings (`Allow players to use SIPD`). Players can then open the import flow and always use `Preview only`.

Under `Additional player targets` the GM can open up more targets for players:

| Target | Additional Foundry permission the player needs |
| --- | --- |
| `Upload directory` | Upload Files |
| Journal entry with an image page | Upload Files and Create Journal Entries |
| `Share image` (also the "show to players" checkbox) | Upload Files |

Foundry grants "Upload Files" only to Assistant GMs by default. Grant it to Players or Trusted Players under **Configure Permissions**. Assistant GM is no alternative when players should not see hidden journals and actors, because Foundry treats Assistant GMs like GMs.

Players always upload into `clipboard-images/players` (shared images into `clipboard-images/shared`) and cannot pick a folder, because Foundry does not let players create folders. The GM's client creates these folders automatically.

Scene and tile targets stay GM only, because Foundry requires the Assistant role to create scenes and tiles.

Note that "Upload Files" lets a player upload files into any existing folder of the Data directory, not only into the SIPD folders.

## Settings

Every user can configure on the module settings page:

* the dialog theme: the warm Signature design or a darker Foundry style
* the module language: follow Foundry (including community translations), English or German
* whether clipboard paste triggers the module
* whether drag and drop triggers the module
* the default target
* whether the last successful target is reused automatically
* whether player sharing is preselected
* whether newly created scenes are activated by default
* whether newly created scenes appear in the navigation by default

World settings for the GM: player access, additional player targets and the storage folder.

## Where images are stored

Images are only saved when the chosen target needs a file. They go into your world folder under `sephrals-image-paste-drop/clipboard-images/`, sorted by year and month. Scene backgrounds and foregrounds, shared images and player uploads get subfolders of their own, and the *Upload directory* target puts the image into the folder you pick.

The world setting *Storage folder* moves all of this to a folder of your choice, for example `assets/handouts`.

On The Forge the images go to your Assets Library, in the folder `sephrals-image-paste-drop` or your own *Storage folder*.

## Limitations

Foundry does not let modules delete files. Image Paste & Drop keeps the number of files small instead:

* a new background or foreground for the same scene replaces the old file
* each user has one file for shared images, which is replaced every time
* the same image is never stored twice
* a pure preview writes no file at all

Clipboard import handles image data and single image links. Uploading requires the Foundry permission "Upload Files", which GMs and Assistant GMs have by default.
