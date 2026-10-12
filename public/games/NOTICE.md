# Third-party games

Both are vendored rather than linked so they keep working without a
third party's frame policy, and so nothing here depends on a site
staying up. Each keeps its own LICENSE file alongside it.

## 2048 — `./2048/`
Gabriele Cirulli, MIT. https://github.com/gabrielecirulli/2048
Unmodified except for the removal of `meta/` (social images) and the
Rakefile, neither of which the game needs to run.

## Racer — `./racer/`
Jake Gordon, MIT. https://github.com/jakesgordon/javascript-racer
Modified: the soundtrack is removed, because the room already has
ambient audio and two tracks fighting is worse than one. `music/` is
deleted, the `<audio>` sources are gone from `v4.final.html`, and
`Dom.playMusic` in `common.js` returns early when there is no source
rather than calling play() on an empty element. Both edits are marked
in the files.
