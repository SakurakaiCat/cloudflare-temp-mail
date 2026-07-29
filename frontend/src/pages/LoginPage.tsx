import { Button, Field, Input, LayerCard } from "@cloudflare/kumo";
import { EnvelopeIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Auth } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "../lib/toast";
import { ThemeToggle } from "../components/ThemeToggle";

export function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await Auth.login(username.trim(), password);
      const s = await refresh();
      toast.success("登录成功");
      const target = s?.role === "mailbox" ? "/mailbox-role" : "/";
      navigate(target, { replace: true });
    } catch (err) {
      toast.error("登录失败", String((err as Error).message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <LayerCard className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="inline-flex items-center justify-center rounded-xl bg-kumo-tint p-2.5 text-kumo-brand">
            <EnvelopeIcon className="h-6 w-6" weight="duotone" />
          </div>
          <h1 className="text-xl font-semibold text-kumo-strong">Cloudflare 临时邮箱</h1>
          <p className="text-sm text-kumo-subtle">登录以管理你的临时邮箱</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="用户名 / 邮箱地址">
            <Input
              value={username}
              onChange={(e) => setUsername((e.target as HTMLInputElement).value)}
              placeholder="admin / guest / you@domain"
              autoComplete="username"
            />
          </Field>
          <Field label="密码">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={loading}>
            登录
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-kumo-subtle">
          默认管理员：admin · 密码取自 ADMIN_PASSWORD 环境变量
        </p>
      </LayerCard>
    </div>
  );
}
