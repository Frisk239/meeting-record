import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatTime, getMeeting, type MeetingDetail } from "../api";

type Tab = "minutes" | "transcript" | "insights";

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("transcript");
  const [groupBy, setGroupBy] = useState<"time" | "speaker">("time");

  const refresh = useCallback(async () => {
    if (!id) return;
    const res = await getMeeting(id);
    if (!res.ok) {
      setError(res.data.message || "加载失败");
      return;
    }
    setError(null);
    setMeeting(res.data.meeting);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!meeting) return;
    const busy =
      meeting.status === "processing" ||
      meeting.jobs.some((j) => j.status === "queued" || j.status === "running");
    if (!busy) return;
    const t = setInterval(() => void refresh(), 1000);
    return () => clearInterval(t);
  }, [meeting, refresh]);

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
          </p>
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

      {tab === "minutes" ? (
        <section className="card stack">
          <h2 className="title-sm">纪要</h2>
          <p className="muted">
            转写成功后的 <strong>Auto Minutes</strong> 将在 S2 接入。当前可先阅读原文。
          </p>
          {meeting.summary ? (
            <p>
              <span className="muted">摘要预览：</span>
              {meeting.summary}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "insights" ? (
        <section className="card stack">
          <h2 className="title-sm">AI 外脑</h2>
          <p className="muted">仅按需生成；本刀不自动生成。S4 实现。</p>
        </section>
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
