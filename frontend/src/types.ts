export type MarketCode = "kr" | "us" | "jp" | "br" | "latam" | "sea" | "europe" | "uk" | "mena" | "africa" | "india" | "china";

export interface StatsResponse {
  total_tracks: number;
  markets: Partial<Record<MarketCode, number>>;
  spotify_enriched: number;
  score_method?: string;
}

export interface SimilarTrack {
  artist: string;
  title: string;
  genre: string;
  market: string;
  similarity: number;
  popularity: number | null;
  album_art: string;
  spotify_url: string;
}

export interface DeepAnalysis {
  summary: string;
  tempo?: {
    bpm?: number;
    category?: string;
    beat_regularity?: string;
  };
  tonality?: {
    key_name?: string;
    confidence?: number;
  };
  rhythm?: {
    danceability?: number;
    complexity?: number;
    avg_onset_strength?: number;
  };
  energy?: {
    category?: string;
    dynamic_range_db?: number;
    has_buildup?: boolean;
    has_drop?: boolean;
    contour?: number[];
  };
  spectral?: {
    brightness?: string;
    noise_ratio?: number;
    low_mid_high?: {
      balance?: string;
      low_pct?: number;
      mid_pct?: number;
      high_pct?: number;
    };
  };
  vocal?: {
    vocal_presence?: string;
    vocal_prominence?: number;
    harmonic_ratio?: number;
    percussive_ratio?: number;
  };
  mood?: {
    primary_mood?: string;
    valence?: number;
    arousal?: number;
  };
  production?: {
    stereo_width?: string;
    polish_score?: number;
    frequency_fullness?: string;
  };
  structure?: {
    duration_sec?: number;
    intro_sec?: number;
    intro_category?: string;
  };
}

export interface AnalyzeResponse {
  score: number;
  market: MarketCode;
  market_name: string;
  market_scores: Record<MarketCode, number>;
  similar_tracks: SimilarTrack[];
  deep_analysis: DeepAnalysis;
  summary: string;
  score_method?: string;
}

export interface GeminiResponse {
  analysis: string;
}

export interface BenchmarkComparison {
  feature: string;
  label: string;
  kr_label: string;
  unit: string;
  track_value: number;
  market_mean: number;
  market_std: number;
  market_range: string;
  diff: number;
  z_score: number;
  status: string;
  status_kr: string;
  direction: string;
  direction_kr: string;
  advice: string;
}

export interface BenchmarkResponse {
  track: Record<string, number>;
  market_profile: Record<string, unknown> | null;
  sample_count?: number;
  comparisons: BenchmarkComparison[];
  match_score?: number;
  market: MarketCode;
  market_name: string;
  error?: string;
}

export interface ViralSegmentDetails {
  start_sec: number;
  end_sec: number;
  score: number;
  energy?: number;
  rhythm?: number;
  interest?: number;
  vocal?: number;
  hookiness?: number;
}

export interface ViralResponse {
  best: {
    start_sec: number;
    end_sec: number;
    timestamp: string;
    score: number;
    reasons: string[];
    details: ViralSegmentDetails;
  };
  top3: ViralSegmentDetails[];
  segment_duration: number;
}

export interface CompareDifference {
  feature: string;
  a_value: number;
  b_value: number;
  a_status: string;
  b_status: string;
  better: "A" | "B";
  unit: string;
}

export interface CompareResponse {
  winner: "A" | "B" | "TIE";
  score_a: number;
  score_b: number;
  viral_a: ViralResponse["best"];
  viral_b: ViralResponse["best"];
  differences: CompareDifference[];
  market: MarketCode;
  market_name: string;
}

export interface MarketFeatureStats {
  mean: number;
  std: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  count: number;
}

export interface MarketProfilesResponse {
  profiles: Record<string, Record<string, MarketFeatureStats>>;
  total_tracks: number;
  chart_tracks: number;
  markets: string[];
  features: string[];
}
