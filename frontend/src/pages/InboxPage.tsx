import { Button, Field, Input, LayerCard, Loader, Select, Tabs } from "@cloudflare/kumo";
import {
  ArrowsClockwiseIcon,
  ArrowSquareOutIcon,
  CaretDownIcon,
  CopyIcon,
  DiceFiveIcon,
  LightningIcon,
  ListIcon,
  PaperPlaneTiltIcon,
  StarIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Api, ApiError, type Domain, type EmailListItem, type Mailbox, type Quota, type SentEmail } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "../lib/toast";
import { copyText, fmtDate, cx } from "../lib/utils";
import { ComposeDialog } from "../components/ComposeDialog";
import { EmailViewer } from "../components/EmailViewer";

const DEFAULT_LENGTH = 12;

type SentRow = {
  id: number;
  subject: string;
  recipient: string;
  status: string;
  created_at: string;
  provider?: string;
};

export function InboxPage() {
  const { session } = useAuth();
  const isGuest = session?.role === "guest";

  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainIndex, setDomainIndex] = useState(0);
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [quota, setQuota] = useState<Quota | null>(null);

  const [currentMailbox, setCurrentMailbox] = useState<string>("");
  const [mailboxInfo, setMailboxInfo] = useState<{ id: number; is_favorite: boolean; forward_to: string | null } | null>(null);
  const [histories, setHistories] = useState<Mailbox[]>([]);
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());
  const [historyCollapsed, setHistoryCollapsed] = useState(true);

  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [sent, setSent] = useState<SentRow[]>([]);
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [selectedEmail, setSelectedEmail] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const [generateLoading, setGenerateLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoSec, setAutoSec] = useState(15);
  const timerRef = useRef<number | null>(null);

  const canSend = !!(session && (session.strictAdmin || session.role === "admin"));

  // 初始化：加载域名 / 配额 / 历史邮箱
  useEffect(() => {
    (async () => {
      try {
        const d = await Api.domains();
        const list = Array.isArray(d) && d.length ? d : ["temp.example.com"];
        setDomains(list);
        // 从 <meta name="mail-domains"> 兜底
        const meta = document.querySelector('meta[name="mail-domains"]');
        if (meta && list.length === 1 && list[0] === "temp.example.com") {
          const cd = meta.getAttribute("content") || "";
          const dl = cd.split(/[, ]+/).filter(Boolean);
          if (dl.length) setDomains(dl);
        }

        // 从 localStorage 恢复当前邮箱
        try {
          const last = localStorage.getItem("freemail:lastMailbox");
          const lastLen = Number(localStorage.getItem("freemail:lastLen"));
          if (last) setCurrentMailbox(last);
          if (lastLen >= 6 && lastLen <= 30) setLength(lastLen);
        } catch (_) {}

        // 配额
        try {
          setQuota(await Api.quota());
        } catch (_) {}

        // 历史邮箱（普通/管理员）
        try {
          const r = await Api.listMailboxes({ page: 1, size: 100 });
          setHistories(r.list || []);
          const pinned = new Set<string>();
          for (const m of r.list || []) {
            if (m.is_pinned) pinned.add(m.address);
          }
          setPinnedSet(pinned);
        } catch (_) {}
      } catch (_) {}
    })();
  }, []);

  // 加载邮件
  const refreshEmails = useCallback(async (silent = false) => {
    if (!currentMailbox) return;
    if (!silent) setRefreshing(true);
    try {
      const list = await Api.listEmails(currentMailbox, 50);
      setEmails(list || []);
    } catch (e) {
      if (!silent) toast.error("拉取邮件失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [currentMailbox]);

  const refreshSent = useCallback(async () => {
    if (!currentMailbox) return;
    try {
      const list = await Api.listSent(currentMailbox);
      const rows: SentRow[] = (list || []).map((s: SentEmail) => ({
        id: s.id,
        subject: s.subject,
        recipient: s.to_addrs || s.recipients || "",
        status: s.status,
        created_at: s.created_at,
        provider: s.provider,
      }));
      setSent(rows);
    } catch (_) {}
  }, [currentMailbox]);

  useEffect(() => {
    if (currentMailbox) {
      refreshEmails();
      refreshSent();
    }
  }, [currentMailbox, refreshEmails, refreshSent]);

  // 自动刷新
  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (!currentMailbox) return;
    timerRef.current = window.setInterval(() => {
      setAutoSec((s) => {
        if (s <= 1) {
          refreshEmails(true);
          return 15;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [currentMailbox, refreshEmails]);

  // 生成邮箱：一次响应拿到 address + mailbox 信息，前端无需再发 /api/mailbox/info
  async function generate() {
    if (generateLoading) return;
    setGenerateLoading(true);
    try {
      const r = await Api.generate(length, domainIndex);
      const email = r.mailbox?.address || r.email;
      applyMailbox(email, r.mailbox || null);
      toast.success("已生成新邮箱", email);
    } catch (e) {
      toast.error("生成失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGenerateLoading(false);
    }
  }

  async function createCustom(local: string) {
    if (!/^[a-z0-9._-]{1,64}$/i.test(local)) {
      toast.warning("用户名仅支持字母数字、点、下划线、连字符");
      return;
    }
    setGenerateLoading(true);
    try {
      const r = await Api.create(local, domainIndex);
      const email = r.mailbox?.address || r.email;
      applyMailbox(email, r.mailbox || null);
      toast.success("已创建邮箱", email);
    } catch (e) {
      toast.error("创建失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setGenerateLoading(false);
    }
  }

  async function applyMailbox(email: string, info: { id: number; is_favorite: boolean; forward_to: string | null } | null) {
    setCurrentMailbox(email);
    if (info) setMailboxInfo({ id: info.id, is_favorite: info.is_favorite, forward_to: info.forward_to });
    try {
      localStorage.setItem("freemail:lastMailbox", email);
    } catch (_) {}
    // 把新生成的邮箱加入历史列表头部，避免重新拉取
    setHistories((prev) => {
      if (prev.some((m) => m.address === email)) return prev;
      return [{ id: info?.id || 0, address: email, created_at: new Date().toISOString(), is_pinned: 0 }, ...prev];
    });
    setAutoSec(15);
  }

  // 从历史侧栏选择邮箱：加载完成后自动折叠历史卡片，把空间让给收件箱
  async function selectFromHistory(email: string, info: { id: number; is_favorite: boolean; forward_to: string | null } | null) {
    await applyMailbox(email, info);
    setHistoryCollapsed(true);
  }

  async function pinCurrent() {
    if (!currentMailbox) return;
    try {
      await Api.pinMailbox(currentMailbox);
      setPinnedSet((prev) => {
        const next = new Set(prev);
        if (next.has(currentMailbox)) next.delete(currentMailbox);
        else next.add(currentMailbox);
        return next;
      });
    } catch (e) {
      toast.error("置顶失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function clearEmails() {
    if (!currentMailbox) return;
    if (!confirm(`确定清空 ${currentMailbox} 的所有收件？`)) return;
    try {
      await Api.clearEmails(currentMailbox);
      setEmails([]);
      toast.success("已清空");
    } catch (e) {
      toast.error("清空失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function copyAddress() {
    if (!currentMailbox) return;
    const ok = await copyText(currentMailbox);
    ok ? toast.success("邮箱地址已复制") : toast.error("复制失败");
  }

  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_300px]">
      {/* 左侧：生成临时邮箱 + 当前邮箱/收件箱 */}
      <div className="flex min-w-0 flex-col gap-4">
        <LayerCard className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-2 text-kumo-strong">
            <LightningIcon className="h-5 w-5 text-kumo-brand" weight="duotone" />
            <h2 className="text-base font-semibold">生成临时邮箱</h2>
          </div>
          {domains.length > 1 ? (
            <Field label="域名">
              <Select
                aria-label="域名"
                value={String(domainIndex)}
                items={domains.map((d, i) => ({ value: String(i), label: d }))}
                onValueChange={(v) => setDomainIndex(Number(v))}
              />
            </Field>
          ) : (
            <Field label="域名">
              <Input value={domains[0] || ""} disabled />
            </Field>
          )}
          <Field label={`随机长度：${length}`}>
            <input
              type="range"
              min={6}
              max={30}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-full accent-[var(--color-kumo-brand)]"
            />
          </Field>
          <Button
            variant="primary"
            size="lg"
            icon={<DiceFiveIcon className="h-4 w-4" />}
            loading={generateLoading}
            onClick={generate}
          >
            随机生成
          </Button>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = (e.currentTarget.elements.namedItem("local") as HTMLInputElement)?.value || "";
              createCustom(v.trim());
              (e.currentTarget.elements.namedItem("local") as HTMLInputElement).value = "";
            }}
          >
            <Input name="local" placeholder="自定义用户名" />
            <Button type="submit" variant="secondary" loading={generateLoading}>创建</Button>
          </form>

          {quota ? (
            <div className="text-xs text-kumo-subtle">
              {quota.limit < 0 ? "管理员：无邮箱上限" : `已用 ${quota.used} / ${quota.limit}`}
            </div>
          ) : null}
        </LayerCard>

        <LayerCard className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-kumo-subtle">当前邮箱</span>
            <code className="fm-monospace break-all text-sm font-semibold text-kumo-strong sm:text-base">
              {currentMailbox || "— 还没生成 —"}
            </code>
            {currentMailbox ? (
              <>
                <Button variant="ghost" size="sm" shape="square" aria-label="复制地址" title="复制" onClick={copyAddress}>
                  <CopyIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={pinnedSet.has(currentMailbox) ? "secondary" : "ghost"}
                  size="sm"
                  icon={<StarIcon className="h-4 w-4" />}
                  onClick={pinCurrent}
                >
                  {pinnedSet.has(currentMailbox) ? "已置顶" : "置顶"}
                </Button>
                {canSend ? (
                  <Button variant="secondary" size="sm" icon={<PaperPlaneTiltIcon className="h-4 w-4" />} onClick={() => setComposeOpen(true)}>
                    写邮件
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  aria-label="刷新"
                  title="刷新"
                  onClick={() => refreshEmails()}
                  loading={refreshing}
                >
                  {!refreshing ? <ArrowsClockwiseIcon className="h-4 w-4" /> : null}
                </Button>
                {emails.length > 0 ? (
                  <Button variant="secondary-destructive" size="sm" icon={<TrashIcon className="h-3.5 w-3.5" />} onClick={clearEmails}>
                    清空
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="text-xs text-kumo-subtle">
            {currentMailbox ? `下次自动刷新：${autoSec}s 后` : "生成一个邮箱地址开始接收邮件"}
          </div>
        </LayerCard>

        {currentMailbox ? (
          <LayerCard className="flex min-h-0 flex-col p-3">
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "inbox" | "sent")}
              tabs={[
                { value: "inbox", label: `收件箱 (${emails.length})` },
                { value: "sent", label: "发件箱" },
              ]}
            />
            <div className="mt-2 min-h-0 flex-1 overflow-auto px-1">
              {tab === "inbox" ? (
                <EmailList
                  items={emails}
                  onOpen={(id) => {
                    setSelectedEmail(id);
                    setViewerOpen(true);
                  }}
                  refreshing={refreshing}
                />
              ) : (
                <SentList items={sent} onOpen={() => {}} />
              )}
            </div>
          </LayerCard>
        ) : (
          <LayerCard className="grid place-items-center p-12 text-center">
            <div className="text-kumo-subtle">
              <LightningIcon className="mx-auto mb-3 h-10 w-10 text-kumo-subtle/60" weight="duotone" />
              <p>上方生成一个邮箱地址后即可收信</p>
              {isGuest ? <p className="mt-1 text-xs">演示模式：数据为前端伪造</p> : null}
            </div>
          </LayerCard>
        )}
      </div>

      {/* 右侧：历史邮箱（可折叠） */}
      <div className="md:sticky md:top-0 md:self-start">
        <LayerCard className="flex min-h-0 flex-col p-3">
          <button
            type="button"
            onClick={() => setHistoryCollapsed((v) => !v)}
            className="group flex w-full items-center justify-between rounded-md px-1 py-1 text-left transition-colors hover:bg-kumo-tint/50"
            aria-expanded={!historyCollapsed}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-kumo-strong">
              <ListIcon className="h-4 w-4 text-kumo-brand" />
              历史邮箱
              {histories.length > 0 ? (
                <span className="rounded-full bg-kumo-tint px-1.5 py-0.5 text-xs text-kumo-subtle">{histories.length}</span>
              ) : null}
            </span>
            <CaretDownIcon
              className={cx(
                "h-4 w-4 shrink-0 text-kumo-subtle transition-transform",
                historyCollapsed ? "" : "rotate-180",
              )}
            />
          </button>
          {!historyCollapsed ? (
            <div className="fm-history-scroll mt-2">
              {histories.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-kumo-subtle">尚未生成邮箱</div>
              ) : (
                histories.map((m) => (
                  <button
                    key={m.address}
                    onClick={() => selectFromHistory(m.address, null)}
                    className={cx(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      m.address === currentMailbox
                        ? "bg-kumo-tint text-kumo-strong"
                        : "text-kumo-default hover:bg-kumo-tint/60",
                    )}
                  >
                    {pinnedSet.has(m.address) ? (
                      <StarIcon className="h-3.5 w-3.5 shrink-0 text-kumo-warning" weight="fill" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{m.address}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="mt-1 px-1 text-xs text-kumo-subtle">点击展开查看已生成的邮箱</div>
          )}
        </LayerCard>
      </div>

      <EmailViewer
        emailId={selectedEmail}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        onDelete={() => refreshEmails(true)}
      />
      {canSend && currentMailbox ? (
        <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} from={currentMailbox} domains={domains} />
      ) : null}
    </div>
  );
}

function EmailList({
  items,
  onOpen,
  refreshing,
}: {
  items: EmailListItem[];
  onOpen: (id: number) => void;
  refreshing?: boolean;
}) {
  if (!items.length) {
    return (
      <div className="px-2 py-10 text-center text-sm text-kumo-subtle">
        {refreshing ? <Loader /> : null}
        <p className="mt-2">暂无邮件 · 等待接收中…</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {items.map((m) => (
        <li
          key={m.id}
          onClick={() => onOpen(m.id)}
          className="fm-mail-item group cursor-pointer rounded-lg border border-transparent px-3 py-2.5 transition-colors"
          data-unread={!m.is_read ? "true" : "false"}
        >
          <div className="flex items-baseline gap-2">
            {!m.is_read ? <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-kumo-brand" /> : <span className="mt-1 inline-block h-2 w-2 shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-strong">{m.subject || "(无主题)"}</span>
            {m.verification_code ? (
              <span className="fm-monospace rounded bg-kumo-tint px-1.5 py-0.5 text-xs text-kumo-brand">{m.verification_code}</span>
            ) : null}
            <span className="text-xs text-kumo-subtle">{fmtDate(m.received_at).slice(5, 16)}</span>
          </div>
          <div className="ml-4 flex items-center gap-2 text-xs text-kumo-subtle">
            <span className="truncate">{m.sender}</span>
            {m.preview ? <span className="truncate opacity-70">· {m.preview}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SentList({ items }: { items: SentRow[]; onOpen: (id: number) => void }) {
  if (!items.length) {
    return <div className="px-2 py-10 text-center text-sm text-kumo-subtle">暂无发件记录</div>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {items.map((m) => (
        <li
          key={m.id}
          className="rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-kumo-line hover:bg-kumo-tint/50"
        >
          <div className="flex items-baseline gap-2">
            <ArrowSquareOutIcon className="h-3.5 w-3.5 shrink-0 text-kumo-subtle" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-kumo-strong">{m.subject || "(无主题)"}</span>
            <span className="text-xs text-kumo-subtle">{fmtDate(m.created_at).slice(5, 16)}</span>
          </div>
          <div className="ml-5 truncate text-xs text-kumo-subtle">
            {m.status ? <span className="mr-2 rounded bg-kumo-tint px-1.5 py-0.5">{m.status}</span> : null}
            {m.recipient}
          </div>
        </li>
      ))}
    </ul>
  );
}
