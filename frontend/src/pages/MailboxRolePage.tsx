import { Button, Dialog, Field, Input, LayerCard, Loader } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, CopyIcon, KeyIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Api, ApiError, Auth, type EmailListItem } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "../lib/toast";
import { copyText, fmtDate } from "../lib/utils";
import { ThemeToggle } from "../components/ThemeToggle";
import { EmailViewer } from "../components/EmailViewer";

export function MailboxRolePage() {
  const { session, setSession } = useAuth();
  const address = session?.mailboxAddress || "";

  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [autoSec, setAutoSec] = useState(15);
  const [search, setSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!address) return;
    if (!silent) setRefreshing(true);
    try {
      const list = await Api.listEmails(address, 50);
      setEmails(list || []);
    } catch (e) {
      if (!silent) toast.error("拉取失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (!address) return;
    timerRef.current = window.setInterval(() => {
      setAutoSec((s) => {
        if (s <= 1) {
          refresh(true);
          return 15;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [address, refresh]);

  const filtered = useMemo(() => {
    if (!search.trim()) return emails;
    const q = search.trim().toLowerCase();
    return emails.filter((e) =>
      (e.subject || "").toLowerCase().includes(q) ||
      (e.sender || "").toLowerCase().includes(q),
    );
  }, [emails, search]);

  async function copy() {
    if (!address) return;
    const ok = await copyText(address);
    ok ? toast.success("已复制") : toast.error("复制失败");
  }

  async function logout() {
    try { await Auth.logout().catch(() => null); } finally {}
    setSession(null);
    window.location.hash = "/login";
  }

  if (!address) {
    return <div className="p-10 text-center text-kumo-subtle">会话异常：缺少邮箱地址</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-kumo-line bg-kumo-base px-3 py-2 sm:px-4">
        <span className="font-semibold text-kumo-default">Cloudflare 临时邮箱</span>
        <code className="fm-monospace break-all text-sm text-kumo-strong">{address}</code>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button size="sm" variant="ghost" icon={<KeyIcon className="h-3.5 w-3.5" />} onClick={() => setPwdOpen(true)}>修改密码</Button>
          <Button size="sm" variant="ghost" onClick={logout}>退出</Button>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-auto p-4">
        <div className="mx-auto max-w-3xl">
          <LayerCard className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-kumo-strong">收件箱 ({filtered.length})</h1>
              <Button variant="ghost" size="sm" shape="square" aria-label="刷新" onClick={() => refresh()} loading={refreshing}>
                {!refreshing ? <ArrowsClockwiseIcon className="h-4 w-4" /> : null}
              </Button>
              <Button variant="ghost" size="sm" icon={<CopyIcon className="h-3.5 w-3.5" />} onClick={copy}>复制地址</Button>
              <span className="ml-auto text-xs text-kumo-subtle">下次自动刷新：{autoSec}s 后</span>
            </div>
            <Field label="搜索">
              <Input
                value={search}
                onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
                placeholder="搜索发件人 / 主题"
              />
            </Field>
            {refreshing && !emails.length ? (
              <div className="flex items-center gap-2 p-6 text-kumo-subtle"><Loader /> 加载中…</div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-kumo-subtle">暂无邮件</div>
            ) : (
              <ul className="flex flex-col gap-1">
                {filtered.map((m) => (
                  <li
                    key={m.id}
                    onClick={() => { setSelectedEmail(m.id); setViewerOpen(true); }}
                    className="fm-mail-item cursor-pointer rounded-lg border border-transparent px-3 py-2.5 transition-colors"
                    data-unread={(!m.is_read || m.is_read === 0) ? "true" : "false"}
                  >
                    <div className="flex items-baseline gap-2">
                      {!m.is_read ? <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-kumo-brand" /> : <span className="h-2 w-2 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-strong">{m.subject || "(无主题)"}</span>
                      {m.verification_code ? (
                        <span className="fm-monospace rounded bg-kumo-tint px-1.5 py-0.5 text-xs text-kumo-brand">{m.verification_code}</span>
                      ) : null}
                      <span className="text-xs text-kumo-subtle">{fmtDate(m.received_at).slice(5, 16)}</span>
                    </div>
                    <div className="ml-4 truncate text-xs text-kumo-subtle">{m.sender}{m.preview ? ` · ${m.preview}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </LayerCard>
        </div>
      </main>

      <EmailViewer emailId={selectedEmail} open={viewerOpen} onOpenChange={setViewerOpen} onDelete={() => refresh(true)} />
      <PasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  );
}

function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!cur || !next) return toast.warning("请填写当前密码和新密码");
    if (next.length < 6) return toast.warning("新密码至少 6 位");
    setLoading(true);
    try {
      await Api.changeOwnPassword(cur, next);
      toast.success("密码已修改");
      onOpenChange(false);
      setCur(""); setNext("");
    } catch (e) {
      toast.error("修改失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog className="p-6">
        <Dialog.Title className="mb-4 text-lg font-semibold text-kumo-strong">修改密码</Dialog.Title>
        <div className="flex flex-col gap-3">
          <Field label="当前密码"><Input type="password" value={cur} onChange={(e) => setCur((e.target as HTMLInputElement).value)} /></Field>
          <Field label="新密码（至少 6 位）"><Input type="password" value={next} onChange={(e) => setNext((e.target as HTMLInputElement).value)} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Dialog.Close render={(p) => <Button variant="ghost" {...p}>取消</Button>} />
          <Button variant="primary" loading={loading} onClick={submit}>保存</Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
