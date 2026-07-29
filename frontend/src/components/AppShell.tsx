import { Button, LayerCard, Loader } from "@cloudflare/kumo";
import {
  EnvelopeIcon,
  KeyIcon,
  ListIcon,
  ListIcon as MenuIcon,
  SignOutIcon,
  UserCircleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Auth } from "../lib/api";
import { ThemeToggle } from "./ThemeToggle";
import { toast } from "../lib/toast";

type NavEntry = { to: string; label: string; icon: ReactNode; require?: "strictAdmin" | "admin" };

function navByRole(strictAdmin: boolean, role: string): NavEntry[] {
  const all: NavEntry[] = [
    { to: "/", label: "收件箱", icon: <EnvelopeIcon className="h-4 w-4" /> },
    { to: "/mailboxes", label: "所有邮箱", icon: <ListIcon className="h-4 w-4" />, require: "admin" },
    { to: "/users", label: "用户管理", icon: <UserCircleIcon className="h-4 w-4" />, require: "strictAdmin" },
    { to: "/apikeys", label: "API 管理", icon: <KeyIcon className="h-4 w-4" /> },
  ];
  return all.filter((n) => {
    if (!n.require) return true;
    if (n.require === "strictAdmin") return strictAdmin;
    if (n.require === "admin") return role === "admin" || strictAdmin;
    return true;
  });
}

function navActive(isActive: boolean) {
  return isActive ? "variant=primary" : "variant=ghost";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, setSession } = useAuth();
  const role = session?.role || "user";
  const strictAdmin = !!session?.strictAdmin;
  const entries = navByRole(strictAdmin, role);
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  async function logout() {
    try {
      await Auth.logout();
    } finally {
      setSession(null);
      window.location.hash = "/login";
      toast.info("已退出登录");
    }
  }

  // 路由变化或视口变宽后关闭移动端抽屉
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (navOpen) {
      const onResize = () => {
        if (window.matchMedia("(min-width: 48rem)").matches) setNavOpen(false);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
  }, [navOpen]);

  const showNav = entries.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-kumo-line bg-kumo-base px-3 py-2.5 sm:px-4">
        {/* 移动端汉堡按钮（多个导航项时才显示） */}
        {showNav ? (
          <Button
            shape="circle"
            variant="ghost"
            aria-label="打开菜单"
            title="菜单"
            className="sm:hidden"
            onClick={() => setNavOpen(true)}
          >
            <MenuIcon className="h-5 w-5" />
          </Button>
        ) : null}
        <div className="flex items-center gap-2 font-semibold text-kumo-default">
          <EnvelopeIcon className="h-5 w-5 text-kumo-brand" weight="duotone" />
          <span>Cloudflare 临时邮箱</span>
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="text-sm text-kumo-subtle hidden sm:inline">
            {session?.username || ""}
            {session?.viaApiKey ? " · API Key" : ""}
          </span>
          <ThemeToggle />
          <Button
            shape="circle"
            variant="ghost"
            aria-label="退出登录"
            title="退出登录"
            onClick={logout}
          >
            <SignOutIcon className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {showNav && (
          <>
            {/* 桌面端常驻侧栏 */}
            <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-kumo-line bg-kumo-base p-3 sm:flex">
              {entries.map((e) => (
                <NavLink key={e.to} to={e.to} end={e.to === "/"} className="block">
                  {({ isActive }) => (
                    <Button
                      variant={isActive ? "primary" : "ghost"}
                      size="base"
                      className="w-full justify-start"
                      onClick={() => undefined}
                    >
                      <span className="inline-flex items-center gap-2">
                        {e.icon}
                        <span>{e.label}</span>
                      </span>
                    </Button>
                  )}
                </NavLink>
              ))}
              <div className="mt-auto pt-2 text-xs text-kumo-subtle">v6 · Kumo UI</div>
            </nav>

            {/* 移动端抽屉 + 遮罩 */}
            {navOpen ? <div className="fm-nav-overlay sm:hidden" onClick={() => setNavOpen(false)} /> : null}
            <nav
              className={`fm-nav-drawer sm:hidden ${navOpen ? "fm-nav-drawer-open" : ""}`}
              aria-hidden={!navOpen}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold text-kumo-default">导航</span>
                <Button
                  shape="circle"
                  variant="ghost"
                  aria-label="关闭菜单"
                  title="关闭"
                  onClick={() => setNavOpen(false)}
                >
                  <XIcon className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex flex-col gap-1 p-3">
                {entries.map((e) => (
                  <NavLink key={e.to} to={e.to} end={e.to === "/"} className="block">
                    {({ isActive }) => (
                      <Button
                        variant={isActive ? "primary" : "ghost"}
                        size="base"
                        className="w-full justify-start"
                        onClick={() => setNavOpen(false)}
                      >
                        <span className="inline-flex items-center gap-2">
                          {e.icon}
                          <span>{e.label}</span>
                        </span>
                      </Button>
                    )}
                  </NavLink>
                ))}
              </div>
            </nav>
          </>
        )}

        <main className="flex-1 min-h-0 min-w-0 overflow-auto p-3 sm:p-4">
          <div key={location.pathname} className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function PageLoader({ label = "加载中…" }: { label?: string }) {
  return (
    <LayerCard className="flex items-center gap-2 p-6 text-kumo-subtle">
      <Loader />
      <span>{label}</span>
    </LayerCard>
  );
}
