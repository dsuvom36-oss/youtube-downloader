const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const youtubedl = require("yt-dlp-exec");

const app = express();

// ✅ Allow your GitHub Pages frontend
app.use(cors({ origin: "https://dsuvom36-oss.github.io" }));
app.use(express.json());

// ----------------- API: Info -----------------
app.get("/api/info", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true
    });

    res.json({
      title: info.title,
      channel: info.channel,
      duration: info.duration,
      thumbnail: info.thumbnail,
      formats: info.formats.map(f => ({
        format_id: f.format_id,
        resolution: f.resolution || (f.height ? `${f.height}p` : "audio"),
        ext: f.ext,
        filesize: f.filesize
          ? (f.filesize / 1024 / 1024).toFixed(1) + " MB"
          : "N/A"
      }))
    });
  } catch (err) {
    console.error("❌ yt-dlp-exec error:", err);
    res.status(500).json({ error: "yt-dlp-exec failed", details: err.message });
  }
});

// ----------------- API: Download -----------------
app.get("/api/download", async (req, res) => {
  const url = req.query.url;
  const formatId = req.query.format_id;
  if (!url || !formatId) return res.status(400).send("Missing url or format_id");

  res.header("Content-Disposition", `attachment; filename="video.${formatId}.mp4"`);

  const proc = youtubedl.raw(url, {
    format: formatId,
    output: "-",
  });

  proc.stdout.pipe(res);
});

// ----------------- API: HLS Streaming -----------------
const HLS_ROOT = path.join(__dirname, "hls");
if (!fs.existsSync(HLS_ROOT)) fs.mkdirSync(HLS_ROOT);

app.get("/api/hls/start", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  const id = randomUUID();
  const outDir = path.join(HLS_ROOT, id);
  fs.mkdirSync(outDir);

  const playlist = "index.m3u8";
  const playlistPath = path.join(outDir, playlist);

  const args = [
    "-i", url,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-hls_time", "6",
    "-hls_list_size", "0",
    "-hls_segment_filename", path.join(outDir, "seg_%03d.ts"),
    playlistPath
  ];

  const ffmpeg = spawn("ffmpeg", args);
  ffmpeg.on("close", code => console.log(`FFmpeg exited (${code}) for job ${id}`));

  const checkPlaylist = () => {
    if (fs.existsSync(playlistPath)) {
      return res.json({ id, playlistUrl: `/hls/${id}/${playlist}` });
    }
    setTimeout(checkPlaylist, 500);
  };
  checkPlaylist();

  // Cleanup after 10 min
  setTimeout(() => {
    try { ffmpeg.kill("SIGKILL"); } catch (e) {}
    fs.rm(outDir, { recursive: true, force: true }, () => {});
    console.log(`Cleaned up job ${id}`);
  }, 10 * 60 * 1000);
});

// Serve HLS files
app.use("/hls", express.static(HLS_ROOT));

// ----------------- Root -----------------
app.get("/", (req, res) => {
  res.send("✅ YouTube Downloader + HLS API (yt-dlp-exec) is running!");
});

// ----------------- Start -----------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});

