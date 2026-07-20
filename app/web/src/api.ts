export type PublicUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
};

export type LlmSettings = {
  baseUrl: string;
  modelId: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  source: "user" | "env" | "none";
};

export type MeetingListItem = {
  id: string;
  title: string;
  status: string;
  summary: string;
  minutesStatus: string;
  createdAt: string;
  updatedAt: string;
  latestJobStatus: string | null;
};

export type TranscriptLine = {
  id: string;
  idx: number;
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type MinutesDoc = {
  topic: string;
  time: string;
  place: string;
  participants: string;
  goal: string;
  topics: Array<{ title: string; bullets: string[]; sub?: string }>;
  disputes: string[];
  actionItems: Array<{ owner: string; action: string }>;
  timeline: string[];
  markdown: string;
  source?: string;
  model?: string;
  generatedAt?: string;
};

export type MeetingDetail = MeetingListItem & {
  recordings: Array<{
    id: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    source: string;
    createdAt: string;
    durationMs: number | null;
  }>;
  jobs: Array<{
    id: string;
    status: string;
    engine: string;
    errorMessage: string;
    recordingId: string;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
  transcript: TranscriptLine[];
  primaryRecordingId: string | null;
  durationMs: number | null;
  minutesMarkdown: string;
  minutes: MinutesDoc | null;
  insightsStatus: string;
  insightsMarkdown: string;
};

export type QaTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ApiError = {
  error?: string;
  message?: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiBase(): string {
  return API_BASE;
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; data: ApiError }> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = await parseJson<T & ApiError>(res);
  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }
  return { ok: true, status: res.status, data };
}

export function getMeta() {
  return api<{ appName: string; registrationOpen: boolean }>("/api/auth/meta");
}

export function register(body: { username: string; email: string; password: string }) {
  return api<{ user: PublicUser; expiresAt: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function login(body: { login: string; password: string }) {
  return api<{ user: PublicUser; expiresAt: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function logout() {
  return api<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function getMe() {
  return api<{ user: PublicUser; llm: LlmSettings }>("/api/auth/me");
}

export function putLlmSettings(body: {
  baseUrl?: string;
  modelId?: string;
  apiKey?: string;
  clearApiKey?: boolean;
}) {
  return api<{ llm: LlmSettings }>("/api/auth/settings/llm", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function putProfile(body: { displayName: string }) {
  return api<{ user: PublicUser }>("/api/auth/settings/profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function listMeetings() {
  return api<{ meetings: MeetingListItem[] }>("/api/meetings");
}

export function getMeeting(id: string) {
  return api<{ meeting: MeetingDetail }>(`/api/meetings/${id}`);
}

export function uploadRecording(input: {
  file: Blob;
  filename: string;
  meetingId?: string;
  title?: string;
  source: "upload" | "browser";
}) {
  const form = new FormData();
  form.append("file", input.file, input.filename);
  form.append("source", input.source);
  if (input.meetingId) form.append("meetingId", input.meetingId);
  if (input.title) form.append("title", input.title);
  return api<{ meeting: MeetingDetail; jobId: string }>("/api/meetings/upload", {
    method: "POST",
    body: form,
  });
}

export function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function generateMinutes(meetingId: string) {
  return api<{ minutes: MinutesDoc }>(`/api/meetings/${meetingId}/minutes/generate`, {
    method: "POST",
  });
}

export function saveMinutes(meetingId: string, markdown: string) {
  return api<{ minutes: MinutesDoc }>(`/api/meetings/${meetingId}/minutes`, {
    method: "PUT",
    body: JSON.stringify({ markdown }),
  });
}

export function saveMinutesDoc(meetingId: string, doc: Partial<MinutesDoc>) {
  return api<{ minutes: MinutesDoc }>(`/api/meetings/${meetingId}/minutes`, {
    method: "PUT",
    body: JSON.stringify(doc),
  });
}

export function listQa(meetingId: string) {
  return api<{ turns: QaTurn[] }>(`/api/meetings/${meetingId}/qa`);
}

export function askQa(meetingId: string, question: string) {
  return api<{ turns: QaTurn[]; answer: string }>(`/api/meetings/${meetingId}/qa`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export function generateInsights(meetingId: string) {
  return api<{ insights: { status: string; markdown: string } }>(
    `/api/meetings/${meetingId}/insights/generate`,
    { method: "POST" },
  );
}

export function deleteMeeting(meetingId: string) {
  return api<{ ok: boolean }>(`/api/meetings/${meetingId}`, { method: "DELETE" });
}

export function cancelMeetingJobs(meetingId: string) {
  return api<{
    ok: boolean;
    cancelledJobIds: string[];
    meeting: MeetingDetail;
  }>(`/api/meetings/${meetingId}/jobs/cancel`, { method: "POST" });
}

/** Cookie-auth audio URL (same origin / Vite proxy). */
export function meetingAudioUrl(meetingId: string, recordingId?: string | null): string {
  const q = recordingId ? `?recordingId=${encodeURIComponent(recordingId)}` : "";
  return `${API_BASE}/api/meetings/${meetingId}/audio${q}`;
}

export function exportMdUrl(meetingId: string, withTranscript = false): string {
  const q = withTranscript ? "?transcript=1" : "";
  return `${API_BASE}/api/meetings/${meetingId}/export.md${q}`;
}

export function exportPdfUrl(meetingId: string, withTranscript = false): string {
  const q = withTranscript ? "?transcript=1" : "";
  return `${API_BASE}/api/meetings/${meetingId}/export.pdf${q}`;
}
