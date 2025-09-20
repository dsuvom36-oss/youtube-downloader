const express = require("express");
const ytdl = require("ytdl-core");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();

// ✅ Allow your GitHub Pages site
app.use(cors({
  origin: "https://dsuvom36-oss.github.io" 
}));

app.use(express.json());

// HLS output root
const HLS_ROOT = path.join(__dirname, "hls");
if (!fs.existsSync(HLS_ROOT)) fs.mkdirSync(HLS_ROOT);

// API: Start HLS stream
app.get("/api/hls/start", async (req, res) => {
  const url = req.query.url;
  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  const id = uuidv4();
  const outDir = path.join(HLS_ROOT, id);
  fs.mkdirSync(outDir);

  const playlist = "index.m3u8";
  const playlistPath = path.join(outDir, playlist);

  // ffmpeg args
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

  ffmpeg.on("error", err => console.error("FFmpeg error:", err));
  ffmpeg.on("close", code => console.log(`FFmpeg exited (${code}) for job ${id}`));

  // YouTube input
  const yt = ytdl(url, { quality: "highest" });
  yt.pipe(ffmpeg.stdin);

  // Wait until playlist is created, then return URL
  const checkPlaylist = () => {
    if (fs.existsSync(playlistPath)) {
      return res.json({ id, playlistUrl: `/hls/${id}/${playlist}` });
    }
    setTimeout(checkPlaylist, 500);
  };
  checkPlaylist();

  // Auto cleanup after 10 minutes
  setTimeout(() => {
    try { ffmpeg.kill("SIGKILL"); } catch(e){}
    fs.rm(outDir, { recursive: true, force: true }, () => {});
    console.log(`Cleaned up job ${id}`);
  }, 10 * 60 * 1000);
});

// Serve HLS
app.use("/hls", express.static(HLS_ROOT, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".ts")) {
      res.setHeader("Cache-Control", "public, max-age=5");
    }
  }
}));

// Root test
app.get("/", (req, res) => {
  res.send("✅ YouTube Downloader + HLS API is running!");
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

