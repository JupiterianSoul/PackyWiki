# Background music

The lounge of a card shop after hours: slow, smoky, jazz. Played in
rotation by src/ui/music.js. Nothing here is generated; these are the
artists' own recordings, found by tools/find-music.mjs, and the
attributions below are the price of the ride.

- `late-jazz-piano-wav.mp3` - "Late Jazz Piano.wav" by szegvari.
  CC0 1.0. <https://creativecommons.org/publicdomain/zero/1.0/>
  Source: Openverse, <https://freesound.org/people/szegvari/sounds/570347>
- `kind-0f-modal-60bpm-aif.mp3` - "Kind 0f modal 60bpm.aif" by MieliTietty.
  CC0 1.0. <https://creativecommons.org/publicdomain/zero/1.0/>
  Source: Openverse, <https://freesound.org/people/MieliTietty/sounds/521269>
- `jazzy-vibes-81-jazz-piano-medley.mp3` - "Jazzy Vibes #81 - Jazz Piano Medley" by Tri-Tachyon.
  BY 4.0. <https://creativecommons.org/licenses/by/4.0/>
  Source: Openverse, <https://freesound.org/people/Tri-Tachyon/sounds/541689>
- `blues-impro.mp3` - "Blues Impro" by kasa90.
  CC0 1.0. <https://creativecommons.org/publicdomain/zero/1.0/>
  Source: Openverse, <https://freesound.org/people/kasa90/sounds/162184>

## Adding more

Drop an `.ogg` or `.mp3` in this folder and it joins the rotation on the
next build; nothing else needs changing. Add the artist and the licence
here at the same time. Only recordings that are public domain or licensed
for reuse with credit belong in this folder. `tools/find-music.mjs` can
also be run again from the Actions tab to replace the whole rotation.
