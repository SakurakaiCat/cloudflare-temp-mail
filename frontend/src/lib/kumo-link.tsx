import React from "react";

/**
 * 薄包装：未来若需要把 kumo 的 LinkButton 接到 React Router，可在此注入
 * LinkProvider component。当前阶段直接透传 children，避免引入复杂依赖。
 */
export function KumoLinkProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
