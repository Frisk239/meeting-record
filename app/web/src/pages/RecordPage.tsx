import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { uploadRecording } from "../api";

type Phase = "idle" | "recording" | "paused" | "uploading" | "error";

const LONG_PRESS_MS = 800;
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
      setElapsed(accumulatedRef.current + (Date.now() - startedAtRef.current));
    }, 200);
  }

  async function startRecording() {
    setError(null);
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

    if (elapsed > MAX_MS_DEFAULT) {
      // still upload; server has soft size cap
    }

    const res = await uploadRecording({
      file: blob,
      filename: `browser-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`,
      source: "browser",
      title: `现场录音 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
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

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">录音</h1>
          <p className="muted">点开始 · 长按结束并自动上传 · 默认最长 60 分钟</p>
        </div>
      </header>

      <section className="record-stage card">
        <div className={`timer ${phase === "recording" ? "live" : ""}`}>
          {formatElapsed(elapsed)}
        </div>
        <p className="muted caption">
          {phase === "idle" && "准备就绪"}
          {phase === "recording" && "录音中… 长按下方按钮确认结束"}
          {phase === "paused" && "已暂停"}
          {phase === "uploading" && "正在上传并排队转写…"}
          {phase === "error" && "出错了"}
        </p>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="record-actions">
          {phase === "idle" || phase === "error" ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => void startRecording()}>
              开始录音
            </button>
          ) : null}

          {phase === "recording" ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={pauseRecording}>
                暂停
              </button>
              <button
                type="button"
                className="btn btn-primary btn-lg hold-btn"
                style={{ ["--press" as string]: String(pressProgress) }}
                onPointerDown={onHoldStart}
                onPointerUp={onHoldEnd}
                onPointerLeave={onHoldEnd}
                onPointerCancel={onHoldEnd}
              >
                长按结束
              </button>
              <button type="button" className="btn btn-ghost danger" onClick={discardRecording}>
                丢弃
              </button>
            </>
          ) : null}

          {phase === "paused" ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={resumeRecording}>
                继续
              </button>
              <button
                type="button"
                className="btn btn-primary btn-lg hold-btn"
                style={{ ["--press" as string]: String(pressProgress) }}
                onPointerDown={onHoldStart}
                onPointerUp={onHoldEnd}
                onPointerLeave={onHoldEnd}
                onPointerCancel={onHoldEnd}
              >
                长按结束
              </button>
              <button type="button" className="btn btn-ghost danger" onClick={discardRecording}>
                丢弃
              </button>
            </>
          ) : null}

          {phase === "uploading" ? (
            <p className="muted">请稍候…</p>
          ) : null}
        </div>
      </section>

      <p className="muted caption">
        也可在笔记页「导入音频」。默认 mock ASR；生产设 ASR_ENGINE=funasr 使用 CPU FunASR 旁路。
      </p>
      <Link className="btn btn-ghost" to="/">
        返回笔记
      </Link>
    </div>
  );
}
