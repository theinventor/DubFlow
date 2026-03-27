// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const { promisify } = require('util');

// Import enhanced transcript fetching
const { fetchTranscript, validateTranscriptAvailability } = require('./transcript-fetcher');

const app = express();
const PORT = process.env.PORT || 3001;
const execAsync = promisify(exec);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// OpenAI Configuration (used for both translation and TTS)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
let openaiClient = null;
let translatorAvailable = false;

if (OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
    translatorAvailable = true;
    console.log('✅ OpenAI initialized (translation + TTS)');
} else {
    console.error('❌ OPENAI_API_KEY not found. Please set it in your environment variables');
}

// Ensure downloads directory exists
const ensureDownloadsDir = async () => {
    const downloadsDir = path.join(__dirname, 'downloads');
    try {
        await fs.access(downloadsDir);
    } catch {
        await fs.mkdir(downloadsDir, { recursive: true });
    }
};

// Extract YouTube video ID from URL
const extractVideoId = (url) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
};

// Detect video context from transcript using OpenAI
const detectTranscriptContext = async (transcript, userContextHint = '') => {
    const fullText = transcript.map(s => s.text).join(' ');
    const truncated = fullText.split(/\s+/).slice(0, 3000).join(' ');

    const systemPrompt = `You are a video content analyst. Given a transcript, identify:
1. The main topic/domain of the video
2. Key domain-specific terms and proper nouns
3. The tone/register (formal, casual, technical, educational)

Respond in JSON:
{"topic": "brief topic", "domain": "domain category", "keyTerms": ["term1", "term2"], "tone": "tone"}`;

    const userMessage = userContextHint
        ? `User provided context: "${userContextHint}"\n\nTranscript:\n${truncated}`
        : `Transcript:\n${truncated}`;

    const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
};

// Translate transcript segments in batches using OpenAI with context
const batchTranslateWithOpenAI = async (transcript, targetLanguage, context, batchSize = 50) => {
    if (!openaiClient) {
        throw new Error('OpenAI not initialized. Please set OPENAI_API_KEY.');
    }

    const results = [];

    for (let i = 0; i < transcript.length; i += batchSize) {
        const batch = transcript.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(transcript.length / batchSize);
        console.log(`🌐 Translating batch ${batchNum}/${totalBatches}`);

        const numberedLines = batch.map((item, idx) => `[${i + idx}] ${item.text}`).join('\n');

        const systemPrompt = `You are a professional translator for ${context.domain || 'general'} content.

Video context:
- Topic: ${context.topic || 'general'}
- Key terms: ${(context.keyTerms || []).join(', ')}
- Tone: ${context.tone || 'neutral'}

Rules:
- Translate each numbered line to ${targetLanguage}.
- Preserve the numbering format exactly: [N] translated text
- Use domain-appropriate terminology for ${targetLanguage}.
- Keep proper nouns as-is unless they have well-known translations.
- Do not add, remove, or merge lines. One output line per input line.
- If a line is a filler word or sound effect, translate naturally or keep as-is.`;

        const response = await openaiClient.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: numberedLines }
            ],
            temperature: 0.3
        });

        const outputText = response.choices[0].message.content;

        // Parse numbered output back into map
        const translatedMap = {};
        const lineRegex = /\[(\d+)\]\s*(.+)/g;
        let match;
        while ((match = lineRegex.exec(outputText)) !== null) {
            translatedMap[parseInt(match[1])] = match[2].trim();
        }

        // Map back to batch items, falling back to original text
        let fallbackCount = 0;
        for (let j = 0; j < batch.length; j++) {
            const globalIndex = i + j;
            const translatedText = translatedMap[globalIndex];
            if (!translatedText) fallbackCount++;
            results.push({ ...batch[j], translatedText: translatedText || batch[j].text });
        }

        if (fallbackCount > 0) {
            console.warn(`⚠️ ${fallbackCount}/${batch.length} segments fell back to original text in batch ${batchNum}`);
        }
    }

    return results;
};

