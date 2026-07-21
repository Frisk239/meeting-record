import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicShare, type MinutesDoc, type PublicShare } from "../api";
import { VisualBoardReadonly } from "../components/MinutesVisualBoard";

function MinutesReadonly({ doc, title }: { doc: MinutesDoc; title: string }) {
  return (
    <article className="minutes-doc share-minutes">
      <header className="minutes-doc-hero">
        <h2 className="minutes-doc-title">
          {doc.topic ? `“${doc.topic}”会议` : title}
          <span className="minutes-doc-title-sub">纪要</span>
        </h2>
      </header>
      <dl className="minutes-meta">
        {doc.topic ? (
          <div className="minutes-meta-row">
            <dt>会议主题</dt>
            <dd>{doc.topic}</dd>
          </div>
        ) : null}
        {doc.time ? (
          <div className="minutes-meta-row">
            <dt>会议时间</dt>
            <dd>{doc.time}</dd>
          </div>
        ) : null}
        {doc.place ? (
          <div className="minutes-meta-row">
            <dt>会议地点</dt>
            <dd>{doc.place}</dd>
          </div>
        ) : null}
        {doc.participants ? (
          <div className="minutes-meta-row">
            <dt>参与主体</dt>
            <dd>{doc.participants}</dd>
          </div>
        ) : null}
        {doc.goal ? (
          <div className="minutes-meta-row">
            <dt>会议核心目标</dt>
            <dd>{doc.goal}</dd>
          </div>
        ) : null}
      </dl>

      <section className="minutes-doc-section">
        <h3 className="minutes-doc-h">关键议题内容</h3>
        {(doc.topics || []).length === 0 ? (
          <p className="muted">暂无议题</p>
        ) : (
          doc.topics.map((t, i) => (
            <div key={i} className="minutes-topic">
              <h4 className="minutes-topic-title">
                {i + 1}、{t.title || "未命名议题"}
              </h4>
              {t.sub ? <p className="minutes-topic-sub">{t.sub}</p> : null}
              {(t.bullets || []).length ? (
                <ul className="minutes-bullets">
                  {t.bullets.map((b, j) =>
                    b.trim() ? (
                      <li key={j}>
                        <p>{b}</p>
                      </li>
                    ) : null,
                  )}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </section>

      {(doc.disputes || []).length ? (
        <section className="minutes-doc-section">
          <h3 className="minutes-doc-h">争议点</h3>
          {doc.disputes.map((d, i) =>
            d.trim() ? (
              <blockquote key={i} className="minutes-quote">
                <p>{d}</p>
              </blockquote>
            ) : null,
          )}
        </section>
      ) : null}

      <section className="minutes-doc-section">
        <h3 className="minutes-doc-h">待办事项</h3>
        {(doc.actionItems || []).length === 0 ? (
          <p className="muted">（无）</p>
        ) : (
          <ul className="minutes-actions">
            {doc.actionItems.map((a, i) =>
              a.owner || a.action ? (
                <li key={i}>
                  <p>
                    {a.owner ? (
                      <strong className="minutes-action-owner">
                        {a.owner}
                        {a.action ? "：" : ""}
                      </strong>
                    ) : null}
                    {a.action || ""}
                  </p>
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>

      {(doc.timeline || []).length ? (
        <section className="minutes-doc-section">
          <h3 className="minutes-doc-h">时间轴</h3>
          <ul className="minutes-bullets">
            {doc.timeline.map((t, i) =>
              t.trim() ? (
                <li key={i}>
                  <p>{t}</p>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [share, setShare] = useState<PublicShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("无效链接");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await getPublicShare(token);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.data.message || "分享不可用");
        setShare(null);
      } else {
        setShare(res.data.share);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="share-page">
      <header className="share-top">
        <p className="share-brand">{share?.appName || "Meeting Record"}</p>
        <p className="muted caption">只读分享 · 无需登录</p>
      </header>

      {loading ? <p className="muted">加载中…</p> : null}
      {error ? (
        <div className="card stack">
          <p className="form-error">{error}</p>
          <p className="muted caption">链接可能已过期或被撤销。</p>
          <Link to="/login" className="btn btn-ghost btn-sm">
            去登录
          </Link>
        </div>
      ) : null}

      {share && !loading ? (
        <div className="share-body stack">
          <h1 className="page-title">{share.title}</h1>
          <p className="muted caption">
            有效期至 {new Date(share.expiresAt).toLocaleString()}
          </p>

          {share.minutes?.visualBoard?.sections?.length ? (
            <VisualBoardReadonly board={share.minutes.visualBoard} />
          ) : null}

          {share.minutes ? (
            <MinutesReadonly doc={share.minutes} title={share.title} />
          ) : (
            <p className="muted">暂无纪要内容。</p>
          )}

          <p className="muted caption share-foot">
            本页为只读快照风格页面，不含原文转写与音频。
          </p>
        </div>
      ) : null}
    </div>
  );
}
