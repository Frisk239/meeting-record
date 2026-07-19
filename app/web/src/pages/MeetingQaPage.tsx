import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { askQa, listQa, type QaTurn } from "../api";

export function MeetingQaPage() {
  const { id } = useParams<{ id: string }>();
  const [turns, setTurns] = useState<QaTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await listQa(id);
      if (res.ok) setTurns(res.data.turns);
      else setError(res.data.message || "加载失败");
    })();
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id || !question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await askQa(id, question.trim());
      if (!res.ok) {
        setError(res.data.message || "提问失败");
        return;
      }
      setTurns(res.data.turns);
      setQuestion("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="caption muted">
            <Link to={`/meetings/${id}`}>← 返回纪要</Link>
          </p>
          <h1 className="page-title">追问</h1>
          <p className="muted">基于本场原文与纪要；不会自动灌屏。</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="card stack qa-thread">
        {turns.length === 0 ? (
          <p className="muted">还没有对话。试着问：「有哪些待办？」</p>
        ) : (
          turns.map((t) => (
            <div key={t.id} className={`qa-bubble ${t.role}`}>
              <div className="caption muted">{t.role === "user" ? "我" : "助手"}</div>
              <p>{t.content}</p>
            </div>
          ))
        )}
      </section>

      <form className="qa-composer card row gap" onSubmit={onSubmit}>
        <input
          className="qa-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="就本场会议提问…"
          disabled={busy}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !question.trim()}>
          {busy ? "…" : "发送"}
        </button>
      </form>
    </div>
  );
}
