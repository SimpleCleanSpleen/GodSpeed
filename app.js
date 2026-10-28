(() => {
  const $ = (id) => document.getElementById(id);
  const audio = $("audio");
  const player = $("player");
  const seek = $("seek");

  let data;
  let viewIndex = 0;          // album shown on the page
  let queue = null;           // { album, index } currently loaded in the player
  let seeking = false;

  const ICONS = `
    <svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
    <svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
    <svg class="i-eq" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="4" height="14"/><rect x="10" y="3" width="4" height="17"/><rect x="16" y="8" width="4" height="12"/></svg>`;
  const DOWNLOAD = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4h2v9.2l3.3-3.3 1.4 1.4L12 17l-5.7-5.7 1.4-1.4 3.3 3.3zM5 19h14v2H5z"/></svg>`;

  const fmt = (s) => {
    if (!isFinite(s)) return "0:00";
    s = Math.floor(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const src = (t) => `audio/${t.file}.mp3`;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const safeName = (s) => s.replace(/:/g, "-").replace(/[\\/*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  const pad = (n) => String(n).padStart(2, "0");
  // ASCII file names for zips: some browsers and older unzip tools mangle "Ø" etc.
  const asciiName = (s) => safeName(s.replace(/Ø/g, "O").replace(/ø/g, "o")
    .normalize("NFKD").replace(/[^\x20-\x7e]/g, ""));

  async function init() {
    data = await (await fetch("tracks.json", { cache: "no-cache" })).json();

    $("albumSwitch").innerHTML = data.albums
      .map((a, i) => `<button type="button" data-i="${i}" aria-pressed="false">${esc(a.title)}</button>`)
      .join("");
    $("albumSwitch").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) showAlbum(+b.dataset.i, true);
    });

    const fromHash = data.albums.findIndex((a) => `#${a.id}` === location.hash);
    showAlbum(fromHash >= 0 ? fromHash : 0, false);
    requestAnimationFrame(() => requestAnimationFrame(() =>
      document.documentElement.classList.remove("no-anim")));

    window.addEventListener("hashchange", () => {
      const i = data.albums.findIndex((a) => `#${a.id}` === location.hash);
      if (i >= 0 && i !== viewIndex) showAlbum(i, true);
    });
  }

  function showAlbum(i, animate) {
    viewIndex = i;
    const a = data.albums[i];
    document.documentElement.dataset.theme = a.theme;
    if (location.hash !== `#${a.id}`) history.replaceState(null, "", `#${a.id}`);
    document.title = `${a.title} · ${data.artist}`;

    document.querySelectorAll("#albumSwitch button").forEach((b) =>
      b.setAttribute("aria-pressed", String(+b.dataset.i === i)));

    $("cover").src = a.cover;
    $("cover").alt = `${a.title} album cover`;
    $("albumTitle").textContent = a.title;
    $("albumMeta").textContent = [data.artist, a.year, a.label].filter(Boolean).join(" · ");
    $("credits").textContent = (a.credits || []).join(" · ");
    $("credits").hidden = !a.credits?.length;

    $("tracks").innerHTML = a.tracks.map((t, n) => `
      <li class="track" data-n="${n}">
        <button class="track-play-btn" type="button" aria-label="Play ${esc(t.title)}">
          <span class="track-num"><span>${n + 1}</span>${ICONS}</span>
          <span class="track-title">${esc(t.title)}</span>
        </button>
        <span class="track-dur">${t.length || ""}</span>
        <a class="download" href="${src(t)}" download="${esc(safeName(`${data.artist} - ${t.title}`))}.mp3"
           aria-label="Download ${esc(t.title)}" title="Download MP3">${DOWNLOAD}</a>
      </li>`).join("");

    if (animate) {
      const el = document.querySelector(".album");
      el.classList.remove("swap");
      void el.offsetWidth;
      el.classList.add("swap");
    }
    markCurrent();
  }

  $("tracks").addEventListener("click", (e) => {
    const b = e.target.closest(".track-play-btn");
    if (!b) return;
    const n = +b.closest(".track").dataset.n;
    if (queue && queue.album === viewIndex && queue.index === n) togglePlay();
    else play(viewIndex, n);
  });

  $("playAlbum").addEventListener("click", () => play(viewIndex, 0));

  // Zips are built in the browser from the MP3s and tracks.json, so they always
  // match the current track order and titles and never need rebuilding.
  const albumEntries = (a, dir) => a.tracks.map((t, n) => ({
    name: `${dir}/${pad(n + 1)} - ${asciiName(t.title)}.mp3`, url: src(t) }));

  $("downloadAlbum").addEventListener("click", (e) => {
    const a = data.albums[viewIndex];
    const name = asciiName(`${data.artist} - ${a.title}`);
    downloadZip(e.currentTarget, `${name}.zip`, albumEntries(a, name));
  });

  $("downloadAll").addEventListener("click", (e) => {
    const root = asciiName(data.artist);
    const entries = data.albums.flatMap((a) => albumEntries(a, `${root}/${asciiName(a.title)}`));
    downloadZip(e.currentTarget, `${root} - All Songs.zip`, entries);
  });

  async function downloadZip(btn, filename, entries) {
    if (btn.disabled) return;
    const label = btn.querySelector("span") || btn;
    const text = label.textContent;
    btn.disabled = true;
    try {
      const files = [];
      for (const [i, f] of entries.entries()) {
        label.textContent = `Preparing ${i + 1} of ${entries.length}…`;
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`${f.url}: ${res.status}`);
        files.push({ name: f.name, data: new Uint8Array(await res.arrayBuffer()) });
      }
      const url = URL.createObjectURL(zip(files));
      const link = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      label.textContent = text;
    } catch (err) {
      console.error(err);
      label.textContent = "Download failed. Tap to retry.";
    } finally {
      btn.disabled = false;
    }
  }

  const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  // Minimal stored (uncompressed) zip; MP3s don't compress anyway.
  function zip(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const header = (sig, size) => {
      const v = new DataView(new ArrayBuffer(size));
      v.setUint32(0, sig, true);
      return v;
    };
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const local = header(0x04034b50, 30);
      // version 2.0, UTF-8 names, stored
      [[4, 20], [6, 0x0800], [8, 0], [10, time], [12, date]].forEach(([o, x]) => local.setUint16(o, x, true));
      local.setUint32(14, crc, true);
      local.setUint32(18, f.data.length, true);
      local.setUint32(22, f.data.length, true);
      local.setUint16(26, name.length, true);
      parts.push(local, name, f.data);

      const cd = header(0x02014b50, 46);
      [[4, 20], [6, 20], [8, 0x0800], [10, 0], [12, time], [14, date]].forEach(([o, x]) => cd.setUint16(o, x, true));
      cd.setUint32(16, crc, true);
      cd.setUint32(20, f.data.length, true);
      cd.setUint32(24, f.data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(cd, name);
      offset += 30 + name.length + f.data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
    const end = header(0x06054b50, 22);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  function play(albumIdx, n) {
    const a = data.albums[albumIdx];
    const t = a.tracks[n];
    queue = { album: albumIdx, index: n };
    audio.src = src(t);
    audio.play().catch(() => {});

    player.hidden = false;
    $("playerCover").src = a.cover;
    $("playerTitle").textContent = t.title;
    $("playerAlbum").textContent = a.title;
    seek.value = 0;
    seek.style.setProperty("--pct", "0%");
    $("curTime").textContent = "0:00";
    $("durTime").textContent = t.length || "0:00";

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: data.artist,
        album: a.title,
        artwork: [{ src: new URL(a.cover, location.href).href, sizes: "1200x1200", type: "image/jpeg" }],
      });
    }
    markCurrent();
  }

  function togglePlay() {
    if (!queue) return play(viewIndex, 0);
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  }

  function step(dir) {
    if (!queue) return;
    const a = data.albums[queue.album];
    if (dir < 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
    const n = queue.index + dir;
    if (n >= 0 && n < a.tracks.length) play(queue.album, n);
  }

  function markCurrent() {
    const playing = !audio.paused;
    player.classList.toggle("playing", playing);
    $("playBtn").setAttribute("aria-label", playing ? "Pause" : "Play");
    document.querySelectorAll(".track").forEach((li) => {
      const cur = queue && queue.album === viewIndex && queue.index === +li.dataset.n;
      li.classList.toggle("current", !!cur);
      li.classList.toggle("playing", !!cur && playing);
    });
  }

  $("playBtn").addEventListener("click", togglePlay);
  $("prevBtn").addEventListener("click", () => step(-1));
  $("nextBtn").addEventListener("click", () => step(1));

  audio.addEventListener("play", markCurrent);
  audio.addEventListener("pause", markCurrent);
  audio.addEventListener("ended", () => {
    const a = data.albums[queue.album];
    if (queue.index + 1 < a.tracks.length) play(queue.album, queue.index + 1);
    else markCurrent();
  });
  audio.addEventListener("loadedmetadata", () => { $("durTime").textContent = fmt(audio.duration); });
  audio.addEventListener("timeupdate", () => {
    if (seeking || !audio.duration) return;
    const p = audio.currentTime / audio.duration;
    seek.value = Math.round(p * 1000);
    seek.style.setProperty("--pct", `${p * 100}%`);
    $("curTime").textContent = fmt(audio.currentTime);
  });

  seek.addEventListener("input", () => {
    seeking = true;
    seek.style.setProperty("--pct", `${seek.value / 10}%`);
    $("curTime").textContent = fmt((seek.value / 1000) * (audio.duration || 0));
  });
  seek.addEventListener("change", () => {
    if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
    seeking = false;
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
  }

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || !queue) return;
    if (e.target.closest("button, a, input, textarea")) return;
    e.preventDefault();
    togglePlay();
  });

  init().catch((err) => {
    $("albumTitle").textContent = "Couldn't load the track list.";
    console.error(err);
  });
})();
