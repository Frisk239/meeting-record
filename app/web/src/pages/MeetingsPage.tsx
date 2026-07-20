import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  cancelMeetingJobs,
  deleteMeeting,
  listMeetings,
  uploadRecording,
  type MeetingListItem,
} from "../api";
import { useAuth } from "../auth/AuthContext";
import { AudioDropZone } from "../components/AudioDropZone";
import { ConfirmDialog } from "../components/ConfirmDialog";

function statusLabel(m: MeetingListItem): string {
  if (m.latestJobStatus === "queued") return "排队中";
  if (m.latestJobStatus === "running" || m.status === "processing") return "转写中";
  if (m.status === "ready") return "已就绪";
  if (m.status === "failed") return "失败";
  return "草稿";
}

function statusClass(m: MeetingListItem): string {
  if (m.status === "ready") return "pill pill-ok";
  if (m.status === "failed") return "pill pill-err";
  if (m.status === "processing" || m.latestJobStatus === "running") return "pill pill-warn";
  return "pill";
}

function isBusy(m: MeetingListItem): boolean {
  return (
    m.status === "processing" ||
    m.latestJobStatus === "queued" ||
    m.latestJobStatus === "running" ||
    m.minutesStatus === "generating"
  );
}

type DialogState =
  | null
  | { type: "delete"; meeting: MeetingListItem }
  | { type: "cancel"; meeting: MeetingListItem }
  | { type: "menu"; meeting: MeetingListItem };

export function MeetingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionBusy, setActionBusy] = useState(false);
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

  useEffect(() => {
    const busy = items.some((m) => isBusy(m));
    if (!busy) return;
    const t = setInterval(() => {
      void refresh();
    }, 1200);
    return () => clearInterval(t);
  }, [items, refresh]);

  const onPickFile = useCallback(
    async (file: File | null) => {
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
        if (res.data.meeting?.id) {
          navigate(`/meetings/${res.data.meeting.id}`);
        }
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [navigate, refresh],
  );

  async function doDelete(m: MeetingListItem) {
    setActionBusy(true);
    setError(null);
    try {
      const res = await deleteMeeting(m.id);
      if (!res.ok) {
        setError(res.data.message || "删除失败");
        return;
      }
      setDialog(null);
      await refresh();
    } finally {
      setActionBusy(false);
    }
  }

  async function doCancel(m: MeetingListItem) {
    setActionBusy(true);
    setError(null);
    try {
      const res = await cancelMeetingJobs(m.id);
      if (!res.ok) {
        setError(res.data.message || "终止失败");
        return;
      }
      setDialog(null);
      await refresh();
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">笔记</h1>
          <p className="muted">你好，{user?.displayName || user?.username}</p>
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
            accept="audio/*,video/webm,video/mp4,.mp3,.wav,.m4a,.ogg,.flac,.webm"
            hidden
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <p className="muted">加载会议…</p>
      ) : (
        <>
          <AudioDropZone
            disabled={uploading}
            onFile={(f) => void onPickFile(f)}
            label={uploading ? "正在上传…" : "将音频文件拖到此处"}
            hint="支持 wav / mp3 / m4a / webm 等 · 也可点右上角「导入音频」"
          >
            {items.length === 0 ? (
              <div className="drop-zone-body">
                <h2 className="title-sm">还没有会议</h2>
                <p className="muted">
                  拖入音频，或现场录音。上传后自动排队 FunASR 转写（含说话人）。
                </p>
                <div className="row gap wrap" style={{ justifyContent: "center" }}>
                  <Link className="btn btn-primary" to="/record">
                    去录音
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    选择文件
                  </button>
                </div>
              </div>
            ) : (
              <div className="drop-zone-body drop-zone-body-slim">
                <p className="muted caption" style={{ margin: 0 }}>
                  {uploading ? "上传中，请稍候…" : "拖放文件到此区域即可新建会议并转写"}
                </p>
              </div>
            )}
          </AudioDropZone>

          {items.length > 0 ? (
            <ul className="meeting-list" style={{ marginTop: 16 }}>
              {items.map((m) => (
                <li key={m.id} className="meeting-row">
                  <Link className="meeting-card meeting-card-main" to={`/meetings/${m.id}`}>
                    <div className="row gap" style={{ justifyContent: "space-between" }}>
                      <h2 className="meeting-title">{m.title}</h2>
                      <span className={statusClass(m)}>{statusLabel(m)}</span>
                    </div>
                    {m.summary ? <p className="meeting-summary muted">{m.summary}</p> : null}
                    <p className="caption muted">
                      {new Date(m.createdAt).toLocaleString("zh-CN", { hour12: false })}
                    </p>
                  </Link>

                  {/* Desktop: hover/always-visible icon strip */}
                  <div className="meeting-actions meeting-actions-desktop">
                    {isBusy(m) ? (
                      <button
                        type="button"
                        className="icon-action"
                        title="终止转写"
                        onClick={() => setDialog({ type: "cancel", meeting: m })}
                      >
                        ⏹
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-action danger"
                      title="删除"
                      onClick={() => setDialog({ type: "delete", meeting: m })}
                    >
                      🗑
                    </button>
                  </div>

                  {/* Mobile: large ⋯ opens action sheet */}
                  <button
                    type="button"
                    className="meeting-more-mobile"
                    aria-label="更多操作"
                    onClick={() => setDialog({ type: "menu", meeting: m })}
                  >
                    ⋯
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {/* Mobile action sheet */}
      {dialog?.type === "menu" ? (
        <div className="sheet-root" onClick={() => setDialog(null)}>
          <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">{dialog.meeting.title}</p>
            {isBusy(dialog.meeting) ? (
              <button
                type="button"
                className="sheet-item"
                onClick={() =>
                  setDialog({ type: "cancel", meeting: dialog.meeting })
                }
              >
                终止转写
              </button>
            ) : null}
            <button
              type="button"
              className="sheet-item danger"
              onClick={() => setDialog({ type: "delete", meeting: dialog.meeting })}
            >
              删除笔记
            </button>
            <button
              type="button"
              className="sheet-item cancel"
              onClick={() => setDialog(null)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={dialog?.type === "delete"}
        title="删除这条笔记？"
        body="将永久删除会议、录音文件与转写/纪要，且不可恢复。若正在转写会先终止任务。"
        confirmLabel="删除"
        danger
        busy={actionBusy}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.type === "delete") void doDelete(dialog.meeting);
        }}
      />

      <ConfirmDialog
        open={dialog?.type === "cancel"}
        title="终止转写？"
        body="将停止当前排队或运行中的转写。笔记会保留，状态变为失败，可稍后重新导入或追加录音。"
        confirmLabel="终止"
        danger
        busy={actionBusy}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.type === "cancel") void doCancel(dialog.meeting);
        }}
      />
    </div>
  );
}
