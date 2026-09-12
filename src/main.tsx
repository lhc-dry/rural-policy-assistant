import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import "./index.css";
import { VisitorLayout, AdminLayout } from "./components/Layout";
import { Login } from "./pages/Login";
import { VisitorHome } from "./pages/VisitorHome";
import { Chat } from "./pages/Chat";
import { useData } from "./stores/data";
import { useApp } from "./stores/app";
import { api } from "./api/http";
const root=createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
const Dashboard = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.Dashboard })),
);
const Documents = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.Documents })),
);
const Announcements = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.Announcements })),
);
function Guard() {
  const [authorized, setAuthorized] = useState<boolean | undefined>();
  const location = useLocation();
  useEffect(() => {
    api.get("/auth/me").then(() => setAuthorized(true)).catch(() => setAuthorized(false));
  }, []);
  if (authorized === undefined) return <div className="empty-state">正在验证登录状态…</div>;
  return authorized ? (
    <AdminLayout />
  ) : (
    <Navigate to="/login" replace state={{ from: location.pathname }} />
  );
}
function App() {
  return (
    <Suspense fallback={<div className="empty-state">正在加载…</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/visitor" element={<VisitorLayout />}>
          <Route index element={<VisitorHome />} />
          <Route path="chat/:categoryId" element={<Chat />} />
        </Route>
        <Route path="/admin" element={<Guard />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="documents" element={<Documents />} />
          <Route path="announcements" element={<Announcements />} />
        </Route>
        <Route path="*" element={<Navigate to="/visitor" replace />} />
      </Routes>
    </Suspense>
  );
}
async function bootstrap() {
  for (const [category, messages] of Object.entries(useApp.getState().messages))
    for (const m of messages)
      if (m.status === "generating")
        useApp.getState().update(category, m.id, { status: "aborted" });
  await useData.getState().reload();
  root.render(
    <StrictMode>
      <BrowserRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}
void bootstrap().catch((e) => {
  const root = document.getElementById("root")!;
  root.textContent = `应用初始化失败：${e instanceof Error ? e.message : String(e)}。请确认后端服务可用并刷新重试。`;
});
