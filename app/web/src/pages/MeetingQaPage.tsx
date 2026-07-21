import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  askQa,
  createQaSession,
  listQaState,
  type QaSessionSummary,
  type QaTurn,
} from "../api";
import { MarkdownView } from "../components/MarkdownView";

function cacheKey(meetingId: string) {
  return `mr:qa:${meetingId}`;
}

type CachePayload = {
  sessions: QaSessionSummary[];
  activeSessionId: string | null;
  turns: QaTurn[];
};

const SUGGESTIONS = [
  "这场会议重点是什么？",
  "有哪些待办？责任人是谁？",
  "实习时长和学分要求？",
  "有哪些需要注意的风险？",
];

function readCache(meetingId: string): CachePayload | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(meetingId));
    if (!raw) return null;
    return JSON.parse(raw) as CachePayload;
  } catch {
    return null;
  }
}

function writeCache(meetingId: string, data: CachePayload) {
  try {
    sessionStorage.setItem(cacheKey(meetingId), JSON.stringify(data));
  } catch {
    // ignore
  }
}

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function MeetingQaPage() {
  const { id } = useParams<{ id: string }>();
  const [sessions, setSessions] = useState<QaSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<QaTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyState = useCallback(
    (data: CachePayload) => {
      setSessions(data.sessions);
      setActiveSessionId(data.activeSessionId);
      setTurns(data.turns);
      if (id) writeCache(id, data);
    },
    [id],
  );

  const load = useCallback(
    async (sessionId?: string | null) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await listQaState(id, sessionId || undefined);
        if (!res.ok) {
          setError(res.data.message || "加载失败");
          return;
        }
        applyState({
          sessions: res.data.sessions,
          activeSessionId: res.data.activeSessionId,
          turns: res.data.turns,
        });
      } finally {
        setLoading(false);
      }
    },
    [id, applyState],
  );

  useEffect(() => {
    if (!id) return;
    const cached = readCache(id);
    if (cached) {
      setSessions(cached.sessions);
      setActiveSessionId(cached.activeSessionId);
      setTurns(cached.turns);
      setLoading(false);
    }
    void load(cached?.activeSessionId);
  }, [id, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy, loading]);

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function sendQuestion(raw: string) {
    if (!id || !raw.trim() || busy) return;
    setBusy(true);
    setError(null);
    const q = raw.trim();
    const tempId = `tmp_${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      {
        id: tempId,
        sessionId: activeSessionId || "",
        role: "user",
        content: q,
        createdAt: new Date().toISOString(),
      },
    ]);
    setQuestion("");
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
    try {
      const res = await askQa(id, q, activeSessionId || undefined);
      if (!res.ok) {
        setError(res.data.message || "提问失败");
        await load(activeSessionId);
        return;
      }
      const full = await listQaState(id, res.data.sessionId);
      if (full.ok) {
        applyState({
          sessions: full.data.sessions,
          activeSessionId: full.data.activeSessionId,
          turns: full.data.turns,
        });
      } else {
        applyState({
          sessions,
          activeSessionId: res.data.sessionId,
          turns: res.data.turns,
        });
      }
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await sendQuestion(question);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendQuestion(question);
    }
  }

  async function onNewSession() {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createQaSession(id);
      if (!res.ok) {
        setError(res.data.message || "无法开启新会话");
        return;
      }
      applyState({
        sessions: [
          {
            id: res.data.session.id,
            title: res.data.session.title,
            createdAt: res.data.session.createdAt,
            updatedAt: res.data.session.updatedAt,
            messageCount: 0,
          },
          ...sessions,
        ],
        activeSessionId: res.data.session.id,
        turns: [],
      });
      setShowHistory(false);
      textareaRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function onSwitchSession(sid: string) {
    if (sid === activeSessionId) {
      setShowHistory(false);
      return;
    }
    setShowHistory(false);
    await load(sid);
  }

  const activeTitle =
    sessions.find((s) => s.id === activeSessionId)?.title || "新会话";
  const empty = !loading && turns.length === 0;

  return (
    <div className="qa-shell">
      {/* Compact chat top bar — ChatGPT / Claude style */}
      <header className="qa-topbar">
        <div className="qa-topbar-left">
          <Link className="qa-back" to={`/meetings/${id}`} aria-label="返回纪要">
            ←
          </Link>
          <div className="qa-topbar-titles">
            <h1 className="qa-topbar-title">追问</h1>
            <p className="qa-topbar-sub muted caption" title={activeTitle}>
              {activeTitle}
              {loading ? " · 同步中" : ""}
            </p>
          </div>
        </div>
        <div className="qa-topbar-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
          >
            历史{sessions.length ? ` ${sessions.length}` : ""}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void onNewSession()}
          >
            新会话
          </button>
        </div>
      </header>

      {/* Session drawer */}
      {showHistory ? (
        <div className="qa-drawer-backdrop" onClick={() => setShowHistory(false)}>
          <aside
            className="qa-drawer"
            onClick={(e) => e.stopPropagation()}
            aria-label="会话历史"
          >
            <div className="qa-drawer-head">
              <h2 className="title-sm">会话历史</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowHistory(false)}
              >
                关闭
              </button>
            </div>
            {sessions.length === 0 ? (
              <p className="muted caption qa-drawer-empty">暂无会话</p>
            ) : (
              <ul className="qa-session-list">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`qa-session-item${s.id === activeSessionId ? " active" : ""}`}
                      onClick={() => void onSwitchSession(s.id)}
                    >
                      <span className="qa-session-title">{s.title}</span>
                      <span className="muted caption">
                        {s.messageCount} 条 · {formatShortTime(s.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      ) : null}

      {error ? <p className="form-error qa-error">{error}</p> : null}

      {/* Scrollable message stream */}
      <div className="qa-stream" ref={threadRef}>
        {empty ? (
          <div className="qa-hero-empty">
            <div className="qa-hero-icon" aria-hidden>
              💬
            </div>
            <h2 className="qa-hero-title">就本场会议提问</h2>
            <p className="muted qa-hero-desc">
              基于本场原文与纪要回答，不会自动灌屏。Enter 发送，Shift+Enter 换行。
            </p>
            <div className="qa-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="qa-chip"
                  disabled={busy}
                  onClick={() => void sendQuestion(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="qa-messages">
            {turns.map((t) => (
              <div key={t.id} className={`qa-row ${t.role}`}>
                {t.role === "assistant" ? (
                  <div className="qa-avatar" aria-hidden>
                    AI
                  </div>
                ) : null}
                <div className={`qa-msg ${t.role}`}>
                  {t.role === "assistant" ? (
                    <MarkdownView source={t.content} className="qa-md" />
                  ) : (
                    <p className="qa-user-text">{t.content}</p>
                  )}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="qa-row assistant">
                <div className="qa-avatar" aria-hidden>
                  AI
                </div>
                <div className="qa-msg assistant qa-typing">
                  <span className="qa-dot" />
                  <span className="qa-dot" />
                  <span className="qa-dot" />
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Sticky composer — always visible */}
      <form className="qa-composer-bar" onSubmit={onSubmit}>
        <div className="qa-composer-inner">
          <textarea
            ref={textareaRef}
            className="qa-textarea"
            value={question}
            rows={1}
            onChange={(e) => {
              setQuestion(e.target.value);
              autoGrow();
            }}
            onKeyDown={onKeyDown}
            placeholder="就本场会议提问…"
            disabled={busy}
            enterKeyHint="send"
          />
          <button
            className="qa-send"
            type="submit"
            disabled={busy || !question.trim()}
            aria-label="发送"
          >
            {busy ? "…" : "↑"}
          </button>
        </div>
        <p className="qa-composer-hint muted caption">仅本场上下文 · 不会跨会联问</p>
      </form>
    </div>
  );
}