// Generate audio using OpenAI TTS
const generateAudio = async (text, language, outputPath) => {
    if (!text || text.trim().length < 2) {
        throw new Error('Text too short for TTS');
    }

    try {
        const response = await openaiClient.audio.speech.create({
            model: 'tts-1',
            voice: 'onyx',
            input: text.trim(),
            response_format: 'mp3'
        });

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(outputPath, buffer);
        return outputPath;
    } catch (error) {
        console.error('OpenAI TTS error:', error.message);
        throw error;
    }
};

// Create silence audio file using ffmpeg CLI directly
const createSilence = async (duration, outputPath) => {
    const safeDuration = Math.max(0.1, Math.min(duration, 3600));
    try {
        await execAsync(
            `ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=22050 -t ${safeDuration} -c:a pcm_s16le "${outputPath}"`,
            { timeout: 10000 }
        );
        console.log(`Created silence: ${safeDuration}s -> ${outputPath}`);
        return outputPath;
    } catch (err) {
        console.error('Silence creation error:', err.message);
        throw err;
    }
};

// Concatenate audio files
const concatenateAudio = async (audioFiles, outputPath) => {
    return new Promise((resolve, reject) => {
        // Check if we have any audio files
        if (!audioFiles || audioFiles.length === 0) {
            return reject(new Error('No audio files to concatenate'));
        }
        
        // If only one file, just copy it
        if (audioFiles.length === 1) {
            const command = ffmpeg(audioFiles[0])
                .output(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', reject)
                .run();
            return;
        }
        
        const command = ffmpeg();
        
        // Add all input files
        audioFiles.forEach(file => {
            command.input(file);
        });
        
        // Create filter complex for concatenation
        const filterComplex = audioFiles.map((_, index) => `[${index}:0]`).join('') + 
                             `concat=n=${audioFiles.length}:v=0:a=1[out]`;
        
        command
            .complexFilter(filterComplex)
            .outputOptions(['-map', '[out]'])
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => {
                console.error('FFmpeg concatenation error:', err);
                reject(err);
            })
            .run();
    });
};

// Download video using yt-dlp (more reliable than ytdl-core)
const downloadVideoOnly = async (videoId, outputPath) => {
    try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Use yt-dlp which is more reliable than ytdl-core
        const command = `yt-dlp -f "bestvideo[ext=mp4]" --no-audio -o "${outputPath}" "${videoUrl}"`;
        
        console.log('Executing:', command);
        const { stdout, stderr } = await execAsync(command);
        
        if (stderr && !stderr.includes('WARNING')) {
            console.error('yt-dlp stderr:', stderr);
        }
        
        // Check if file was created
        try {
            await fs.access(outputPath);
            return outputPath;
        } catch {
            throw new Error('Video file was not created successfully');
        }
        
    } catch (error) {
        console.error('yt-dlp error:', error);
        
        // Fallback: try with different format
        try {
            const fallbackCommand = `yt-dlp -f "best[ext=mp4]" --no-audio -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`;
            console.log('Trying fallback:', fallbackCommand);
            await execAsync(fallbackCommand);
            
            // Check if file was created
            await fs.access(outputPath);
            return outputPath;
        } catch (fallbackError) {
            throw new Error(`Failed to download video: ${error.message}. Fallback also failed: ${fallbackError.message}`);
        }
    }
};

// Alternative: Download video using youtube-dl
const downloadVideoWithYoutubeDl = async (videoId, outputPath) => {
    try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const command = `youtube-dl -f "bestvideo[ext=mp4]" --no-audio -o "${outputPath}" "${videoUrl}"`;
        
        console.log('Executing youtube-dl:', command);
        await execAsync(command);
        
        // Check if file was created
        await fs.access(outputPath);
        return outputPath;
    } catch (error) {
        throw new Error(`youtube-dl failed: ${error.message}`);
    }
};

