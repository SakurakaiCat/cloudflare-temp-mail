import { Button, Field, Input, LayerCard, Loader, Select, Toolbar } from "@cloudflare/kumo";
import { ArrowsClockwiseIcon, KeyIcon, MinusIcon, StarIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Api, ApiError, type Domain, type Mailbox } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "../lib/toast";
import { fmtDate, cx } from "../lib/utils";

type Filters = { q: string; domain: string; login: string; favorite: string; forward: string };

export function MailboxesPage() {
  const { session } = useAuth();
  const strictAdmin = !!session?.strictAdmin;

  const [domains, setDomains] = useState<Domain[]>([]);
  const [items, setItems] = useState<Mailbox[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const size = 50;
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({ q: "", domain: "", login: "", favorite: "", forward: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, size };
      if (filters.q) params.q = filters.q;
      if (filters.domain) params.domain = filters.domain;
      if (filters.login) params.login = filters.login;
      if (filters.favorite) params.favorite = filters.favorite;
      if (filters.forward) params.forward = filters.forward;
      const r = await Api.listMailboxes(params);
      setItems(r.list || []);
      setTotal(r.total || 0);
    } catch (e) {
      toast.error("加载失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    Api.domains().then((d) => setDomains(Array.isArray(d) && d.length ? d : [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const allSelected = items.length > 0 && items.every((m) => selected.has(m.address));

  function toggleOne(addr: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr); else next.add(addr);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((m) => m.address)));
  }

  async function batchFavorite(value: boolean) {
    if (!selected.size) return;
    try {
      await Api.batchFavoriteByAddress([...selected], value);
      toast.success(value ? "已收藏" : "已取消收藏");
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error("操作失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function batchClearForward() {
    if (!selected.size) return;
    const target = prompt("输入转发目标邮箱（留空清除转发）", "");
    if (target === null) return;
    const t = target.trim() === "" ? null : target.trim();
    try {
      await Api.batchForwardByAddress([...selected], t);
      toast.success("转发已更新");
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error("操作失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function batchToggleLogin(can_login: boolean) {
    if (!selected.size) return;
    if (!strictAdmin) return toast.warning("仅管理员可操作");
    try {
      await Api.batchToggleLogin([...selected], can_login);
      toast.success(can_login ? "已放行登录" : "已禁止登录");
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error("操作失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function resetPassword(addr: string) {
    if (!strictAdmin) return;
    if (!confirm(`重置 ${addr} 的登录密码到默认值？`)) return;
    try {
      await Api.resetMailboxPassword(addr);
      toast.success("密码已重置");
    } catch (e) {
      toast.error("重置失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function del(addr: string) {
    if (!confirm(`删除邮箱 ${addr}？该操作会一并删除其下所有邮件。`)) return;
    try {
      await Api.deleteMailbox(addr);
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error("删除失败", e instanceof ApiError ? e.message : String(e));
    }
  }

  const page_total = Math.max(1, Math.ceil(total / size));
  const filters_changed = (k: keyof Filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <LayerCard className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-kumo-strong">所有邮箱</h1>
          <span className="text-xs text-kumo-subtle">共 {total} 个</span>
          <Button variant="ghost" size="sm" shape="square" aria-label="刷新" onClick={load} loading={loading}>
            {!loading ? <ArrowsClockwiseIcon className="h-4 w-4" /> : null}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-5">
          <Input placeholder="搜索邮箱地址" value={filters.q} onChange={(e) => filters_changed("q", (e.target as HTMLInputElement).value)} />
          {domains.length > 1 ? (
            <Select
              aria-label="域名"
              value={filters.domain}
              items={[{ value: "", label: "全部域名" }, ...domains.map((d) => ({ value: d, label: d }))]}
              onValueChange={(v) => filters_changed("domain", String(v))}
            />
          ) : null}
          <Select
            aria-label="登录"
            value={filters.login}
            items={[{ value: "", label: "登录权限：全部" }, { value: "true", label: "已放行" }, { value: "false", label: "已禁止" }]}
            onValueChange={(v) => filters_changed("login", String(v))}
          />
          <Select
            aria-label="收藏"
            value={filters.favorite}
            items={[{ value: "", label: "收藏：全部" }, { value: "true", label: "已收藏" }, { value: "false", label: "未收藏" }]}
            onValueChange={(v) => filters_changed("favorite", String(v))}
          />
          <Select
            aria-label="转发"
            value={filters.forward}
            items={[{ value: "", label: "转发：全部" }, { value: "true", label: "已配置" }, { value: "false", label: "未配置" }]}
            onValueChange={(v) => filters_changed("forward", String(v))}
          />
        </div>
      </LayerCard>

      {selected.size > 0 ? (
        <LayerCard className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm text-kumo-subtle">已选 {selected.size} 个：</span>
          <Button size="sm" icon={<StarIcon className="h-3.5 w-3.5" />} onClick={() => batchFavorite(true)}>收藏</Button>
          <Button size="sm" icon={<MinusIcon className="h-3.5 w-3.5" />} onClick={() => batchFavorite(false)}>取消收藏</Button>
          <Button size="sm" onClick={batchClearForward}>批量转发</Button>
          {strictAdmin ? <Button size="sm" onClick={() => batchToggleLogin(true)}>放行登录</Button> : null}
          {strictAdmin ? <Button size="sm" onClick={() => batchToggleLogin(false)}>禁止登录</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>取消选择</Button>
        </LayerCard>
      ) : null}

      <LayerCard className="flex flex-col p-0">
        <div className="overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 p-10 text-kumo-subtle"><Loader /> 加载中…</div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center text-sm text-kumo-subtle">没有匹配的邮箱</div>
          ) : (
            <table className="fm-card-table w-full text-sm">
              <thead className="sticky top-0 bg-kumo-base text-kumo-subtle">
                <tr className="border-b border-kumo-line text-left">
                  <th className="px-3 py-2">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="全选" />
                  </th>
                  <th className="px-3 py-2">邮箱地址</th>
                  <th className="px-3 py-2">创建时间</th>
                  <th className="px-3 py-2">收藏</th>
                  <th className="px-3 py-2">登录</th>
                  <th className="px-3 py-2">转发</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.address} className="border-b border-kumo-line/60 hover:bg-kumo-tint/40">
                    <td data-label="" className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(m.address)} onChange={() => toggleOne(m.address)} aria-label={`选择 ${m.address}`} />
                    </td>
                    <td data-label="邮箱地址" className="fm-monospace truncate px-3 py-2 text-kumo-default">{m.address}</td>
                    <td data-label="创建时间" className="px-3 py-2 text-kumo-subtle">{fmtDate(m.created_at).slice(0, 16)}</td>
                    <td data-label="收藏" className="px-3 py-2">{m.is_favorite ? <StarIcon className="h-4 w-4 text-kumo-warning" weight="fill" /> : <span className="text-kumo-subtle">—</span>}</td>
                    <td data-label="登录" className="px-3 py-2">
                      {m.can_login ? <span className="rounded bg-kumo-tint px-1.5 py-0.5 text-xs">放行</span> : <span className="text-kumo-subtle">—</span>}
                    </td>
                    <td data-label="转发" className="max-w-[200px] truncate px-3 py-2 text-kumo-subtle">{m.forward_to || "—"}</td>
                    <td data-label="操作" className="fm-actions px-3 py-2">
                      <div className="inline-flex gap-1">
                        {strictAdmin ? (
                          <Button size="sm" variant="ghost" shape="square" aria-label="重置密码" title="重置密码" onClick={() => resetPassword(m.address)}>
                            <KeyIcon className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        <Button size="sm" variant="secondary-destructive" shape="square" aria-label="删除" title="删除" onClick={() => del(m.address)}>
                          <TrashIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {total > size ? (
          <div className="flex items-center justify-between border-t border-kumo-line p-2 text-sm">
            <span className="text-kumo-subtle">第 {page} / {page_total} 页</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
              <Button size="sm" variant="secondary" disabled={page >= page_total} onClick={() => setPage((p) => p + 1)}>下一页</Button>
            </div>
          </div>
        ) : null}
      </LayerCard>
    </div>
  );
}
