# Sephral’s Image Paste & Drop Manual

This manual covers the details. For a quick overview see the [README](README.md).

## What it reacts to

* Pasted clipboard images and pasted image links outside of text inputs
* Dropped image files and dropped image URLs outside of text inputs
* Several images at once: several pasted or dropped image files, several image links pasted one per line, or several links dropped together

After a paste or drop a preview dialog opens with your configured defaults. The image is uploaded when the chosen target needs a file. If the browser cannot download an image URL, the module offers to use the URL directly.

## Targets

* Create a new scene and use the image as its background
* Replace the background of the current scene
* Replace the foreground overlay of the current scene, useful for map overlays and framing assets
* Create a centered tile in the current scene, placed at the drop point when you drop the image onto the canvas
* Create a centered tile scaled to fit the current scene
* Create a journal entry with an image page
* Create a map pin: a journal entry with the image page and a pin on the current scene that opens it
* Use the image for the selected tokens
* Use the image as actor portrait
* Post the image in chat
* Show the image to connected players, to all of them or only to the ones you pick
* Open the image in a preview window only
* Upload the image into a folder of your choice (`Upload directory`)

Scene, tile and map pin targets need a viewed scene. The token target needs at least one selected token, the portrait target a selected token or a character assigned to you. Targets that are not possible right now are greyed out in the dialog.

## Several images at once

When a paste or drop holds more than one image, a dialog with a thumbnail of every image opens instead. Pick one target for all of them:

* one journal entry with a page per image, in the order of the thumbnails
* tiles in a grid on the current scene, spaced by one grid square and kept inside the scene
* one journal entry per image
* one new scene per image (new scenes from a batch are never activated)
* one chat message with all images
* upload only

The name you enter is used for the journal entry. Each image keeps its own file name as page, tile or scene name. Images without a real file name, for example screenshots, are numbered.

Images that cannot be loaded are skipped with a notice. If only one image is left, the normal dialog for a single image opens. Links that block the download cannot be used directly in a batch, paste such a link on its own instead.

## Map pins

A map pin creates a journal entry with the image page and places a pin on the current scene that opens this page. Dropped onto the canvas, the pin lands at the drop point and snaps to the grid like a dropped journal entry. Hold Shift to place it without snapping. A pasted image puts the pin in the center of the scene. On Foundry v14 the pin goes to the level you are viewing.

The new journal entry has the default permissions, so players only see the pin's page once you share the entry with them.

## Tokens and portraits

The token target changes the image of every selected token. With "Also change the prototype token" checked, linked tokens also pass the image on to their actor's prototype token, so the next token placed from that actor uses it as well. The size of the tokens stays the same.

The portrait target changes the portrait of the actors of the selected tokens. Without a selected token it changes the portrait of the character assigned to you.

## Chat posts

The chat target posts the image as a chat message from your current speaker. "Visible to" decides who sees it: your current chat mode (public, private to the GM or only you) or everyone. A blind post goes to the GM like a private one, so you can still see your own image. Click an image in the chat to open it in a larger window.

## Showing images to players

The share target and the "Also show this image to players afterwards" option show the image in a window on the screens of connected players. Under "Show to" you can check single players. With nobody checked, all connected players see it. Players who are offline do not get the image later.

## Image links

Copy an image link, for example with "Copy image address" in your browser, and press `Ctrl+V` outside of text inputs. SIPD downloads the image and opens the same dialog as for a dropped image. This works for web addresses that end in an image file type (png, jpg, jpeg, gif, webp, svg, avif) and for `data:image` links. Other text is left alone. Several such links, one per line, are imported together.

Some servers do not let other sites download their images. SIPD then offers to use the URL directly. Nothing is uploaded in that case. The image stays on the other server and can change or disappear at any time.

A linked image works for journal image pages, map pins, portraits, chat posts, for showing it to players and for the preview. Scene backgrounds, tiles and tokens are drawn by the canvas, which needs the same download access. These targets stay unavailable for linked images, and so does the upload target.

## Tile position