// Generate SRT subtitle file from translated transcript
const generateSrtFile = async (translatedTranscript, outputPath) => {
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };

    let srt = '';
    let index = 1;

    for (const item of translatedTranscript) {
        const text = (item.translatedText || item.text || '').trim();
        if (!text || text.length < 2) continue;

        const start = formatTime(item.start);
        const end = formatTime(item.start + item.duration);
        srt += `${index}\n${start} --> ${end}\n${text}\n\n`;
        index++;
    }

    await fs.writeFile(outputPath, srt, 'utf8');
    console.log(`📝 Generated SRT with ${index - 1} subtitle entries`);
    return outputPath;
};

// Merge video, audio, and burned-in subtitles
const mergeVideoAudio = async (videoPath, audioPath, outputPath, subtitlePath = null, position = 'bottom') => {
    // Use ffmpeg CLI directly for subtitle burning — fluent-ffmpeg escaping is unreliable
    const escapedSubPath = subtitlePath ? subtitlePath.replace(/'/g, "'\\''").replace(/:/g, '\\:') : null;

    // ASS alignment: 8=top-center, 5=middle-center, 2=bottom-center
    const alignMap = { top: 8, middle: 5, bottom: 2 };
    const alignment = alignMap[position] || 2;
    const marginV = position === 'middle' ? 0 : 30;

    const vf = subtitlePath
        ? `-vf "subtitles='${escapedSubPath}':force_style='Fontsize=24,PrimaryColour=&Hffffff,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,Alignment=${alignment},MarginV=${marginV}'"`
        : '-c:v copy';

    const cmd = subtitlePath
        ? `ffmpeg -y -i "${videoPath}" -i "${audioPath}" ${vf} -c:a aac -strict experimental -shortest "${outputPath}"`
        : `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -strict experimental -shortest "${outputPath}"`;

    try {
        console.log('Running FFmpeg merge' + (subtitlePath ? ' with burned-in captions' : '') + '...');
        await execAsync(cmd, { timeout: 600000 }); // 10 min timeout for re-encoding
        return outputPath;
    } catch (error) {
        console.error('FFmpeg merge error:', error.message);
        throw error;
    }
};

// New endpoint to check transcript availability
app.post('/api/check-transcript', async (req, res) => {
    const { videoUrl } = req.body;
    
    try {
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }
        
        console.log(`🔍 Checking transcript for video: ${videoId}`);
        const result = await validateTranscriptAvailability(videoId);
        
        res.json(result);
        
    } catch (error) {
        console.error('Error checking transcript:', error);
        res.status(500).json({
            error: 'Failed to check transcript availability',
            details: error.message
        });
    }
});

// Helper: get cache directory for a video+language combo
const getCacheDir = (videoId, language) => {
    return path.join(__dirname, 'downloads', 'cache', `${videoId}_${language.toLowerCase()}`);
};

// Helper: read JSON cache file
const readCache = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch {
        return null;
    }
};

// Helper: write JSON cache file
const writeCache = async (filePath, data) => {
    await fs.writeFile(filePath, JSON.stringify(data));
};

