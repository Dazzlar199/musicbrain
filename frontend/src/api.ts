import type {
  AnalyzeResponse,
  BenchmarkResponse,
  CompareResponse,
  GeminiResponse,
  MarketCode,
  MarketProfilesResponse,
  StatsResponse,
  ViralResponse,
} from "./types";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const error = await response.json();
      message = error.detail ?? error.error ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function fileFormData(file: File, market?: MarketCode): FormData {
  const formData = new FormData();
  formData.append("file", file);
  if (market) {
    formData.append("market", market);
  }
  return formData;
}

export function fetchStats() {
  return request<StatsResponse>("/api/stats");
}

export function fetchMarketProfiles() {
  return request<MarketProfilesResponse>("/api/market-profiles");
}

export function analyzeTrack(file: File, market: MarketCode) {
  return request<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    body: fileFormData(file, market),
  });
}

export function benchmarkTrack(file: File, market: MarketCode) {
  return request<BenchmarkResponse>("/api/benchmark", {
    method: "POST",
    body: fileFormData(file, market),
  });
}

export function findViralSegment(file: File) {
  return request<ViralResponse>("/api/viral", {
    method: "POST",
    body: fileFormData(file),
  });
}

export function generateGeminiReport(
  file: File,
  market: MarketCode,
  analysisJson: unknown,
  userPrompt?: string,
) {
  const formData = fileFormData(file, market);
  formData.append("analysis_json", JSON.stringify(analysisJson));
  if (userPrompt) formData.append("user_prompt", userPrompt);
  return request<GeminiResponse>("/api/gemini", {
    method: "POST",
    body: formData,
  });
}

export function generateGeminiStructured(
  file: File,
  market: MarketCode,
  analysisJson: unknown,
  userPrompt?: string,
) {
  const formData = fileFormData(file, market);
  formData.append("analysis_json", JSON.stringify(analysisJson));
  if (userPrompt) formData.append("user_prompt", userPrompt);
  return request<Record<string, unknown>>("/api/gemini/structured", {
    method: "POST",
    body: formData,
  });
}

export function listenAnalyze(file: File, market: MarketCode, prompt?: string) {
  const formData = fileFormData(file, market);
  if (prompt) formData.append("prompt", prompt);
  return request<Record<string, unknown>>("/api/listen", {
    method: "POST",
    body: formData,
  });
}

export function hitAnalyze(file: File, market: MarketCode) {
  return request<Record<string, unknown>>("/api/hit-analyze", {
    method: "POST",
    body: fileFormData(file, market),
  });
}

export function hitTiming(file: File, market: MarketCode) {
  return request<Record<string, unknown>>("/api/hit-timing", {
    method: "POST",
    body: fileFormData(file, market),
  });
}

export function compareMixes(fileA: File, fileB: File, market: MarketCode) {
  const formData = new FormData();
  formData.append("file_a", fileA);
  formData.append("file_b", fileB);
  formData.append("market", market);
  return request<CompareResponse>("/api/compare", {
    method: "POST",
    body: formData,
  });
}
