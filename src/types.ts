export interface QualityOption {
  name: string;
  resolution: string;
  bandwidth: number;
  url: string;
  progressiveUrl?: string;
  estimatedSize: string;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  duration: number; // in seconds
  thumbnail: string;
  owner: string;
  sourceUrl: string;
  qualities: QualityOption[];
  isDemo?: boolean;
}

export interface BackgroundJob {
  id: string;
  url: string;
  videoId: string;
  title: string;
  thumbnail: string;
  quality: string;
  status: "pending" | "downloading" | "merging" | "completed" | "failed" | "cancelled";
  progress: number;
  downloadSpeed: string;
  fileSize: string;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  createdAt: number;
}
