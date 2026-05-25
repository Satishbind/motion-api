import { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Download, 
  Search, 
  Video, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Trash2, 
  Sparkles, 
  Clock, 
  ArrowRight, 
  ExternalLink, 
  FileVideo, 
  Gauge, 
  Zap, 
  RotateCcw, 
  HelpCircle, 
  X,
  FileDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { VideoInfo, BackgroundJob } from "./types";

export default function App() {
  const [urlInput, setUrlInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  
  // Download queue & processing states
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [activeTab, setActiveTab] = useState<"direct" | "background">("direct");
  const [oneClickLoading, setOneClickLoading] = useState<boolean>(false);

  // Poll intervals reference for background compilations
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Popular pre-filled sample URLs for testing
  const sampleUrls = [
    { label: "Big Buck Bunny (1080p Sample)", url: "https://www.dailymotion.com/video/xaawkmy" },
    { label: "Wildlife Wonders Trailer", url: "https://www.dailymotion.com/video/x8o7v4p" },
    { label: "Tech Review Promo", url: "https://www.dailymotion.com/video/x8np4v5" }
  ];

  // Fetch alive background jobs on mount
  useEffect(() => {
    fetchJobs();
    return () => stopPolling();
  }, []);

  // Set up polling when there are active/downloading jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (job) => job.status === "pending" || job.status === "downloading" || job.status === "merging"
    );

    if (hasActiveJobs) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(fetchJobs, 1500);
      }
    } else {
      stopPolling();
    }
  }, [jobs]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (e) {
      console.error("Failed to sync background job state:", e);
    }
  };

  const handleError = (msg: string) => {
    setError(msg);
    setLoading(false);
    setOneClickLoading(false);
  };

  // Extract metadata and stream options
  const handleAnalyze = async (targetUrl?: string) => {
    const urlToUse = targetUrl || urlInput;
    if (!urlToUse.trim()) {
      return handleError("Kripya valid Dailymotion URL enter karein.");
    }

    setLoading(true);
    setError(null);
    setVideoInfo(null);

    // Auto-update input field value if clicked sample
    if (targetUrl) {
      setUrlInput(targetUrl);
    }

    try {
      const response = await fetch(`/api/info?url=${encodeURIComponent(urlToUse)}`);
      if (!response.ok) {
        let errMsg = "Server could not fetch video metadata.";
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await response.json();
            errMsg = errData.error || errMsg;
          } else {
            const text = await response.text();
            // Chop down to a readable size if it's a huge HTML page
            errMsg = text.length > 200 ? text.substring(0, 200) + "..." : text || errMsg;
          }
        } catch (e) {
          errMsg = `Server error HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      setVideoInfo(data);
      setLoading(false);
    } catch (err: any) {
      handleError(err.message || "Video extract karne me dikkat aayi. Kripya check karein link sahi hai ya nahi.");
    }
  };

  // Handle direct client-side HLS/MP4 proxy stream download
  const handleDirectDownload = (playlistUrl: string, quality: string, progressiveUrl?: string) => {
    if (!videoInfo) return;
    
    // Construct streaming endpoint URL
    let downloadUrl = `/api/download-proxy?title=${encodeURIComponent(videoInfo.title)}&quality=${quality}`;
    if (progressiveUrl) {
      downloadUrl += `&progressiveUrl=${encodeURIComponent(progressiveUrl)}`;
    } else {
      downloadUrl += `&playlistUrl=${encodeURIComponent(playlistUrl)}`;
    }

    // Programmatically trigger download using a hidden anchor tag to prevent iframe/popup blocking
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.setAttribute("download", "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Submit background compilation task to server
  const handleBackgroundJobSubmit = async (playlistUrl: string, quality: string, progressiveUrl?: string) => {
    if (!videoInfo) return;

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: videoInfo.sourceUrl,
          quality,
          playlistUrl,
          progressiveUrl,
          videoId: videoInfo.videoId,
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail,
          duration: videoInfo.duration
        })
      });

      if (!res.ok) {
        throw new Error("Job queue submission rejected by server.");
      }

      // Refresh immediately
      fetchJobs();
    } catch (err: any) {
      alert("Failed to submit job: " + err.message);
    }
  };

  // Perform a smart 1-click automatic selection download
  const handleOneClickSmartDownload = () => {
    if (!videoInfo || videoInfo.qualities.length === 0) return;
    
    setOneClickLoading(true);

    // Auto quality rule: Priority logic selects the highest quality stream
    // 4K has maximum priority, followed by 1080, then 720, etc.
    const bestStream = videoInfo.qualities[0]; // array is sorted descending by bandwidth

    // Trigger instant HLS stream mapping or direct progressive MP4 proxy pipe
    handleDirectDownload(bestStream.url, bestStream.name, bestStream.progressiveUrl);

    setTimeout(() => {
      setOneClickLoading(false);
    }, 2000);
  };

  // Delete / cancel background compiling task
  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        setJobs(jobs.filter((j) => j.id !== jobId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Clear URL input helper
  const clearInput = () => {
    setUrlInput("");
    setError(null);
  };

  // Format digital timers
  const formatSeconds = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Dynamic Ambient Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] bg-cyan-500/5 blur-[120px] pointer-events-none rounded-full" />
      
      {/* Decorative Grid Line Accents */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-35 pointer-events-none" />

      {/* Primary Container */}
      <div className="relative max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:py-12">
        
        {/* Header Branding */}
        <header className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-950/40 border border-cyan-500/20 rounded-full text-xs font-semibold text-cyan-400 tracking-wide mb-4">
            <Zap className="w-3.5 h-3.5 fill-current animate-pulse text-cyan-300" />
            SUPERFAST & AUTO-COMPILER INCLUDED
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white select-none">
            Motion <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400">Quality Downloader</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
            Dailymotion video URLs paste karein aur high speed direct ya bg-processed downloads up to <span className="text-cyan-400 font-bold">4K Quality</span> me hasil karein.
          </p>
        </header>

        {/* Input submission box wrapper */}
        <section className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-md mb-8">
          <h2 className="text-sm font-bold tracking-wider text-slate-400 uppercase mb-3 flex items-center gap-2">
            <Video className="w-4 h-4 text-cyan-400" />
            Dailymotion Video Link Dalein
          </h2>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="https://www.dailymotion.com/video/xaawkmy"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-cyan-500/50 hover:border-slate-700 rounded-xl px-4 py-3.5 text-sm outline-none transition-all pr-10 text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/10 font-mono tracking-tight"
                id="video-link-input"
              />
              {urlInput && (
                <button
                  onClick={clearInput}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <button
              onClick={() => handleAnalyze()}
              disabled={loading}
              className="px-6 py-3.5 bg-gradient-to-r from-cyan-500 to-sky-600 hover:from-cyan-400 hover:to-sky-500 text-slate-950 font-bold rounded-xl transition-all shadow-lg hover:shadow-cyan-500/10 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 text-sm tracking-wide"
              id="analyze-button"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing Video...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 stroke-[3px]" />
                  Verify & Extract Link
                </>
              )}
            </button>
          </div>

          {/* Quick Sandbox Try Samples helper */}
          <div className="mt-4 pt-4 border-t border-slate-800/60">
            <p className="text-xs font-medium text-slate-500 mb-2">Try checking sample URLs to test fast speed compiling instantly:</p>
            <div className="flex flex-wrap gap-2">
              {sampleUrls.map((sample, i) => (
                <button
                  key={i}
                  onClick={() => handleAnalyze(sample.url)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-cyan-950/30 border border-slate-800 hover:border-cyan-800/40 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-cyan-300 transition-all cursor-pointer"
                >
                  <Play className="w-2.5 h-2.5 fill-current opacity-70" />
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Error Notification Block */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-rose-950/20 border border-rose-900/40 p-4 rounded-xl flex items-start gap-3 mb-8"
            >
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold tracking-wide uppercase text-rose-300">Analysis fail or Link restricted</h4>
                <p className="text-xs text-rose-200/90 mt-1 leading-relaxed">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Analyzed Video Panel */}
        <AnimatePresence>
          {videoInfo && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 mb-10"
            >
              {/* Core Information Section - Bento layout */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-900/40 border border-slate-800 p-5 rounded-2xl shadow-md">
                
                {/* Thumbnail Display with play Overlay */}
                <div className="md:col-span-5 relative group aspect-video rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
                  <img
                    src={videoInfo.thumbnail}
                    alt={videoInfo.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/30 to-transparent flex items-end p-4">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/80 border border-slate-800/80 backdrop-blur-sm rounded-md text-[10px] font-mono font-bold tracking-tight text-cyan-400">
                      <Clock className="w-3.5 h-3.5" />
                      {formatSeconds(videoInfo.duration)}
                    </div>
                  </div>
                </div>

                {/* Video Info Details */}
                <div className="md:col-span-7 flex flex-col justify-between">
                  <div>
                    {videoInfo.isDemo && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-yellow-950/50 border border-yellow-700/30 rounded-md text-[10px] font-bold text-yellow-400 mb-2">
                        <Sparkles className="w-3 h-3 fill-current" />
                        Simulation Preview (All features active)
                      </span>
                    )}
                    <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug line-clamp-2">
                      {videoInfo.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <p className="text-slate-400 font-medium">Channel: <span className="text-slate-200 font-bold">{videoInfo.owner}</span></p>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                      <p className="font-mono text-slate-500">ID: {videoInfo.videoId}</p>
                    </div>
                  </div>

                  {/* 1-Click Fast automatic Select Card */}
                  <div className="mt-4 pt-4 border-t border-slate-800/80">
                    <div className="bg-gradient-to-br from-cyan-950/40 to-indigo-950/40 border border-cyan-500/20 p-4 rounded-xl flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-extrabold tracking-wider uppercase text-cyan-400 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 fill-current animate-bounce" />
                          Recommended Automatic download
                        </span>
                        <h4 className="text-sm font-bold text-slate-100">
                          Highest Available Quality ({videoInfo.qualities[0]?.name || "Auto"}p)
                        </h4>
                        <p className="text-xs text-slate-400">
                          Automatic format mapping & fast speed segments proxy. Est Size: <span className="text-white font-mono font-bold">{videoInfo.qualities[0]?.estimatedSize || "Unknown"}</span>
                        </p>
                      </div>

                      <button
                        onClick={handleOneClickSmartDownload}
                        disabled={oneClickLoading}
                        className="py-3 px-5 shrink-0 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg transition-all font-bold text-xs tracking-wider flex items-center gap-2 shadow-md shadow-cyan-400/10 cursor-pointer disabled:opacity-50"
                      >
                        {oneClickLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Piping...
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                            1-Click Fast Download
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                </div>

              </div>

              {/* Granular Download Options - Tab system */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="flex border-b border-slate-800 bg-slate-900/30">
                  <button
                    onClick={() => setActiveTab("direct")}
                    className={`flex-1 py-4.5 px-4 text-xs sm:text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 cursor-pointer ${
                      activeTab === "direct" 
                        ? "border-cyan-400 text-cyan-400 bg-cyan-950/10" 
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    ⚡ Fast Direct Stream (Piping)
                  </button>
                  <button
                    onClick={() => setActiveTab("background")}
                    className={`flex-1 py-4.5 px-4 text-xs sm:text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 cursor-pointer ${
                      activeTab === "background" 
                        ? "border-cyan-400 text-cyan-400 bg-cyan-950/10" 
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Gauge className="w-4 h-4" />
                    ⚙️ Server Background Stitching (Compiler)
                  </button>
                </div>

                {/* Sub Tab Area Info */}
                <div className="p-4 bg-slate-950/60 border-b border-slate-800/50">
                  {activeTab === "direct" ? (
                    <p className="text-xs leading-relaxed text-slate-400 flex items-start gap-1 p-1">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span>
                        <strong>Direct Stream (Piping) :-</strong> Is feature ke zaraye video download instant shuru hogi. Server HLS chunks ko connect kar ke system standard storage me stream pipe karega bina server storage ke use ke. Fast downloading rate me subse behter hai!
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs leading-relaxed text-slate-400 flex items-start gap-1 p-1">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span>
                        <strong>Server Background Compile (HLS compiler) :-</strong> Agar aap offline ya stable full file save chahte hain, to server background processor saare chunks ko background task me download karke stable MP4 file taiyar karega. Complete ho jane par file save link mil jayega!
                      </span>
                    </p>
                  )}
                </div>

                {/* Quality options list table */}
                <div className="divide-y divide-slate-800/80">
                  {videoInfo.qualities.map((quality, i) => (
                    <div 
                      key={i} 
                      className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-900/20 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-center text-slate-400 group-hover:border-cyan-500/20 transition-all">
                          {quality.name.includes("2160") || quality.name.toLowerCase().includes("4k") ? (
                            <span className="text-[10px] tracking-tight font-extrabold text-cyan-400">4K UHD</span>
                          ) : (
                            <span className="text-xs font-bold font-mono text-slate-300">{quality.name}p</span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                            {quality.name.includes("2160") || quality.name.toLowerCase().includes("4k") ? "4K Video Quality" : `Resolution: ${quality.resolution}`}
                            {quality.progressiveUrl && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-500/20 text-emerald-400 rounded font-medium">MP4 Stream</span>
                            )}
                          </h4>
                          <p className="text-xs text-slate-400">
                            Est Size: <span className="text-white font-mono font-bold">{quality.estimatedSize}</span> &middot; Bandwidth: <span className="text-slate-300 font-mono font-bold text-[11px]">{(quality.bandwidth / 1024).toFixed(0)} kbps</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        {activeTab === "direct" ? (
                          <button
                            onClick={() => handleDirectDownload(quality.url, quality.name, quality.progressiveUrl)}
                            className="w-full sm:w-auto py-2.5 px-4.5 bg-slate-950 hover:bg-cyan-500 hover:text-slate-950 border border-slate-800 hover:border-cyan-500 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Direct Download
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBackgroundJobSubmit(quality.url, quality.name, quality.progressiveUrl)}
                            className="w-full sm:w-auto py-2.5 px-4.5 bg-slate-950 hover:bg-cyan-500 hover:text-slate-950 border border-slate-800 hover:border-cyan-500 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Gauge className="w-3.5 h-3.5" />
                            Launch BG Thread
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Server background Compile task manager */}
        <section className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-bold tracking-wider text-slate-300 uppercase flex items-center gap-2">
              <Gauge className="w-4.5 h-4.5 text-cyan-400" />
              Background Compile Tracker
            </h3>
            {jobs.length > 0 && (
              <button
                onClick={fetchJobs}
                className="p-1 px-2 hover:bg-slate-800 border border-slate-800/60 rounded text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                Sync Updates
              </button>
            )}
          </div>

          {jobs.length === 0 ? (
            <div className="text-center py-10 bg-slate-950/40 border border-dashed border-slate-800 rounded-xl">
              <FileVideo className="w-10 h-10 text-slate-700 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Job compile list empty.</p>
              <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto p-1 leading-relaxed">
                Upar playlist me quality select karke "Launch BG Thread" trigger karein taaki automatic asynchronous compile track ho sake.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div 
                  key={job.id} 
                  className="bg-slate-950/80 border border-slate-800 p-4 sm:p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all hover:border-slate-700/60"
                >
                  {/* Job meta thumbnails */}
                  <div className="flex items-center gap-4">
                    <img 
                      src={job.thumbnail} 
                      alt="" 
                      className="w-16 h-10 object-cover rounded bg-slate-900 border border-slate-800 shrink-0"
                    />
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono tracking-tight font-bold bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-slate-400 rounded-md">
                        {job.quality}p Stream
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-200 line-clamp-1 max-w-[280px] sm:max-w-[400px]">
                        {job.title}
                      </h4>
                      <p className="text-[10px] text-slate-500">Job Reference ID: {job.id}</p>
                    </div>
                  </div>

                  {/* Processing gauges */}
                  <div className="flex-1 max-w-md space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      {job.status === "downloading" ? (
                        <span className="text-cyan-400 font-bold flex items-center gap-1 select-none animate-pulse">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Downloading segments ({job.progress}%)
                        </span>
                      ) : job.status === "completed" ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1 select-none">
                          <CheckCircle className="w-3.5 h-3.5 fill-current text-emerald-500" />
                          Compile Successfully Completed
                        </span>
                      ) : job.status === "failed" ? (
                        <span className="text-rose-400 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          Error: {job.error || "Execution terminated"}
                        </span>
                      ) : job.status === "cancelled" ? (
                        <span className="text-slate-500 font-medium">Cancelled</span>
                      ) : (
                        <span className="text-slate-400 select-none flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                          Analyzing playlist source...
                        </span>
                      )}
                      
                      <span className="text-[10px] font-mono text-slate-400">
                        {job.downloadSpeed && job.downloadSpeed !== "0 KB/s" && (
                          <span className="text-cyan-400 font-bold pr-2">{job.downloadSpeed}</span>
                        )}
                        {job.fileSize}
                      </span>
                    </div>

                    {/* Progress slider bar */}
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          job.status === "failed" 
                            ? "bg-rose-500" 
                            : job.status === "completed" 
                            ? "bg-emerald-500" 
                            : "bg-gradient-to-r from-cyan-400 to-indigo-500"
                        }`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Job terminal states triggers */}
                  <div className="flex items-center gap-2 justify-end">
                    {job.status === "completed" ? (
                      <a
                        href={`/api/jobs/${job.id}/download`}
                        className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-md shadow-emerald-500/10"
                      >
                        <FileDown className="w-4 h-4" />
                        Download Video
                      </a>
                    ) : null}
                    
                    <button
                      onClick={() => handleDeleteJob(job.id)}
                      className="p-2.5 border border-slate-800 hover:border-rose-950/70 hover:bg-rose-950/20 text-slate-500 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                      title="Clear session job"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Helpful User FAQ and guide tips */}
        <section className="mt-12 border-t border-slate-900 pt-8 max-w-3xl mx-auto">
          <h3 className="text-sm font-extrabold tracking-wider text-slate-400 uppercase text-center mb-6 flex items-center justify-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            FREQUENTLY ASKED QUESTIONS (FAQ) & QUICK GUIDE
          </h3>

          <div className="space-y-4">
            <div className="bg-slate-900/15 border border-slate-800/50 p-4 rounded-xl">
              <h4 className="text-xs font-bold text-white mb-1">Q1. Download speeds ko subse fast kaise rakhein?</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Direct Download feature subse fast speed faraham karta hai. Isme file segments ko server memory se hote huye seedhe browser download stream me bheja jata hai jisse bina background wait ke click karte hi downloading shuru ho jati hai.
              </p>
            </div>

            <div className="bg-slate-900/15 border border-slate-800/50 p-4 rounded-xl">
              <h4 className="text-xs font-bold text-white mb-1">Q2. Automatic quality format selection kya karata hai?</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                "1-Click Fast Download" card automatically video information extract karte samay available qualities me se subse behtar video quality format ko extract karke single tap download process launch kar deta hai.
              </p>
            </div>

            <div className="bg-slate-900/15 border border-slate-800/50 p-4 rounded-xl">
              <h4 className="text-xs font-bold text-white mb-1">Q3. Background compile aur local stream me kya antar hai?</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Stitched/Segment standard quality videos me agar direct stream play nahi hoti, to server background compiler background flow shuru karke standard binary segments ko ek solid .mp4 merge file me compose karta hai jo download karne par VLC aur Mobile gallery me 100% responsive play hoti hai.
              </p>
            </div>
          </div>
        </section>

        {/* Custom Humble Credits */}
        <footer className="mt-14 pb-4 text-center border-t border-slate-900/60 pt-6">
          <p className="text-xs text-slate-600 font-medium font-mono">
            Direct Proxy Video Mapping System &middot; 4K UHD Downloader Engine
          </p>
        </footer>

      </div>
    </div>
  );
}
