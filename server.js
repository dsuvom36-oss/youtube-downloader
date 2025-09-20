const express = require("express");
const ytdl = require("ytdl-core");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const app = express();

// ✅ Allow your GitHub Pages site
app.use(cors({ origin: "https://dsuvom36-oss.github.io" }));
app.use(express.json());

// ----------------- API: Info -----------------
app.get("/api/info", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    const info = await ytdl.getInfo(url);
    const formats = info.formats.map(f => ({
      itag: f.itag,
      qualityLabel: f.qualityLabel,
      mimeType: f.mimeType,
      audioBitrate: f.audioBitrate,
      hasVideo: f.hasVideo,
      hasAudio: f.hasAudio,
      size: f.contentLength
        ? (Number(f.contentLength) / 1024 / 1024).toFixed(1) + " MB"
        : "N/A"
    }));

    res.json({
      title: info.videoDetails.title,
      channel: info.videoDetails.author.name,
      thumbnail: info.videoDetails.thumbnails.pop().url,
      duration: info.videoDetails.lengthSeconds + "s",
      views: info.videoDetails.viewCount,
      uploadDate: info.videoDetails.uploadDate,
      description: info.videoDetails.description,
      formats
    });
  } catch (err) {
    console.error("❌ Error in /api/info:", err); // log full error in Render
    res.status(500).json({
      error: "Failed to fetch video info",
      details: err.message // send reason back for debugging
    });
  }
});

// ----------------- API: Download -----------------
app.get("/api/download", async (req, res) => {
  try {
    const url = req.query.url;
    const itag = req.query.itag;
    if (!url || !itag) return res.status(400).send("Missing url or itag");

    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, { quality: itag });
    if (!format) return res.status(400).send("Invalid format/itag");

    res.header("Content-Disposition", `attachment; filename="${info.videoDetails.title}.mp4"`);
    ytdl(url, { format }).pipe(res);
  } catch (err) {
    console.error("❌ Error in /api/download:", err);
    res.status(500).send("Download failed: " + err.message);
  }
});

// ----------------- API: HLS Streaming -----------------
const HLS_ROOT = path.join(__dirname, "hls");
if (!fs.existsSync(HLS_ROOT)) fs.mkdirSync(HLS_ROOT);

app.get("/api/hls/start", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    const id = randomUUID();
    const outDir = path.join(HLS_ROOT, id);
    fs.mkdirSync(outDir);

    const playlist = "index.m3u8";
    const playlistPath = path.join(outDir, playlist);

    const args = [
      "-hide_banner", "-loglevel", "warning",
      "-i", "pipe:0",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k",
      "-hls_time", "6",
      "-hls_list_size", "0",
      "-hls_segment_filename", path.join(outDir, "seg_%03d.ts"),
      playlistPath
    ];

    const ffmpeg = spawn("ffmpeg", args);
    ffmpeg.on("close", code => console.log(`FFmpeg exited (${code}) for job ${id}`));

    const yt = ytdl(url, { quality: "highest" });
    yt.pipe(ffmpeg.stdin);

    const checkPlaylist = () => {
      if (fs.existsSync(playlistPath)) {
        return res.json({ id, playlistUrl: `/hls/${id}/${playlist}` });
      }
      setTimeout(checkPlaylist, 500);
    };
    checkPlaylist();

    setTimeout(() => {
      try { ffmpeg.kill("SIGKILL"); } catch (e) {}
      fs.rm(outDir, { recursive: true, force: true }, () => {});
      console.log(`Cleaned up job ${id}`);
    }, 10 * 60 * 1000);

  } catch (err) {
    console.error("❌ Error in /api/hls/start:", err);
    res.status(500).json({ error: "HLS failed", details: err.message });
  }
});

// Serve HLS files
app.use("/hls", express.static(HLS_ROOT));

// ----------------- Root -----------------
app.get("/", (req, res) => {
  res.send("✅ YouTube Downloader + HLS API is running!");
});

// ----------------- Start -----------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});


