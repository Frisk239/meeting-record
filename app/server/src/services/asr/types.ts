/** Transcription pipeline port — audio path in → speaker-aware segments out. */

export type AsrSegment = {
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
};

export type AsrResult = {
  engine: string;
  /** succeeded | degraded | failed | cancelled */
  status: "succeeded" | "degraded" | "failed" | "cancelled";
  segments: AsrSegment[];
  errorMessage?: string;
};

export type AsrProgress = {
  stage: string;
  percent: number;
  message: string;
  /** Optional raw log line for UI console */
  logLine?: string;
};

export type AsrInput = {
  audioPath: string;
  mimeType: string;
  originalFilename: string;
  meetingTitle: string;
  /** When set, engine registers child for abort */
  jobId?: string;
  onProgress?: (p: AsrProgress) => void;
};

export interface AsrEngine {
  readonly name: string;
  transcribe(input: AsrInput): Promise<AsrResult>;
}
