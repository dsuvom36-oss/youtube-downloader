const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const HLS_ROOT = path.join(__dirname, 'hls'); // make sure writable
if (!fs.existsSync(HLS_ROOT)) fs.mkdirSync(HLS_ROOT);

// Start an HLS job: returns an id you can use to access /hls/<id>/index.m3u8
app.get('/api/hls/start', async (req, res) => {
  const url = req.query.url;
  if (!url || !ytdl.validateURL(url)) return res.status(400).json({ error: 'Invalid url' });

  const id = uuidv4();
  const outDir = path.join(HLS_ROOT, id);
  fs.mkdirSync(outDir);

  // Prepare ffmpeg args:
  // -y overwrite, -i - read stdin, -c:v libx264 encode video, -c:a aac audio,
  // -preset veryfast (adjust), -f hls output as playlist
  const playlist = 'index.m3u8';
  const args = [
    '-hide_banner', '-loglevel', 'warning',
    '-i', 'pipe:0',                 // input from stdin
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-hls_time', '6',               // segment duration
    '-hls_list_size', '0',         // 0 = all segments (VOD) — for live, use small list_size
    '-hls_segment_filename', path.join(outDir, 'seg_%03d.ts'),
    path.join(outDir, playlist)
  ];

  // Spawn ffmpeg
  const ff = spawn('ffmpeg', args);

  ff.on('error', (err) => {
    console.error('ffmpeg spawn error:', err);
  });

  ff.stderr.on('data', d => {
    // optional: log for debugging
    // console.error('ffmpeg:', d.toString());
  });

  ff.on('close', code => {
    console.log(`ffmpeg exited with ${code} for job ${id}`);
    // we'll keep files for a while; consider cleaning after N secs
  });

  // Pipe YouTube stream into ffmpeg stdin
  const yt = ytdl(url, { quality: 'highestvideo', filter: (f) => f.container === 'mp4' || true });

  yt.pipe(ff.stdin);

  // After first playlist is written (may be a few seconds), respond with the playlist URL.
  // We'll poll the output until index.m3u8 exists.
  const checkPlaylist = () => {
    const p = path.join(outDir, playlist);
    if (fs.existsSync(p)) {
      // return the public path
      const publicUrl = `/hls/${id}/${playlist}`;
      return res.json({ id, playlistUrl: publicUrl });
    } else {
      setTimeout(checkPlaylist, 500);
    }
  };
  checkPlaylist();

  // Optional: schedule cleanup after X minutes
  setTimeout(() => {
    try { ff.kill('SIGKILL'); } catch(e){}
    // delete folder
    fs.rm(outDir, { recursive: true, force: true }, err => {});
    console.log(`Cleaned HLS job ${id}`);
  }, 1000 * 60 * 10); // cleanup after 10 minutes
});

// Serve HLS directory statically
app.use('/hls', express.static(HLS_ROOT, {
  setHeaders: (res, filePath) => {
    // let browser cache segments briefly if desired:
    if (filePath.endsWith('.ts')) {
      res.setHeader('Cache-Control', 'public, max-age=5');
    }
  }
}));

// existing endpoints...
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening ${PORT}`));

