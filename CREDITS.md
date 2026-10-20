# BACKBEAT prototype: credits & licenses

## Recorded drum kit: Virtuosity Drums (CC0 1.0)
- **Source:** Versilian Studios LLC & Karoryfer Lecolds, *Virtuosity Drums*. Performed by Austin McMahon, recorded at Virtuosity Musical Instruments, Boston, MA.
  - Product page: https://versilian-studios.com/virtuosity-drums/
  - Repository (samples were taken from here): https://github.com/sfzinstruments/virtuosity_drums (its LICENSE file is "CC0 1.0 Universal")
  - Also listed as "Free (Public Domain)" / CC0 on KVR: https://www.kvraudio.com/product/virtuosity-drums-by-versilian-studios
- **License: Creative Commons Zero (CC0 1.0 Universal).** The publisher's statement: "released under a Creative Commons 0 (CC0) license … may use this product for any purpose, commercial or not, without the need for attribution." Checked on 2026-10-20 against the KVR listing and the repo's LICENSE file.
- **What we changed (provenance, as the authors ask):** we picked a subset (kick snares-off 4 velocity layers × 3 round robins; snare centre 5 layers × 2; ghost ×3; rimshot ×3; hi-hat closed 4×2 and open 3×2; high and low tom 3×2 (the low tom doubles as the floor tom); crash 3×2; ride 3×2). For each sample we mixed the close mic (kick/snare) with the overhead and room mics, trimmed and faded it, and encoded it as 44.1 kHz stereo Ogg Vorbis (q4) and AAC .m4a (128k, for iOS Safari). That's 66 samples, about 1.6 MB per format, in `public/kit/`.

## Music and SFX
- "Neon Backline", "Ironclad Pulse", and "Thunderline 160" are original procedural compositions by the BACKBEAT team (WebAudio synths, a generated-IR reverb, and bus compression). No third-party music. No properly licensed recorded backing stems were added this pass.
- The UI and judgement sounds are synthesized in code.

## Code
three.js (MIT), Vite (MIT), TypeScript (Apache-2.0), Playwright (Apache-2.0, test only).

None of the names, art, UI copy, or music come from Magic Tiles or any other game.
