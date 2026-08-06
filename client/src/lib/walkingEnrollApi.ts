import { isAxiosError } from "axios";
import { api, apiBase } from "./api";

export type EnrollConfig = {
  count: number;
  faiss_count: number;
  enrolled_faces_dir: string;
  match_threshold: number;
  env_override?: string;
  data_dir: string;
};

export type EnrollItem = {
  id: number;
  name: string;
  folder_name: string;
  folder_path: string;
  source_path: string;
  face_crop_path: string;
  quality: number;
  det_confidence: number;
  created_at: string;
};

export type EnrollListResponse = {
  enrolled_faces_dir: string;
  count: number;
  items: EnrollItem[];
};

export type EnrollCreateResponse = EnrollItem & {
  enrolled_faces_dir: string;
  similarity_threshold: number;
};

export type EnrollDeleteResponse = {
  deleted: boolean;
  id: number;
};

export type FaceSearchDetection = {
  id?: number;
  track_id?: number;
  camera_id?: string;
  timestamp?: string;
  crop_path?: string;
  face_crop_path?: string;
  frame_path?: string;
  identity_name?: string | null;
};

export type FaceSearchHit = {
  detection: FaceSearchDetection;
  face_similarity?: number;
  score?: number;
  matched_face_id?: number;
};

export type FaceSearchDiagnostic = {
  gallery_size?: number;
  threshold?: number;
  face_found?: boolean;
  reason?: string;
};

export type FaceSearchResponse = {
  count: number;
  results: FaceSearchHit[];
  diagnostic?: FaceSearchDiagnostic;
};

export type FaceSearchOptions = {
  top_k?: number;
  threshold?: number;
};

const PREFIX = "/walking-enroll";

export function walkingImageUrl(path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}${PREFIX}/media${normalized}`;
}

export function mapWalkingError(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const parts = detail
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object" && "msg" in entry) {
            return String((entry as { msg?: unknown }).msg ?? "");
          }
          return "";
        })
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    const status = error.response?.status;
    if (status === 400) return "Please check the photo and name, then try again.";
    if (status === 503 || status === 502 || status === 504) {
      return "Face service is temporarily unavailable. Please try again later.";
    }
    if (error.code === "ECONNABORTED") {
      return "The request timed out. Please try again.";
    }
    if (error.message.includes("Network Error")) {
      return "Unable to reach the face enrollment service. Please try again later.";
    }
  }
  return "Something went wrong. Please try again.";
}

export async function fetchEnrollList(): Promise<EnrollListResponse> {
  const { data } = await api.get<EnrollListResponse>(PREFIX, { timeout: 30_000 });
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
    throw new Error("Invalid response from face enrollment service.");
  }
  return data;
}

export async function fetchEnrollItem(id: number): Promise<EnrollItem> {
  const { data } = await api.get<EnrollItem>(`${PREFIX}/${id}`);
  return data;
}

export async function createEnroll(name: string, file: File): Promise<EnrollCreateResponse> {
  const form = new FormData();
  form.append("name", name.trim());
  form.append("file", file);
  const { data } = await api.post<EnrollCreateResponse>(PREFIX, form, {
    timeout: 120_000,
  });
  return data;
}

export async function deleteEnroll(id: number): Promise<EnrollDeleteResponse> {
  const { data } = await api.delete<EnrollDeleteResponse>(`${PREFIX}/${id}`);
  return data;
}

export async function searchByFace(
  file: File,
  options: FaceSearchOptions = {}
): Promise<FaceSearchResponse> {
  const form = new FormData();
  form.append("file", file);
  if (options.top_k != null) form.append("top_k", String(options.top_k));
  if (options.threshold != null) form.append("threshold", String(options.threshold));
  const { data } = await api.post<FaceSearchResponse>(`${PREFIX}/search/face`, form, {
    timeout: 120_000,
  });
  if (!data || typeof data !== "object" || !Array.isArray(data.results)) {
    throw new Error("Invalid response from face search service.");
  }
  return data;
}

export function faceSearchScore(hit: FaceSearchHit): number {
  const raw = hit.face_similarity ?? hit.score ?? 0;
  return Number.isFinite(raw) ? raw : 0;
}

export function emptySearchMessage(response: FaceSearchResponse | null | undefined): string {
  const reason = response?.diagnostic?.reason?.trim();
  if (reason) return reason;
  if (response?.diagnostic?.face_found === false) {
    return "No face detected in the reference photo. Try a clearer frontal image.";
  }
  return "No matching captures found for this face.";
}

export function filterSearchHitsByDate(
  hits: FaceSearchHit[],
  range: { from: Date | null; to: Date | null }
): FaceSearchHit[] {
  if (!range.from && !range.to) return hits;
  return hits.filter((hit) => {
    const ts = hit.detection?.timestamp;
    if (!ts) return true;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return true;
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });
}

export function formatEnrollDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatQuality(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}
