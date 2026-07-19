import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  formatTime,
  generateInsights,
  generateMinutes,
  getMeeting,
  saveMinutes,
  type MeetingDetail,
} from "../api";

type Tab = "minutes" | "transcript" | "insights";

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("minutes");
  const [groupBy, setGroupBy] = useState<"time" | "speaker">("time");
  const [editMd, setEditMd] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const res = await getMeeting(id);
    if (!res.ok) {
      setError(res.data.message || "加载失败");
      return;
    }
    setError(null);
    setMeeting(res.data.meeting);
    if (!editing) {
      setEditMd(res.data.meeting.minutesMarkdown || "");
    }
  }, [id, editing]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!meeting) return;
    const busyJob =
      meeting.status === "processing" ||
      meeting.minutesStatus === "generating" ||
      meeting.jobs.some((j) => j.status === "queued" || j.status === "running");
    if (!busyJob) return;
    const t = setInterval(() => void refresh(), 1000);
    return () => clearInterval(t);
  }, [meeting, refresh]);

  async function onRegenerate() {
    if (!id) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await generateMinutes(id);
      if (!res.ok) {
        setMsg(res.data.message || "生成失败");
        return;
      }
      setEditing(false);
      await refresh();
      setMsg("纪要已重新生成");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!id) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await saveMinutes(id, editMd);
      if (!res.ok) {
        setMsg(res.data.message || "保存失败");
        return;
      }
      setEditing(false);
      await refresh();
      setMsg("已保存");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="page">
        <p className="form-error">{error}</p>
        <Link to="/">返回</Link>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  const job = meeting.jobs[0];
  const lines =
    groupBy === "time"
      ? meeting.transcript
      : [...meeting.transcript].sort((a, b) =>
          a.speaker === b.speaker ? a.startMs - b.startMs : a.speaker.localeCompare(b.speaker),
        );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="caption muted">
            <Link to="/">笔记</Link> / 详情
          </p>
          <h1 className="page-title">{meeting.title}</h1>
          <p className="muted caption">
            状态：{meeting.status}
            {job ? ` · Job ${job.status} (${job.engine})` : ""}
            {` · 纪要 ${meeting.minutesStatus}`}
          </p>
        </div>
        <div className="row gap wrap">
          <a className="btn btn-ghost" href={`/api/meetings/${meeting.id}/export.md`}>
            导出 MD
          </a>
          <a
            className="btn btn-ghost"
            href={`/api/meetings/${meeting.id}/export.md?transcript=1`}
          >
            MD+原文
          </a>
          <a className="btn btn-primary" href={`/api/meetings/${meeting.id}/export.pdf`}>
            导出 PDF
          </a>
        </div>
      </header>

      <div className="segmented tabs-3" role="tablist">
        <button
          type="button"
          className={tab === "minutes" ? "active" : ""}
          onClick={() => setTab("minutes")}
        >
          纪要
        </button>
        <button
          type="button"
          className={tab === "transcript" ? "active" : ""}
          onClick={() => setTab("transcript")}
        >
          原文
        </button>
        <button
          type="button"
          className={tab === "insights" ? "active" : ""}
          onClick={() => setTab("insights")}
        >
          外脑
        </button>
      </div>

      {msg ? <p className="form-ok">{msg}</p> : null}

      {tab === "minutes" ? (
        <section className="card stack">
          <div className="row gap wrap" style={{ justifyContent: "space-between" }}>
            <h2 className="title-sm">纪要</h2>
            <div className="row gap wrap">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || meeting.transcript.length === 0}
                onClick={() => void onRegenerate()}
              >
                重新生成
              </button>
              {!editing ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!meeting.minutesMarkdown && meeting.minutesStatus !== "ready"}
                  onClick={() => {
                    setEditMd(meeting.minutesMarkdown || "");
                    setEditing(true);
                  }}
                >
                  编辑
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setEditing(false);
                      setEditMd(meeting.minutesMarkdown || "");
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => void onSave()}
                  >
                    保存
                  </button>
                </>
              )}
            </div>
          </div>

          {meeting.minutesStatus === "generating" ? (
            <p className="muted">正在生成纪要…</p>
          ) : null}
          {meeting.minutesStatus === "failed" ? (
            <p className="form-error">自动纪要失败，可点「重新生成」</p>
          ) : null}
          {meeting.minutesStatus === "none" && meeting.status !== "ready" ? (
            <p className="muted">转写完成后将自动生成纪要。</p>
          ) : null}

          {editing ? (
            <textarea
              className="minutes-editor"
              value={editMd}
              onChange={(e) => setEditMd(e.target.value)}
              rows={18}
            />
          ) : meeting.minutesMarkdown ? (
            <pre className="minutes-view">{meeting.minutesMarkdown}</pre>
          ) : (
            <p className="muted">暂无纪要内容</p>
          )}
        </section>
      ) : null}

      {tab === "insights" ? (
        <section className="card stack">
          <div className="row gap wrap" style={{ justifyContent: "space-between" }}>
            <h2 className="title-sm">AI 外脑</h2>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void (async () => {
                if (!id) return;
                setBusy(true);
                setMsg(null);
                try {
                  const res = await generateInsights(id);
                  if (!res.ok) {
                    setMsg(res.data.message || "生成失败");
                    return;
                  }
                  await refresh();
                  setMsg("外脑已生成（仅本次显式触发）");
                } finally {
                  setBusy(false);
                }
              })()}
            >
              {meeting.insightsStatus === "ready" ? "重新生成" : "一键生成"}
            </button>
          </div>
          <p className="muted caption">转写成功后不自动生成。仅在你点击时调用 LLM/mock。</p>
          {meeting.insightsMarkdown ? (
            <pre className="minutes-view">{meeting.insightsMarkdown}</pre>
          ) : (
            <p className="muted">尚未生成外脑内容。</p>
          )}
        </section>
      ) : null}

      {tab === "minutes" ? (
        <Link className="fab-ask" to={`/meetings/${meeting.id}/qa`}>
          追问
        </Link>
      ) : null}

      {tab === "transcript" ? (
        <section className="card stack">
          <div className="row gap wrap" style={{ justifyContent: "space-between" }}>
            <h2 className="title-sm">原文</h2>
            <div className="segmented" style={{ marginBottom: 0, maxWidth: 220 }}>
              <button
                type="button"
                className={groupBy === "time" ? "active" : ""}
                onClick={() => setGroupBy("time")}
              >
                按时间
              </button>
              <button
                type="button"
                className={groupBy === "speaker" ? "active" : ""}
                onClick={() => setGroupBy("speaker")}
              >
                按说话人
              </button>
            </div>
          </div>

          {meeting.status === "processing" ||
          job?.status === "queued" ||
          job?.status === "running" ? (
            <p className="muted">转写进行中…</p>
          ) : null}

          {job?.status === "failed" ? (
            <p className="form-error">{job.errorMessage || "转写失败"}</p>
          ) : null}

          {lines.length === 0 && meeting.status === "ready" ? (
            <p className="muted">暂无转写段落</p>
          ) : null}

          <ul className="transcript-list">
            {lines.map((line) => (
              <li key={line.id} className="transcript-line">
                <div className="transcript-meta">
                  <span className="speaker">{line.speaker}</span>
                  <span className="muted caption">
                    {formatTime(line.startMs)} – {formatTime(line.endMs)}
                  </span>
                </div>
                <p className="transcript-text">{line.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