// Main dubbing endpoint with SSE progress streaming
app.post('/api/dub-video', async (req, res) => {
    const { videoUrl, targetLanguage, contextHint, forceRefresh, burnCaptions, captionPosition } = req.body;
    const jobId = uuidv4();

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendProgress = (step, label, progress = null, detail = null) => {
        const data = { step, label, progress, detail };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const sendDone = (result) => {
        res.write(`data: ${JSON.stringify({ done: true, ...result })}\n\n`);
        res.end();
    };

    const sendError = (error) => {
        res.write(`data: ${JSON.stringify({ error: error.message || error })}\n\n`);
        res.end();
    };

    try {
        await ensureDownloadsDir();
        const videoId = extractVideoId(videoUrl);
        if (!videoId) { sendError({ message: 'Invalid YouTube URL' }); return; }

        // Send videoId so frontend can update URL for recovery
        res.write(`data: ${JSON.stringify({ videoId })}\n\n`);
        console.log('📹 Video ID extracted:', videoId);

        // Set up cache
        const cacheDir = getCacheDir(videoId, targetLanguage);
        await fs.mkdir(cacheDir, { recursive: true });
        const transcriptCache = path.join(cacheDir, 'transcript.json');
        const translationCache = path.join(cacheDir, 'translation.json');
        const contextCache = path.join(cacheDir, 'context.json');
        const cachedFinalVideo = path.join(cacheDir, 'dubbed_video.mp4');

        // Check cache
        if (!forceRefresh) {
            try {
                await fs.access(cachedFinalVideo);
                console.log('✅ Found cached dubbed video');
                res.write(`data: ${JSON.stringify({ videoId })}\n\n`);
                const jobDir = path.join(__dirname, 'downloads', jobId);
                await fs.mkdir(jobDir, { recursive: true });
                await fs.copyFile(cachedFinalVideo, path.join(jobDir, 'dubbed_video.mp4'));
                const context = await readCache(contextCache);
                sendDone({
                    success: true, jobId,
                    downloadUrl: `/downloads/${jobId}/dubbed_video.mp4`,
                    message: 'Video returned from cache! Use "Force Refresh" to re-generate.',
                    transcriptSegments: 0, translationErrors: 0,
                    detectedContext: context || {}, cached: true
                });
                return;
            } catch { /* no cache */ }
        } else {
            console.log('🔄 Force refresh requested');
        }

        // Step 1: Fetch transcript
        sendProgress('transcript', 'Fetching transcript...');
        let transcript;

        if (!forceRefresh) {
            transcript = await readCache(transcriptCache);
            if (transcript) sendProgress('transcript', 'Using cached transcript', 100);
        }

        if (!transcript) {
            transcript = await fetchTranscript(videoId);
            await writeCache(transcriptCache, transcript);
        }

        if (!transcript || transcript.length === 0) {
            sendError({ message: 'No transcript found for this video' });
            return;
        }

        sendProgress('transcript', `Fetched ${transcript.length} segments`, 100);
        console.log(`✅ ${transcript.length} transcript segments`);

        // Step 2: Detect context
        sendProgress('context', 'Analyzing video content...');
        let videoContext;

        if (!forceRefresh) {
            videoContext = await readCache(contextCache);
        }

        if (!videoContext) {
            try {
                videoContext = await detectTranscriptContext(transcript, contextHint);
                await writeCache(contextCache, videoContext);
            } catch (contextError) {
                videoContext = { topic: 'general', domain: 'general', keyTerms: [], tone: 'neutral' };
            }
        }

        sendProgress('context', `Detected: ${videoContext.topic}`, 100);
        console.log(`✅ Context: "${videoContext.topic}"`);

        // Step 3: Translate
        let translatedTranscript;
        let translationErrors = 0;

        if (!forceRefresh) {
            translatedTranscript = await readCache(translationCache);
            if (translatedTranscript) sendProgress('translate', 'Using cached translation', 100);
        }

        if (!translatedTranscript) {
            const totalBatches = Math.ceil(transcript.length / 50);
            sendProgress('translate', `Translating to ${targetLanguage}...`, 0, `0/${totalBatches} batches`);

            // Wrap batchTranslateWithOpenAI to get per-batch progress
            // We'll do it inline here to stream progress
            if (!openaiClient) throw new Error('OpenAI not initialized');
            translatedTranscript = [];
            const batchSize = 50;

            for (let i = 0; i < transcript.length; i += batchSize) {
                const batch = transcript.slice(i, i + batchSize);
                const batchNum = Math.floor(i / batchSize) + 1;
                const pct = Math.round((batchNum / totalBatches) * 100);
                sendProgress('translate', `Translating...`, pct, `Batch ${batchNum}/${totalBatches}`);

                const numberedLines = batch.map((item, idx) => `[${i + idx}] ${item.text}`).join('\n');

                const systemPrompt = `You are a professional translator for ${videoContext.domain || 'general'} content.\n\nVideo context:\n- Topic: ${videoContext.topic || 'general'}\n- Key terms: ${(videoContext.keyTerms || []).join(', ')}\n- Tone: ${videoContext.tone || 'neutral'}\n\nRules:\n- Translate each numbered line to ${targetLanguage}.\n- Preserve the numbering format exactly: [N] translated text\n- Use domain-appropriate terminology for ${targetLanguage}.\n- Keep proper nouns as-is unless they have well-known translations.\n- Do not add, remove, or merge lines. One output line per input line.\n- If a line is a filler word or sound effect, translate naturally or keep as-is.`;

                const response = await openaiClient.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: numberedLines }
                    ],
                    temperature: 0.3
                });

                const outputText = response.choices[0].message.content;
                const translatedMap = {};
                const lineRegex = /\[(\d+)\]\s*(.+)/g;
                let match;
                while ((match = lineRegex.exec(outputText)) !== null) {
                    translatedMap[parseInt(match[1])] = match[2].trim();
                }

                for (let j = 0; j < batch.length; j++) {
                    const globalIndex = i + j;
                    const translatedText = translatedMap[globalIndex] || batch[j].text;
                    translatedTranscript.push({ ...batch[j], translatedText });
                }

                console.log(`🌐 Translated batch ${batchNum}/${totalBatches}`);
            }

            await writeCache(translationCache, translatedTranscript);
            translationErrors = translatedTranscript.filter(item =>
                item.text === item.translatedText && item.text.trim().length >= 2
            ).length;
        }

        sendProgress('translate', 'Translation complete', 100);

        // Step 4: Generate audio
        const audioClips = [];
        const tempDir = path.join(__dirname, 'downloads', jobId);
        await fs.mkdir(tempDir, { recursive: true });

        const CONCURRENCY = 8;
        let successfulClips = 0;
        const totalSegments = translatedTranscript.length;

        sendProgress('audio', 'Generating audio...', 0, `0/${totalSegments}`);

        const generateOne = async (i) => {
            const item = translatedTranscript[i];
            if (!item.translatedText || item.translatedText.trim().length < 2) return null;

            const audioPath = path.join(tempDir, `line_${i}.mp3`);
            try {
                await generateAudio(item.translatedText, targetLanguage, audioPath);
                successfulClips++;
                return { path: audioPath, start: item.start, duration: item.duration, index: i };
            } catch (audioError) {
                try {
                    const silenceDuration = Math.max(item.duration, 0.5);
                    const silencePath = path.join(tempDir, `silence_${i}.wav`);
                    await createSilence(silenceDuration, silencePath);
                    successfulClips++;
                    return { path: silencePath, start: item.start, duration: silenceDuration, index: i };
                } catch { return null; }
            }
        };

        for (let i = 0; i < totalSegments; i += CONCURRENCY) {
            const chunk = [];
            for (let j = i; j < Math.min(i + CONCURRENCY, totalSegments); j++) {
                chunk.push(generateOne(j));
            }
            const results = await Promise.all(chunk);
            for (const result of results) {
                if (result) audioClips.push(result);
            }
            const pct = Math.round((Math.min(i + CONCURRENCY, totalSegments) / totalSegments) * 100);
            sendProgress('audio', 'Generating audio...', pct, `${successfulClips}/${totalSegments}`);
        }

        if (audioClips.length === 0) throw new Error('No audio clips generated');

        sendProgress('audio', `Generated ${audioClips.length} audio clips`, 100);

        // Step 5: Align + concatenate
        sendProgress('merge', 'Aligning and concatenating audio...');
        const alignedAudioFiles = [];
        audioClips.sort((a, b) => a.start - b.start);
        let currentTime = 0;

        for (let i = 0; i < audioClips.length; i++) {
            const clip = audioClips[i];
            if (clip.start > currentTime) {
                const silenceDuration = clip.start - currentTime;
                if (silenceDuration > 0.1) {
                    const silencePath = path.join(tempDir, `gap_${i}_${Date.now()}.wav`);
                    try {
                        await createSilence(silenceDuration, silencePath);
                        alignedAudioFiles.push(silencePath);
                    } catch {}
                }
            }
            alignedAudioFiles.push(clip.path);
            currentTime = clip.start + clip.duration;
        }

        const finalAudioPath = path.join(tempDir, 'final_audio.wav');
        try {
            await concatenateAudio(alignedAudioFiles, finalAudioPath);
        } catch {
            const totalDuration = Math.max(...audioClips.map(clip => clip.start + clip.duration));
            await createSilence(totalDuration || 10, finalAudioPath);
        }

        // Step 6: Download video
        sendProgress('merge', 'Downloading video...');
        const videoPath = path.join(tempDir, 'video.mp4');
        try {
            await downloadVideoOnly(videoId, videoPath);
        } catch (error) {
            try { await downloadVideoWithYoutubeDl(videoId, videoPath); }
            catch (fb) { throw new Error(`Video download failed: ${error.message}`); }
        }

        // Step 7: Subtitles + merge
        let subtitlePath = null;
        if (burnCaptions) {
            sendProgress('merge', 'Generating subtitles...');
            subtitlePath = path.join(tempDir, 'subtitles.srt');
            await generateSrtFile(translatedTranscript, subtitlePath);
        }

        sendProgress('merge', burnCaptions ? 'Merging video, audio, and captions...' : 'Merging video and audio...');
        const finalVideoPath = path.join(tempDir, 'dubbed_video.mp4');
        await mergeVideoAudio(videoPath, finalAudioPath, finalVideoPath, subtitlePath, captionPosition);

        // Cache
        try {
            await fs.copyFile(finalVideoPath, cachedFinalVideo);
        } catch {}

        console.log('✅ Dubbing completed successfully!');
        sendDone({
            success: true, jobId,
            downloadUrl: `/downloads/${jobId}/dubbed_video.mp4`,
            message: 'Video dubbed successfully with AI-powered contextual translation!',
            transcriptSegments: transcript.length,
            translationErrors, detectedContext: videoContext
        });

    } catch (error) {
        console.error('❌ Error during dubbing process:', error);
        sendError(error);
    }
});

