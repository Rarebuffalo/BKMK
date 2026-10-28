# Product demo video

| File | What it is |
|---|---|
| `artifacts/bkmk-demo.mp4` | The ~29 s teaser |
| `artifacts/bkmk-demo-thumbnail.png` | The Bookmark DNA reveal at 15.6 s |
| `artifacts/bkmk-demo-poster.png` | The closing brand frame at 26.8 s |

Rebuild everything with `scripts/demo-video/build.sh`.

## What the video shows, and the data behind it

All UI footage is the **real BKMK.exe frontend**, driven by Playwright and captured frame by frame. Nothing was mocked up or screenshotted from a design file.

**Demo mode, not a live scan.** This build has no real X developer credentials, so a live scan of @krishnassinghh wasn't possible. The video uses the app's built-in, labelled **demo mode**, with `krishnassinghh` as the demo identity:

- The frontend ran with no backend behind it. The landing page itself states: "Live X scanning isn't enabled on this server — scans use sample data."
- The DEMO tags, the "Demo identity — not looked up on X" note, the dashboard's "synthetic sample bookmarks" banner and the share card's "SAMPLE DATA · PROTOTYPE" stamp are all left visible.
- Every number on screen is what the app computed for that demo identity, unedited: **The Curator · 572 bookmarks · 9 topic clusters · Curation Score 84/100 · 7 of 8 badges**. None of it was retrieved from X.
- The landing-page preview card is the app's fixed sample card ("The Builder 79"), personalised only with the typed handle. It's on screen briefly and labelled "sample card" in the UI.

No tokens, cookies, credentials or real bookmark content appear anywhere. The only prototype control hidden from the footage is the "Demo lab" button (a reviewer tool).

## Specifications (checked with ffprobe and ffmpeg on the exported file)

| Property | Value |
|---|---|
| Container | MP4 with faststart |
| Video | H.264 High, 1920×1080, 30 fps constant, yuv420p, BT.709 limited range |
| Audio | AAC-LC, 48 kHz stereo, 192 kb/s |
| Duration | 29.17 s (video and audio streams within 6 ms of each other) |
| Size | 11.6 MB (about 3.2 Mb/s) |
| Loudness | −14.0 LUFS integrated, −1.4 dBTP peak (no clipping) |

**Checks run on the exported file:**

- Decodes without errors.
- Black frames: only the intended 0.2 s fade-in.
- Freeze: only the intended 1.5 s hold on the closing frame.
- Audio fades to about −45 dB by the last frame.
- Frames sampled through every section were inspected visually.

**Capture resolution.** The app was captured at a 1280×720 CSS viewport through the Chrome DevTools screencast (smooth, change-driven frames, ~60 fps). Frames were then upscaled to 1080p with Lanczos and light sharpening.

Native 1080p capture with a screenshot loop was tested and topped out at 9–12 fps, which made the scan and reveal animations visibly choppy. The 1280-wide viewport was chosen on purpose: the UI fills the frame with large text, which stays readable in small players.

## Edit (scripts/demo-video/edit.py)

| Time | Section | Treatment |
|---|---|---|
| 0.0–3.2 | Boot intro (HTML using the app's fonts and colours) | CRT power-on of the wordmark, "YOU SAVED IT FOR A REASON." |
| 2.9–5.9 | Landing page, typing `krishnassinghh` | Typing at 1.45×, gentle push-in on the input |
| 5.6–7.0 | Confirm and connect (demo) | 2× |
| 6.7–13.0 | Scan: grid fills, topics colour in, badges unlock | 1.7×. Caption "SCAN YOUR SAVED WORLD" |
| 12.7–16.5 | Bookmark DNA reveal | 1×, 7% push-in. Caption "DISCOVER YOUR BOOKMARK DNA". The music drop lands on the cut. |
| 16.2–17.7 | Score, interests, badges | 1.3×. Caption "UNLOCK YOUR BADGES" |
| 17.4–21.4 | Dashboard, then topics, then library search for "agent" | Real time, with typing at 1.45× |
| 21.1–24.9 | Share page, Collector ID card, PNG download | 1.2×. Caption "SHARE YOUR RESULT" |
| 24.6–29.2 | Outro: "YOUR SAVED INTERNET, DECODED." and the "Scan your Bookmark DNA" button | Hold, then fade out |

- Sections are joined with 0.3 s crossfades.
- Only waiting and typing stretches are sped up, never the whole video.
- No URL is shown, because no public deployment exists yet.

## Music and sound (scripts/demo-video/music.py)

- **Original, generated in code.** The whole soundtrack is synthesised from scratch with numpy: band-limited additive saw and square oscillators, noise drums, an FFT-convolution reverb. No samples, loops or third-party audio are used, so there are no licensing restrictions.
- **Arrangement.** Synthwave at 113.4 BPM. The tempo was chosen so that six bars land exactly on the DNA reveal cut (12.7 s):
  - pad intro, then kick and bass under the landing page;
  - a 16th-note arpeggio that opens up through the scan, with a riser and snare roll;
  - a drop with a crash, lead hook and full groove on the reveal;
  - a resolving chord under the outro.
- **Sound effects,** each placed from the recorder's step markers mapped through the edit's speed changes:
  - boot blips;
  - keyboard ticks per typed character;
  - button clicks;
  - scan page ticks;
  - a chime for each badge unlock;
  - an accent on "Report ready";
  - a chime when the PNG downloads.
- **Mastering.** EBU R128 loudness normalisation to −14 LUFS with a true-peak limiter.

## How it was made

1. Started a frontend instance with no backend (`BKMK_API_URL=http://127.0.0.1:9 npx vite --port 5175`), so the app runs in its honest demo state.
2. `record.mjs` drove the UI with Playwright (system Chromium) while recording timestamped CDP screencast frames and a marker at each step.
3. `build.sh` turned the frames into a constant-frame-rate 1080p master, then ran `edit.py` (cuts, ramps, push-ins, captions, crossfades), then `music.py` (the score, synced to `timeline.json`), then the final mux and the thumbnail and poster extraction.

Large intermediates (frames, master, stems) are git-ignored inside `scripts/demo-video/`.

## Found while recording

The first take exposed a real bug: typing quickly in the library search dropped characters ("agent" became "gnt"). The input was bound directly to the URL, which updates asynchronously.

This was fixed in `BookmarkBrowser.tsx`. The fix is covered by a new Vitest test and an E2E step that types key by key. The video was re-recorded on the fixed build.

## Limitations

- Demo data only. Re-record with a real account once X credentials are configured: run `record.mjs` against a live server and adjust the connect steps.
- Captured at 720p CSS resolution and upscaled to 1080p (see above).
