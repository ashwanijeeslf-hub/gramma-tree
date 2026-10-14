# Gramma-Tree: The Sentence Builder

A free English sentence-building game for children aged 6 to 10. Tap the fruits to put the
words in the right order. 3 levels, 30 sentences, stars, sounds, and saved progress for each child.

It is a plain static website: no server, no database, nothing to install, and it needs
nothing from the internet once the files are on a web host.

## What is in this folder

| File | Purpose |
| --- | --- |
| `index.html` | The page |
| `styles.css` | The game's styles and animations (also loads the Fredoka font) |
| `app.js` | All game logic: sentences, sounds, saving, score screen |
| `tailwind.css` | The few Tailwind utility classes the page uses (generated, see below) |
| `fonts/` | Fredoka font files and its licence (`OFL.txt`) |
| `favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `manifest.webmanifest` | Icons and "Add to Home screen" support |
| `tools/` | Settings used to rebuild `tailwind.css` (not needed to run the game) |

## Try it on your own computer

Open a terminal in this folder and run:

    python -m http.server 8000

Then open <http://localhost:8000>. (Opening `index.html` by double-click also works in most browsers.)

## Put it online (free)

Upload this whole folder, keeping everything in the same place:

- **Netlify Drop:** drag the folder onto <https://app.netlify.com/drop>.
- **GitHub Pages:** create a public repository, upload the files, then Settings > Pages >
  "Deploy from a branch" > `main` / `(root)`.

All links inside the game are relative, so it works at the site root or in a sub-folder
such as `https://name.github.io/gramma-tree/`.

## Saved data and privacy

Names, progress and scores are saved only in each child's own browser (`localStorage`, key
`gramma-tree-save-v1`). Nothing is sent anywhere. Saves belong to the web address, so changing
the site's address means children start again, and a different device or browser has its own saves.

## Changing the sentences

Edit `GAME_DATA` near the top of `app.js`. Each level has a `wordRange`; the game prints a
console warning if a sentence has too many or too few words for its level.

## Rebuilding `tailwind.css`

Only needed if you add new Tailwind classes to `index.html` or `app.js`. Requires Node.js.
Run from this folder:

    npx tailwindcss@3.4.16 -c tools/tailwind.config.js -i tools/tailwind-input.css -o tailwind.css --minify

## Credits

Font: [Fredoka](https://fonts.google.com/specimen/Fredoka), SIL Open Font License 1.1 (see `fonts/OFL.txt`).
