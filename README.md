# Godspeed

Static site for the Christian band Godspeed. Stream and download both albums: *Higher Calling* (2002, Bee Team Records) and *Ø > U R*.

## Editing tracks

All album and track info lives in [`tracks.json`](tracks.json). To rename a song, change its `"title"`. To reorder songs, move its line. Each `"file"` must match an MP3 in `audio/` (without the `.mp3`).

The track titles and order for **Ø > U R** are confirmed from the CD liner notes.

## Re-encoding audio

The WAV masters are not committed (see `.gitignore`). To regenerate an MP3:

```sh
ffmpeg -i song.wav -ar 44100 -c:a libmp3lame -b:a 192k audio/song.mp3
```

## Local preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.
