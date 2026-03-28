'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, Download, Globe, Zap, CheckCircle, AlertCircle, Loader2, Subtitles } from 'lucide-react';

// Derive backend URL from current hostname so it works on localhost and remote hosts
const getBackendUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  const hostname = window.location.hostname;
  return `http://${hostname}:3001`;
};

const STEPS = [
  { key: 'transcript', label: 'Extracting transcript' },
  { key: 'context', label: 'Analyzing context' },
  { key: 'translate', label: 'Translating' },
  { key: 'download', label: 'Downloading video' },
  { key: 'audio', label: 'Generating audio' },
  { key: 'align', label: 'Aligning audio' },
  { key: 'merge', label: 'Merging video' },
];

export default function YouTubeDubber() {
  const [videoUrl, setVideoUrl] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('spanish');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [contextHint, setContextHint] = useState('');
  const [forceRefresh, setForceRefresh] = useState(false);
  const [burnCaptions, setBurnCaptions] = useState(false);
  const [captionPosition, setCaptionPosition] = useState('bottom');
  const [progress, setProgress] = useState(null); // latest SSE event: { step, label, progress, detail }
  const [stepStates, setStepStates] = useState({}); // { [stepKey]: { label, progress, detail } }
  const [recovering, setRecovering] = useState(false);

  const languages = [
    { code: 'spanish', name: 'Spanish (Español)' },
    { code: 'french', name: 'French (Français)' },
    { code: 'german', name: 'German (Deutsch)' },
    { code: 'italian', name: 'Italian (Italiano)' },
    { code: 'portuguese', name: 'Portuguese (Português)' },
    { code: 'russian', name: 'Russian (Русский)' },
    { code: 'japanese', name: 'Japanese (日本語)' },
    { code: 'korean', name: 'Korean (한국어)' },
    { code: 'chinese', name: 'Chinese (中文)' },
    { code: 'hindi', name: 'Hindi (हिंदी)' },
    { code: 'arabic', name: 'Arabic (العربية)' },
    { code: 'dutch', name: 'Dutch (Nederlands)' },
    { code: 'polish', name: 'Polish (Polski)' },
    { code: 'turkish', name: 'Turkish (Türkçe)' },
    { code: 'thai', name: 'Thai (ไทย)' },
    { code: 'vietnamese', name: 'Vietnamese (Tiếng Việt)' }
  ];

  // Shared function: start a dub job and stream SSE progress
  const startDubJob = useCallback(async (opts) => {
    setIsLoading(true);
    setError('');
    setResult(null);
    setProgress(null);
    setStepStates({});

    try {
      const response = await fetch(`${getBackendUrl()}/api/dub-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts)
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.error) {
              throw new Error(data.error);
            }

            if (data.videoId) {
              const url = new URL(window.location);
              url.searchParams.set('v', data.videoId);
              url.searchParams.set('lang', opts.targetLanguage);
              window.history.replaceState({}, '', url);
              continue;
            }

            if (data.done) {
              setResult(data);
            } else if (data.step) {
              setProgress(data);
              setStepStates(prev => ({
                ...prev,
                [data.step]: { label: data.label, progress: data.progress, detail: data.detail }
              }));
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
      setRecovering(false);
    }
  }, []);

  // On mount, check URL params — if cached result exists show it, otherwise start the dub job
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('v');
    const lang = params.get('lang');
    if (!v || !lang) return;

    setRecovering(true);
    setVideoUrl(`https://www.youtube.com/watch?v=${v}`);
    setTargetLanguage(lang);

    const recover = async () => {
      // Check cache first
      try {
        const res = await fetch(`${getBackendUrl()}/api/cache-status/${v}/${lang}`);
        const data = await res.json();
        if (data.status === 'completed') {
          setResult(data);
          setRecovering(false);
          return;
        }
      } catch {}

      // No cache — start a real dub job with full SSE progress
      await startDubJob({
        videoUrl: `https://www.youtube.com/watch?v=${v}`,
        targetLanguage: lang
      });
    };

    recover();
  }, [startDubJob]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await startDubJob({
      videoUrl,
      targetLanguage,
      contextHint: contextHint.trim() || undefined,
      forceRefresh,
      burnCaptions,
      captionPosition: burnCaptions ? captionPosition : undefined
    });
  };

  const resetForm = () => {
    setVideoUrl('');
    setTargetLanguage('spanish');
    setContextHint('');
    setForceRefresh(false);
    setBurnCaptions(false);
    setCaptionPosition('bottom');
    setResult(null);
    setError('');
    setProgress(null);
    setStepStates({});
    setRecovering(false);
    window.history.replaceState({}, '', window.location.pathname);
  };

  // Determine step status from stepStates
  const getStepStatus = (stepKey) => {
    const state = stepStates[stepKey];
    if (!state) return 'pending';
    if (state.progress >= 100) return 'done';
    return 'active';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-900 via-purple-900 to-indigo-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            YouTube Video Dubber
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Transform any YouTube video into multiple languages with AI-powered dubbing
          </p>
        </div>

        {!result ? (

          <div className="max-w-2xl mx-auto">
            <div className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* YouTube URL Input */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">
                    YouTube Video URL
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300"
                      required
                    />
                    <Play className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  </div>
                </div>

                {/* Language Selection */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">
                    Target Language
                  </label>
                  <div className="relative">
                    <select
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 appearance-none"
                    >
                      {languages.map((lang) => (
                        <option key={lang.code} value={lang.code} className="bg-gray-800 text-white">
                          {lang.name}
                        </option>
                      ))}
                    </select>
                    <Globe className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                  </div>
                </div>

                {/* Context Hint */}
                <div>
                  <label className="block text-white text-sm font-medium mb-3">
                    Context Hint (Optional)
                  </label>
                  <textarea
                    value={contextHint}
                    onChange={(e) => setContextHint(e.target.value)}
                    placeholder="E.g., 'This is a video about fixing a snowmobile engine' — helps the AI use the right terminology"
                    rows={2}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 resize-none"
                  />
                </div>

                {/* Checkboxes */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceRefresh}
                      onChange={(e) => setForceRefresh(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/10 text-purple-500 focus:ring-purple-400"
                    />
                    <span className="text-gray-300 text-sm">Force refresh (ignore cached results)</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={burnCaptions}
                      onChange={(e) => setBurnCaptions(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/10 text-purple-500 focus:ring-purple-400"
                    />
                    <span className="text-gray-300 text-sm">Burn captions into video</span>
                  </label>
                  {burnCaptions && (
                    <div className="flex items-center gap-4 pl-7">
                      <span className="text-gray-400 text-sm">Position:</span>
                      {['top', 'middle', 'bottom'].map((pos) => (
                        <label key={pos} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="captionPosition"
                            value={pos}
                            checked={captionPosition === pos}
                            onChange={(e) => setCaptionPosition(e.target.value)}
                            className="w-3.5 h-3.5 border-white/20 bg-white/10 text-purple-500 focus:ring-purple-400"
                          />
                          <span className="text-gray-300 text-sm capitalize">{pos}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="flex items-center gap-3 p-4 bg-red-500/20 border border-red-500/30 rounded-2xl">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-red-300 text-sm">{error}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading || !videoUrl.trim()}
                  className="w-full bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed shadow-xl"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3">
                      <Zap className="w-5 h-5" />
                      <span>Start Dubbing</span>
                    </div>
                  )}
                </button>
              </form>
            </div>

            {/* Progress Panel */}
            {isLoading && progress && (
              <div className="mt-8 backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20">
                <h3 className="text-xl font-semibold text-white mb-6">Creating Your Dubbed Video</h3>

                {/* Steps */}
                <div className="space-y-4">
                  {STEPS.map((step) => {
                    const state = stepStates[step.key];
                    const status = getStepStatus(step.key);
                    const isActive = status === 'active';
                    const isDone = status === 'done';
                    const pct = state?.progress ?? null;

                    return (
                      <div key={step.key}>
                        <div className="flex items-center gap-3 mb-1.5">
                          {/* Status icon */}
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isDone ? 'bg-green-500' : isActive ? 'bg-purple-500' : 'bg-white/10'
                          }`}>
                            {isDone ? (
                              <CheckCircle className="w-4 h-4 text-white" />
                            ) : isActive ? (
                              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                            ) : (
                              <div className="w-2 h-2 bg-white/30 rounded-full" />
                            )}
                          </div>

                          {/* Label */}
                          <span className={`text-sm flex-1 ${
                            isDone ? 'text-green-300' : isActive ? 'text-white font-medium' : 'text-gray-500'
                          }`}>
                            {state ? state.label : step.label}
                          </span>

                          {/* Detail text */}
                          {isActive && state?.detail && (
                            <span className="text-xs text-purple-300">{state.detail}</span>
                          )}

                          {/* Percentage */}
                          {pct !== null && (
                            <span className={`text-xs w-10 text-right ${isDone ? 'text-green-300' : 'text-purple-300'}`}>
                              {pct}%
                            </span>
                          )}
                        </div>

                        {/* Progress bar */}
                        {pct !== null && (
                          <div className="ml-9 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ease-out ${
                                isDone ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-purple-500 to-pink-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Results Section */
          <div className="max-w-4xl mx-auto">
            <div className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20">
              {/* Success Message */}
              <div className="flex items-center gap-3 mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-2xl">
                <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0" />
                <div>
                  <h3 className="text-green-300 font-semibold">Success!</h3>
                  <p className="text-green-200 text-sm">{result.message}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-blue-400 text-lg">📝</span>
                    </div>
                    <div>
                      <p className="text-white font-semibold">{result.transcriptSegments}</p>
                      <p className="text-gray-400 text-sm">Transcript Segments</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-red-400 text-lg">⚠️</span>
                    </div>
                    <div>
                      <p className="text-white font-semibold">{result.translationErrors}</p>
                      <p className="text-gray-400 text-sm">Translation Errors</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detected Context */}
              {result.detectedContext && result.detectedContext.topic && (
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <span className="text-purple-400 text-lg">🧠</span>
                    </div>
                    <div>
                      <p className="text-white font-semibold">{result.detectedContext.topic}</p>
                      <p className="text-gray-400 text-sm">Detected Context — {result.detectedContext.tone} tone</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Video Player */}
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-white mb-4">Your Dubbed Video</h3>
                <div className="bg-black/50 rounded-2xl overflow-hidden border border-white/10">
                  <video
                    controls
                    className="w-full h-auto max-h-96"
                    src={`${getBackendUrl()}${result.downloadUrl}`}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={`${getBackendUrl()}${result.downloadUrl}`}
                  download
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl text-center flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Video
                </a>
                <button
                  onClick={() => {
                    startDubJob({
                      videoUrl,
                      targetLanguage,
                      burnCaptions: true,
                      captionPosition: 'bottom',
                      remerge: true
                    });
                  }}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-3 px-6 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl flex items-center justify-center gap-2"
                >
                  <Subtitles className="w-5 h-5" />
                  Add Captions
                </button>
                <button
                  onClick={resetForm}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-6 rounded-2xl transition-all duration-300 border border-white/20 flex items-center justify-center gap-2"
                >
                  <Zap className="w-5 h-5" />
                  Dub Another Video
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12">
          <p className="text-gray-400 text-sm">
            Powered by AI
          </p>
        </div>
      </div>
    </div>
  );
}
