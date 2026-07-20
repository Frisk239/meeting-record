import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  cancelMeetingJobs,
  deleteMeeting,
  exportMdUrl,
  exportPdfUrl,
  formatTime,
  generateInsights,
  generateMinutes,
  getMeeting,
  meetingAudioUrl,
  saveMinutesDoc,
  uploadRecording,
  type MeetingDetail,
  type MinutesDoc,
  type TranscriptLine,
} from "../api";
import { AudioDropZone } from "../components/AudioDropZone";
import { ConfirmDialog } from "../components/ConfirmDialog";

type Tab = "minutes" | "transcript" | "insights";
type RecFilter = "time" | "speaker" | string;

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function emptyMinutes(title: string): MinutesDoc {
  return {
    topic: title,
    time: "",
    place: "",
    participants: "",
    goal: "",
    topics: [],
    disputes: [],
    actionItems: [],
    timeline: [],
    markdown: "",
  };
}

function stageLabel(stage: string): string {
  switch (stage) {
    case "queued":
      return "排队中";
    case "convert":
      return "音频转码";
    case "loading_model":
      return "加载模型";
    case "transcribing":
      return "语音识别";
    case "minutes":
      return "生成纪要";
    case "done":
      return "完成";
    case "error":
      return "失败";
    default:
      return stage || "处理中";
  }
}

function jobBannerText(m: MeetingDetail): string | null {
  const job = m.jobs[0];
  if (job?.status === "queued") {
    return job.progressMessage || "排队等待 CPU 转写…";
  }
  if (job?.status === "running" || m.status === "processing") {
    const stage = stageLabel(job?.progressStage || "");
    const msg = job?.progressMessage || "转写 + 说话人分离进行中…";
    return `${stage} · ${msg}`;
  }
  if (m.minutesStatus === "generating") return "转写完成，正在生成纪要…";
  if (m.status === "failed" || job?.status === "failed") {
    return job?.errorMessage || "任务失败";
  }
  return null;
}

