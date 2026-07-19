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
  /** succeeded | degraded | failed */
  status: "succeeded" | "degraded" | "failed";
  segments: AsrSegment[];
  errorMessage?: string;
};

export type AsrInput = {
  audioPath: string;
  mimeType: string;
  originalFilename: string;
  meetingTitle: string;
};

export interface AsrEngine {
  readonly name: string;
  transcribe(input: AsrInput): Promise<AsrResult>;
}
