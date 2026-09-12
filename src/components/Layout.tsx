import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  Leaf,
  LogOut,
  Settings,
  Menu,
  X,
  Sprout,
  ShoppingBag,
  CloudRain,
  Scale,
  Flower2,
  LayoutDashboard,
  Files,
  Megaphone,
} from "lucide-react";
import { useData } from "../stores/data";
import { IconButton } from "./IconButton";
import { api } from "../api/http";
export const categoryIcons = [Sprout, ShoppingBag, CloudRain, Scale, Flower2];
export function VisitorLayout() {
  const nav = useNavigate();
  const { categories, announcements, error, reload } = useData();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const refresh = () => void reload();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reload]);
  return (
    <div className="app-layout">
      <aside className={`sidebar ${open ? "mobile-open" : ""}`}>
        <div className="brand">
          <Leaf size={25} />
          <div>
            <strong>乡村助农</strong>
            <span>政策知识库</span>
          </div>
          <IconButton
            label="关闭导航"
            className="mobile-only"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </IconButton>
        </div>
        <NavLink
          end
          to="/visitor"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          onClick={() => setOpen(false)}
        >
          <LayoutDashboard size={18} />
          政策服务台
        </NavLink>
        <div className="nav-label">知识板块</div>
        {categories.map((c, i) => {
          const Icon = categoryIcons[i % categoryIcons.length];
          return (
            <NavLink
              key={c.id}
              to={`/visitor/chat/${c.id}`}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} />
              <span>{c.name}</span>
            </NavLink>
          );
        })}
        <div className="sidebar-footer">
          <div className="footer-emblem">
            <Leaf size={35} />
          </div>
          <strong>让每一份政策惠及乡村</strong>
          <span>权威政策资料</span>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <div className="flex items-center gap-2">
            <IconButton
              label="打开导航"
              className="mobile-only"
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </IconButton>
            <span className="topbar-title">
              乡村助农政策知识库 <span>/ AI 问答助手</span>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="visitor-badge">访客</span>
            <IconButton
              label={`公告 ${announcements.filter((a) => a.isPublished).length} 条`}
              onClick={() => nav("/visitor")}
            >
              <Bell size={19} />
            </IconButton>
            <IconButton
              label="管理员后台"
              onClick={() => nav("/admin/dashboard")}
            >
              <Settings size={19} />
            </IconButton>
            <IconButton label="返回登录" onClick={() => nav("/login")}>
              <LogOut size={18} />
            </IconButton>
          </div>
        </header>
        {error && (
          <div className="notice danger">
            {error}
            <button onClick={() => void reload()}>重试</button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
export function AdminLayout() {
  const nav = useNavigate();
  const reload = useData((s) => s.reload);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const refresh = () => void reload();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [reload]);
  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <strong className="flex items-center gap-2">
          <Leaf size={23} />
          助农政策管理
        </strong>
        <div className="flex gap-3">
          <button onClick={() => nav("/visitor")}>访客端</button>
          <IconButton
            label="退出登录"
            onClick={() => {
              void api.post("/auth/logout").finally(() => nav("/login"));
            }}
          >
            <LogOut size={18} />
          </IconButton>
        </div>
      </header>
      <div className="admin-body">
        <nav className="admin-nav">
          {[
            ["/admin/dashboard", "数据看板", LayoutDashboard],
            ["/admin/documents", "文档管理", Files],
            ["/admin/announcements", "公告管理", Megaphone],
          ].map(([path, title, Icon]) => {
            const I = Icon as typeof Files;
            return (
              <NavLink
                key={String(path)}
                to={String(path)}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <I size={18} />
                {String(title)}
              </NavLink>
            );
          })}
        </nav>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
