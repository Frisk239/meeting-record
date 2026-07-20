/**
 * Tracks the in-flight ASR child process so we can abort FunASR mid-run.
 */
import type { ChildProcess } from "node:child_process";

let currentJobId: string | null = null;
let currentChild: ChildProcess | null = null;
/** jobIds that must not start or must discard results */
const cancelled = new Set<string>();

export function registerRunningJob(jobId: string, child: ChildProcess | null): void {
  currentJobId = jobId;
  currentChild = child;
  child?.once("exit", () => {
    if (currentJobId === jobId) {
      currentJobId = null;
      currentChild = null;
    }
  });
}

export function clearRunningJob(jobId: string): void {
  if (currentJobId === jobId) {
    currentJobId = null;
    currentChild = null;
  }
}

export function markJobCancelled(jobId: string): void {
  cancelled.add(jobId);
}

export function isJobCancelled(jobId: string): boolean {
  return cancelled.has(jobId);
}

export function clearCancelled(jobId: string): void {
  cancelled.delete(jobId);
}

export function getRunningJobId(): string | null {
  return currentJobId;
}

/** Kill worker if it matches jobId (or any if jobId omitted for meeting-level abort). */
export function killRunningWorker(jobId?: string): boolean {
  if (!currentChild) return false;
  if (jobId && currentJobId && jobId !== currentJobId) return false;
  if (currentJobId) markJobCancelled(currentJobId);
  try {
    // Windows: kill process tree when possible
    currentChild.kill("SIGTERM");
    // Force after short delay if still alive
    const child = currentChild;
    setTimeout(() => {
      try {
        if (!child.killed) child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, 1500);
  } catch {
    // ignore
  }
  return true;
}
