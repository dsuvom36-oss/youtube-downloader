// server.js
const express = require("express");
const ytdl = require("ytdl-core");
const cors = require("cors");

const app = express();

// Allow all origins (fine for testing). If you want to restrict, set origin: "https://your-frontend.com"
app.use(cors());

// Simple root route so visiting / doesn't 404
app.get("/", (req, res) => {
  res.send("✅ YouTube Downloader API is running! Use /api/info?url=VIDEO_URL");
});

// GET video info
app.get("/api/info", async (req, res) => {
  const url = req.query.url;
  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: "Invalid or missing url parameter" });
  }

  try {
    const info = await ytdl.getInfo(url);
    const formats = info.formats
      .filter(f => (f.hasVideo || f.hasAudio))
      .map(f => ({
        itag: f.itag,
        qualityLabel: f.qualityLabel || null,
        audioBitrate: f.audioBitrate || null,
        size: f.contentLength ? (Number(f.contentLength) / (1024 * 1024)).toFixed(1) + " MB" : "N/A",
        mimeType: f.mimeType || '',
        hasVideo: !!f.hasVideo,
        hasAudio: !!f.hasAudio
      }));

    res.json({
      title: info.videoDetails.title,
      channel: info.videoDetails.author.name,
      thumbnail: info.videoDetails.thumbnails.pop().url,
      duration: new Date(info.videoDetails.lengthSeconds * 1000).toISOString().substr(11, 8),
      views: info.videoDetails.viewCount,
      uploadDate: info.videoDetails.uploadDate,
      description: info.videoDetails.description,
      formats
    });
  } catch (err) {
    console.error("Error /api/info:", err);
    res.status(500).json({ error: "Failed to fetch video info" });
  }
});

// Stream/download route: supply ?url=...&itag=XXX to choose format
app.get("/api/download", (req, res) => {
  const { url, itag } = req.query;
  if (!url || !ytdl.validateURL(url)) return res.status(400).send("Invalid url");

  // If itag provided, attempt to use that. Otherwise stream best
  const options = itag ? { quality: itag } : {};
  res.header("Content-Disposition", 'attachment; filename="video.mp4"');

  try {
    ytdl(url, options).pipe(res);
  } catch (err) {
    console.error("Error /api/download:", err);
    res.status(500).send("Download failed");
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

