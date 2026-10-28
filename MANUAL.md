# Sephral’s Image Paste & Drop Manual

This manual covers the details. For a quick overview see the [README](README.md).

## What it reacts to

* Pasted clipboard images, videos and image links outside of text inputs
* Dropped image and video files and dropped image URLs outside of text inputs
* Several images at once: several pasted or dropped image files, several image links pasted one per line, or several links dropped together
* Two keyboard shortcuts that skip the dialog (see [Keyboard shortcuts](#keyboard-shortcuts))

After a paste or drop a preview dialog opens with your configured defaults. The image is uploaded when the chosen target needs a file. If the browser cannot download an image URL, the module offers to use the URL directly.

Files dropped onto the file list of Foundry's file browser are left to Foundry, which uploads them into the folder you are browsing.

## Targets

* Create a new scene and use the image as its background, with a grid that fits the map (see [Grid of new scenes](#grid-of-new-scenes))
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

## Grid of new scenes

A new scene gets a grid that fits the map when the file name says how big the squares are:

* `30x20`, `30 x 20`, `30×20` or `30_x_20`: the map is 30 squares wide and 20 squares high. The other order works too.
* `140px` or `140ppi`: one square is 140 pixels.

Squares only count when they fit the image, so a pixel size such as `4096x2048` is no grid. A name only counts with at least 5 squares on each side and at most 600 pixels per square, and aspect ratios such as `16x9` are ignored. Without a grid in the name the scene keeps Foundry's default of 100 pixels.

With *Create a new scene* as target the dialog shows the row *Grid*: the grid type, the size of one square in pixels and, for square grids, how many squares the map is wide. Change one number and the other follows. The grid type starts with the default of your game system. Foundry needs at least 20 pixels per square, a smaller size is raised to 20. An empty size keeps Foundry's default.

Foundry only takes whole pixels per square. When the squares of a map are not a whole number of pixels, for example 29.5 squares across 3000 pixels or a large map shrunk on upload (see [Smaller files](#smaller-files)), the scene is made a few pixels larger or smaller so that it holds exactly that many squares. Foundry stretches the map to the scene, so its grid stays on the squares drawn into the map.

Several images as one new scene each take the grid from their own file names. Their thumbnails show it while that target is chosen.

## Videos

WebM, MP4 and OGV videos work like images. Paste or drop them and pick a target: an animated map becomes a scene background, a foreground overlay or a tile that plays in a loop, tokens can use a video as well, journal pages play it in a loop with controls, and chat posts play it muted in a loop. The actor portrait only takes images and stays greyed out for videos.

Videos are uploaded as they are. Shrinking and WebP only apply to images. Links that end in `.webm`, `.mp4`, `.m4v` or `.ogv` are imported like image links. Other video formats such as MOV are left alone, Foundry cannot play them.

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

## Keyboard shortcuts

Two shortcuts skip the dialog:

| Shortcut | What it does |
| --- | --- |
| `Alt+V` | Sends the copied image to the target the dialog would preselect, with the dialog's defaults |
| `Alt+P` | Shows the copied image to all connected players |

Change them under **Configure Controls**. The shortcuts read the clipboard themselves. Browsers only allow that on HTTPS pages, on `localhost` and in Foundry's desktop app, and the browser may ask for permission the first time. Everywhere else, and when the clipboard holds a copied file instead of an image, the shortcut waits ten seconds for the next `Ctrl+V` or drop and sends that image to its target.

When the target is not possible right now, for example the token target without a selected token, the normal dialog opens. When the remembered target is one you may not use at all, `Alt+V` takes the target the dialog preselects instead. Several images at once always get the dialog for several images. A shortcut does not change the target the dialog reuses. Players can use the shortcuts with the targets the GM allows them.

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

*Save debug file* (GM) saves a file for bug reports, see [Debug file](#debug-file).

## Debug file

For bug reports, the GM saves one file about all of Sephral’s modules in this world: `Save debug file` in the module settings, or `Save Debug File (Sephral’s Modules)` in the context menu of a chat message. It holds the versions of Foundry, the system and the active modules, the settings of the modules and what they recorded, for Image Paste & Drop the storage folder, what players may do and upload, whether the browser allows reading the clipboard, the shortcuts and the images of its chat posts. Macros call `game.modules.get("sephrals-image-paste-drop").api.saveDebugFile()`.

The file contains chat text and whispers. Check it before you share it.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Image Paste & Drop it holds:

* on how many of the last 30 days the module was used
* how often images are pasted or dropped, several images are imported at once, and images go to a scene, a tile, a journal or map pin, a token or portrait, or are shown to the players or posted in the chat
* the settings *Dialog theme*, *Allow players to use SIPD* and *Save uploads as WebP* (only the chosen option)
* where errors occur in the module code: file, line and error type, never the error message

No names, chat messages, notes, dice results or other content of the world are sent.

## Macros

`game.modules.get("sephrals-image-paste-drop").api.runSelfTest()` runs the self test (GM).

`game.modules.get("sephrals-image-paste-drop").api.saveDebugFile()` saves the debug file (GM), see [Debug file](#debug-file).

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
