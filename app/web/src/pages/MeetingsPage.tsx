import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listMeetings, uploadRecording, type MeetingListItem } from "../api";
import { useAuth } from "../auth/AuthContext";

function statusLabel(m: MeetingListItem): string {
  if (m.latestJobStatus === "queued" || m.latestJobStatus === "running") return "转写中";
  if (m.status === "ready") return "已就绪";
  if (m.status === "failed") return "失败";
  if (m.status === "processing") return "处理中";
  return "草稿";
}

function statusClass(m: MeetingListItem): string {
  if (m.status === "ready") return "pill pill-ok";
  if (m.status === "failed") return "pill pill-err";
  if (m.status === "processing" || m.latestJobStatus === "running") return "pill pill-warn";
  return "pill";
}

export function MeetingsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await listMeetings();
    if (!res.ok) {
      setError(res.data.message || "加载失败");
      return;
    }
    setError(null);
    setItems(res.data.meetings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Poll while any job is in flight
  useEffect(() => {
    const busy = items.some(
      (m) =>
        m.status === "processing" ||
        m.latestJobStatus === "queued" ||
        m.latestJobStatus === "running",
    );
    if (!busy) return;
    const t = setInterval(() => {
      void refresh();
    }, 1200);
    return () => clearInterval(t);
  }, [items, refresh]);

  async function onPickFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadRecording({
        file,
        filename: file.name,
        source: "upload",
        title: `导入 ${file.name.replace(/\.[^.]+$/, "")}`,
      });
      if (!res.ok) {
        setError(res.data.message || "上传失败");
        return;
      }
      await refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">笔记</h1>
          <p className="muted">你好，{user?.username}</p>
        </div>
        <div className="row gap wrap">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "上传中…" : "导入音频"}
          </button>
          <Link className="btn btn-primary" to="/record">
            开始录音
          </Link>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,video/webm,video/mp4"
            hidden
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <p className="muted">加载会议…</p>
      ) : items.length === 0 ? (
        <section className="empty-card">
          <h2 className="title-sm">还没有会议</h2>
          <p className="muted">现场录音或导入音频后，会自动排队转写（当前为 mock ASR）。</p>
          <div className="row gap">
            <Link className="btn btn-primary" to="/record">
              去录音
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => fileRef.current?.click()}
            >
              导入音频
            </button>
          </div>
        </section>
      ) : (
        <ul className="meeting-list">
          {items.map((m) => (
            <li key={m.id}>
              <Link className="meeting-card" to={`/meetings/${m.id}`}>
                <div className="row gap" style={{ justifyContent: "space-between" }}>
                  <h2 className="meeting-title">{m.title}</h2>
                  <span className={statusClass(m)}>{statusLabel(m)}</span>
                </div>
                {m.summary ? <p className="meeting-summary muted">{m.summary}</p> : null}
                <p className="caption muted">
                  {new Date(m.createdAt).toLocaleString("zh-CN", { hour12: false })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