When you drop an image onto the canvas and create a centered tile, the tile is centered on the drop point. It snaps to the grid the same way Foundry snaps dropped tiles. Hold Shift while dropping to place it without snapping. The tile always stays inside the scene.

Pasted images and tiles scaled to fit the scene are centered on the scene. A tile grid from several images is centered on the drop point or on the scene. Large images in a grid are scaled down evenly so the whole grid fits into the scene.

## Smaller files

Two settings make uploads smaller before they leave your browser:

* *Shrink large images*: images whose longer side is above the chosen size (2048, 4096 or 8192 pixels) are scaled down. Off by default.
* *Save uploads as WebP*: PNG and JPEG images are converted to WebP, which is usually much smaller. *WebP quality* sets the quality (85 by default).

GIFs, SVGs and animated images are never changed, because shrinking would lose the animation or the vector graphics. When a conversion alone would not make the file smaller, the original is kept. Previews and directly used image links are not changed.

When an upload would be shrunk or converted, the import dialog shows a checkbox such as *Save optimized: 2048 x 1024, WebP*. It names the new size, the new format or both, and it is checked by default, so the settings apply. Uncheck it to upload this one image in its original size and format. The settings stay as they are and the next import uses them again. For a conversion alone the hint below the checkbox says that it only happens when the file gets smaller. The checkbox only appears for targets that upload a file, not for `Preview only`.

The dialog for several images has one checkbox for all of them. Its label names the size limit and the target format, its hint says how many of the images are affected, and each affected thumbnail shows its new size or format. Unchecked, every image of this batch is uploaded as it is.

Scenes and tiles created from a shrunk image use its new size.

## Player access

By default only the GM can use SIPD.

The GM can enable player access in the settings (`Allow players to use SIPD`). Players can then open the import flow and always use `Preview only`.

Under `Additional player targets` the GM can open up more targets for players:

| Target | Additional Foundry permission the player needs |
| --- | --- |
| `Upload directory` | Upload Files |
| Journal entry with an image page | Upload Files and Create Journal Entries |
| `Share image` (also the "show to players" checkbox) | Upload Files |
| Image of the selected tokens | Upload Files |
| Actor portrait | Upload Files |
| Image post in chat | Upload Files |

Players only change tokens and portraits of actors they own. Tokens of other actors are left alone, even when they are selected.

Foundry grants "Upload Files" only to Assistant GMs by default. Grant it to Players or Trusted Players under **Configure Permissions**. Assistant GM is no alternative when players should not see hidden journals and actors, because Foundry treats Assistant GMs like GMs.

Players always upload into `clipboard-images/players` (shared images into `clipboard-images/shared`) and cannot pick a folder, because Foundry does not let players create folders. The GM's client creates these folders automatically.

Scene, tile and map pin targets stay GM only, because Foundry requires the Assistant role to create scenes, tiles and map pins.

Note that "Upload Files" lets a player upload files into any existing folder of the Data directory, not only into the SIPD folders.

## Settings

Every user can configure on the module settings page:

* the dialog theme: the warm Signature design or a darker Foundry style
* the module language: follow Foundry (including community translations), English or German
* whether clipboard paste triggers the module
* whether drag and drop triggers the module
* the default target
* whether the last successful target is reused automatically (for single images and for batches separately)
* whether player sharing is preselected
* whether newly created scenes are activated by default
* whether newly created scenes appear in the navigation by default
* whether large images are shrunk before the upload, and to which size
* whether uploads are saved as WebP, and in which quality

World settings for the GM: player access, additional player targets and the storage folder.

The gear in the title bar of the import window closes it and opens these settings.

*Run self test* (GM) checks the file picker, the storage folder, the targets, WebP in your browser and whether players may upload files. Run it after every Foundry update. When a newer Foundry than the tested one is installed, the GM gets a notice once.

## Macros

`game.modules.get("sephrals-image-paste-drop").api.runSelfTest()` runs the self test (GM).

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

Uploading requires the Foundry permission "Upload Files", which GMs and Assistant GMs have by default.
