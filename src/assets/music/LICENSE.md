# Music credits

Every track under `src/assets/music/` is a found recording, never generated.
They are picked up automatically: `src/ui/music.js` globs this folder, so a
file dropped here is in the shuffle on the next build and a file removed is
gone from it. Keep the credit for anything you add.

## Tracks

All seven are by **migfus20** on [Freesound](https://freesound.org/people/migfus20/),
kept under their original filenames so the Freesound sound id stays attached
to the file. Each is used under the licence shown on its own sound page.

Re-encoded to 96 kbps mono for the app (the originals were up to 320 kbps
stereo, seven times the size for no audible difference under game sound).
The source files are the ones linked below, not what ships here.

| File | Sound page |
| --- | --- |
| `564001__migfus20__jazz-background-music-loop.mp3` | https://freesound.org/s/564001/ |
| `564855__migfus20__emotional-piano-background-music.mp3` | https://freesound.org/s/564855/ |
| `567112__migfus20__relaxing-music.mp3` | https://freesound.org/s/567112/ |
| `578598__migfus20__glory-hotel-fixed-track-55.mp3` | https://freesound.org/s/578598/ |
| `586838__migfus20__background-music.mp3` | https://freesound.org/s/586838/ |
| `609562__migfus20__background-music.mp3` | https://freesound.org/s/609562/ |
| `723287__migfus20__relaxing-jazz-music-loop.mp3` | https://freesound.org/s/723287/ |

Credit line for a store listing or an about screen:

> Music by migfus20 (freesound.org)

## Adding a track

Drop the file in this folder, add a row above with the page it came from, and
build. Nothing else to wire up. Prefer something slow and without a strong
beat: the music sits under the game's own sounds, it does not lead them.
