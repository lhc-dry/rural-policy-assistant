import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Leaf, ArrowRight, ShieldCheck } from "lucide-react";
import { api } from "../api/http";
export function Login() {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const nav = useNavigate(),
    location = useLocation();
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/login", {
        username,
        password,
      });
      window.dispatchEvent(new Event("auth-change"));
      const from = (location.state as { from?: string } | null)?.from;
      nav(from&&/^\/admin(?:\/[a-z]+)?$/.test(from) ? from : "/admin/dashboard");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-screen">
      <main className="login-surface">
        <div className="brand">
          <Leaf size={30} />
          <div>
            <strong>乡村助农政策知识库</strong>
            <span>政策有据，惠农有路</span>
          </div>
        </div>
        <h1>欢迎使用</h1>
        <button
          className="primary-button visitor-enter"
          onClick={() => nav("/visitor")}
        >
          访客进入
          <ArrowRight size={18} />
        </button>
        <div className="login-divider">
          <ShieldCheck size={16} />
          管理员登录
        </div>
        <form onSubmit={login}>
          <label>
            账号
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button type="submit" className="secondary-button w-full" disabled={busy}>
            {busy ? "登录中…" : "登录后台"}
          </button>
        </form>
      </main>
    </div>
  );
}
