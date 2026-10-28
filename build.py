#!/usr/bin/env python3
"""Rebuild the site's audio from tracks.json.

    python3 build.py                 # retag the MP3s in audio/ and refresh lengths
    python3 build.py --wav ~/WAVs    # re-encode every song from a folder of WAVs first

tracks.json is the source of truth. For every track this script:
  - (with --wav) encodes the matching WAV to audio/<file>.mp3 at 192 kbps,
  - writes ID3 tags (title, artist, album, track n/total, year) from tracks.json,
  - sets the track's "length" in tracks.json from the new audio (when re-encoded).

The album and all-songs zips are built in the browser from these MP3s and
tracks.json, so there are no zip files to rebuild or commit.

A WAV matches a track if its name, ignoring case, spaces and punctuation,
equals the track's "file" value or its title (e.g. iCantStop.wav,
"I Can't Stop.wav" and "01 - I Can't Stop.wav" all match "I Can't Stop").
Nothing is changed if any track has no WAV or a WAV matches nothing.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
AUDIO = ROOT / "audio"
TRACKS = ROOT / "tracks.json"
BITRATE = "192k"


def key(s):
    s = re.sub(r"^\d{1,2}\s*[-._)]\s*", "", s)  # drop a leading "01 - " track number
    return re.sub(r"[^a-z0-9]", "", s.lower())


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True).stdout
    s = round(float(out))
    return f"{s // 60}:{s % 60:02d}"


def match_wavs(folder, albums):
    wavs = {}
    for p in sorted(folder.iterdir()):
        if p.suffix.lower() == ".wav":
            wavs.setdefault(key(p.stem), []).append(p)
    found, problems, used = {}, [], set()
    for a in albums:
        for t in a["tracks"]:
            hits = {p for k in {key(t["file"]), key(t["title"])} for p in wavs.get(k, [])}
            if len(hits) == 1:
                found[t["file"]] = hits.pop()
                used.add(found[t["file"]])
            elif not hits:
                problems.append(f'no WAV for "{t["title"]}" (expected {t["file"]}.wav)')
            else:
                problems.append(f'several WAVs match "{t["title"]}": ' + ", ".join(p.name for p in sorted(hits)))
    for p in sorted(p for ps in wavs.values() for p in ps if p not in used):
        problems.append(f"{p.name} does not match any track")
    return found, problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--wav", type=Path, help="folder of replacement WAV files")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg is not installed (macOS: brew install ffmpeg)")

    data = json.loads(TRACKS.read_text(encoding="utf-8"))
    albums = data["albums"]

    wavs = {}
    if args.wav:
        if not args.wav.is_dir():
            sys.exit(f"{args.wav} is not a folder")
        wavs, problems = match_wavs(args.wav, albums)
        if problems:
            sys.exit("Nothing was changed:\n  " + "\n  ".join(problems))

    missing = [t["file"] for a in albums for t in a["tracks"]
               if t["file"] not in wavs and not (AUDIO / f'{t["file"]}.mp3').exists()]
    if missing:
        sys.exit("Missing MP3s in audio/: " + ", ".join(missing))

    with tempfile.TemporaryDirectory() as tmp:
        for a in albums:
            total = len(a["tracks"])
            for n, t in enumerate(a["tracks"], 1):
                mp3 = AUDIO / f'{t["file"]}.mp3'
                out = Path(tmp) / mp3.name
                tags = {"title": t["title"], "artist": data["artist"], "album": a["title"],
                        "track": f"{n}/{total}", "date": a.get("year")}
                meta = [x for k, v in tags.items() if v for x in ("-metadata", f"{k}={v}")]
                if t["file"] in wavs:
                    src = ["-i", str(wavs[t["file"]]), "-ar", "44100", "-c:a", "libmp3lame", "-b:a", BITRATE]
                    print(f'encode  {a["title"]} {n:02d}  {wavs[t["file"]].name} -> {mp3.name}')
                else:
                    src = ["-i", str(mp3), "-c", "copy"]
                    print(f'retag   {a["title"]} {n:02d}  {mp3.name}')
                subprocess.run(["ffmpeg", "-v", "error", "-y", *src, "-map_metadata", "-1", *meta,
                                "-id3v2_version", "3", str(out)], check=True)
                shutil.move(out, mp3)
                if t["file"] in wavs or not t.get("length"):
                    t["length"] = duration(mp3)

    text = json.dumps(data, ensure_ascii=False, indent=2)
    # Keep one track per line so tracks.json stays easy to hand-edit.
    text = re.sub(r"\{\s+(\"title\"[^{}]*?)\s+\}",
                  lambda m: "{ " + re.sub(r",\s+", ", ", m.group(1)) + " }", text)
    TRACKS.write_text(text + "\n", encoding="utf-8")
    print(f"\nDone: {sum(len(a['tracks']) for a in albums)} tracks. Review with `git diff tracks.json`, then commit and push.")


if __name__ == "__main__":
    main()
