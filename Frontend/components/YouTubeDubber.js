'use client';

import { useState } from 'react';
import { Play, Download, Globe, Zap, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function YouTubeDubber() {
  const [videoUrl, setVideoUrl] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('spanish');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [contextHint, setContextHint] = useState('');
  const [forceRefresh, setForceRefresh] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('http://localhost:3001/api/dub-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl,
          targetLanguage,
          contextHint: contextHint.trim() || undefined,
          forceRefresh
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process video');
      }

      setResult(data);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setVideoUrl('');
    setTargetLanguage('spanish');
    setContextHint('');
    setForceRefresh(false);
    setResult(null);
    setError('');
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
            🎙️ YouTube Video Dubber
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
                    🎬 YouTube Video URL
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
                    🌍 Target Language
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

                {/* Force Refresh */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceRefresh}
                    onChange={(e) => setForceRefresh(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/10 text-purple-500 focus:ring-purple-400"
                  />
                  <span className="text-gray-300 text-sm">Force refresh (ignore cached results)</span>
                </label>

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
                      <span>Processing Magic...</span>
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

            {/* Loading Animation */}
            {isLoading && (
              <div className="mt-8 backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4">
                    <div className="w-16 h-16 border-4 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Creating Your Dubbed Video</h3>
                  <p className="text-gray-300 mb-4">This may take a few minutes...</p>
                  
                  {/* Progress Steps */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-3 text-purple-300">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                      <span className="text-sm">Extracting transcript</span>
                    </div>
                    <div className="flex items-center justify-center gap-3 text-purple-300">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-150"></div>
                      <span className="text-sm">Analyzing video context</span>
                    </div>
                    <div className="flex items-center justify-center gap-3 text-purple-300">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-300"></div>
                      <span className="text-sm">Translating with context</span>
                    </div>
                    <div className="flex items-center justify-center gap-3 text-purple-300">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-700"></div>
                      <span className="text-sm">Generating audio</span>
                    </div>
                    <div className="flex items-center justify-center gap-3 text-purple-300">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-1000"></div>
                      <span className="text-sm">Merging video</span>
                    </div>
                  </div>
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
                <h3 className="text-xl font-semibold text-white mb-4">🎬 Your Dubbed Video</h3>
                <div className="bg-black/50 rounded-2xl overflow-hidden border border-white/10">
                  <video
                    controls
                    className="w-full h-auto max-h-96"
                    src={`http://localhost:3001${result.downloadUrl}`}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={`http://localhost:3001${result.downloadUrl}`}
                  download
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-xl text-center flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Video
                </a>
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
            Powered by AI • Made with ❤️ for content creators
          </p>
        </div>
      </div>
    </div>
  );
}