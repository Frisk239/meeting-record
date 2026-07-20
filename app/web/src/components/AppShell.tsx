import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AppShell() {
  const { appName, user } = useAuth();

  return (
    <div className="app-frame">
      <header className="nav-desktop">
        <div className="nav-brand">{appName}</div>
        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            笔记
          </NavLink>
          <NavLink
            to="/record"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            录音
          </NavLink>
          <NavLink to="/me" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            我的
          </NavLink>
        </nav>
        <div className="nav-user">{user?.displayName || user?.username}</div>
      </header>

      <main className="page-main">
        <Outlet />
      </main>

      <nav className="nav-mobile" aria-label="主导航">
        <NavLink to="/" end className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
          <span className="tab-icon">☰</span>
          <span>笔记</span>
        </NavLink>
        <NavLink to="/record" className={({ isActive }) => `tab tab-primary${isActive ? " active" : ""}`}>
          <span className="tab-icon">●</span>
          <span>录音</span>
        </NavLink>
        <NavLink to="/me" className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
          <span className="tab-icon">◎</span>
          <span>我的</span>
        </NavLink>
      </nav>
    </div>
  );
}
