import { Toasty } from "@cloudflare/kumo";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { toastManager } from "./lib/toast";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { InboxPage } from "./pages/InboxPage";
import { MailboxesPage } from "./pages/MailboxesPage";
import { AdminPage } from "./pages/AdminPage";
import { MailboxRolePage } from "./pages/MailboxRolePage";
import { ApiKeysPage } from "./pages/ApiKeysPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Toasty toastManager={toastManager}>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<LoginGate />} />
              <Route
                path="/*"
                element={
                  <RootRouter />
                }
              />
            </Routes>
          </HashRouter>
        </Toasty>
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * /login 的进入守卫：若已登录则跳回首页。
 */
function LoginGate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-10 text-kumo-subtle">加载中…</div>;
  if (session?.authenticated) {
    // mailbox 角色登录后进入单邮箱视图
    const target = session.role === "mailbox" ? "/mailbox-role" : "/";
    return <Navigate to={target} replace />;
  }
  return <LoginPage />;
}

/**
 * 顶层分发：根据会话角色决定主框架内容。
 */
function RootRouter() {
  const { session, loading } = useAuth();
  if (loading) {
    return <div className="p-10 text-kumo-subtle">加载中…</div>;
  }
  if (!session?.authenticated) {
    return <Navigate to="/login" replace />;
  }
  if (session.role === "mailbox") {
    return (
      <Routes>
        <Route path="/mailbox-role" element={<MailboxRolePage />} />
        <Route path="*" element={<Navigate to="/mailbox-role" replace />} />
      </Routes>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <Routes>
          <Route path="/" element={<InboxPage />} />
          <Route path="/mailboxes" element={<MailboxesPage />} />
          <Route path="/users" element={<RequireAuth strictAdmin><AdminPage /></RequireAuth>} />
          <Route path="/apikeys" element={<ApiKeysPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </RequireAuth>
  );
}
