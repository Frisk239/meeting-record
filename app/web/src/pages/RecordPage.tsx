import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { uploadRecording } from "../api";

type Phase = "idle" | "recording" | "paused" | "uploading" | "error";

const LONG_PRESS_MS = 800;
/** Mirrors server MAX_RECORDING_MINUTES default; hard stop on client. */
const MAX_MS_DEFAULT = 60 * 60 * 1000;

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RecordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const appendMeetingId = (location.state as { appendMeetingId?: string } | null)
    ?.appendMeetingId;

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pressProgress, setPressProgress] = useState(0);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const accumulatedRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const pressRafRef = useRef<number | null>(null);
  const maxHitRef = useRef(false);

  function clearTick() {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    return () => {
      clearTick();
      stopTracks();
      if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
      if (pressRafRef.current) window.cancelAnimationFrame(pressRafRef.current);
    };
  }, []);

  function startTicker() {
    clearTick();
    tickRef.current = window.setInterval(() => {
      const next = accumulatedRef.current + (Date.now() - startedAtRef.current);
      setElapsed(next);
      if (next >= MAX_MS_DEFAULT && !maxHitRef.current) {
        maxHitRef.current = true;
        void finishAndUpload();
      }
    }, 200);
  }

  async function startRecording() {
    setError(null);
    maxHitRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000);
      accumulatedRef.current = 0;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setPhase("recording");
      startTicker();
    } catch (e) {
      setPhase("error");
      setError(
        e instanceof Error
          ? `无法使用麦克风：${e.message}（需 HTTPS 或 localhost）`
          : "无法使用麦克风",
      );
    }
  }

  function pauseRecording() {
    const rec = mediaRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    accumulatedRef.current += Date.now() - startedAtRef.current;
    clearTick();
    setPhase("paused");
  }

  function resumeRecording() {
    const rec = mediaRef.current;
    if (!rec || rec.state !== "paused") return;
    rec.resume();
    startedAtRef.current = Date.now();
    setPhase("recording");
    startTicker();
  }

  function discardRecording() {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    mediaRef.current = null;
    chunksRef.current = [];
    stopTracks();
    clearTick();
    accumulatedRef.current = 0;
    setElapsed(0);
    setPhase("idle");
    setPressProgress(0);
    maxHitRef.current = false;
  }

  async function finishAndUpload() {
    const rec = mediaRef.current;
    if (!rec) return;
    setPhase("uploading");
    clearTick();
    setPressProgress(0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        resolve(new Blob(chunksRef.current, { type }));
      };
      rec.onerror = () => reject(new Error("录音失败"));
      if (rec.state === "recording" || rec.state === "paused") rec.stop();
      else reject(new Error("录音未在进行"));
    });

    stopTracks();
    mediaRef.current = null;

    if (blob.size < 1) {
      setError("录音为空");
      setPhase("error");
      return;
    }

    const res = await uploadRecording({
      file: blob,
      filename: `browser-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
      source: "browser",
      meetingId: appendMeetingId,
      title: appendMeetingId
        ? undefined
        : `现场录音 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    });

    if (!res.ok) {
      setError(res.data.message || "上传失败");
      setPhase("error");
      return;
    }

    navigate(`/meetings/${res.data.meeting.id}`, { replace: true });
  }

  function onHoldStart() {
    if (phase !== "recording" && phase !== "paused") return;
    const start = Date.now();
    setPressProgress(0);
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / LONG_PRESS_MS);
      setPressProgress(p);
      if (p < 1) pressRafRef.current = window.requestAnimationFrame(tick);
    };
    pressRafRef.current = window.requestAnimationFrame(tick);
    pressTimerRef.current = window.setTimeout(() => {
      void finishAndUpload();
    }, LONG_PRESS_MS);
  }

  function onHoldEnd() {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (pressRafRef.current) {
      window.cancelAnimationFrame(pressRafRef.current);
      pressRafRef.current = null;
    }
    setPressProgress(0);
  }

  const title = appendMeetingId
    ? "追加录音"
    : `新录音 ${new Date().toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}`;

  return (
    <div className="page record-page">
      <header className="page-header">
        <div>
          <p className="caption muted">
            <Link
              className="btn-back"
              to={appendMeetingId ? `/meetings/${appendMeetingId}` : "/"}
              aria-label="返回"
            >
              <span className="btn-back-icon" aria-hidden>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </span>
              <span>返回</span>
            </Link>
          </p>
          <h1 className="page-title">{title}</h1>
          <p className="muted">
            点击中间开始 · <strong>长按结束并上传</strong>（约 0.8 秒）· 上限{" "}
            {MAX_MS_DEFAULT / 60000} 分钟
          </p>
        </div>
      </header>

      <section className="record-stage card">
        <div className="record-status">
          {phase === "idle" && "准备录音"}
          {phase === "recording" && "录音中"}
          {phase === "paused" && "已暂停"}
          {phase === "uploading" && "正在上传并排队转写…"}
          {phase === "error" && "出错了"}
        </div>
        <div className={`timer ${phase === "recording" ? "live" : ""}`}>
          {formatElapsed(elapsed)}
        </div>
        <div
          className={`wave ${phase === "recording" ? "" : "paused"}`}
          aria-hidden
        >
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} />
          ))}
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="record-actions-proto">
          {(phase === "recording" || phase === "paused") && (
            <button
              type="button"
              className="rec-round"
              title="丢弃"
              onClick={discardRecording}
            >
              ✕
            </button>
          )}

          {phase === "idle" || phase === "error" ? (
            <button
              type="button"
              className="rec-main"
              onClick={() => void startRecording()}
              title="开始"
            >
              ●
            </button>
          ) : null}

          {(phase === "recording" || phase === "paused") && (
            <button
              type="button"
              className="rec-main hold-btn"
              style={{ ["--press" as string]: String(pressProgress) }}
              title="长按结束"
              onPointerDown={onHoldStart}
              onPointerUp={onHoldEnd}
              onPointerLeave={onHoldEnd}
              onPointerCancel={onHoldEnd}
            >
              {phase === "paused" ? "▶" : "●"}
            </button>
          )}

          {phase === "recording" ? (
            <button
              type="button"
              className="rec-round"
              title="暂停"
              onClick={pauseRecording}
            >
              Ⅱ
            </button>
          ) : null}
          {phase === "paused" ? (
            <button
              type="button"
              className="rec-round"
              title="继续"
              onClick={resumeRecording}
            >
              ▶
            </button>
          ) : null}
        </div>

        <p className="hold-hint muted caption">
          {phase === "recording" || phase === "paused"
            ? "长按中间按钮确认结束并自动上传"
            : "也可在笔记页「导入音频」"}
        </p>
      </section>
    </div>
  );
}
