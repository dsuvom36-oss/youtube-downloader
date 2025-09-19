const express = require("express");
const ytdl = require("ytdl-core");
const cors = require("cors");

const app = express();
app.use(cors());

// Get video info
app.get("/api/info", async (req, res) => {
  const url = req.query.url;
  if (!ytdl.validateURL(url)) return res.status(400).json({ error: "Invalid URL" });

  try {
    const info = await ytdl.getInfo(url);
    const formats = info.formats
      .filter(f => f.hasVideo || f.hasAudio)
      .map(f => ({
        quality: f.qualityLabel || `${f.audioBitrate}kbps`,
        size: f.contentLength ? (f.contentLength / (1024 * 1024)).toFixed(1) + " MB" : "N/A",
        type: f.hasVideo ? "video" : "audio",
        url: f.url
      }));

    res.json({
      title: info.videoDetails.title,
      channel: info.videoDetails.author.name,
      thumbnail: info.videoDetails.thumbnails.pop().url,
      duration: new Date(info.videoDetails.lengthSeconds * 1000).toISOString().substr(11, 8),
      views: info.videoDetails.viewCount,
      uploadDate: info.videoDetails.uploadDate,
      description: info.videoDetails.description,
      qualities: formats
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch info" });
  }
});

// Download route
app.get("/api/download", (req, res) => {
  const { url, quality } = req.query;
  if (!ytdl.validateURL(url)) return res.status(400).send("Invalid URL");

  res.header("Content-Disposition", 'attachment; filename="video.mp4"');
  ytdl(url, { quality }).pipe(res);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
