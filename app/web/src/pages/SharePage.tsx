/**
 * Standalone public document for share links.
 * No app shell / nav / login CTA as primary UX — pure read-only minutes + visual.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
    // Mark document mode for CSS (no app chrome)
    document.documentElement.classList.add("share-doc-mode");
    document.body.classList.add("share-doc-mode");
    return () => {
      document.documentElement.classList.remove("share-doc-mode");
      document.body.classList.remove("share-doc-mode");
    };
  }, []);

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
        document.title = "分享不可用";
      } else {
        setShare(res.data.share);
        setError(null);
        document.title = `${res.data.share.title} · 分享`;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="share-doc">
      <div className="share-doc-paper">
        {loading ? (
          <p className="muted share-doc-status">加载分享内容…</p>
        ) : null}

        {error ? (
          <div className="share-doc-error">
            <h1 className="share-doc-error-title">无法打开分享</h1>
            <p className="form-error">{error}</p>
            <p className="muted caption">
              链接可能已被撤销，或会议已删除。此页为独立只读文档，不含登录入口。
            </p>
          </div>
        ) : null}

        {share && !loading ? (
          <>
            <header className="share-doc-header">
              <p className="share-doc-kicker">会议纪要 · 只读分享</p>
              <h1 className="share-doc-title">{share.title}</h1>
              <p className="share-doc-meta muted caption">
                {share.appName}
                {share.permanent || !share.expiresAt ? " · 永久有效" : ""}
                {" · 不含原文与录音"}
              </p>
            </header>

            {share.minutes?.visualBoard?.sections?.length ? (
              <section className="share-doc-visual" aria-label="图解总览">
                <VisualBoardReadonly board={share.minutes.visualBoard} />
              </section>
            ) : null}

            {share.minutes ? (
              <MinutesReadonly doc={share.minutes} title={share.title} />
            ) : (
              <p className="muted">暂无纪要内容。</p>
            )}

            <footer className="share-doc-footer muted caption">
              本页为独立只读文档，不进入应用工作台。
            </footer>
          </>
        ) : null}
      </div>
    </div>
  );
}