function isTranscribing(m: MeetingDetail): boolean {
  const job = m.jobs[0];
  return (
    m.status === "processing" ||
    job?.status === "queued" ||
    job?.status === "running"
  );
}

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("minutes");
  const [filter, setFilter] = useState<RecFilter>("time");
  const [draft, setDraft] = useState<MinutesDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [confirm, setConfirm] = useState<null | "cancel" | "delete">(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    const res = await getMeeting(id);
    if (!res.ok) {
      setError(res.data.message || "加载失败");
      return;
    }
    setError(null);
    setMeeting(res.data.meeting);
    setDraft((prev) => {
      if (prev && busy) return prev;
      const m = res.data.meeting.minutes;
      return m ? { ...m } : emptyMinutes(res.data.meeting.title);
    });
  }, [id, busy]);

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

  const speakers = useMemo(() => {
    if (!meeting) return [] as string[];
    return [...new Set(meeting.transcript.map((t) => t.speaker))];
  }, [meeting]);

  const lines: TranscriptLine[] = useMemo(() => {
    if (!meeting) return [];
    if (filter === "time" || filter === "speaker") {
      if (filter === "speaker") {
        return [...meeting.transcript].sort((a, b) =>
          a.speaker === b.speaker
            ? a.startMs - b.startMs
            : a.speaker.localeCompare(b.speaker),
        );
      }
      return meeting.transcript;
    }
    return meeting.transcript.filter((t) => t.speaker === filter);
  }, [meeting, filter]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = SPEEDS[speedIdx] ?? 1;
  }, [speedIdx]);

  function onTimeUpdate() {
    const el = audioRef.current;
    if (!el) return;
    setCurrentMs(Math.floor(el.currentTime * 1000));
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  function seekTo(ms: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = ms / 1000;
    setCurrentMs(ms);
    if (el.paused) {
      void el.play();
      setPlaying(true);
    }
  }

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
      await refresh();
      setMsg("纪要已重新生成");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveStructured() {
    if (!id || !draft) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await saveMinutesDoc(id, {
        topic: draft.topic,
        time: draft.time,
        place: draft.place,
        participants: draft.participants,
        goal: draft.goal,
        topics: draft.topics,
        disputes: draft.disputes,
        actionItems: draft.actionItems,
        timeline: draft.timeline,
      });
      if (!res.ok) {
        setMsg(res.data.message || "保存失败");
        return;
      }
      await refresh();
      setMsg("纪要已保存");
    } finally {
      setBusy(false);
    }
  }

  async function onImport(file: File | null) {
    if (!file || !id) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await uploadRecording({
        file,
        filename: file.name,
        meetingId: id,
        source: "upload",
      });
      if (!res.ok) {
        setMsg(res.data.message || "导入失败");
        return;
      }
      await refresh();
      setMsg("已追加音频并排队转写");
      setTab("transcript");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onCancelJob() {
    if (!id) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await cancelMeetingJobs(id);
      if (!res.ok) {
        setMsg(res.data.message || "终止失败");
        return;
      }
      setConfirm(null);
      await refresh();
      setMsg("已终止转写");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteMeeting() {
    if (!id) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await deleteMeeting(id);
      if (!res.ok) {
        setMsg(res.data.message || "删除失败");
        return;
      }
      navigate("/", { replace: true });
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

  if (!meeting || !draft) {
    return (
      <div className="page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  const banner = jobBannerText(meeting);
  const durationMs = meeting.durationMs || 0;
  const progress =
    durationMs > 0 ? Math.min(100, (currentMs / durationMs) * 100) : 0;
  const audioSrc = meetingAudioUrl(meeting.id, meeting.primaryRecordingId);

  return (
    <div className="page detail-page">
      <audio
        ref={audioRef}
        src={meeting.primaryRecordingId ? audioSrc : undefined}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <header className="page-header">
        <div>
          <p className="caption muted">
            <Link to="/">← 笔记</Link>
          </p>
          <h1 className="page-title">{meeting.title}</h1>
          <p className="muted caption">
            {meeting.status}
            {meeting.jobs[0] ? ` · ${meeting.jobs[0].engine}/${meeting.jobs[0].status}` : ""}
            {` · 纪要 ${meeting.minutesStatus}`}
          </p>
        </div>
        <div className="row gap wrap detail-toolbar">
          <a className="btn btn-ghost btn-sm" href={exportMdUrl(meeting.id)}>
            导出 MD
          </a>
          <a className="btn btn-ghost btn-sm" href={exportMdUrl(meeting.id, true)}>
            MD+原文
          </a>
          <a className="btn btn-primary btn-sm" href={exportPdfUrl(meeting.id)}>
            导出 PDF
          </a>
          <button
            type="button"
            className="btn btn-ghost btn-sm danger detail-delete-desktop"
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            删除
          </button>
        </div>
      </header>

      {banner ? (
        <div
          className={`job-banner${meeting.status === "failed" && !isTranscribing(meeting) ? " fail" : ""}`}
        >
          <div className="job-banner-col">
            <div className="job-banner-main">
              <span className="dot" />
              <span>{banner}</span>
              {isTranscribing(meeting) && meeting.jobs[0] ? (
                <span className="job-pct">
                  {Math.max(0, Math.min(100, meeting.jobs[0].progressPercent || 0))}%
                </span>
              ) : null}
            </div>
            {isTranscribing(meeting) && meeting.jobs[0] ? (
              <div
                className="job-progress-track"
                role="progressbar"
                aria-valuenow={meeting.jobs[0].progressPercent || 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i
                  style={{
                    width: `${Math.max(2, Math.min(100, meeting.jobs[0].progressPercent || 0))}%`,
                  }}
                />
              </div>
            ) : null}
            {meeting.status === "failed" && meeting.jobs[0]?.errorMessage ? (
              <p className="job-error-detail">{meeting.jobs[0].errorMessage}</p>
            ) : null}
          </div>
          {isTranscribing(meeting) ? (
            <div className="job-banner-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm danger"
                disabled={busy}
                onClick={() => setConfirm("cancel")}
              >
                终止转写
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm danger mobile-only"
                disabled={busy}
                onClick={() => setConfirm("delete")}
              >
                放弃并删除
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Mobile sticky management bar when idle */}
      {!isTranscribing(meeting) ? (
        <div className="mobile-manage-bar">
          <button
            type="button"
            className="btn btn-ghost btn-sm danger"
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            删除笔记
          </button>
        </div>
      ) : null}

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
        <section className="card stack minutes-structured">
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
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || meeting.minutesStatus === "none"}
                onClick={() => void onSaveStructured()}
              >
                保存修改
              </button>
            </div>
          </div>

          {meeting.minutesStatus === "none" && meeting.status !== "ready" ? (
            <p className="muted">纪要尚未生成。转写成功后将自动生成（Auto Minutes）。</p>
          ) : (
            <>
              <div className="minutes-header">
                <div className="kv-grid">
                  <label>
                    <span>会议主题</span>
                    <input
                      value={draft.topic}
                      onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>会议时间</span>
                    <input
                      value={draft.time}
                      onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>会议地点</span>
                    <input
                      value={draft.place}
                      onChange={(e) => setDraft({ ...draft, place: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>参与主体</span>
                    <input
                      value={draft.participants}
                      onChange={(e) =>
                        setDraft({ ...draft, participants: e.target.value })
                      }
                    />
                  </label>
                  <label className="span-2">
                    <span>核心目标</span>
                    <input
                      value={draft.goal}
                      onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="section">
                <div className="section-title">关键议题内容</div>
                {(draft.topics || []).length === 0 ? (
                  <p className="muted">暂无议题</p>
                ) : (
                  draft.topics.map((t, i) => (
                    <div key={i} className="topic-block">
                      <input
                        className="topic-title-input"
                        value={t.title}
                        onChange={(e) => {
                          const topics = [...draft.topics];
                          topics[i] = { ...t, title: e.target.value };
                          setDraft({ ...draft, topics });
                        }}
                      />
                      {t.sub ? <p className="muted caption">{t.sub}</p> : null}
                      <ul>
                        {(t.bullets || []).map((b, j) => (
                          <li key={j}>
                            <input
                              value={b}
                              onChange={(e) => {
                                const topics = [...draft.topics];
                                const bullets = [...(t.bullets || [])];
                                bullets[j] = e.target.value;
                                topics[i] = { ...t, bullets };
                                setDraft({ ...draft, topics });
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>

              <div className="section">
                <div className="section-title">争议点</div>
                {(draft.disputes || []).length === 0 ? (
                  <p className="muted">（无）</p>
                ) : (
                  draft.disputes.map((d, i) => (
                    <blockquote key={i} className="quote">
                      <textarea
                        value={d}
                        rows={2}
                        onChange={(e) => {
                          const disputes = [...draft.disputes];
                          disputes[i] = e.target.value;
                          setDraft({ ...draft, disputes });
                        }}
                      />
                    </blockquote>
                  ))
                )}
              </div>

              <div className="section">
                <div className="section-title">待办事项</div>
                <ul className="action-list">
                  {(draft.actionItems || []).map((a, i) => (
                    <li key={i}>
                      <input
                        className="who-input"
                        value={a.owner}
                        placeholder="责任人"
                        onChange={(e) => {
                          const actionItems = [...draft.actionItems];
                          actionItems[i] = { ...a, owner: e.target.value };
                          setDraft({ ...draft, actionItems });
                        }}
                      />
                      <input
                        className="grow"
                        value={a.action}
                        placeholder="动作"
                        onChange={(e) => {
                          const actionItems = [...draft.actionItems];
                          actionItems[i] = { ...a, action: e.target.value };
                          setDraft({ ...draft, actionItems });
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="section">
                <div className="section-title">时间轴内容回顾</div>
                {(draft.timeline || []).map((t, i) => (
                  <div key={i} className="timeline-item">
                    <input
                      value={t}
                      onChange={(e) => {
                        const timeline = [...draft.timeline];
                        timeline[i] = e.target.value;
                        setDraft({ ...draft, timeline });
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}

      {tab === "transcript" ? (
        <section className="card stack">
          <div className="player">
            <button type="button" className="icon-btn" onClick={togglePlay} aria-label="播放">
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="time">{formatTime(currentMs)}</span>
            <div className="bar">
              <i style={{ width: `${progress}%` }} />
            </div>
            <span className="time">{formatTime(durationMs)}</span>
            <button
              type="button"
              className="chip"
              onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            >
              {SPEEDS[speedIdx]}x
            </button>
          </div>

          <div className="seg-filters">
            <button
              type="button"
              className={filter === "time" ? "active" : ""}
              onClick={() => setFilter("time")}
            >
              按时间
            </button>
            <button
              type="button"
              className={filter === "speaker" ? "active" : ""}
              onClick={() => setFilter("speaker")}
            >
              按说话人
            </button>
            {speakers.map((s) => (
              <button
                key={s}
                type="button"
                className={filter === s ? "active" : ""}
                onClick={() => setFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>

          {lines.length === 0 ? (
            <p className="muted">暂无原文。转写完成后将显示带说话人标签的分段。</p>
          ) : (
            <ul className="transcript-list">
              {lines.map((line) => (
                <li key={line.id} className="transcript-line">
                  <button
                    type="button"
                    className="transcript-meta as-btn"
                    onClick={() => seekTo(line.startMs)}
                  >
                    <span className="speaker">{line.speaker}</span>
                    <span className="muted caption">
                      {formatTime(line.startMs)} – {formatTime(line.endMs)}
                    </span>
                  </button>
                  <p className="transcript-text">{line.text}</p>
                </li>
              ))}
            </ul>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac"
            hidden
            onChange={(e) => void onImport(e.target.files?.[0] ?? null)}
          />
          <AudioDropZone
            compact
            disabled={busy}
            className="drop-zone-detail"
            onFile={(f) => void onImport(f)}
            label={busy ? "处理中…" : "拖拽音频到此追加导入"}
          >
            <div className="bottom-actions row gap wrap">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                导入音频
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  navigate("/record", { state: { appendMeetingId: meeting.id } })
                }
              >
                追加录音
              </button>
            </div>
          </AudioDropZone>
        </section>
      ) : null}

      {tab === "insights" ? (
        <section className="card stack">
          <div className="row gap wrap" style={{ justifyContent: "space-between" }}>
            <h2 className="title-sm">AI 外脑</h2>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || meeting.status !== "ready"}
              onClick={() =>
                void (async () => {
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
                })()
              }
            >
              {meeting.insightsStatus === "ready" ? "重新生成" : "生成外脑"}
            </button>
          </div>
          <p className="muted caption">
            外脑不会在转写后自动生成。需要时点击按钮显式生成。
          </p>
          {meeting.insightsMarkdown ? (
            <pre className="minutes-view">{meeting.insightsMarkdown}</pre>
          ) : (
            <div className="empty-insights">
              <p className="muted">尚未生成外脑内容。</p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "minutes" && meeting.status === "ready" ? (
        <Link className="fab-ask" to={`/meetings/${meeting.id}/qa`}>
          💬 追问
        </Link>
      ) : null}

      <ConfirmDialog
        open={confirm === "cancel"}
        title="终止转写？"
        body="将停止当前排队或运行中的 FunASR 任务。笔记会保留，可重新导入或追加录音后再转写。"
        confirmLabel="终止"
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void onCancelJob()}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="删除这条笔记？"
        body="将永久删除会议、录音与转写/纪要。若正在转写会先终止任务。此操作不可恢复。"
        confirmLabel="删除"
        danger
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void onDeleteMeeting()}
      />
    </div>
  );
}
