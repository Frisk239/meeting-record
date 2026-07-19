import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export function resolveDataDir(): string {
  return path.isAbsolute(config.dataDir)
    ? config.dataDir
    : path.resolve(process.cwd(), config.dataDir);
}

export function ensureMediaDirs(): void {
  const root = resolveDataDir();
  fs.mkdirSync(path.join(root, "media"), { recursive: true });
  fs.mkdirSync(path.join(root, "exports"), { recursive: true });
}

export function mediaPathFor(userId: string, recordingId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "") || ".bin";
  const dir = path.join(resolveDataDir(), "media", userId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${recordingId}${safeExt.startsWith(".") ? safeExt : `.${safeExt}`}`);
}

export function extFromFilename(name: string, mime: string): string {
  const fromName = path.extname(name);
  if (fromName) return fromName.toLowerCase();
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return ".m4a";
  if (mime.includes("ogg")) return ".ogg";
  return ".bin";
}

export async function writeUpload(
  targetPath: string,
  data: Uint8Array | Buffer,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, data);
}
