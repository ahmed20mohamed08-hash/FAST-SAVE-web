const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR });

const ytDlp = new YTDlpWrap();

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Fast Save API is running!' });
});

// Check URL
app.post('/api/check', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'No URL provided' });

        const info = await ytDlp.getVideoInfo(url);
        
        res.json({
            success: true,
            title: info.title || 'Unknown',
            duration: info.duration || 0,
            thumbnail: info.thumbnail || '',
            formats: [
                { id: 'best', label: '🎬 أعلى جودة' },
                { id: '720', label: '🎬 HD (720p)' },
                { id: '480', label: '🎬 متوسطة (480p)' },
                { id: 'audio', label: '🎵 صوت فقط (MP3)' }
            ]
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Download
app.post('/api/download', async (req, res) => {
    try {
        const { url, format } = req.body;
        if (!url) return res.status(400).json({ error: 'No URL provided' });

        const jobId = Date.now().toString(36);
        let outputPath;

        if (format === 'audio') {
            outputPath = path.join(DOWNLOADS_DIR, `${jobId}.mp3`);
            await ytDlp.exec([
                url,
                '-f', 'bestaudio',
                '-o', outputPath,
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '192K'
            ]);
        } else if (format === '720') {
            outputPath = path.join(DOWNLOADS_DIR, `${jobId}.mp4`);
            await ytDlp.exec([
                url,
                '-f', 'best[height<=720]',
                '-o', outputPath
            ]);
        } else if (format === '480') {
            outputPath = path.join(DOWNLOADS_DIR, `${jobId}.mp4`);
            await ytDlp.exec([
                url,
                '-f', 'best[height<=480]',
                '-o', outputPath
            ]);
        } else {
            outputPath = path.join(DOWNLOADS_DIR, `${jobId}.mp4`);
            await ytDlp.exec([
                url,
                '-f', 'best',
                '-o', outputPath
            ]);
        }

        res.json({
            success: true,
            jobId,
            filename: path.basename(outputPath),
            message: 'تم التحميل بنجاح!'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Convert local video to MP3
app.post('/api/convert', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        const { start, end } = req.body;
        const inputPath = req.file.path;
        const jobId = Date.now().toString(36);
        const outputPath = path.join(DOWNLOADS_DIR, `${jobId}.mp3`);

        let command = ffmpeg(inputPath)
            .toFormat('mp3')
            .audioBitrate(192)
            .on('end', () => {
                fs.unlinkSync(inputPath);
                res.json({
                    success: true,
                    jobId,
                    filename: `${jobId}.mp3`,
                    message: 'تم التحويل بنجاح!'
                });
            })
            .on('error', (err) => {
                fs.unlinkSync(inputPath);
                res.status(500).json({ error: err.message });
            });

        if (start) command.setStartTime(parseFloat(start));
        if (end) command.setDuration(parseFloat(end) - parseFloat(start || 0));

        command.save(outputPath);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Download file
app.get('/api/file/:name', (req, res) => {
    const filePath = path.join(DOWNLOADS_DIR, req.params.name);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Serve static files (frontend)
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Fast Save Server running on port ${PORT}`);
    console.log(`📁 Downloads folder: ${DOWNLOADS_DIR}`);
});

module.exports = app;