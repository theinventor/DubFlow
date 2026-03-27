// Transcript fetching — yt-dlp primary, youtube-transcript npm fallback
const { YoutubeTranscript } = require('youtube-transcript');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// Fetch auto-captions via yt-dlp (handles auto-generated captions reliably)
const fetchWithYtDlp = async (videoId) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dubflow-'));
    const outPath = path.join(tmpDir, 'sub');

    try {
        console.log('📝 Fetching transcript via yt-dlp...');
        await execAsync(
            `yt-dlp --write-auto-sub --write-sub --sub-lang en --sub-format json3 --skip-download -o "${outPath}" "https://www.youtube.com/watch?v=${videoId}"`,
            { timeout: 30000 }
        );

        const subFile = path.join(tmpDir, 'sub.en.json3');
        const raw = await fs.readFile(subFile, 'utf8');
        const data = JSON.parse(raw);

        const segments = data.events
            .filter(e => e.segs && e.segs.some(s => s.utf8 && s.utf8.trim() && s.utf8.trim() !== '\n'))
            .map(e => ({
                text: e.segs.map(s => s.utf8 || '').join('').trim(),
                start: (e.tStartMs || 0) / 1000,
                duration: (e.dDurationMs || 0) / 1000
            }))
            .filter(s => s.text.length > 0);

        if (segments.length === 0) {
            throw new Error('yt-dlp returned captions but no usable segments');
        }

        console.log(`✅ yt-dlp fetched ${segments.length} segments`);
        return segments;
    } finally {
        // Clean up temp files
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
};

// Fallback: fetch via youtube-transcript npm package
const fetchWithNpmPackage = async (videoId) => {
    console.log('📝 Trying youtube-transcript npm package as fallback...');

    const languageCodes = ['en', 'en-US', 'en-GB', null];

    for (const langCode of languageCodes) {
        try {
            const config = langCode ? { lang: langCode } : {};
            const transcript = await YoutubeTranscript.fetchTranscript(videoId, config);

            if (transcript && transcript.length > 0) {
                console.log(`✅ npm package fetched ${transcript.length} segments (lang: ${langCode || 'auto'})`);
                return transcript.map(item => ({
                    text: item.text,
                    start: parseFloat(item.offset) / 1000,
                    duration: parseFloat(item.duration) / 1000
                }));
            }
        } catch (error) {
            console.log(`npm package failed (${langCode || 'auto'}): ${error.message}`);
        }
    }

    throw new Error('youtube-transcript npm package could not fetch captions');
};

// Main transcript fetching function
const fetchTranscript = async (videoId) => {
    if (!videoId || typeof videoId !== 'string' || videoId.length !== 11) {
        throw new Error('Invalid YouTube video ID format');
    }

    // Try yt-dlp first (handles auto-generated captions)
    try {
        return await fetchWithYtDlp(videoId);
    } catch (ytdlpError) {
        console.log(`yt-dlp failed: ${ytdlpError.message}`);
    }

    // Fall back to npm package
    try {
        return await fetchWithNpmPackage(videoId);
    } catch (npmError) {
        console.log(`npm fallback failed: ${npmError.message}`);
    }

    throw new Error(
        'No transcript/captions found for this video. ' +
        'Please ensure the video has either:\n' +
        '• Manual captions/subtitles\n' +
        '• Auto-generated captions enabled\n' +
        '• Public accessibility settings'
    );
};

// Test function to validate transcript availability
const validateTranscriptAvailability = async (videoId) => {
    try {
        console.log(`🔍 Checking transcript availability for: ${videoId}`);
        const transcript = await fetchTranscript(videoId);
        return {
            available: true,
            segmentCount: transcript.length,
            totalDuration: Math.max(...transcript.map(t => t.start + t.duration)),
            preview: transcript.slice(0, 3).map(t => t.text).join(' ')
        };
    } catch (error) {
        return {
            available: false,
            error: error.message
        };
    }
};

module.exports = {
    fetchTranscript,
    validateTranscriptAvailability
};
