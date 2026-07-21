import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { MeetingDetailPage } from "./pages/MeetingDetailPage";
import { MeetingQaPage } from "./pages/MeetingQaPage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { RecordPage } from "./pages/RecordPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SharePage } from "./pages/SharePage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) {
    return (
      <div className="center-screen">
        <p className="muted">加载中…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) {
    return (
      <div className="center-screen">
        <p className="muted">加载中…</p>
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      {/* Public read-only share — no auth shell */}
      <Route path="/s/:token" element={<SharePage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<MeetingsPage />} />
        <Route path="record" element={<RecordPage />} />
        <Route path="meetings/:id" element={<MeetingDetailPage />} />
        <Route path="meetings/:id/qa" element={<MeetingQaPage />} />
        <Route path="me" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
