import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function MeetingsPage() {
  const { user } = useAuth();

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">笔记</h1>
          <p className="muted">你好，{user?.username}。会议列表将在下一刀接通。</p>
        </div>
        <Link className="btn btn-primary" to="/record">
          开始录音
        </Link>
      </header>

      <section className="empty-card">
        <h2 className="title-sm">还没有会议</h2>
        <p className="muted">
          本刀已完成账号与 LLM 设置。录音上传、转写与纪要将在后续切片接入。
        </p>
        <div className="row gap">
          <Link className="btn btn-primary" to="/record">
            去录音（占位）
          </Link>
          <Link className="btn btn-ghost" to="/me">
            配置 LLM
          </Link>
        </div>
      </section>
    </div>
  );
}