// Get job status endpoint
app.get('/api/job-status/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const jobDir = path.join(__dirname, 'downloads', jobId);
    const finalVideo = path.join(jobDir, 'dubbed_video.mp4');
    
    try {
        await fs.access(finalVideo);
        res.json({
            status: 'completed',
            downloadUrl: `/downloads/${jobId}/dubbed_video.mp4`
        });
    } catch {
        res.json({
            status: 'processing'
        });
    }
});

// Check cache status by videoId + language (for recovery after page refresh)
app.get('/api/cache-status/:videoId/:language', async (req, res) => {
    const { videoId, language } = req.params;
    const cacheDir = getCacheDir(videoId, language);
    const cachedVideo = path.join(cacheDir, 'dubbed_video.mp4');
    const contextCache = path.join(cacheDir, 'context.json');

    try {
        await fs.access(cachedVideo);
        // Video exists — copy to a job dir for serving
        const jobId = uuidv4();
        const jobDir = path.join(__dirname, 'downloads', jobId);
        await fs.mkdir(jobDir, { recursive: true });
        await fs.copyFile(cachedVideo, path.join(jobDir, 'dubbed_video.mp4'));
        const context = await readCache(contextCache);
        res.json({
            status: 'completed',
            success: true,
            jobId,
            downloadUrl: `/downloads/${jobId}/dubbed_video.mp4`,
            message: 'Video recovered from cache!',
            transcriptSegments: 0,
            translationErrors: 0,
            detectedContext: context || {},
            cached: true
        });
    } catch {
        res.json({ status: 'processing' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'YouTube Dubbing API is running',
        translateStatus: translatorAvailable ? 'OpenAI Connected' : 'Not Connected'
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        details: error.message
    });
});

app.listen(PORT, () => {
    console.log(`🚀 YouTube Dubbing API server running on port ${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔑 OpenAI Translator Status: ${translatorAvailable ? '✅ Connected' : '❌ Not Connected'}`);
});

module.exports = app;
