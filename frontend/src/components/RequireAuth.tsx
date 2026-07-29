import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { PageLoader } from "./AppShell";

/**
 * 限制访问：仅放行登录用户；可选 additionally 限制为 strictAdmin。
 * 未加载完会话时显示加载态。
 */
export function RequireAuth({
  children,
  strictAdmin = false,
}: {
  children: ReactNode;
  strictAdmin?: boolean;
}) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageLoader label="正在验证会话…" />;
  }
  if (!session?.authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (strictAdmin && !session.strictAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
