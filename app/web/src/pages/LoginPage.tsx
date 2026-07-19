import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

type Mode = "login" | "register";

export function LoginPage() {
  const { appName, registrationOpen, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [loginId, setLoginId] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let err: string | null;
      if (mode === "login") {
        err = await login(loginId.trim(), password);
      } else {
        err = await register({
          username: username.trim(),
          email: email.trim(),
          password,
        });
      }
      if (err) {
        setError(err);
        return;
      }
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{appName}</h1>
        <p className="auth-sub muted">
          {mode === "login" ? "登录以查看你的会议笔记" : "创建账号，数据按用户隔离"}
        </p>

        <div className="segmented" role="tablist">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            登录
          </button>
          {registrationOpen ? (
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => {
                setMode("register");
                setError(null);
              }}
            >
              注册
            </button>
          ) : null}
        </div>

        {!registrationOpen && mode === "login" ? (
          <p className="hint muted">当前实例暂不可自助注册，请使用已有账号登录。</p>
        ) : null}

        <form className="stack" onSubmit={onSubmit}>
          {mode === "login" ? (
            <label className="field">
              <span>用户名或邮箱</span>
              <input
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
              />
            </label>
          ) : (
            <>
              <label className="field">
                <span>用户名</span>
                <input
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>邮箱</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
            </>
          )}
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "请稍候…" : mode === "login" ? "登录" : "注册并进入"}
          </button>
        </form>
      </div>
    </div>
  );
}
