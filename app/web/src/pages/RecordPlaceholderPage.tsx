import { Link } from "react-router-dom";

export function RecordPlaceholderPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">录音</h1>
      </header>
      <section className="empty-card">
        <p className="muted">
          现场麦录音（点开始 · 长按确认结束 · 自动上传）将在 <strong>S1 转写通路</strong> 实现。
        </p>
        <Link className="btn btn-ghost" to="/">
          返回笔记
        </Link>
      </section>
    </div>
  );
}
