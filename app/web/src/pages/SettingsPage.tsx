import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function SettingsPage() {
  const { user, llm, appName, logout, saveLlm, saveProfile } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setDisplayName(user.displayName || user.username);
  }, [user]);

  useEffect(() => {
    if (!llm) return;
    setBaseUrl(llm.baseUrl || "");
    setModelId(llm.modelId || "");
    setApiKey(llm.apiKeyMasked || "");
  }, [llm]);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const err = await saveProfile(displayName.trim());
      if (err) {
        setError(err);
        return;
      }
      setMessage("已保存个人资料");
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const err = await saveLlm({ baseUrl, modelId, apiKey });
      if (err) {
        setError(err);
        return;
      }
      setMessage("已保存 LLM 配置");
    } finally {
      setBusy(false);
    }
  }

  async function onClearKey() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const err = await saveLlm({
        baseUrl,
        modelId,
        apiKey: "",
        clearApiKey: true,
      });
      if (err) {
        setError(err);
        return;
      }
      setMessage("已清除用户级 API Key（将回退部署默认）");
      setApiKey("");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const initial = (user?.displayName || user?.username || "?").slice(0, 1).toUpperCase();

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">我的</h1>
          <p className="muted">{appName}</p>
        </div>
      </header>

      <section className="card stack profile-card">
        <div className="profile-row">
          <span className="nav-avatar lg">{initial}</span>
          <div>
            <div className="profile-name">{user?.displayName || user?.username}</div>
            <div className="profile-email muted">{user?.email}</div>
          </div>
        </div>
        <h2 className="title-sm">个人中心</h2>
        <form className="stack" onSubmit={onSaveProfile}>
          <label className="field">
            <span>显示名称</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="怎么称呼你"
              maxLength={64}
            />
          </label>
          <label className="field">
            <span>账号</span>
            <input value={user?.email || ""} disabled />
            <span className="hint muted">登录邮箱（不可改）</span>
          </label>
          <label className="field">
            <span>产品显示名</span>
            <input value={appName} disabled />
            <span className="hint muted">部署可用 APP_NAME 配置，非用户个人项</span>
          </label>
          <div className="row gap wrap">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              保存资料
            </button>
            <button type="button" className="btn btn-ghost danger" onClick={onLogout}>
              退出登录
            </button>
          </div>
        </form>
      </section>

      <section className="card stack">
        <h2 className="title-sm">LLM（OpenAI Chat Completions 兼容）</h2>
        <p className="muted caption">
          填写 base_url · model_id · api_key。用户配置优先；留空 Key 可回退部署环境变量。
          {llm ? (
            <>
              {" "}
              当前来源：<strong>{llm.source}</strong>
              {llm.hasApiKey ? " · 已配置 Key" : " · 未配置 Key"}
            </>
          ) : null}
        </p>

        <form className="stack" onSubmit={onSave}>
          <label className="field">
            <span>Base URL</span>
            <input
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Model ID</span>
            <input
              placeholder="gpt-4o-mini"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>API Key</span>
            <input
              type="password"
              placeholder={llm?.hasApiKey ? "已保存（留空则不改）" : "sk-…"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="form-ok">{message}</p> : null}

          <div className="row gap wrap">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "保存中…" : "保存 LLM 配置"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={onClearKey}
            >
              清除用户 Key
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
