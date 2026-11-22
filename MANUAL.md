# Sephral’s Image Paste & Drop Manual

This manual covers the details. For a quick overview see the [README](README.md).

## What it reacts to

* Pasted clipboard images, videos and image links outside of text inputs
* Dropped image and video files and dropped image URLs outside of text inputs
* Drops and pastes onto a token, a tile or an open actor, item or journal sheet, which change that one (see [Drop onto a token, tile or sheet](#drop-onto-a-token-tile-or-sheet))
* Several images at once: several pasted or dropped image files, several image links pasted one per line, or several links dropped together
* Two keyboard shortcuts that skip the dialog (see [Keyboard shortcuts](#keyboard-shortcuts))

While you drag an image over Foundry, a glow and a label show where it will land (see [Drop indicator](#drop-indicator)). After a paste or drop a preview dialog opens with your configured defaults. The image is uploaded when the chosen target needs a file. If the browser cannot download an image URL, the module offers to use the URL directly.

Files dropped onto the file list of Foundry's file browser are left to Foundry, which uploads them into the folder you are browsing.

## Targets

* Create a new scene and use the image as its background, with a grid that fits the map (see [Grid of new scenes](#grid-of-new-scenes))
* Replace the background of the current scene
* Replace the foreground overlay of the current scene, useful for map overlays and framing assets
* Create a centered tile in the current scene, placed at the drop point when you drop the image onto the canvas
* Create a centered tile scaled to fit the current scene
* Replace the image of the tile the image is dropped onto
* Create a journal entry with an image page
* Add an image page to the journal entry the image is dropped onto
* Create a map pin: a journal entry with the image page and a pin on the current scene that opens it
* Use the image for the selected tokens
* Use the image as actor portrait
* Use the image as image of the item the image is dropped onto
* Post the image in chat
* Show the image to connected players, to all of them or only to the ones you pick
* Open the image in a preview window only
* Upload the image into a folder of your choice (`Upload directory`)

Scene, tile and map pin targets need a viewed scene. The token target needs at least one selected token, the portrait target a selected token or a character assigned to you. Targets that are not possible right now are greyed out in the dialog. The tile image, item image and journal page targets only appear for a drop or paste onto their tile, item or journal entry, and they cannot be the default target.

## Drop onto a token, tile or sheet

Drop an image where it belongs and the dialog starts with the matching target, naming what it changes:

| Dropped onto | Preselected target |
| --- | --- |
| a token on the canvas | its token image, also when other tokens are selected. A linked token also offers the portrait of its actor. |
| a tile on the canvas (GM) | a new image for that tile. The tile keeps its place and size. |
| a map pin on the canvas (GM) | a new picture for that pin, see [Bridges to other Sephral modules](#bridges-to-other-sephral-modules). The pin keeps its place and text. |
| an open actor sheet | the portrait of that actor |
| an open item sheet | the image of that item |
| an open journal entry | a new image page at the end, which the journal then shows. The name from the dialog becomes the page name. |
| an empty spot on the canvas or anywhere else | your usual target, as before |

You can still pick another target in the dialog. A target chosen because of where the image landed is not remembered as the target to start with next time.

`Ctrl+V` works the same way: with the mouse over a token, a tile or an open sheet, the pasted image goes to that one. With the mouse over an empty spot on the canvas a paste keeps your usual target. `Alt+V` sends the copied image straight to the token, tile or sheet under the mouse without the dialog. `Alt+P` always shows the image to the players.

Only tokens, actors, items and journal entries you may change count, and only tokens you can see on the canvas. On Foundry v14 that is the level you are viewing. Tokens win over map pins, and map pins win over tiles. While the tile controls are active, tiles win first. While the notes controls are active, map pins win first. Tiles that cover half of the scene or more, such as overlays and roofs, only count while the tile controls are active, so they do not catch every drop meant for an empty spot. Sheets you can only look at, and sheets from locked compendiums, keep the usual dialog. Portraits and item images only take images, so a video dropped onto an actor or item sheet gets your usual target.

Several images at once always get the dialog for several images.

## Drop indicator

While you drag an image file or an image link over Foundry, the module shows where it will land:

* a soft pulsing glow around the token or tile under the cursor
* a glowing frame around the open actor, item or journal sheet under the cursor
* on an empty spot of the canvas, a marker where a new tile or map pin would land, or an outline of the scene when the image would become its background or foreground
* a label next to the cursor that names the target, for example *Token image* with the token's name, or your usual target with the note that the dialog can still change it

The indicator follows the dialog theme. Text selections and Foundry's own drags, such as actors from the sidebar, get no indicator, and neither do files the module does not take, such as PDFs. It disappears when you drop, leave the window or stop dragging. *Show the drop target while dragging* turns it off.

After the start, users who can upload images get a short tip about dropping onto tokens, tiles and sheets and about the two shortcuts. It comes back at every start until you click *Got it* or close it, then never again in this browser. Players only get it when the GM allows them a target for their own token or sheets.

## Grid of new scenes

A new scene gets a grid that fits the map. Where the grid comes from, in this order:

1. The file name says how big the squares are. It always wins, and then the picture is not searched.
2. The grid printed on the map, found by the module (see [Finding the printed grid](#finding-the-printed-grid)).
3. What you set in the dialog, by hand or by measuring.
4. Otherwise the scene keeps Foundry's default of 100 pixels and the grid type of your game system.

File names:

* `30x20`, `30 x 20`, `30×20` or `30_x_20`: the map is 30 squares wide and 20 squares high. The other order works too.
* `140px` or `140ppi`: one square is 140 pixels.

Squares only count when they fit the image, so a pixel size such as `4096x2048` is no grid. A name only counts with at least 5 squares on each side and at most 600 pixels per square, and aspect ratios such as `16x9` are ignored.

With *Create a new scene* as target the dialog shows the row *Grid*: the grid type (square, or hexagons with odd or even rows or columns), the size of one cell in pixels and, for square grids, how many squares the map is wide. Change one number and the other follows. The grid type starts with the default of your game system. Foundry needs at least 20 pixels per cell, a smaller size is raised to 20. An empty size keeps Foundry's default. Below the row the text tells how many squares or hexagons the map holds and where the grid comes from.

Foundry only takes whole pixels per cell. When the cells of a map are not a whole number of pixels, for example 29.5 squares across 3000 pixels, 87.47 pixels per cell or a large map shrunk on upload (see [Smaller files](#smaller-files)), the scene is made a few pixels larger or smaller so that it holds exactly that many cells. Foundry stretches the map to the scene, so its grid stays on the cells drawn into the map.

Several images as one new scene each take the grid from their own file names, or the printed grid of each map. The thumbnails show a grid from the name while that target is chosen.

### Finding the printed grid

When a map without a grid in its name becomes a new scene, the module looks at the picture itself. The search only runs while the target is *Create a new scene* (also when you switch to it in the dialog, or when a shortcut creates a scene). Token pictures, tiles, journal pages and the other targets never start it. The dialog opens at once, the search runs in the background and fills the grid row when it is done. A yellow outline of the found grid lies over the preview, so you can check it before you insert.

* The module finds square grids and hexagons with a pointy top or a flat top. It tells them apart, and picks the odd or even variant of the hexagon type that needs the smaller shift.
* It finds the size of a cell down to a fraction of a pixel and the position of the grid. Foundry's grid is then shifted onto the printed one (the scene shift of Foundry 14, the background offset of Foundry 13) and the scene is stretched by a few pixels where needed, see above.
* A map without a printed grid, or with a grid too faint to be sure about, gets the note *No printed grid found*. The module does not guess: the default grid stays and nothing is drawn over the preview. The *Measure* button is outlined then, so the way out is right there.
* The cells must be at least 20 pixels (Foundry's minimum) and the map at least 5 cells across. Grids with major lines every fifth cell are read as the finer grid when its lines are visible, else as the major one. Floors made of repeating tiles can look like a grid to the search. The preview is there for that reason.
* The search works on a copy of the picture reduced to about 1200 pixels and takes one to two seconds. Linked images that the browser cannot read pixel by pixel are not searched. Videos are not searched.
* The search needs the right to create scenes, so it only runs for GMs and Assistant GMs. The setting *Look for the grid on maps* turns the automatic search off. The buttons stay.

The buttons under the grid row:

* *Find grid* runs the search again, also when the search is off or you changed the fields.
* *Measure* is for maps without a usable printed grid. The preview becomes large, drag across a few cells from one grid corner to another (hexagons: from center to center along a row, pointy tops sideways, flat tops up and down), type how many cells the line crosses and click *Use*. When there is a printed grid near the line, the module snaps to it and corrects the size. Without one the size is the length of the line divided by the number of cells, and the corner where you started the drag is the grid position.

Typing a size or the squares across keeps the position of the printed grid but drops its exact size, another kind of grid (square, rows, columns) drops both.

Shortcuts: with *Alt+V* to the target *Create a new scene* the module waits for the search and uses the result. The search is part of the shortcut, not of the dialog, so it is skipped when the setting is off.

The self test checks that Foundry places its first square and its first hexagon where the grid fit expects them, which the shift depends on.

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

## Bridges to other Sephral modules

Where a picture fits another of Sephral’s modules that is active in the world, the dialog offers that directly. Without the other module nothing new shows up, and none of this ever opens a window by itself. The bridges are for the GM.

### Map pin pictures

Drop or paste an image onto a map pin on the canvas (a core map note, which is also what Sephral’s Map Pins draws) and the pin takes it as its picture. The pin keeps its place, text and journal link. The upload goes the same way as for tokens and tiles: the same folder, the same size and WebP choices, and a copied image address is not offered, because the canvas needs a copy of the file. Pins draw their picture in a square, so the dialog offers *Cut to a square* for pictures that are not square. A video does not work as a pin picture. The change can be undone like the picture of a token (see [Picture back](#picture-back)).

### Token Wardrobe: a picture as a new outfit

With Sephral’s Token Wardrobe active, the dialog for a picture dropped onto a token (or pasted with tokens selected, or dropped onto an actor sheet) has two more targets:

* *Add as a new outfit of …*: the picture becomes an outfit of the actor with the picture as portrait and as token image. Nothing is put on.
* *Add as a new outfit and put it on*: the same, and the token (or the actor) wears it right away.

The name from the dialog is the name of the outfit. Without a typed name the outfit is called *Outfit 1*, *Outfit 2* and so on. A video becomes the token image only. Cut to a square, removing the background and the frame work as for token pictures. For an unlinked token the outfit goes to the world actor behind it, as Token Wardrobe keeps its outfits there. These targets are never the target the dialog starts with, and they are not part of the settings of the default target. An added outfit is not covered by *Undo*, delete it in the wardrobe window.

### Handout Lens: shown pictures keep their size

When you show a picture to the players with Handout Lens active, two things change. The picture is not shrunk by the setting *Maximum image size* (a scanned handout stays readable when zoomed in, the choice *Upload as WebP* in the dialog still counts). And Foundry only opens a shown picture for the players, so the picture opens in the lens for you as well, ready to zoom, point at details and lead the players’ view.

## Tokens and portraits

The token target changes the image of every selected token, or of the token the image was dropped onto. The row *Change* decides what else gets the picture:

* *Only this token*: just the token or the selected tokens.
* *The actor's prototype token and all its tokens on this scene*: the prototype token of the actor, so the next token placed from it looks the same, and every token of that actor on the scene of the token, linked or not (the default, as the prototype token changed before this choice existed).
* *As above, and the actor portrait*: additionally the portrait of the actor.

The last choice is kept per user and preselected the next time. The setting *Ask what a token picture changes* hides the row when you do not want the question: the last choice then applies silently. The shortcuts never ask, they always use the last choice. Only what you own is changed (GMs everything). The size of the tokens stays the same.

*Cut to a square* (a box in the dialog, shown for pictures that are not square) saves the centered square of the picture, which is what round and square token frames show anyway. The setting *Cut token pictures to a square* ticks the box in advance and applies to the shortcuts. It is off by default because the edges of the picture are lost. PNG, JPEG and WebP are cut, animated pictures, GIF, AVIF and SVG stay as they are, as do videos. The cut happens before the upload and before shrinking and WebP conversion.

### Removing the background

*Remove the background* (a box in the dialog for the token and the portrait target) makes a plain background see-through. It works on your computer only, no picture leaves the browser and no outside service or model is used. The module looks at the edge of the picture: when one colour (or two) covers most of it, that is the background. From every edge pixel it then clears all connected pixels that are close to the background colour (a flood fill), so a hole in the figure that has the same colour stays. The edge of the cut is softened by two pixels. The slider *Tolerance* decides how far from the background colour a pixel may be and still go. A small preview with a checkerboard behind it shows the result while you move the slider.

The box is switched off, with a note, when the edge of the picture is already see-through or is not one plain colour. It is not offered for videos, GIF, SVG, animated pictures and AVIF. The work runs in chunks so the dialog stays usable, on a copy of at most 4096 pixels on the longer side. The result is saved as PNG, or as WebP with its transparency when WebP is chosen. The cut happens after the square cut and before the frame, shrinking and WebP conversion. Nothing is remembered, the box starts unticked every time, and the shortcuts never remove a background.

### Token frame

For the token target the dialog has the block *Frame*: a picker with one small live picture per style, each showing your picture in that frame, so you choose by looking. The ring is drawn into the picture before it is saved (after the cut and the background removal, before shrinking and WebP), so it needs no module on other computers. Round styles also make everything outside the circle see-through. Every style is drawn in code, there are no image files behind them.

Styles: *No frame*, *Flat ring* and *Flat square* (one plain colour), *Token ring* (a soft ring with a dark outline and a light inner edge), the metal rings *Gold*, *Silver*, *Bronze* and *Iron* (bevelled rim, a groove, an inset band in the chosen colour and an inner lip), *Studded ring* (steel with brass studs), *Gem ring* (gold with four gems in the chosen colour), *Rune ring* (dark stone with engraved runes that glow in the chosen colour), *Wooden ring* (planks with grain and nails), *Stone ring* (blocks with joints), *Laurel wreath* (leaves in the chosen colour, the gaps between them stay see-through) and *Ornate square* (a gold frame with a gem in each corner). The metal and relief styles are lit from the upper left and shade the picture a little next to the inner edge. The thumbnails keep their ring a little thicker than the slider says so details stay visible.

The colour comes from the player who owns the actor (an online player first, else the GM's own colour), from the disposition of the token (friendly, neutral, hostile, secret, the colours Foundry draws token borders in) or from a colour you pick. It is the whole ring on the flat styles and the accent on the others (inlay, gems, runes, painted stripe, leaves). The slider *Thickness* is a share of the shorter side, 2 to 12 percent. Pictures that are not square get the ring on their own shape, so cut them to a square first. The options stay collapsed until a choice is made, and the result below the original picture shows cut, background and frame together.

The setting *Frame for token pictures* preselects a frame in the dialog and also applies to the shortcuts. It is off by default. The colour source and the thickness always start with the owner colour and 5 percent. The values *round* and *square* of the first version are now the flat styles and are converted on the first start. The portrait never gets a frame.

The portrait target changes the portrait of the actors of the selected tokens. Without a selected token it changes the portrait of the character assigned to you.

## Chat posts

The chat target posts the image as a chat message from your current speaker. "Visible to" decides who sees it: your current chat mode (public, private to the GM or only you) or everyone. A blind post goes to the GM like a private one, so you can still see your own image. Click an image in the chat to open it in a larger window.

## Showing images to players

With Sephral’s Handout Lens active the picture also opens in the lens for you and keeps its size, see [Bridges to other Sephral modules](#bridges-to-other-sephral-modules).

The share target and the "Also show this image to players afterwards" option show the image in a window on the screens of connected players. Under "Show to" you can check single players. With nobody checked, all connected players see it. Without Handout Lens, players who are offline do not get the image later. With Handout Lens active, players who join later still get the last shown picture.

## Image links

Copy an image link, for example with "Copy image address" in your browser, and press `Ctrl+V` outside of text inputs. SIPD downloads the image and opens the same dialog as for a dropped image. This works for web addresses that end in an image file type (png, jpg, jpeg, gif, webp, svg, avif) and for `data:image` links. Other text is left alone. Several such links, one per line, are imported together.

Some servers do not let other sites download their images. SIPD then offers to use the URL directly. Nothing is uploaded in that case. The image stays on the other server and can change or disappear at any time.

A linked image works for journal image pages, map pins, portraits, chat posts, for showing it to players and for the preview. Scene backgrounds, tiles and tokens are drawn by the canvas, which needs the same download access. These targets stay unavailable for linked images, and so does the upload target.

## Tile position

When you drop an image onto the canvas and create a centered tile, the tile is centered on the drop point. It snaps to the grid the same way Foundry snaps dropped tiles. Hold Shift while dropping to place it without snapping. The tile always stays inside the scene.

Pasted images and tiles scaled to fit the scene are centered on the scene. A tile grid from several images is centered on the drop point or on the scene. Large images in a grid are scaled down evenly so the whole grid fits into the scene.

## Picture back

Replacing the picture of a token, tile, map pin, actor portrait or item can be undone with one click:

* The success message has an *Undo* link while it is shown.
* The token HUD and the tile HUD get a *Previous picture* button, the header of an actor or item sheet gets a *Previous picture* entry. They appear as long as a replacement of this session can be undone.
* The shortcut *Put back the previous picture* (no key by default, set one under **Configure Controls**) undoes the last replacement of this session. `game.modules.get("sephrals-image-paste-drop").api.restorePreviousPicture(uuid)` does the same for one document, without an uuid for the last replacement.

It puts back exactly what the import changed: the token or tokens, the prototype token and the portrait, depending on what the row *Change* said. The last five replacements per document are kept. They live in the memory of your browser and are gone after a reload. The uploaded file stays in the storage folder. A player can only put back what they own, and a document that was deleted meanwhile is skipped with a message.

## Smaller files

Two settings make uploads smaller before they leave your browser:

* *Shrink large images*: images whose longer side is above the chosen size (2048, 4096 or 8192 pixels) are scaled down. Off by default.
* *Save uploads as WebP*: PNG and JPEG images are converted to WebP, which is usually much smaller. *WebP quality* sets the quality (85 by default).

GIFs, SVGs and animated images are never changed, because shrinking would lose the animation or the vector graphics. When a conversion alone would not make the file smaller, the original is kept. Previews and directly used image links are not changed.

When an upload would be shrunk or converted, the import dialog shows a checkbox such as *Save optimized: 2048 x 1024, WebP*. It names the new size, the new format or both, and it is checked by default, so the settings apply. Uncheck it to upload this one image in its original size and format. The settings stay as they are and the next import uses them again. For a conversion alone the hint below the checkbox says that it only happens when the file gets smaller. The checkbox only appears for targets that upload a file, not for `Preview only`.

The dialog for several images has one checkbox for all of them. Its label names the size limit and the target format, its hint says how many of the images are affected, and each affected thumbnail shows its new size or format. Unchecked, every image of this batch is uploaded as it is.

Scenes and tiles created from a shrunk image use its new size.

*Upload as WebP* is a checkbox of its own for every image that can be converted (PNG, JPEG and other still pictures, not videos, GIF, SVG, animated pictures or files that are WebP already). The line below it shows the size of the file and, a moment after the dialog opens, what it would be as WebP, for example *8.2 MB, as WebP about 0.9 MB*. The browser really encodes the picture with the chosen quality (and the size limit, if one is set) to find out, nothing is stored. Pictures above about 48 megapixels are not encoded, the line then shows the size of the file only, and so does a browser that cannot write WebP. The checkbox starts ticked when *Save uploads as WebP* is on and applies to this import only. The size setting keeps its own checkbox *Save optimized*.

## Keyboard shortcuts

Two shortcuts skip the dialog:

| Shortcut | What it does |
| --- | --- |
| `Alt+V` | Sends the copied image to the token, tile or sheet under the mouse, else to the target the dialog would preselect, with the dialog's defaults |
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
| Item image (drop onto an item sheet) | Upload Files |
| Image page in an open journal entry | Upload Files. The player must own the journal entry. |

Players only change tokens and portraits of actors they own, and only items and journal entries they own. Tokens of other actors are left alone, even when they are selected or the image is dropped onto them. Replacing the image of a tile stays GM only.

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
* whether the printed grid of a map is searched when it becomes a new scene
* whether the import window asks what a token picture changes, whether token pictures are cut to a square, and which frame token pictures get
* whether the drop target is shown while dragging
* the default target
* whether the last successful target is reused automatically (for single images and for batches separately)
* whether player sharing is preselected
* whether newly created scenes are activated by default
* whether newly created scenes appear in the navigation by default
* whether large images are shrunk before the upload, and to which size
* whether uploads are saved as WebP, and in which quality

World settings for the GM: player access, additional player targets and the storage folder.

The gear in the title bar of the import window closes it and opens these settings.

*Run self test* (GM) checks the file picker, the storage folder, the targets, the grid placement, WebP in your browser and whether players may upload files. Run it after every Foundry update. When a newer Foundry than the tested one is installed, the GM gets a notice once.

*Save debug file* (GM) saves a file for bug reports, see [Debug file](#debug-file).

## Debug file

For bug reports, the GM saves one file about all of Sephral’s modules in this world: `Save debug file` in the module settings, or `Save Debug File (Sephral’s Modules)` in the context menu of a chat message. It holds the versions of Foundry, the system and the active modules, the settings of the modules and what they recorded, for Image Paste & Drop the storage folder, what players may do and upload, whether the browser allows reading the clipboard, the shortcuts and the images of its chat posts. Macros call `game.modules.get("sephrals-image-paste-drop").api.saveDebugFile()`.

The file contains chat text and whispers. Check it before you share it.

## Sephral’s Modules

The first button in the module settings, *Sephral’s Modules* (GMs only), opens one window for all of Sephral's modules in the world: the version, self test, settings, manual and demo video of each, a button that switches on an installed module that is off (Foundry then reloads the world for everyone), and the debug file. Below, *More from Sephral* lists other modules that fit the game system of the world, shown only after a click, each with its demo video and an *Install* button. Foundry installs modules only on its setup screen, so the button copies the module's link (manifest URL) and shows the steps with a short clip. When the GM launches the world again, the window opens once with the new module and its *Enable* button. The list is part of the module. Only a video you start is loaded, from the module page on GitHub. If the GM agreed to the usage statistics, the window also counts how it is used: opened, the other modules shown, a video or install link of one of them, a module installed or switched on from it. It never records which module.

## First hint

A GM who has never imported anything in this browser gets one short notification once per world after the start, for example *Paste a picture with Alt + V or drop it on the map to make a scene, tile or token.* It does not come again, not after the first import either, and it never opens a window or writes to the chat. The state is the hidden world setting `firstHint`.

## Usage statistics

The module can take part in a small usage report shared by all of Sephral’s modules. Nothing is counted or sent until the GM agrees: shortly after the world starts, the active GM is asked, and the question comes back at every start until there is an answer. The answer counts for all of Sephral’s modules in the world. *Share usage statistics* in the module settings turns the report on or off at any time, and *Manage statistics* below it shows what the report contains right now.

With the GM’s consent only the active GM’s browser counts, and it sends at most one report a day. The counts are kept in a hidden world setting, so all browsers and computers of the GM count together, and turning the statistics off deletes them. A copy of a world gets its own world ID. The question lists everything the report contains, from the Foundry version to a random world ID. For Image Paste & Drop it holds:

* on how many of the last 30 days the module was used
* how often images are pasted or dropped, several images are imported at once, and images go to a scene, a tile, a journal or map pin, a token or portrait, an item, or are shown to the players or posted in the chat
* how often an image goes to the token, tile or sheet it was dropped or pasted onto, and how often the drop indicator appears
* how often a printed grid is found on a map or not found, how often a grid is measured by hand, how many scenes get a grid fitted to the map, how many keep the found grid unchanged, how many get another grid after one was found (typed, measured or another grid type) and how many get a hexagon grid
* how often a background is removed from a picture, and how often a frame is drawn into a token picture
* how often an image becomes the picture of a map pin, a new outfit (also how often one is put on right away) and how often a shown picture is handled for Handout Lens
* how often a replaced picture is put back, and how often *Upload as WebP* is ticked in the dialog while the setting is off
* the settings *Dialog theme*, *Allow players to use SIPD*, *Save uploads as WebP*, *Show the drop target while dragging* and *Look for the grid on maps* (only the chosen option)
* where errors occur in the module code: file, line, error type and whether the error arose in the module itself, in Foundry, in the game system or in another module, never the error message or the name of another module

No names, chat messages, notes, dice results or other content of the world are sent.

## Macros

`game.modules.get("sephrals-image-paste-drop").api.runSelfTest()` runs the self test (GM).

`game.modules.get("sephrals-image-paste-drop").api.saveDebugFile()` saves the debug file (GM), see [Debug file](#debug-file).

`game.modules.get("sephrals-image-paste-drop").api.samples()` lists sample windows: the import dialogs (new scene with the grid from the file name, a found printed grid, no grid found, token and portrait pictures with background removal, square cut and frames, linked pictures, several pictures at once) and the hints, over pictures made up in memory. A sample uploads nothing, creates and changes nothing and saves no setting, Insert only says that it does nothing. Translators and testers use them to see every text without pasting a picture first.

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
