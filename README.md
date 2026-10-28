# Godspeed

Static site for the Christian band Godspeed. Stream and download both albums: *Higher Calling* (2002, Bee Team Records) and *Ø > U R*.

## Editing tracks

All album and track info lives in [`tracks.json`](tracks.json). To rename a song, change its `"title"`. To reorder songs, move its line. Each `"file"` must match an MP3 in `audio/` (without the `.mp3`). An album's optional `"credits"` lines show under its track list.

Track titles and order for both albums are confirmed from the CDs.

After changing titles or order, run `python3 build.py` so the MP3 tags (title, track number) match.

## Downloads

Each song has its own download button. The "Download album" button and the "Download every song" link build a zip in the visitor's browser from the MP3s in `audio/`, named and numbered from `tracks.json` (for example `01 - I Can't Stop.mp3`). There are no zip files to rebuild or commit, and they always match the site. (A committed all-songs zip wouldn't work anyway: at about 124 MB it's over GitHub's 100 MB file limit.)

## Replacing the audio with new WAVs

You need Python 3 and ffmpeg (macOS: `brew install ffmpeg`).

1. Put all the new WAVs in one folder, e.g. `~/Desktop/godspeed-wavs`. Name each one after its song. Any of these work for "I Can't Stop": `I Can't Stop.wav`, `01 - I Can't Stop.wav`, `iCantStop.wav`. Case, spaces and punctuation don't matter.
2. From this folder, run:

   ```sh
   python3 build.py --wav ~/Desktop/godspeed-wavs
   ```

   It re-encodes every song to `audio/` at 192 kbps, writes the tags, and updates each song's length in `tracks.json`. If any song has no WAV, or a WAV doesn't match a song, it stops and changes nothing, and tells you which.
3. Check the result: `python3 -m http.server 8000`, open http://localhost:8000, play a few songs.
4. Publish:

   ```sh
   git add audio tracks.json
   git commit -m "Replace audio with new WAV masters"
   git push
   ```

   GitHub Pages redeploys in a minute or two.

The folder must have a WAV for every song on both albums. To replace only some songs, encode those by hand with `ffmpeg -i song.wav -ar 44100 -c:a libmp3lame -b:a 192k audio/<file>.mp3`, then run `python3 build.py` (no `--wav`) to tag them; set their `"length"` in `tracks.json` yourself. The WAVs themselves are never committed (see `.gitignore`).

## Cover art

Covers in `covers/` are 1200×1200 JPEGs. `covers/HigherCalling.png` is the full-size master for the Higher Calling cover and isn't loaded by the site.

## Local preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.
